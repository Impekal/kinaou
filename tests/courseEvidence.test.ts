import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { courseLessonChoices, courseOutlineSchema, newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { attachCourseDemoEvidence, courseDemoEvidenceState, courseEvidenceAssetChoices, courseEvidenceDateSchema, courseSourceUrlSchema, type CourseDemonstration, type CourseSource } from '../src/core/courseEvidence'
import { createProject, parseProject } from '../src/core/project'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { resolveCourseExportReview, reviewCourseExport } from '../src/core/courseExportReview'
import { CourseLessonEvidenceEditor } from '../src/components/CourseLessonEvidenceEditor'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'

const source: CourseSource = { id: 'source-a', title: 'Documentation', url: 'https://example.org/reference?q=course#section', accessedOn: '2026-09-27', notes: '  Original claim\nÜberblick 🌍  ' }
const demo: CourseDemonstration = { id: 'demo-a', title: 'Run example', steps: 'Open the recorded example', expected: 'Shows expected output', observed: '', performedOn: '2026-09-27' }
function memory(): KeyValueStore {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function fixture() {
  const project = parseProject({ ...createProject('Evidence course'), assets: [
    { id: 'capture', kind: 'video', uri: 'KINAOU/Assets/Captures/demo.mp4', managed: true },
    { id: 'image', kind: 'image', uri: 'KINAOU/Assets/GeneratedImages/illustration.png', managed: true, metadata: { kind: 'generated' } },
    { id: 'offline', kind: 'document', uri: 'KINAOU/Assets/offline.pdf', managed: true, offline: true },
    { id: 'outside', kind: 'video', uri: '/private/other.mp4', managed: false }
  ], metadata: { keep: 'unrelated' } })
  const outline = newCourseOutline(project)
  outline.modules = [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Lesson', objective: 'Learn', script: 'Original script', range: { inMs: 0, outMs: 1000 } }] }]
  return { project, outline }
}
function withEvidence() {
  const { project, outline } = fixture()
  outline.modules[0].lessons[0].sources = [structuredClone(source)]
  outline.modules[0].lessons[0].demonstrations = [attachCourseDemoEvidence(project, demo, 'capture')]
  return { project, outline, saved: saveCourseOutline(project, outline) }
}

it('round-trips source attribution, exact notes and file references with course revision/history', () => {
  const { project, saved, outline } = withEvidence()
  const storage = memory()
  const repository = new ProjectRepository(storage)
  repository.save(parseProject(JSON.parse(JSON.stringify(saved))))
  expect(projectCourse(repository.load(project.id)!)).toEqual(outline)
  expect(projectCourse(saved)!.modules[0].lessons[0].sources![0].notes).toBe(source.notes)
  expect(saved.assets).toEqual(project.assets)
  expect(saved.tracks).toEqual(project.tracks)
  expect(saved.metadata.keep).toBe('unrelated')
  const history = new PersistentVersionHistory(storage)
  const checkpoint = history.snapshot(saved, 'Before saving course outline', 'system')
  const draft = projectCourse(saved)!
  draft.modules[0].lessons[0].sources![0].notes = 'Revised'
  const next = saveCourseOutline(saved, draft)
  expect(projectCourse(next)!.revision).toBe(2)
  const restored = new PersistentVersionHistory(storage).restoreReversibly(next, checkpoint.id)
  expect(projectCourse(restored.project)).toEqual(outline)
  expect(projectCourse(restored.safetyVersion.project)!.modules[0].lessons[0].sources![0].notes).toBe('Revised')
})

it.each(['javascript:alert(1)', 'data:text/plain,secret', 'file:///private/data', 'ftp://example.org/a', '/relative',
  'https://user:secret@example.org', 'https://user@example.org', 'https://example.org/hidden\npath', '', 'https://example.org/a b'
])('rejects unsupported or credential-bearing source URL %j', url => {
  expect(courseSourceUrlSchema.safeParse(url).success).toBe(false)
})
it.each(['https://example.org/évidence', 'http://localhost:1234/docs', source.url])('stores a source URL without fetching it: %s', url => {
  expect(courseSourceUrlSchema.parse(url)).toBe(url)
})
it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-1-01', 'not-a-date'])('rejects invalid calendar dates: %s', value => {
  expect(courseEvidenceDateSchema.safeParse(value).success).toBe(false)
})
it('accepts leap dates and allows planning without invented access/performance timestamps', () => {
  expect(courseEvidenceDateSchema.parse('2024-02-29')).toBe('2024-02-29')
  const { project, outline } = fixture()
  outline.modules[0].lessons[0].sources = [{ ...source, accessedOn: undefined }]
  outline.modules[0].lessons[0].demonstrations = [{ ...demo, performedOn: undefined }]
  const lesson = projectCourse(saveCourseOutline(project, outline))!.modules[0].lessons[0]
  expect(lesson.sources![0].accessedOn).toBeUndefined()
  expect(lesson.demonstrations![0].performedOn).toBeUndefined()
  expect(courseDemoEvidenceState(project, lesson.demonstrations![0])).toBe('none')
  expect(lesson.demonstrations![0]).not.toHaveProperty('verified')
})
it('only attaches unique registered managed assets and never mutates media', () => {
  const { project } = fixture()
  const before = JSON.stringify(project)
  expect(courseEvidenceAssetChoices(project).map(asset => asset.id)).toEqual(['capture', 'image'])
  const attached = attachCourseDemoEvidence(project, demo, 'capture')
  expect(attached.evidence).toEqual({ assetId: 'capture', uri: 'KINAOU/Assets/Captures/demo.mp4', kind: 'video' })
  expect(courseDemoEvidenceState(project, attached)).toBe('linked')
  for (const id of ['missing', 'offline', 'outside']) expect(() => attachCourseDemoEvidence(project, demo, id)).toThrow()
  expect(demo).not.toHaveProperty('evidence')
  expect(JSON.stringify(project)).toBe(before)
  const duplicate = { ...project, assets: [...project.assets, project.assets[0]] }
  expect(() => attachCourseDemoEvidence(duplicate, demo, 'capture')).toThrow()
  expect(courseDemoEvidenceState(duplicate, attached)).toBe('changed')
})
it('shows missing, changed and offline links without silently rebinding them', () => {
  const { saved } = withEvidence()
  const demonstration = projectCourse(saved)!.modules[0].lessons[0].demonstrations![0]
  expect(courseDemoEvidenceState({ ...saved, assets: [] }, demonstration)).toBe('missing')
  const changed = structuredClone(saved); changed.assets[0].uri = 'KINAOU/Assets/replacement.mp4'
  expect(courseDemoEvidenceState(changed, demonstration)).toBe('changed')
  const offline = structuredClone(saved); offline.assets[0].offline = true
  expect(courseDemoEvidenceState(offline, demonstration)).toBe('offline')
  expect(demonstration.evidence!.uri).toBe('KINAOU/Assets/Captures/demo.mp4')
})
it('rejects forged/new cross-project file references but retains existing missing evidence for repair', () => {
  const { project, outline, saved } = withEvidence()
  const foreign = { ...project, assets: [] }
  expect(() => saveCourseOutline(foreign, outline)).toThrow(/new demonstration reference/)
  const mismatched = structuredClone(outline)
  mismatched.modules[0].lessons[0].demonstrations![0].evidence!.kind = 'image'
  expect(() => saveCourseOutline(project, mismatched)).toThrow()
  const missing = { ...saved, assets: [] }
  const edit = projectCourse(missing)!
  edit.modules[0].lessons[0].demonstrations![0].observed = 'Original recording no longer registered'
  const next = saveCourseOutline(missing, edit)
  expect(courseDemoEvidenceState(next, projectCourse(next)!.modules[0].lessons[0].demonstrations![0])).toBe('missing')
})
it('allows explicit reattachment after an asset mapping change, without changing other fields', () => {
  const { saved } = withEvidence()
  const changed = structuredClone(saved); changed.assets[0].uri = 'KINAOU/Assets/replacement.mp4'
  const draft = projectCourse(changed)!
  const before = draft.modules[0].lessons[0].demonstrations![0]
  draft.modules[0].lessons[0].demonstrations![0] = attachCourseDemoEvidence(changed, before, 'capture')
  const next = saveCourseOutline(changed, draft)
  expect(courseDemoEvidenceState(next, projectCourse(next)!.modules[0].lessons[0].demonstrations![0])).toBe('linked')
  expect(before.evidence!.uri).not.toBe(changed.assets[0].uri)
})
it('keeps generated illustrative material as an unverified reference, not a real demonstration claim', () => {
  const { project } = fixture()
  const illustration = attachCourseDemoEvidence(project, { ...demo, observed: '', performedOn: undefined }, 'image')
  expect(courseDemoEvidenceState(project, illustration)).toBe('linked')
  expect(illustration.observed).toBe('')
  expect(illustration).not.toHaveProperty('verified')
  expect(illustration).not.toHaveProperty('executed')
})
it('invalidates prior course export review after attribution edits and rejects stale drafts', () => {
  const { saved } = withEvidence()
  const choice = courseLessonChoices(saved, 1000)[0]
  const review = reviewCourseExport(saved.id, choice)
  const draft = projectCourse(saved)!
  draft.modules[0].lessons[0].sources![0].url = 'https://example.org/new'
  const next = saveCourseOutline(saved, draft)
  expect(resolveCourseExportReview(next.id, review, courseLessonChoices(next, 1000), choice.range).stale).toBe(true)
  expect(() => saveCourseOutline(next, draft)).toThrow(/changed/)
})
it('deletes only metadata references, never assets or recordings', () => {
  const { saved } = withEvidence()
  const draft = projectCourse(saved)!
  draft.modules[0].lessons[0].sources = []
  draft.modules[0].lessons[0].demonstrations = []
  const next = saveCourseOutline(saved, draft)
  expect(next.assets).toEqual(saved.assets)
  expect(next.tracks).toEqual(saved.tracks)
})
it('bounds entries, text and total evidence and rejects duplicate evidence IDs within a lesson', () => {
  const { outline } = withEvidence()
  const lesson = outline.modules[0].lessons[0]
  lesson.sources = Array.from({ length: 21 }, (_, i) => ({ ...source, id: `source-${i}` }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.sources = [{ ...source, notes: 'x'.repeat(4001) }]
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.sources = [source, source]
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.sources = [{ ...source, id: demo.id }]
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.sources = []
  lesson.demonstrations = Array.from({ length: 11 }, (_, i) => ({ ...demo, id: `demo-${i}` }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.demonstrations = []
  outline.modules[0].lessons = Array.from({ length: 20 }, (_, i) => ({ ...lesson, id: `lesson-${i}`,
    sources: Array.from({ length: 20 }, (_, s) => ({ ...source, id: `source-${s}`, notes: 'x'.repeat(1000) })) }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
})
it.each(uiLanguages)('renders attribution in %s with honest status and no fetch/command/persistence', language => {
  const { saved } = withEvidence()
  const lesson = projectCourse(saved)!.modules[0].lessons[0]
  lesson.demonstrations![0].steps = '<script>doNotExecute()</script>'
  const onChange = vi.fn(), fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language,
      children: createElement(CourseLessonEvidenceEditor, { project: saved, lesson, onChange }) }))
    expect(html).toContain(translateUi(language, 'course.evidence.heading').replaceAll('&', '&amp;'))
    expect(html).toContain(translateUi(language, 'course.evidence.linked'))
    expect(html).toContain('&lt;script&gt;doNotExecute()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href=')
    expect(onChange).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally { fetchSpy.mockRestore() }
})
