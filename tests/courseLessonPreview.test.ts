import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { createCourseLessonPreview } from '../src/core/courseLessonPreview'
import { createRenderPlan, formatProfiles, projectFormatPreset, setProjectFormatReframing } from '../src/core/render'
import { createRangeRenderPlan } from '../src/core/renderRange'
import { freshPreviewPlan } from '../src/core/previewSession'
import { defaultAudioDucking } from '../src/core/audioDucking'
import { defaultLoudnessNormalization } from '../src/core/audioLoudness'
import { projectExportHistory } from '../src/core/exportHistory'
import { CourseLessonPreviewPanel } from '../src/components/CourseLessonPreviewPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = parseProject({ ...createProject('Preview'), assets: [
    { id: 'video', kind: 'video', managed: true, uri: 'KINAOU/Assets/video.mp4', metadata: { durationMs: 8000 } },
    { id: 'voice', kind: 'audio', managed: true, uri: 'KINAOU/Assets/voice.wav', metadata: { durationMs: 4000 } },
    { id: 'caption', kind: 'caption', managed: true, uri: 'kinaou://caption/caption', metadata: { text: 'Authorized caption' } }
  ], tracks: [
    { id: 'visual', type: 'video', name: 'Video', clips: [{ id: 'v', assetId: 'video', startMs: 0, durationMs: 4000, sourceOffsetMs: 0, speed: 2 }] },
    { id: 'speech', type: 'voice', name: 'Voice', clips: [{ id: 'a', assetId: 'voice', startMs: 0, durationMs: 4000, gain: 0.5, fadeInMs: 200, fadeOutMs: 300 }] },
    { id: 'captions', type: 'caption', name: 'Captions', clips: [{ id: 'c', assetId: 'caption', startMs: 1500, durationMs: 2000 }] }
  ] })
  return saveCourseOutline(project, { ...newCourseOutline(project), modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Second part', objective: 'Observe', range: { inMs: 2000, outMs: 4000 } }] }] })
}
it.each(['landscape', 'vertical', 'square'] as const)('uses exact saved range and existing %s preview pipeline without receipts or mutation', format => {
  const project = fixture(), before = JSON.stringify(project), settings = { audioDucking: { ...defaultAudioDucking, reductionDb: 9 }, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: true } }
  const result = createCourseLessonPreview(project, 'lesson', format, settings)
  const expected = createRangeRenderPlan(createRenderPlan(project, projectFormatPreset(project, format, 'preview'), result.plan.outputRelativePath, settings), { inMs: 2000, outMs: 4000 }, result.plan.outputRelativePath)
  expect(result.plan).toEqual(expected); expect(result.plan.purpose).toBe('preview'); expect(result.plan.durationMs).toBe(2000)
  expect(result.plan.preset.width).toBe(formatProfiles[format].preview.width); expect(result.plan.preset.height).toBe(formatProfiles[format].preview.height)
  expect(result.plan.clips.find(c => c.asset.id === 'video')?.sourceOffsetMs).toBe(4000)
  expect(result.plan.clips.find(c => c.asset.id === 'caption')?.durationMs).toBe(1500)
  expect(result.context).toMatchObject({ lessonId: 'lesson', outlineRevision: projectCourse(project)!.revision })
  expect(result.plan.audioDucking).toEqual(settings.audioDucking); expect(result.plan.loudnessNormalization).toEqual(settings.loudnessNormalization)
  expect(projectExportHistory(project)).toEqual([]); expect(JSON.stringify(project)).toBe(before)
})
it('preserves explicit target framing without changing project output format', () => {
  const project = setProjectFormatReframing(fixture(), 'vertical', { fit: 'cover', focusX: 0.2, focusY: 0.8 }), before = JSON.stringify(project)
  expect(createCourseLessonPreview(project, 'lesson', 'vertical').plan.preset).toMatchObject({ fit: 'cover', focusX: 0.2, focusY: 0.8 })
  expect(JSON.stringify(project)).toBe(before)
})
it('each submitted preview receives a separate managed cache path', () => {
  const prepared = createCourseLessonPreview(fixture(), 'lesson', 'landscape').plan, a = freshPreviewPlan(prepared), b = freshPreviewPlan(prepared)
  expect(a.outputRelativePath).not.toBe(b.outputRelativePath)
  expect(a.outputRelativePath).toMatch(/^KINAOU\/Cache\/Previews\/preview-[a-f0-9-]+\.mp4$/)
  expect(a).toEqual({ ...prepared, outputRelativePath: a.outputRelativePath })
})
it.each(['noCourse', 'noLesson', 'outside', 'offline', 'missing', 'unmanaged', 'empty', 'audio'] as const)('refuses %s instead of silently previewing the whole project', fault => {
  let project = fixture()
  if (fault === 'noCourse') delete project.metadata.courseOutline
  if (fault === 'outside') { const course = projectCourse(project)!; course.modules[0].lessons[0].range.outMs = 5000; project = saveCourseOutline(project, course) }
  if (fault === 'offline') project.assets[0].offline = true
  if (fault === 'missing') project.assets.shift()
  if (fault === 'unmanaged') project.assets[0].managed = false
  if (fault === 'empty') project.tracks = []
  expect(() => createCourseLessonPreview(project, fault === 'noLesson' ? 'absent' : 'lesson', 'landscape', fault === 'audio' ? { audioDucking: { ...defaultAudioDucking, reductionDb: 100 } } : {})).toThrow()
})
it.each(['de', 'en', 'fr'] as const)('renders %s explicit-only cache preview with no I/O or automatic job', language => {
  const project = fixture(), fetch = vi.spyOn(globalThis, 'fetch'), busy = vi.fn()
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseLessonPreviewPanel, { project, lessonId: 'lesson', format: 'landscape', audioDucking: defaultAudioDucking, loudnessNormalization: defaultLoudnessNormalization, workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerConnected: false, workerCapabilities: [], disabled: false, onBusyChange: busy }) }))
    expect(html).toContain(translateUi(language, 'course.preview.heading')); expect(html).toContain('Module / Second part'); expect(html).toContain('disabled=""')
    expect(fetch).not.toHaveBeenCalled(); expect(busy).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
