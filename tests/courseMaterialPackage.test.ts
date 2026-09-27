import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { courseOutlineSchema, newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { courseMaterialLimits } from '../src/core/courseMaterials'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { createCourseMaterialPackage } from '../src/core/courseMaterialPackage'
import { courseInstructorReviewState, courseInstructorSignature, recordCourseInstructorReview } from '../src/core/courseInstructorReview'
import { createTextZip, textZipLimits } from '../src/core/textZip'
import { createProject, parseProject } from '../src/core/project'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { CourseLessonMaterialsEditor } from '../src/components/CourseLessonMaterialsEditor'
import { CourseMaterialPackagePanel } from '../src/components/CourseMaterialPackagePanel'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = createProject('Material course'), course = newCourseOutline(project)
  course.modules = [{ id: 'module', title: 'Module', lessons: [{
    id: 'lesson', title: 'Lesson', objective: 'Learn', script: 'SECRET_SCRIPT',
    range: { inMs: 0, outMs: 1000 },
    sources: [{ id: 'source', title: 'Source', url: 'https://example.org', notes: 'SECRET_SOURCE_NOTES' }],
    exercises: [{ id: 'exercise', title: 'Exercise', prompt: 'Explain', hint: 'Hint', solution: 'SECRET_SOLUTION', criteria: 'SECRET_RUBRIC' }],
    materials: [{ id: 'public', title: 'Handout', audience: 'learner', body: '  Bonjour\nÜberblick 🌍  ' }, { id: 'internal', title: 'Internal', audience: 'instructor', body: 'SECRET_MATERIAL' }]
  }] }]
  return saveCourseOutline(project, course)
}
function memory(): KeyValueStore {
  const map = new Map<string, string>()
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: key => { map.delete(key) } }
}
function inspectZip<T>(bytes: Uint8Array, inspect: (read: (path: string) => string, paths: string[]) => T): T {
  const directory = mkdtempSync(join(tmpdir(), 'kinaou-text-zip-test-'))
  try {
    const file = join(directory, 'test.zip'); writeFileSync(file, bytes)
    execFileSync('unzip', ['-t', file])
    const paths = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n')
    return inspect(path => execFileSync('unzip', ['-p', file, path], { encoding: 'utf8' }), paths)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

it('creates real interoperable ZIP headers/CRC and exact UTF-8 payloads, including empty files', () => {
  const bytes = createTextZip([{ path: 'known.txt', text: '123456789' }, { path: 'nested/utf8.txt', text: 'Bonjour\nÜberblick 🌍' }, { path: 'empty.txt', text: '' }, { path: 'bom.txt', text: '\ufeffExact BOM' }])
  expect(new DataView(bytes.buffer).getUint32(14, true)).toBe(0xcbf43926)
  inspectZip(bytes, (read, paths) => {
    expect(paths).toEqual(['known.txt', 'nested/utf8.txt', 'empty.txt', 'bom.txt'])
    expect(read('nested/utf8.txt')).toBe('Bonjour\nÜberblick 🌍')
    expect(read('empty.txt')).toBe('')
    expect(read('bom.txt')).toBe('\ufeffExact BOM')
  })
  const damaged = bytes.slice(); damaged[30 + 'known.txt'.length] ^= 1
  expect(() => inspectZip(damaged, () => {})).toThrow()
})

it.each(['../escape.txt', '/absolute.txt', 'a/../b.txt', 'a//b.txt', 'a\\b.txt', 'C:/file.txt', 'nul.txt', 'dir/COM1.txt', 'file.', 'a\u0000b.txt'])('rejects unsafe archive path %j', path => {
  expect(() => createTextZip([{ path, text: 'test' }])).toThrow(/path/)
})
it('rejects duplicate, case-colliding and file/directory-conflicting entries and excessive output', () => {
  expect(() => createTextZip([{ path: 'a.txt', text: '' }, { path: 'A.txt', text: '' }])).toThrow(/Duplicate/)
  expect(() => createTextZip([{ path: 'a', text: '' }, { path: 'a/b.txt', text: '' }])).toThrow(/Conflicting/)
  expect(() => createTextZip([])).toThrow()
  expect(() => createTextZip(Array.from({ length: textZipLimits.entries + 1 }, (_, i) => ({ path: 'p' + i, text: '' })))).toThrow()
  expect(() => createTextZip([{ path: 'big.txt', text: 'x'.repeat(textZipLimits.bytes) }])).toThrow(/size/)
  expect(() => createTextZip([{ path: 'p'.repeat(241), text: '' }])).toThrow(/path/)
  expect(() => createTextZip([{ path: 'invalid.txt', text: String.fromCharCode(0xd800) }])).toThrow(/Unicode/)
})

it('persists bounded authored materials with history and invalidates prior instructor review', async () => {
  const project = fixture(), storage = memory(), repo = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  repo.save(parseProject(JSON.parse(JSON.stringify(project))))
  expect(projectCourse(repo.load(project.id)!)!.modules[0].lessons[0].materials![0].body).toBe('  Bonjour\nÜberblick 🌍  ')
  const reviewed = await recordCourseInstructorReview(project, 'lesson', { reviewer: 'TEST Reviewer', notes: 'Synthetic test only', checks: { accuracy: true, demonstrations: true, exercises: true } })
  const before = history.snapshot(reviewed, 'Before saving course outline', 'system')
  const draft = projectCourse(reviewed)!; draft.modules[0].lessons[0].materials![0].body = 'Changed'
  const next = saveCourseOutline(reviewed, draft)
  expect(courseInstructorReviewState(next, 'lesson', await courseInstructorSignature(next))).toBe('stale')
  expect(projectCourse(history.restoreReversibly(next, before.id).project)!.modules[0].lessons[0].materials![0].body).toBe('  Bonjour\nÜberblick 🌍  ')
  expect(next.assets).toEqual(project.assets); expect(next.tracks).toEqual(project.tracks)
})

it('excludes all instructor-only fields and references from a real learner ZIP', async () => {
  const project = fixture(), before = JSON.stringify(project), fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const file = await createCourseMaterialPackage(project, 'learner')
    expect(file.filename).toMatch(/^course-[a-zA-Z0-9-]+-learner-r1.zip$/)
    inspectZip(file.bytes, (read, paths) => {
      expect(paths).toEqual(['manifest.json', 'README.txt', 'lessons/lesson-lesson/material-public.txt', 'lessons/lesson-lesson/worksheet.txt'])
      for (const path of paths) expect(read(path)).not.toContain('SECRET')
      expect(read('lessons/lesson-lesson/material-public.txt')).toContain('  Bonjour\nÜberblick 🌍  ')
      const manifest = JSON.parse(read('manifest.json'))
      expect(manifest).toMatchObject({ audience: 'learner', mediaIncluded: false, draft: true, urlsFetched: false, fullProjectBackup: false })
      expect(manifest.modules[0].lessons[0].files).toEqual(paths.slice(2))
    })
    expect(JSON.stringify(project)).toBe(before); expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})

it('includes explicit private instructor content and truthful review/media boundaries in a real ZIP', async () => {
  const project = await recordCourseInstructorReview(fixture(), 'lesson', { reviewer: 'SECRET_REVIEWER', notes: 'SECRET_REVIEW_NOTES', checks: { accuracy: true, demonstrations: true, exercises: true } })
  const file = await createCourseMaterialPackage(project, 'instructor')
  inspectZip(file.bytes, (read, paths) => {
    expect(paths).toContain('lessons/lesson-lesson/material-internal.txt')
    expect(read('lessons/lesson-lesson/answer-key.txt')).toContain('SECRET_SOLUTION')
    expect(read('lessons/lesson-lesson/answer-key.txt')).toContain('SECRET_RUBRIC')
    expect(read('lessons/lesson-lesson/script.txt')).toBe('SECRET_SCRIPT')
    expect(read('private/course-outline.json')).toContain('SECRET_SOURCE_NOTES')
    expect(JSON.parse(read('private/review-records.json'))[0]).toMatchObject({ reviewer: 'SECRET_REVIEWER', stateAtPackaging: 'current', selfReportedOnly: true, mediaBytesChecked: false })
    expect(JSON.parse(read('private/video-references.json'))).toMatchObject({ mediaIncluded: false, filePresenceChecked: false, fullArchive: false, receipts: [] })
    expect(paths.some(path => path.endsWith('.mp4'))).toBe(false)
  })
})

it('packages retained course references even after the generic recent list evicts them', async () => {
  let project = fixture()
  const course = projectCourse(project)!, lesson = course.modules[0].lessons[0]
  const receipt = { jobId: 'lesson-job', label: 'TEST output', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape' as const, range: lesson.range, durationMs: 1000, sceneIds: [], completedAt: '2026-09-27T00:00:00Z' }
  project = recordSuccessfulExport(project, { ...receipt, courseLesson: { courseId: course.id, moduleId: 'module', lessonId: 'lesson', courseTitle: course.title, moduleTitle: 'Module', lessonTitle: 'Lesson', language: course.language, outlineRevision: course.revision } })
  for (let i = 0; i < 55; i++) project = recordSuccessfulExport(project, { ...receipt, jobId: 'ordinary-' + i })
  inspectZip((await createCourseMaterialPackage(project, 'instructor')).bytes, read => {
    expect(JSON.parse(read('private/video-references.json')).receipts).toEqual([])
    const retained = JSON.parse(read('private/retained-lesson-outputs.json'))
    expect(retained).toMatchObject({ mediaIncluded: false, filePresenceChecked: false, integrityChecked: false, fullArchive: false, referenceLimit: 1000 })
    expect(retained.references.map((entry: { jobId: string }) => entry.jobId)).toEqual(['lesson-job'])
  })
  inspectZip((await createCourseMaterialPackage(project, 'learner')).bytes, (_read, paths) => {
    expect(paths.some(path => path.startsWith('private/'))).toBe(false)
  })
})

it('refuses corrupt retained outputs in a private package without exposing them to learners', async () => {
  const project = fixture(); project.metadata.courseOutputIndex = { broken: true }
  await expect(createCourseMaterialPackage(project, 'instructor')).rejects.toThrow(/Invalid course output/)
  await expect(createCourseMaterialPackage(project, 'learner')).resolves.toHaveProperty('bytes')
})

it('freezes saved input before async work and keeps stale review labels in the package', async () => {
  const project = await recordCourseInstructorReview(fixture(), 'lesson', { reviewer: 'TEST', notes: 'Synthetic only', checks: { accuracy: true, demonstrations: true, exercises: true } })
  project.script = 'Changed production script'
  const pending = createCourseMaterialPackage(project, 'instructor')
  const outline = projectCourse(project)!; outline.modules[0].lessons[0].script = 'Later mutation'
  project.metadata.courseOutline = outline
  inspectZip((await pending).bytes, read => {
    expect(read('lessons/lesson-lesson/script.txt')).toBe('SECRET_SCRIPT')
    expect(JSON.parse(read('private/review-records.json'))[0].stateAtPackaging).toBe('stale')
  })
})

it('does not drop blank selected materials or incomplete exercises; excluded internal drafts stay private', async () => {
  const project = fixture(), outline = projectCourse(project)!
  outline.modules[0].lessons[0].materials![1].body = ''
  const internalDraft = saveCourseOutline(project, outline)
  await expect(createCourseMaterialPackage(internalDraft, 'learner')).resolves.toHaveProperty('bytes')
  await expect(createCourseMaterialPackage(internalDraft, 'instructor')).rejects.toThrow(/Empty material/)
  outline.modules[0].lessons[0].materials![0].body = ' '
  await expect(createCourseMaterialPackage(saveCourseOutline(project, outline), 'learner')).rejects.toThrow(/Empty material/)
  const incomplete = projectCourse(project)!; incomplete.modules[0].lessons[0].exercises![0].solution = ''
  await expect(createCourseMaterialPackage(saveCourseOutline(project, incomplete), 'instructor')).rejects.toThrow()
})

it('fails closed for corrupt private review data, unknown modes and courses with no material payload', async () => {
  const project = fixture()
  project.metadata.courseInstructorReviews = { invalid: true }
  await expect(createCourseMaterialPackage(project, 'instructor')).rejects.toThrow(/invalid/)
  await expect(createCourseMaterialPackage(project, 'learner')).resolves.toHaveProperty('bytes')
  await expect(createCourseMaterialPackage(project, 'public' as never)).rejects.toThrow()
  const empty = createProject('Empty')
  await expect(createCourseMaterialPackage(empty, 'learner')).rejects.toThrow(/course/)
  await expect(createCourseMaterialPackage(saveCourseOutline(empty, newCourseOutline(empty)), 'learner')).rejects.toThrow(/No saved text/)
})

it('validates unique IDs, visibility, per-field/per-lesson and total material bounds', () => {
  const outline = projectCourse(fixture())!, lesson = outline.modules[0].lessons[0], material = lesson.materials![0]
  lesson.materials = [{ ...material, body: 'x'.repeat(courseMaterialLimits.body) }]
  expect(courseOutlineSchema.safeParse(outline).success).toBe(true)
  lesson.materials[0].body += 'x'; expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.materials = [material, material]; expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.materials = [{ ...material, audience: 'everyone' as never }]; expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.materials = Array.from({ length: 11 }, (_, i) => ({ ...material, id: 'm-' + i }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.materials = Array.from({ length: 10 }, (_, i) => ({ ...material, id: 'm-' + i, body: 'x'.repeat(20000) }))
  outline.modules[0].lessons = Array.from({ length: 3 }, (_, i) => ({ ...lesson, id: 'l-' + i }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
})

it.each(uiLanguages)('localizes package headers/controls in %s and requires private acknowledgment', async language => {
  const project = fixture(), course = projectCourse(project)!; course.language = language
  const saved = saveCourseOutline(project, course)
  inspectZip((await createCourseMaterialPackage(saved, 'learner')).bytes, read => {
    expect(read('README.txt')).toContain({ de: 'ENTWURF', en: 'DRAFT', fr: 'BROUILLON' }[language])
  })
  const lesson = projectCourse(saved)!.modules[0].lessons[0]
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: [
    createElement(CourseLessonMaterialsEditor, { key: 'editor', lesson, onChange: vi.fn() }),
    createElement(CourseMaterialPackagePanel, { key: 'package', project: saved, dirty: false })
  ] }))
  expect(html).toContain(translateUi(language, 'course.materials.title'))
  expect(html).toContain('<button disabled="">' + translateUi(language, 'course.package.instructor'))
  expect(html).toContain('SECRET_MATERIAL') // private authoring UI, not a learner export
})
