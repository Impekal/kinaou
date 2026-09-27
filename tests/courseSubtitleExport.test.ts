import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { addCaption } from '../src/core/captions'
import { courseSubtitleReviewIsCurrent, downloadReviewedCourseSubtitles, reviewCourseSubtitleExport } from '../src/core/courseSubtitleExport'
import { serializeWebVtt, webVttTimestamp } from '../src/core/webvtt'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { createRangeRenderPlan } from '../src/core/renderRange'
import { CourseSubtitleExportPanel } from '../src/components/CourseSubtitleExportPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  let project = parseProject({ ...createProject('Subtitles'), tracks: [{ id: 'captions', type: 'caption', name: 'Captions', clips: [] }] })
  project = saveCourseOutline(project, { ...newCourseOutline(project), id: 'course', language: 'fr', modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Leçon 🌍', objective: '', range: { inMs: 5000, outMs: 8000 } }] }] })
  project = addCaption(project, { text: 'Bonjour <b>🌍</b> & A --> B', startMs: 4800, durationMs: 1000 })
  project = addCaption(project, { text: 'Deuxième\nligne', startMs: 6100, durationMs: 800 })
  project = addCaption(project, { text: 'Fin', startMs: 7700, durationMs: 600 })
  return project
}

it('exports complete caption text with lesson-relative clipped times matching range rendering, without project writes', () => {
  const project = fixture(), before = JSON.stringify(project), review = reviewCourseSubtitleExport(project, 'lesson')
  expect(review).toMatchObject({ lessonTitle: 'Leçon 🌍', language: 'fr', revision: 1, durationMs: 3000, clippedCues: 2, filename: 'lesson-lesson-fr-r1.vtt' })
  expect(review.cues.map(cue => [cue.startMs, cue.endMs])).toEqual([[0, 800], [1100, 1900], [2700, 3000]])
  const full = createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/whole.mp4')
  const render = createRangeRenderPlan(full, { inMs: 5000, outMs: 8000 }, 'KINAOU/Renders/lesson.mp4')
  expect(render.clips.map(clip => [clip.startMs, clip.startMs + clip.durationMs])).toEqual(review.cues.map(cue => [cue.startMs, cue.endMs]))
  const file = downloadReviewedCourseSubtitles(project, review)
  expect(file.mimeType).toBe('text/vtt;charset=utf-8')
  expect(file.text).toBe('WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.800\nBonjour &lt;b&gt;🌍&lt;/b&gt; &amp; A --&gt; B\n\n2\n00:00:01.100 --> 00:00:01.900\nDeuxième\nligne\n\n3\n00:00:02.700 --> 00:00:03.000\nFin\n')
  expect(JSON.stringify(project)).toBe(before); expect(Object.isFrozen(review.cues[0])).toBe(true)
})
it('excludes muted and outside clips, includes locked readable captions, and sorts independent of storage order', () => {
  const project = fixture()
  project.tracks[0].clips.reverse(); project.tracks[0].locked = true
  project.tracks.push({ ...structuredClone(project.tracks[0]), id: 'muted', muted: true })
  expect(reviewCourseSubtitleExport(project, 'lesson').cues).toHaveLength(3)
  const outside = addCaption({ ...project, tracks: [{ ...project.tracks[0], locked: false }] }, { text: 'Outside', startMs: 8000, durationMs: 500 })
  expect(reviewCourseSubtitleExport(outside, 'lesson').cues).toHaveLength(3)
  project.tracks[0].muted = true
  expect(() => reviewCourseSubtitleExport(project, 'lesson')).toThrow('captions')
})
it.each(['asset', 'duplicate-asset', 'offline', 'unmanaged', 'kind', 'track', 'speed'] as const)('rejects unsupported %s in an included caption without a partial file', kind => {
  const project = fixture()
  if (kind === 'asset') project.assets.shift()
  if (kind === 'duplicate-asset') project.assets.push(structuredClone(project.assets[0]))
  if (kind === 'offline') project.assets[0].offline = true
  if (kind === 'unmanaged') project.assets[0].managed = false
  if (kind === 'kind') project.assets[0].kind = 'image'
  if (kind === 'track') project.tracks[0].type = 'video'
  if (kind === 'speed') project.tracks[0].clips[0].speed = 2
  expect(() => reviewCourseSubtitleExport(project, 'lesson')).toThrow('unsupported')
})
it('rejects overlaps across visible caption tracks rather than dropping one', () => {
  const project = fixture(); project.tracks.push({ ...structuredClone(project.tracks[0]), id: 'other' })
  expect(() => reviewCourseSubtitleExport(project, 'lesson')).toThrow('overlap')
})
it.each(['', ' \n ', 'A\n\nB', '\nA', 'A\n', 'A\u0000B', 'A\u0007B', '\ud800'])('rejects ambiguous or invalid cue text %j', text => {
  const project = fixture(); project.assets[0].metadata.text = text
  expect(() => reviewCourseSubtitleExport(project, 'lesson')).toThrow('text')
})
it('normalizes CRLF line endings only and preserves literal entity-looking text and Unicode', () => {
  const result = serializeWebVtt([{ startMs: 0, endMs: 1000, text: '  A &amp; <00:00:01.000>\r\nÜé🌍  ' }])
  expect(result).toContain('  A &amp;amp; &lt;00:00:01.000&gt;\nÜé🌍  ')
})
it.each([0, 1, 999, 1000, 60000, 3600000, 86400000])('formats exact millisecond timestamp %s', ms => {
  const parts = webVttTimestamp(ms).split(/[:.]/).map(Number)
  expect(((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000 + parts[3]).toBe(ms)
})
it.each([-1, 0.5, NaN, Infinity, 86400001])('rejects invalid timestamp %s', ms => { expect(() => webVttTimestamp(ms)).toThrow() })
it('enforces bounded whole-file output and refuses unordered/invalid cues', () => {
  expect(() => serializeWebVtt([])).toThrow('limit')
  expect(() => serializeWebVtt(Array.from({ length: 1001 }, (_, index) => ({ startMs: index, endMs: index + 1, text: 'A' })))).toThrow('limit')
  expect(() => serializeWebVtt([{ startMs: 0, endMs: 10, text: 'é'.repeat(600000) }])).toThrow('limit')
  expect(() => serializeWebVtt([{ startMs: 0, endMs: 10, text: 'A' }, { startMs: 9, endMs: 20, text: 'B' }])).toThrow('overlapping')
  expect(() => serializeWebVtt([{ startMs: 10, endMs: 10, text: 'A' }])).toThrow('overlapping')
  const project = fixture(); project.assets[0].metadata.text = 'é'.repeat(600000)
  expect(() => reviewCourseSubtitleExport(project, 'lesson')).toThrow('limit')
})
it('rejects missing lessons and stale, reconstructed or edited review state', () => {
  const project = fixture(), review = reviewCourseSubtitleExport(project, 'lesson')
  expect(() => reviewCourseSubtitleExport(project, 'missing')).toThrow('lesson')
  expect(() => downloadReviewedCourseSubtitles(project, { ...review })).toThrow('stale')
  expect(() => downloadReviewedCourseSubtitles(project, JSON.parse(JSON.stringify(review)))).toThrow('stale')
  project.assets[0].metadata.text = 'Changed'
  expect(courseSubtitleReviewIsCurrent(project, review)).toBe(false)
  expect(() => downloadReviewedCourseSubtitles(project, review)).toThrow('stale')
  expect(downloadReviewedCourseSubtitles(project, reviewCourseSubtitleExport(project, 'lesson')).text).toContain('Changed')
})
it('writes a real UTF-8 sidecar that ffprobe reads with exact lesson-relative packet times', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'kinaou-course-vtt-'))
  try {
    const project = fixture(), file = downloadReviewedCourseSubtitles(project, reviewCourseSubtitleExport(project, 'lesson'))
    const target = path.join(temporary, file.filename); await writeFile(target, file.text, { encoding: 'utf8', flag: 'wx' })
    const parsed = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_packets', '-show_entries', 'packet=pts_time,duration_time', '-of', 'json', target], { encoding: 'utf8' }))
    expect(parsed.packets.map((packet: { pts_time: string; duration_time: string }) => [Number(packet.pts_time), Number(packet.duration_time)])).toEqual([[0, 0.8], [1.1, 0.8], [2.7, 0.3]])
    expect(await readFile(target, 'utf8')).toBe(file.text)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
it.each(uiLanguages)('requires saved input, review and acknowledgement for %s download', language => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseSubtitleExportPanel, { project: fixture(), dirty: true }) }))
  expect(html).toContain(translateUi(language, 'course.subtitles.heading'))
  expect(html).toContain(translateUi(language, 'course.saveFirst'))
  expect(html).toContain(`<button disabled="">${translateUi(language, 'course.subtitles.download')}</button>`)
})
