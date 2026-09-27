import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, statfs, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { openCourseOutputMedia } from './course-output-media.mjs'
import { buildPublishPreflightResult, validatePublishExportReceipt } from './publish-package.mjs'

export const MAX_LESSON_DELIVERY_BYTES = 8 * 1024 ** 3
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const now = () => new Date().toISOString()
const deliveryReadme = {
  en: 'PRIVATE KINAOU LESSON VIDEO COPY\nOriginal MP4 bytes plus historical receipt and SHA-256. Manifest contains private managed paths. No source project, scripts, subtitles, exercises, other materials or platform/teaching approval. Verify before sharing.\n',
  de: 'PRIVATE KINAOU-LEKTIONSVIDEOKOPIE\nOriginale MP4-Bytes mit historischem Beleg und SHA-256. Das Manifest enthält private verwaltete Pfade. Keine Quellprojektdateien, Skripte, Untertitel, Übungen, weiteren Materialien oder fachliche/Plattformfreigabe. Vor Weitergabe erneut prüfen.\n',
  fr: 'COPIE PRIVÉE DE VIDÉO DE LEÇON KINAOU\nOctets MP4 originaux avec reçu historique et SHA-256. Le manifeste contient des chemins privés. Sans projet source, scripts, sous-titres, exercices, autres supports ni validation pédagogique/de plateforme. Revérifiez avant partage.\n'
}
function text(value, limit, allowLines = false) { if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > limit || (allowLines ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value)) throw Error('Invalid delivery text'); return value }
export function validateLessonDeliveryRequest(value) {
  if (!value || value.schemaVersion !== 1 || value.acknowledgePrivateMetadata !== true || !uuid.test(value.requestId)) throw Error('Invalid or unacknowledged lesson delivery request')
  const raw = value.export?.courseLesson
  if (!raw || !Number.isSafeInteger(raw.outlineRevision) || raw.outlineRevision < 1 || !['de', 'en', 'fr'].includes(raw.language)) throw Error('Invalid lesson context')
  const courseLesson = {}
  for (const key of ['courseId', 'moduleId', 'lessonId']) { courseLesson[key] = text(raw[key], 100); if (!/^[a-zA-Z0-9-]+$/.test(raw[key])) throw Error('Invalid lesson identity') }
  courseLesson.outlineRevision = raw.outlineRevision
  for (const key of ['courseTitle', 'moduleTitle', 'lessonTitle']) courseLesson[key] = text(raw[key], 240, true)
  courseLesson.language = raw.language
  const normalized = { schemaVersion: 1, requestId: value.requestId, projectId: text(value.projectId, 200), acknowledgePrivateMetadata: true, export: { ...validatePublishExportReceipt(value.export), courseLesson } }
  if (Buffer.byteLength(JSON.stringify(normalized)) > 48 * 1024) throw Error('Delivery request exceeds 48 KiB')
  return normalized
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function relativeDirectory(input) { return `KINAOU/Renders/CourseDeliveries/${input.requestId}` }
async function directory(root, input, create = false) {
  let current = await realpath(root)
  if (path.basename(current) !== 'KINAOU') throw Error('Invalid managed delivery root')
  for (const part of ['Renders', 'CourseDeliveries', ...(create ? [] : [input.requestId])]) {
    current = path.join(current, part)
    if (create) await mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(current) !== current) throw Error('Unsafe delivery directory')
  }
  return create ? path.join(current, input.requestId) : current
}
async function jsonFile(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size <= 0 || info.size > 65536) throw Error('Invalid delivery record')
    const bytes = Buffer.alloc(info.size)
    let offset = 0
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) throw Error('Truncated delivery record'); offset += bytesRead }
    return JSON.parse(bytes.toString('utf8'))
  } finally { await handle.close() }
}
async function hashFile(file, size) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat(); if (!before.isFile() || before.size !== size || size <= 0 || size > MAX_LESSON_DELIVERY_BYTES) throw Error('Delivery media size changed')
    const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024)
    for (let offset = 0; offset < size;) { const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - offset), offset); if (!bytesRead) throw Error('Truncated delivery media'); hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead }
    const after = await handle.stat(); if (['size','mtimeMs','ctimeMs','ino','dev'].some(key => before[key] !== after[key])) throw Error('Delivery media changed during verification')
    return hash.digest('hex')
  } finally { await handle.close() }
}
async function writeStatus(folder, job) {
  const temp = path.join(folder, 'status.next.json')
  await writeFile(temp, JSON.stringify(job), { flag: 'wx', mode: 0o600 })
  await rename(temp, path.join(folder, 'status.json'))
}
/** One explicit private media copy; durable request IDs prevent automatic duplicate work. */
export function createLessonDeliveryRuntime({ root, probe }) {
  const active = new Map()
  async function diskStatus(input) {
    let folder
    try { folder = await directory(root, input) } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, request: input, state: 'unknown' }; throw error }
    let saved
    try { saved = validateLessonDeliveryRequest(await jsonFile(path.join(folder, 'request.json'))) } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, request: input, state: 'interrupted', error: 'Reserved directory has no complete request record; do not overwrite it' }; throw error }
    if (!equal(saved, input)) throw Error('Delivery request ID conflicts with a different request')
    let manifest
    try { manifest = await jsonFile(path.join(folder, 'manifest.json')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (manifest) {
      const result = manifest.result
      const base = relativeDirectory(input)
      if (manifest.schemaVersion !== 1 || manifest.kind !== 'private-course-lesson-delivery' || !equal(validateLessonDeliveryRequest(manifest.request), input)
        || result?.directory !== base || result.mediaPath !== `${base}/lesson.mp4` || result.manifestPath !== `${base}/manifest.json`
        || result.sourcePath !== input.export.outputRelativePath || !/^[a-f0-9]{64}$/.test(result.sha256) || !Number.isSafeInteger(result.sizeBytes)
        || result.sizeBytes <= 0 || result.sizeBytes > MAX_LESSON_DELIVERY_BYTES || typeof result.createdAt !== 'string' || !Number.isFinite(Date.parse(result.createdAt))) throw Error('Invalid delivery manifest')
      let sha256
      try { sha256 = await hashFile(path.join(folder, 'lesson.mp4'), result.sizeBytes) }
      catch (error) { return { schemaVersion: 1, request: input, state: 'integrityFailed', error: String(error.message ?? error).slice(0, 4000) } }
      if (sha256 !== result.sha256) return { schemaVersion: 1, request: input, state: 'integrityFailed', error: 'Delivery video no longer matches its recorded hash' }
      return { schemaVersion: 1, request: input, state: 'ready', result: { ...result, integrityCheckedAt: now() } }
    }
    let status
    try { status = await jsonFile(path.join(folder, 'status.json')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (status?.state === 'failed' && equal(validateLessonDeliveryRequest(status.request), input) && typeof status.error === 'string' && status.error.length > 0 && status.error.length <= 4000) return { schemaVersion: 1, request: input, state: 'failed', error: status.error }
    return { schemaVersion: 1, request: input, state: 'interrupted', error: 'No completed manifest; worker restart or interruption. No automatic resume or overwrite.' }
  }
  async function execute(entry, folder) {
    const { input } = entry, part = path.join(folder, 'lesson.mp4.partial'), mediaPath = path.join(folder, 'lesson.mp4')
    let source, output
    try {
      source = await openCourseOutputMedia(root, input.export, MAX_LESSON_DELIVERY_BYTES)
      const before = await source.handle.stat(), disk = await statfs(folder)
      if (disk.bavail * disk.bsize < source.sizeBytes + 16 * 1024 ** 2) throw Error('Not enough free space for delivery plus 16 MiB reserve')
      entry.job = { schemaVersion: 1, request: input, state: 'copying', copiedBytes: 0, totalBytes: source.sizeBytes }
      await writeStatus(folder, entry.job)
      output = await open(part, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024)
      for (let offset = 0; offset < source.sizeBytes;) {
        const { bytesRead } = await source.handle.read(buffer, 0, Math.min(buffer.length, source.sizeBytes - offset), offset)
        if (!bytesRead) throw Error('Source ended while copying lesson')
        hash.update(buffer.subarray(0, bytesRead))
        for (let written = 0; written < bytesRead;) { const item = await output.write(buffer, written, bytesRead - written, offset + written); if (!item.bytesWritten) throw Error('Lesson copy write failed'); written += item.bytesWritten }
        offset += bytesRead; entry.job.copiedBytes = offset
      }
      const after = await source.handle.stat()
      if (['size','mtimeMs','ctimeMs','ino','dev'].some(key => before[key] !== after[key])) throw Error('Source changed while copying lesson')
      await output.sync(); await output.close(); output = undefined
      entry.job = { ...entry.job, state: 'verifying' }; await writeStatus(folder, entry.job)
      const sha256 = hash.digest('hex')
      const preflight = buildPublishPreflightResult(input.export, { ...await probe(part), sizeBytes: source.sizeBytes }, now())
      if (!preflight.ready) throw Error(`Copied lesson preflight failed: ${Object.entries(preflight.checks).filter(([, pass]) => !pass).map(([name]) => name).join(', ')}`)
      if (await hashFile(part, source.sizeBytes) !== sha256) throw Error('Copied video hash differs from source bytes')
      await rename(part, mediaPath)
      const base = relativeDirectory(input), result = { directory: base, manifestPath: `${base}/manifest.json`, mediaPath: `${base}/lesson.mp4`, sourcePath: input.export.outputRelativePath, sizeBytes: source.sizeBytes, sha256, createdAt: now(), integrityCheckedAt: now() }
      await writeFile(path.join(folder, 'SHA256SUMS'), `${sha256}  lesson.mp4\n`, { flag: 'wx', mode: 0o600 })
      await writeFile(path.join(folder, 'README.txt'), deliveryReadme[input.export.courseLesson.language], { flag: 'wx', mode: 0o600 })
      await writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ schemaVersion: 1, kind: 'private-course-lesson-delivery', request: input, result, preflight, privateMetadata: true, fullProjectBackup: false, teachingQualityApproved: false }, null, 2), { flag: 'wx', mode: 0o600 })
      entry.job = { schemaVersion: 1, request: input, state: 'ready', result }
      await writeStatus(folder, entry.job).catch(() => {}) // Complete manifest is authoritative if final status write failed.
    } catch (error) {
      entry.job = { schemaVersion: 1, request: input, state: 'failed', error: String(error.message ?? error).slice(0, 4000) }
      await output?.close().catch(() => {}); output = undefined
      // Only this newly created operation's own payloads, never original media or foreign files.
      for (const name of ['lesson.mp4.partial', 'lesson.mp4', 'SHA256SUMS', 'README.txt']) await unlink(path.join(folder, name)).catch(() => {})
      await writeStatus(folder, entry.job).catch(() => {})
    } finally { await output?.close().catch(() => {}); await source?.handle.close().catch(() => {}); active.delete(input.requestId) }
  }
  return {
    async start(value) {
      const input = validateLessonDeliveryRequest(value), previous = active.get(input.requestId)
      if (previous) { if (!equal(previous.input, input)) throw Error('Delivery request ID conflicts'); await previous.started; return structuredClone(previous.job) }
      if (active.size >= 2) throw Error('At most two lesson deliveries may run at once')
      const entry = { input, job: { schemaVersion: 1, request: input, state: 'queued' } }; active.set(input.requestId, entry)
      entry.started = (async () => {
        const folder = await directory(root, input, true)
        try { await mkdir(folder, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error; entry.job = await diskStatus(input); active.delete(input.requestId); return }
        await writeFile(path.join(folder, 'request.json'), JSON.stringify(input), { flag: 'wx', mode: 0o600 })
        await writeStatus(folder, entry.job)
        void execute(entry, folder)
      })()
      try { await entry.started; return structuredClone(entry.job) } catch (error) { active.delete(input.requestId); throw error }
    },
    async status(value) {
      const input = validateLessonDeliveryRequest(value), entry = active.get(input.requestId)
      if (entry) { if (!equal(entry.input, input)) throw Error('Delivery request ID conflicts'); await entry.started; return structuredClone(entry.job) }
      return diskStatus(input)
    }
  }
}
