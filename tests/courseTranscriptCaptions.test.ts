import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { bindCourseNarration, registerCourseNarration } from '../src/core/courseNarration'
import { applyCourseNarrationPlacement, reviewCourseNarrationPlacement } from '../src/core/courseNarrationPlacement'
import { applyCourseTranscriptCaptions, courseCaptionReviewIsCurrent, reviewCourseTranscriptCaptions } from '../src/core/courseTranscriptCaptions'
import { isCourseTranscript, registerTranscriptAsset } from '../src/core/transcripts'
import { addCaption, addTranscriptCaptions } from '../src/core/captions'
import type { SttJobRecord, SttTranscript } from '../src/core/sttJobs'
import { CourseTranscriptCaptionsPanel } from '../src/components/CourseTranscriptCaptionsPanel'
import { CaptionEditor } from '../src/components/CaptionEditor'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { PersistentVersionHistory } from '../src/core/versioning'
import { ProjectRepository } from '../src/core/persistence'

function fixture() {
  const p = createProject('Lesson captions')
  let project = saveCourseOutline(p, { ...newCourseOutline(p), id: 'course', language: 'fr', modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Leçon 🌍', objective: '', script: 'Bonjour le monde. Exemple.', range: { inMs: 1000, outMs: 4000 } }] }] })
  const binding = bindCourseNarration(project, 'lesson')
  project = registerCourseNarration(project, { id: 'voice-job', adapterId: 'piper', voiceId: 'KINAOU/Models/fr.onnx', state: 'succeeded', progress: 1, audioPath: 'KINAOU/Assets/GeneratedVoice/voice-job.wav', durationMs: 2000, sizeBytes: 5000, createdAt: 'x', updatedAt: 'x' }, binding.script, binding)
  const source = project.assets[0]
  project = applyCourseNarrationPlacement(project, reviewCourseNarrationPlacement(project, source.id, null))
  const job: SttJobRecord = { id: 'stt-job', state: 'succeeded', progress: 1, createdAt: 'x', updatedAt: 'x', transcriptPath: 'KINAOU/Projects/Transcripts/stt-job.json', transcript: { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'fr', text: 'Bonjour le monde. Exemple.', segments: [{ startMs: 200, endMs: 900, text: 'Bonjour le monde.' }, { startMs: 1100, endMs: 1900, text: 'Exemple.' }] } }
  project = registerTranscriptAsset(project, source.id, job)
  return { project, transcriptId: project.assets[1].id, sourceId: source.id, job }
}
function fixtureWithTrack() { const f = fixture(); f.project.tracks.push({ id: 'caption', type: 'caption', name: 'Captions', locked: false, muted: false, clips: [] }); return f }

it('reviews source-relative transcript segments on the actual lesson timeline and applies reversibly without source writes', () => {
  const { project, transcriptId, sourceId } = fixture(), before = JSON.stringify(project)
  const review = reviewCourseTranscriptCaptions(project, transcriptId)
  expect(review.segments).toMatchObject([{ startMs: 1200, durationMs: 700, sourceStartMs: 200, sourceEndMs: 900, text: 'Bonjour le monde.' }, { startMs: 2100, durationMs: 800 }])
  expect(Object.isFrozen(review.segments[0])).toBe(true)
  const next = applyCourseTranscriptCaptions(project, review), captions = next.tracks.find(track => track.type === 'caption')!
  expect(captions.clips.map(clip => [clip.startMs, clip.durationMs])).toEqual([[1200, 700], [2100, 800]])
  expect(next.assets[2].metadata).toMatchObject({ transcriptAssetId: transcriptId, transcriptSegmentIndex: 0, courseNarrationAssetId: sourceId, sourceStartMs: 200, sourceEndMs: 900 })
  expect(next.assets.slice(0, 2)).toEqual(project.assets); expect(next.tracks[0]).toEqual(project.tracks[0]); expect(next.metadata).toEqual(project.metadata)
  expect(JSON.stringify(project)).toBe(before); expect(courseCaptionReviewIsCurrent(next, review)).toBe(false)
  expect(() => applyCourseTranscriptCaptions(next, review)).toThrow('stale')
})
it('retains course attribution in transcripts and refuses misleading generic zero-based import', () => {
  const { project, transcriptId, sourceId, job } = fixtureWithTrack(), transcript = project.assets[1]
  expect(transcript.metadata.courseNarrationSource).toEqual(project.assets[0].metadata.courseNarrationSource)
  expect(registerTranscriptAsset(project, sourceId, job)).toBe(project)
  expect(() => addTranscriptCaptions(project, transcriptId, [0])).toThrow('reviewed course')
  project.assets = project.assets.filter(asset => asset.id !== sourceId)
  expect(isCourseTranscript(project, transcript)).toBe(true)
  expect(() => addTranscriptCaptions(project, transcriptId, [0])).toThrow('reviewed course')
  expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('source')
})
it('supports legacy transcripts through their present course audio without silently rewriting provenance', () => {
  const { project, transcriptId } = fixture(); delete project.assets[1].metadata.courseNarrationSource
  expect(isCourseTranscript(project, project.assets[1])).toBe(true)
  expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).not.toThrow()
  expect(project.assets[1].metadata.courseNarrationSource).toBeUndefined()
})
it.each(['script', 'project', 'course', 'language', 'missing-source', 'source-offline', 'source-unmanaged', 'source-path', 'duplicate-source', 'retained-attribution'] as const)('blocks changed %s attribution', kind => {
  const { project, transcriptId } = fixture(), course = projectCourse(project)!
  if (kind === 'script') course.modules[0].lessons[0].script = 'Changed'
  if (kind === 'project') project.id = 'other'
  if (kind === 'course') course.id = 'other'
  if (kind === 'language') course.language = 'de'
  if (kind === 'missing-source') project.assets.splice(0, 1)
  if (kind === 'source-offline') project.assets[0].offline = true
  if (kind === 'source-unmanaged') project.assets[0].managed = false
  if (kind === 'source-path') project.assets[0].uri = 'KINAOU/Assets/../other.wav'
  if (kind === 'duplicate-source') project.assets.push(structuredClone(project.assets[0]))
  if (kind === 'retained-attribution') project.assets[1].metadata.courseNarrationSource = { bad: true }
  project.metadata.courseOutline = course
  expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('source')
})
it.each(['missing', 'duplicate', 'offline', 'unmanaged', 'path', 'malformed'] as const)('rejects %s transcript', kind => {
  const { project, transcriptId } = fixture(), transcript = project.assets[1]
  if (kind === 'missing') project.assets.pop()
  if (kind === 'duplicate') project.assets.push(structuredClone(transcript))
  if (kind === 'offline') transcript.offline = true
  if (kind === 'unmanaged') transcript.managed = false
  if (kind === 'path') transcript.uri = 'KINAOU/Projects/Transcripts/../bad.json'
  if (kind === 'malformed') transcript.metadata.transcript = { broken: true }
  expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('transcript')
})
it.each(['missing', 'duplicate', 'muted', 'silent', 'offset', 'speed', 'trim', 'start', 'range', 'duration', 'kind'] as const)('rejects unsupported %s narration placement', kind => {
  const { project, transcriptId } = fixture(), track = project.tracks[0], clip = track.clips[0]
  if (kind === 'missing') track.clips = []
  if (kind === 'duplicate') track.clips.push({ ...clip, id: 'other' })
  if (kind === 'muted') track.muted = true
  if (kind === 'silent') clip.gain = 0
  if (kind === 'offset') clip.sourceOffsetMs = 100
  if (kind === 'speed') clip.speed = 2
  if (kind === 'trim') clip.durationMs = 1000
  if (kind === 'start') clip.startMs = 2000
  if (kind === 'range') { const course = projectCourse(project)!; course.modules[0].lessons[0].range.outMs = 2500; project.metadata.courseOutline = course }
  if (kind === 'duration') project.assets[0].metadata.durationMs = NaN
  if (kind === 'kind') track.type = 'music'
  expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('placement')
})
it.each(['empty', 'overlap', 'unordered', 'overrun', 'count', 'bytes'] as const)('rejects %s segments atomically without clipping or omission', kind => {
  const { project, transcriptId } = fixture(), transcript = project.assets[1].metadata.transcript as SttTranscript
  if (kind === 'empty') transcript.segments = []
  if (kind === 'overlap') transcript.segments[1].startMs = 800
  if (kind === 'unordered') transcript.segments.reverse()
  if (kind === 'overrun') transcript.segments[1].endMs = 2001
  if (kind === 'count') transcript.segments = Array.from({ length: 1001 }, () => transcript.segments[0])
  if (kind === 'bytes') transcript.text = 'é'.repeat(100001)
  const before = JSON.stringify(project)
  expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('segments'); expect(JSON.stringify(project)).toBe(before)
})
it('requires matching recognized language, while retaining recognized text rather than substituting the script', () => {
  const { project, transcriptId } = fixture(), transcript = project.assets[1].metadata.transcript as SttTranscript
  transcript.language = 'unknown'; expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('language')
  transcript.language = 'de'; expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('language')
  transcript.language = 'fr-FR'; transcript.segments[0].text = 'Recognized test difference'
  expect(reviewCourseTranscriptCaptions(project, transcriptId).segments[0].text).toBe('Recognized test difference')
})
it.each(['locked', 'muted', 'multiple'] as const)('refuses %s caption targets', kind => {
  const { project, transcriptId } = fixtureWithTrack(), track = project.tracks[1]
  if (kind === 'locked') track.locked = true
  if (kind === 'muted') track.muted = true
  if (kind === 'multiple') project.tracks.push({ ...track, id: 'another' })
  expect(() => reviewCourseTranscriptCaptions(project, transcriptId)).toThrow('track')
})
it('refuses visible caption overlap and existing transcript captions even when muted or moved', () => {
  const f = fixtureWithTrack()
  const overlap = addCaption(f.project, { text: 'Existing', startMs: 1500, durationMs: 300 })
  expect(() => reviewCourseTranscriptCaptions(overlap, f.transcriptId)).toThrow('overlap')
  const boundary = addCaption(f.project, { text: 'Adjacent', startMs: 900, durationMs: 300 })
  expect(() => reviewCourseTranscriptCaptions(boundary, f.transcriptId)).not.toThrow()
  const inserted = applyCourseTranscriptCaptions(f.project, reviewCourseTranscriptCaptions(f.project, f.transcriptId))
  inserted.tracks[1].clips[0].startMs = 10000
  expect(() => reviewCourseTranscriptCaptions(inserted, f.transcriptId)).toThrow('duplicate')
})
it('invalidates reviews after edits and rejects forged/reloaded decisions; save-only retry and history restore preserve sources', () => {
  const { project, transcriptId } = fixture(), review = reviewCourseTranscriptCaptions(project, transcriptId)
  expect(() => applyCourseTranscriptCaptions(project, { ...review })).toThrow('stale')
  const changed = { ...project, title: 'Edited' }; expect(() => applyCourseTranscriptCaptions(changed, review)).toThrow('stale')
  const data = new Map<string, string>(); let fail = false
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (fail && key.includes('kinaou.project.')) throw Error('TEST failure'); data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repo = new ProjectRepository(store), history = new PersistentVersionHistory(store)
  repo.save(project); history.snapshot(project, 'Before lesson transcript captions', 'system')
  fail = true; expect(() => repo.save(applyCourseTranscriptCaptions(project, review))).toThrow('TEST')
  expect(courseCaptionReviewIsCurrent(project, review)).toBe(true); fail = false
  const next = repo.save(applyCourseTranscriptCaptions(project, review))
  expect(repo.load(project.id)?.assets).toHaveLength(4)
  const restored = history.restoreReversibly(next, history.list(project.id)[0].id).project
  expect(restored.assets).toEqual(project.assets); expect(restored.tracks).toEqual(project.tracks)
  expect(projectCourse(restored)).toEqual(projectCourse(project))
})
it.each(uiLanguages)('renders reviewed course import separately from generic zero-based import in %s', language => {
  const { project } = fixtureWithTrack(), persist = vi.fn(), history = new PersistentVersionHistory({ getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  const panel = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseTranscriptCaptionsPanel, { project, history, onProjectChange: persist }) }))
  expect(panel).toContain(translateUi(language, 'course.captions.heading'))
  expect(panel).toContain(`<button disabled="">${translateUi(language, 'course.captions.apply')}</button>`)
  const editor = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CaptionEditor, { project, history, onProjectChange: persist }) }))
  expect(editor).not.toContain('class="transcriptImport"'); expect(persist).not.toHaveBeenCalled()
})
