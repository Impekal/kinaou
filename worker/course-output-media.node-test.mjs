import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, open } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { MAX_COURSE_PLAYBACK_BYTES, openCourseOutputMedia } from './course-output-media.mjs'

const receipt = { schemaVersion: 1, jobId: 'job', label: 'lesson', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape', range: { inMs: 0, outMs: 1000 }, sceneIds: [], durationMs: 1000, completedAt: '2026-09-27T00:00:00.000Z', courseLesson: { courseId: 'course', moduleId: 'module', lessonId: 'lesson' } }
const bytes = Buffer.from([0, 0, 0, 16, ...Buffer.from('ftypisomTEST')])
async function fixture(fn) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-playback-')), root = path.join(temp, 'KINAOU'), renders = path.join(root, 'Renders')
  await mkdir(renders, { recursive: true }); await writeFile(path.join(renders, 'lesson.mp4'), bytes)
  try { await fn({ root, temp, renders, file: path.join(renders, 'lesson.mp4') }) } finally { await rm(temp, { force: true, recursive: true }) }
}
test('opens original bytes read-only with bounded descriptor and optional historical size', () => fixture(async ({ root, file }) => {
  const media = await openCourseOutputMedia(root, { ...receipt, sizeBytes: bytes.length })
  try { assert.equal(media.sizeBytes, bytes.length); assert.deepEqual(await media.handle.readFile(), bytes) } finally { await media.handle.close() }
  assert.deepEqual(await readFile(file), bytes)
}))
for (const invalid of ['KINAOU/Assets/lesson.mp4', 'KINAOU/Renders/../secret.mp4', 'KINAOU/Renders//lesson.mp4', 'KINAOU/Renders/./lesson.mp4', '/KINAOU/Renders/lesson.mp4', 'KINAOU/Renders/lesson.wav', 'KINAOU/Renders/\u0000.mp4', 'KINAOU\\Renders\\lesson.mp4']) test(`rejects noncanonical path ${JSON.stringify(invalid)}`, () => fixture(async ({ root }) => {
  await assert.rejects(openCourseOutputMedia(root, { ...receipt, outputRelativePath: invalid }))
}))
test('rejects missing file, non-course receipt and changed historical size', () => fixture(async ({ root }) => {
  await assert.rejects(openCourseOutputMedia(root, { ...receipt, outputRelativePath: 'KINAOU/Renders/missing.mp4' }))
  await assert.rejects(openCourseOutputMedia(root, { ...receipt, courseLesson: undefined }), /course/)
  await assert.rejects(openCourseOutputMedia(root, { ...receipt, sizeBytes: 999 }), /size differs/)
}))
test('rejects empty, malformed and oversized sparse files without buffering them', () => fixture(async ({ root, file }) => {
  await writeFile(file, ''); await assert.rejects(openCourseOutputMedia(root, receipt), /nonempty/)
  await writeFile(file, 'not an MP4 file'); await assert.rejects(openCourseOutputMedia(root, receipt), /header/)
  const handle = await open(file, 'r+'); await handle.truncate(MAX_COURSE_PLAYBACK_BYTES + 1); await handle.close()
  await assert.rejects(openCourseOutputMedia(root, receipt), /256 MiB/)
}))
test('rejects final symlink, parent symlink and a directory with MP4 suffix', () => fixture(async ({ root, renders, temp }) => {
  await symlink(path.join(renders, 'lesson.mp4'), path.join(renders, 'link.mp4'))
  await assert.rejects(openCourseOutputMedia(root, { ...receipt, outputRelativePath: 'KINAOU/Renders/link.mp4' }), /links/)
  await mkdir(path.join(temp, 'outside')); await writeFile(path.join(temp, 'outside/lesson.mp4'), bytes)
  await symlink(path.join(temp, 'outside'), path.join(renders, 'linked'))
  await assert.rejects(openCourseOutputMedia(root, { ...receipt, outputRelativePath: 'KINAOU/Renders/linked/lesson.mp4' }), /links/)
  await mkdir(path.join(renders, 'directory.mp4'))
  await assert.rejects(openCourseOutputMedia(root, { ...receipt, outputRelativePath: 'KINAOU/Renders/directory.mp4' }), /regular/)
}))
