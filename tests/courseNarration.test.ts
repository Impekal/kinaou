import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { assertCourseNarrationBinding, assertCourseNarrationRetake, assertCourseNarrationVoice, bindCourseNarration, registerCourseNarration } from '../src/core/courseNarration'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { createProject, parseProject } from '../src/core/project'
import { AudioStudioSession, type AudioFeedback } from '../src/core/audioStudioSession'
import { AudioStudioPanel } from '../src/components/AudioStudioPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import type { SpeechVoiceDescriptor } from '../src/core/speech'
import type { SpeechJobRecord, SpeechSynthesisRequest } from '../src/core/speechJobs'
import { speechRetakeContextForAsset } from '../src/core/speechRetakes'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const voice: SpeechVoiceDescriptor = { id: 'KINAOU/Models/fr.onnx', adapterId: 'piper', label: 'French TEST', locale: 'fr-FR', capabilities: ['synthesis'] }
const job = (id = 'job'): SpeechJobRecord => ({ id, adapterId: 'piper', voiceId: voice.id, state: 'succeeded', progress: 1, audioPath: `KINAOU/Assets/GeneratedVoice/${id}.wav`, durationMs: 2500, sizeBytes: 5000, createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:01Z' })
function fixture() {
  const project = createProject('Main course'); project.script = 'Keep the main production script'
  return saveCourseOutline(project, { ...newCourseOutline(project), id: 'course', language: 'fr', modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Leçon 🌍', objective: 'Learn', script: '  Bonjour\n  deuxième ligne 🌍  ', range: { inMs: 1000, outMs: 4000 } }] }] })
}
function store(): KeyValueStore { const data = new Map<string, string>(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } } }

it('binds saved lesson text and course language independently of the main project script without writes', () => {
  const project = fixture(), before = JSON.stringify(project), binding = bindCourseNarration(project, 'lesson')
  expect(binding).toMatchObject({ projectId: project.id, script: 'Bonjour\n  deuxième ligne 🌍', course: { lessonId: 'lesson', outlineRevision: 1, language: 'fr' } })
  expect(assertCourseNarrationBinding(project, binding, '  ' + binding.script + '\n')).toEqual(binding)
  expect(JSON.stringify(project)).toBe(before)
  expect(() => bindCourseNarration(project, 'missing')).toThrow()
  expect(() => bindCourseNarration(createProject('No course'), 'lesson')).toThrow()
})
it.each(['draft', 'revision', 'same-revision-script', 'removed', 'project', 'course', 'language'] as const)('refuses changed %s source before generating or registering narration', kind => {
  let project = fixture(); const binding = bindCourseNarration(project, 'lesson')
  const course = projectCourse(project)!
  let text = binding.script
  if (kind === 'draft') text += 'Edited'
  if (kind === 'revision') { course.audience = 'Changed audience'; project = saveCourseOutline(project, course) }
  if (kind === 'same-revision-script') { course.modules[0].lessons[0].script = 'Changed'; project.metadata.courseOutline = course }
  if (kind === 'removed') { course.modules = []; project.metadata.courseOutline = course }
  if (kind === 'project') project.id = 'other-project'
  if (kind === 'course') { course.id = 'other-course'; project.metadata.courseOutline = course }
  if (kind === 'language') { course.language = 'en'; project.metadata.courseOutline = course }
  expect(() => assertCourseNarrationBinding(project, binding, text)).toThrow()
  expect(() => registerCourseNarration(project, job(), text, binding)).toThrow()
  expect(project.assets).toHaveLength(0)
})
it('requires known matching fixed voice locale or explicit matching language control', () => {
  const binding = bindCourseNarration(fixture(), 'lesson')
  expect(() => assertCourseNarrationVoice(binding, voice, {})).not.toThrow()
  expect(() => assertCourseNarrationVoice(binding, { ...voice, locale: null }, {})).toThrow()
  expect(() => assertCourseNarrationVoice(binding, { ...voice, locale: 'de-DE' }, {})).toThrow()
  const controlled: SpeechVoiceDescriptor = { ...voice, locale: null, capabilities: ['synthesis', 'language-control', 'voice-clone', 'reference-audio'] }
  expect(() => assertCourseNarrationVoice(binding, controlled, { language: 'fr' })).not.toThrow()
  expect(() => assertCourseNarrationVoice(binding, controlled, {})).toThrow()
  expect(() => assertCourseNarrationVoice(binding, controlled, { language: 'en' })).toThrow()
})
it('registers only real completed job metadata with historical lesson source and no automatic placement', () => {
  const project = fixture(), binding = bindCourseNarration(project, 'lesson')
  const next = registerCourseNarration(project, job(), binding.script, binding)
  expect(next.script).toBe(project.script); expect(next.tracks).toEqual(project.tracks); expect(next.storyboard).toEqual(project.storyboard)
  expect(projectCourse(next)).toEqual(projectCourse(project))
  expect(next.assets[0].metadata).toMatchObject({ sourceText: binding.script, speechJobId: 'job', courseNarrationSource: { schemaVersion: 1, projectId: project.id, course: binding.course } })
  expect(registerCourseNarration(next, job(), binding.script, binding)).toBe(next)
  expect(() => registerCourseNarration(project, { ...job(), state: 'running' }, binding.script, binding)).toThrow()
  expect(() => registerCourseNarration(project, { ...job(), language: 'en' }, binding.script, binding)).toThrow(/language/)
  expect(() => registerCourseNarration(project, { ...job(), audioPath: 'KINAOU/Assets/GeneratedVoice/other.wav' }, binding.script, binding)).toThrow(/match/)
  const tampered = structuredClone(next); tampered.assets[0].metadata.voiceId = 'other'
  expect(() => registerCourseNarration(tampered, job(), binding.script, binding)).toThrow(/match/)
})
it('preserves same-lesson retake lineage and blocks generic, cross-lesson and stale revision reassignment', () => {
  const original = fixture(), binding = bindCourseNarration(original, 'lesson')
  const first = registerCourseNarration(original, job(), binding.script, binding), asset = first.assets[0]
  expect(() => assertCourseNarrationRetake(asset, binding)).not.toThrow()
  expect(() => assertCourseNarrationRetake(asset)).toThrow()
  const generic = structuredClone(asset); delete generic.metadata.courseNarrationSource
  expect(() => assertCourseNarrationRetake(generic, binding)).toThrow()
  expect(() => assertCourseNarrationRetake(generic)).not.toThrow()
  expect(() => assertCourseNarrationRetake(asset, { ...binding, course: { ...binding.course, lessonId: 'other' } })).toThrow()
  expect(() => assertCourseNarrationRetake(asset, { ...binding, course: { ...binding.course, outlineRevision: 2 } })).toThrow()
  const next = registerCourseNarration(first, job('retake'), binding.script, binding, speechRetakeContextForAsset(asset, first.assets))
  expect(next.assets).toHaveLength(2)
  expect(next.assets[1].metadata).toMatchObject({ speechRetakeIndex: 2, speechRetakeOfAssetId: asset.id, courseNarrationSource: asset.metadata.courseNarrationSource })
  expect(next.assets[0]).toEqual(asset)
  const otherCourse = projectCourse(first)!; otherCourse.modules[0].lessons.push({ ...otherCourse.modules[0].lessons[0], id: 'other-lesson' })
  const other = saveCourseOutline(first, otherCourse), otherBinding = bindCourseNarration(other, 'other-lesson')
  expect(() => registerCourseNarration(other, job('wrong-retake'), otherBinding.script, otherBinding, speechRetakeContextForAsset(asset, first.assets))).toThrow(/different|earlier/)
})
it('uses existing Audio Studio save-only recovery and durable source attribution without another synthesis', async () => {
  const storage = store(), repo = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  let project = repo.save(fixture()), fail = true
  const binding = bindCourseNarration(project, 'lesson'), states: AudioFeedback[] = []
  const client = { startSpeech: vi.fn(async (_request: SpeechSynthesisRequest) => job()), speechStatus: vi.fn(async () => job()), cancelSpeech: vi.fn(async () => ({ ...job(), state: 'cancelled' as const })) }
  const session = new AudioStudioSession(project, 'test', binding.script, voice, {
    client, environment: () => ({ project, connection: 'test' }), snapshot: value => { history.snapshot(value, 'Before saving generated voice', 'system') },
    persist: value => { if (fail) throw new Error('TEST save failure'); project = repo.save(value) }, publish: value => states.push(value),
    saveResult: (value, result, text, retake) => registerCourseNarration(value, result, text, binding, retake)
  })
  await session.run(); expect(states.at(-1)?.phase).toBe('saveFailed'); expect(project.assets).toHaveLength(0)
  fail = false; await session.run(); await session.run()
  expect(client.startSpeech).toHaveBeenCalledTimes(1)
  expect(client.startSpeech.mock.calls[0][0]).toMatchObject({ text: binding.script, voiceId: voice.id })
  expect(states.at(-1)?.phase).toBe('succeeded')
  expect(repo.load(project.id)?.assets[0].metadata.courseNarrationSource).toBeDefined()
  expect(history.restoreReversibly(project, history.list(project.id)[0].id).project.assets).toHaveLength(0)
})
it('discards a late course narration result after a course edit', async () => {
  let project = fixture(); const binding = bindCourseNarration(project, 'lesson')
  let resolve!: (value: SpeechJobRecord) => void
  const pending = new Promise<SpeechJobRecord>(r => { resolve = r }), persist = vi.fn()
  const session = new AudioStudioSession(project, 'test', binding.script, voice, { client: { startSpeech: async () => pending, speechStatus: async () => job(), cancelSpeech: async () => job() }, environment: () => ({ project, connection: 'test' }), snapshot: vi.fn(), persist, publish: vi.fn(), saveResult: (value, result, text) => registerCourseNarration(value, result, text, binding) })
  const run = session.run(); const changed = projectCourse(project)!; changed.audience = 'Changed audience'; project = saveCourseOutline(project, changed); resolve(job()); await run
  expect(persist).not.toHaveBeenCalled(); expect(session.wasDetached).toBe(true)
})
it.each(uiLanguages)('renders source choices and generated provenance in %s without auto-starting', language => {
  const project = fixture(), binding = bindCourseNarration(project, 'lesson')
  const saved = parseProject(JSON.parse(JSON.stringify(registerCourseNarration(project, job(), binding.script, binding))))
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AudioStudioPanel, { project: saved, history: new PersistentVersionHistory(store()), workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }) }))
  expect(html).toContain(translateUi(language, 'course.narration.heading'))
  expect(html).toContain(translateUi(language, 'course.narration.asset', { lesson: binding.course.lessonTitle, revision: 1, language: 'fr' }))
  expect(html).toContain('Keep the main production script')
  expect(html).toContain('Module / Leçon 🌍')
})
