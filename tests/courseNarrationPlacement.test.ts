import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { bindCourseNarration, registerCourseNarration } from '../src/core/courseNarration'
import { applyCourseNarrationPlacement, courseNarrationPlacementIsCurrent, reviewCourseNarrationPlacement } from '../src/core/courseNarrationPlacement'
import { CourseNarrationPlacementControl } from '../src/components/CourseNarrationPlacementControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { displaySystemHistoryLabel } from '../src/core/uiSystemLabels'
import { PersistentVersionHistory } from '../src/core/versioning'
import { ProjectRepository } from '../src/core/persistence'

function fixture() {
  const original = createProject('Placement test')
  const course = saveCourseOutline(original, { ...newCourseOutline(original), id: 'course', language: 'fr', modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Leçon', objective: '', script: 'Bonjour 🌍', range: { inMs: 1000, outMs: 4000 } }] }] })
  const binding = bindCourseNarration(course, 'lesson')
  return parseProject({ ...registerCourseNarration(course, { id: 'job', adapterId: 'piper', voiceId: 'KINAOU/Models/fr.onnx', state: 'succeeded', progress: 1, audioPath: 'KINAOU/Assets/GeneratedVoice/job.wav', durationMs: 2000, sizeBytes: 5000, createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:01Z' }, binding.script, binding), tracks: [{ id: 'voice', type: 'voice', name: 'Voice', clips: [] }] })
}
const inspect = (project: KinaouProject, target: string | null = 'voice') => reviewCourseNarrationPlacement(project, project.assets[0].id, target)
const clip = (assetId = 'other', startMs = 1500, durationMs = 500) => ({ id: 'existing', assetId, startMs, durationMs, gain: 1, speed: 1, sourceOffsetMs: 0 })

it.each(['voice', null])('places the full measured recording at the lesson start on %s without edits to source, course or other tracks', target => {
  const project = fixture(), before = JSON.stringify(project), review = inspect(project, target)
  expect(review).toMatchObject({ startMs: 1000, endMs: 3000, durationMs: 2000, remainingMs: 1000, sourceRevision: 1, currentRevision: 1 })
  expect(Object.isFrozen(review)).toBe(true); expect(JSON.stringify(project)).toBe(before)
  const next = applyCourseNarrationPlacement(project, review), track = next.tracks.at(-1)!
  expect(track).toMatchObject({ type: 'voice', muted: false, locked: false })
  expect(track.clips).toHaveLength(1)
  expect(track.clips[0]).toMatchObject({ assetId: project.assets[0].id, startMs: 1000, durationMs: 2000, sourceOffsetMs: 0, speed: 1, gain: 1 })
  expect(next.assets).toEqual(project.assets); expect(next.metadata).toEqual(project.metadata)
  expect(next.storyboard).toEqual(project.storyboard)
  if (target === null) expect(next.tracks[0]).toEqual(project.tracks[0])
  expect(JSON.stringify(project)).toBe(before)
  expect(courseNarrationPlacementIsCurrent(next, review)).toBe(false)
  expect(() => applyCourseNarrationPlacement(next, review)).toThrow('stale')
})
it('requires the exact reviewed snapshot and refuses revived or forged reviews', () => {
  const project = fixture(), review = inspect(project)
  expect(() => applyCourseNarrationPlacement(project, { ...review })).toThrow('stale')
  expect(() => applyCourseNarrationPlacement(project, JSON.parse(JSON.stringify(review)))).toThrow('stale')
  project.title = 'Changed'
  expect(courseNarrationPlacementIsCurrent(project, review)).toBe(false)
  expect(() => applyCourseNarrationPlacement(project, review)).toThrow('stale')
})
it('permits a fresh review after deliberate range, title and module edits with unchanged script and language', () => {
  let project = fixture(); const old = inspect(project), course = projectCourse(project)!
  course.modules[0].id = 'moved'; course.modules[0].lessons[0].title = 'Renamed'
  course.modules[0].lessons[0].range = { inMs: 6000, outMs: 9000 }
  project = saveCourseOutline(project, course)
  expect(() => applyCourseNarrationPlacement(project, old)).toThrow('stale')
  expect(inspect(project)).toMatchObject({ lessonTitle: 'Renamed', startMs: 6000, endMs: 8000, sourceRevision: 1, currentRevision: 2 })
})
it.each(['project', 'course', 'language', 'script', 'removed', 'missing', 'malformed'] as const)('blocks changed %s source', kind => {
  const project = fixture(), course = projectCourse(project)!
  if (kind === 'project') project.id = 'other-project'
  if (kind === 'course') course.id = 'other-course'
  if (kind === 'language') course.language = 'en'
  if (kind === 'script') course.modules[0].lessons[0].script = 'Changed'
  if (kind === 'removed') course.modules = []
  if (kind === 'missing') delete project.assets[0].metadata.courseNarrationSource
  if (kind === 'malformed') project.assets[0].metadata.courseNarrationSource = { bad: true }
  project.metadata.courseOutline = course
  expect(() => inspect(project)).toThrow('source')
})
it.each(['offline', 'unmanaged', 'traversal', 'non-assets', 'kind', 'duplicate-id'] as const)('rejects %s media', kind => {
  const project = fixture(), asset = project.assets[0]
  if (kind === 'offline') asset.offline = true
  if (kind === 'unmanaged') asset.managed = false
  if (kind === 'traversal') asset.uri = 'KINAOU/Assets/../secret.wav'
  if (kind === 'non-assets') asset.uri = 'KINAOU/Models/model.wav'
  if (kind === 'kind') asset.kind = 'video'
  if (kind === 'duplicate-id') project.assets.push(structuredClone(asset))
  expect(() => inspect(project)).toThrow('media')
})
it.each([undefined, 0, -1, NaN, Infinity, 86400001, '2000'])('rejects invalid measured duration %s', duration => {
  const project = fixture(); project.assets[0].metadata.durationMs = duration
  expect(() => inspect(project)).toThrow('duration')
})
it('rounds duration up and never trims, stretches or moves the lesson to hide an overrun', () => {
  const project = fixture(); project.assets[0].metadata.durationMs = 2000.2
  expect(inspect(project)).toMatchObject({ durationMs: 2001, endMs: 3001 })
  project.assets[0].metadata.durationMs = 3000
  expect(inspect(project).remainingMs).toBe(0)
  project.assets[0].metadata.durationMs = 3000.01
  const before = JSON.stringify(project)
  expect(() => inspect(project)).toThrow('overrun'); expect(JSON.stringify(project)).toBe(before)
})
it.each(['muted', 'locked', 'kind', 'missing', 'duplicate-id'] as const)('rejects %s target track', kind => {
  const project = fixture()
  if (kind === 'muted') project.tracks[0].muted = true
  if (kind === 'locked') project.tracks[0].locked = true
  if (kind === 'kind') project.tracks[0].type = 'music'
  if (kind === 'missing') project.tracks = []
  if (kind === 'duplicate-id') project.tracks.push(structuredClone(project.tracks[0]))
  expect(() => inspect(project)).toThrow('track')
})
it('blocks duplicates even on muted tracks or outside the lesson', () => {
  const project = fixture(); project.tracks[0].muted = true; project.tracks[0].clips.push(clip(project.assets[0].id, 10000))
  expect(() => inspect(project, null)).toThrow('duplicate')
})
it('prevents overlaps across speech tracks, including new-track attempts, but allows adjacency and muted/background clips', () => {
  const project = fixture(); project.tracks.push({ id: 'dialog', type: 'dialog', name: 'Other', locked: false, muted: false, clips: [clip()] })
  expect(() => inspect(project)).toThrow('overlap'); expect(() => inspect(project, null)).toThrow('overlap')
  project.tracks[1].clips[0].startMs = 3000
  expect(() => inspect(project)).not.toThrow()
  project.tracks[1].clips[0] = clip('other', 500, 500)
  expect(() => inspect(project)).not.toThrow()
  project.tracks[1].clips[0].startMs = 1500; project.tracks[1].muted = true
  expect(() => inspect(project)).not.toThrow()
  project.tracks[1].muted = false; project.tracks[1].type = 'music'
  expect(() => inspect(project)).not.toThrow()
  project.assets.push({ ...structuredClone(project.assets[0]), id: 'other' })
  expect(() => inspect(project)).toThrow('overlap')
})
it('keeps a failed-save review retryable and restores the previous project from durable history', () => {
  const data = new Map<string, string>(); let fail = false
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (fail && key.includes('kinaou.project.')) throw Error('TEST save failure'); data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repo = new ProjectRepository(store), history = new PersistentVersionHistory(store)
  const project = repo.save(fixture()), review = inspect(project)
  history.snapshot(project, 'Before placing lesson narration', 'system')
  fail = true; expect(() => repo.save(applyCourseNarrationPlacement(project, review))).toThrow('TEST')
  expect(repo.load(project.id)?.tracks[0].clips).toHaveLength(0)
  expect(courseNarrationPlacementIsCurrent(project, review)).toBe(true)
  fail = false; const placed = repo.save(applyCourseNarrationPlacement(project, review))
  expect(repo.load(project.id)?.tracks[0].clips).toHaveLength(1)
  expect(history.restoreReversibly(placed, history.list(project.id)[0].id).project.tracks[0].clips).toHaveLength(0)
})
it.each(uiLanguages)('renders an explicit review before placement and localized history in %s', language => {
  const project = fixture(), persist = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseNarrationPlacementControl, { project, asset: project.assets[0], history: new PersistentVersionHistory({ getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }), onProjectChange: persist }) }))
  expect(html).toContain(translateUi(language, 'course.voicePlace.heading'))
  expect(html).toContain(`<button class="secondaryButton" disabled="">${translateUi(language, 'course.voicePlace.apply')}</button>`)
  expect(persist).not.toHaveBeenCalled()
  expect(displaySystemHistoryLabel({ source: 'system', label: 'Before placing lesson narration' }, (key, values) => translateUi(language, key, values))).toBe(translateUi(language, 'history.system.courseNarrationPlacement'))
})
