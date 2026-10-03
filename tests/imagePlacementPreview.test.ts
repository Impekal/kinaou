import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { ImageIntervalPlacement } from '../src/core/imageIntervalPlacement'
import { createTimelinePreviewPlan, setProjectTargetFormat, setProjectFormatReframing } from '../src/core/render'
import { freshPreviewPlan } from '../src/core/previewSession'
import { ShortPreviewSession } from '../src/core/shortPreviewSession'
import { translateUi } from '../src/core/uiMessages'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreviewPlayback } from '../src/components/PreviewFeedback'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'

function fixture() {
  const project = parseProject({ ...createProject('Full placement preview'), assets: [{ id: 'image', kind: 'image', managed: true, uri: 'KINAOU/Assets/image.png', metadata: {} }, { id: 'video', kind: 'video', managed: true, uri: 'KINAOU/Assets/video.mp4', metadata: { durationMs: 10000 } }], tracks: [{ id: 'v', name: 'Underlying', type: 'video', clips: [{ id: 'video', assetId: 'video', startMs: 0, durationMs: 5000, embeddedAudio: true }] }, { id: 'i', name: 'Images', type: 'image', clips: [] }] })
  return { project, request: { assetId: 'image', trackId: 'i', startMs: 1000, durationMs: 2000 } }
}
it.each(['landscape', 'vertical', 'square'] as const)('matches the complete prepared project preview in %s without insertion or changed framing/audio/layers', format => {
  const f = fixture(), project = setProjectFormatReframing(setProjectTargetFormat(f.project, format), format, { fit: 'cover', focusX: 0.2, focusY: 0.8 }), before = JSON.stringify(project), placement = new ImageIntervalPlacement(project, f.request)
  const plan = placement.preview(project), committed = placement.commit(project, '', true, vi.fn(), vi.fn())
  expect(plan).toEqual(createTimelinePreviewPlan(committed)); expect(plan.purpose).toBe('preview'); expect(plan.durationMs).toBe(5000); expect(plan.clips).toHaveLength(2)
  expect(plan.clips.find(c => c.clipId === placement.clipId)).toMatchObject({ startMs: 1000, durationMs: 2000 })
  expect(plan.requiredCapabilities).toContain('embedded-video-audio'); expect(plan.requiredCapabilities).toContain('format-reframing'); expect(plan.preset).toMatchObject({ fit: 'cover', focusX: 0.2, focusY: 0.8 }); expect(JSON.stringify(project)).toBe(before)
})
it('does not expose mutable prepared project references and creates unique output paths', () => {
  const { project, request } = fixture(), p = new ImageIntervalPlacement(project, request), first = p.preview(project)
  first.clips[0].asset.uri = 'KINAOU/Assets/replaced.mp4'; first.preset.width = 1
  const second = p.preview(project); expect(second.clips[0].asset.uri).toBe('KINAOU/Assets/video.mp4'); expect(second.preset.width).toBe(960)
  expect(freshPreviewPlan(second).outputRelativePath).not.toBe(freshPreviewPlan(second).outputRelativePath); expect(p.commit(project, '', true, vi.fn(), vi.fn()).assets).toEqual(project.assets)
})
it('bounds the entire timeline, including late muted clips; keeps explicit insertion available', () => {
  const { project, request } = fixture(); request.startMs = 58000; request.durationMs = 2000
  expect(new ImageIntervalPlacement(project, request).preview(project).durationMs).toBe(60000)
  project.tracks[0].muted = true; project.tracks[0].clips[0].startMs = 60000
  const p = new ImageIntervalPlacement(project, request); expect(() => p.preview(project)).toThrow(/previewLength/); expect(p.commit(project, '', true, vi.fn(), vi.fn()).tracks[1].clips).toHaveLength(1)
})
it.each(['project', 'scope', 'committed'])('rejects %s invalidated preview without accepting old A/B/A state', kind => {
  const { project, request } = fixture(), p = new ImageIntervalPlacement(project, request, 'A')
  if (kind === 'committed') p.commit(project, 'A', true, vi.fn(), vi.fn())
  else { p.observe(kind === 'project' ? { ...project, title: 'B' } : project, kind === 'scope' ? 'B' : 'A'); p.observe(project, 'A') }
  expect(() => p.preview(project, 'A')).toThrow(/stale/)
})
it('retries the same real preview protocol job after a lost read and detaches late media', async () => {
  const { project, request } = fixture(), plan = freshPreviewPlan(new ImageIntervalPlacement(project, request).preview(project)), job = { id: 'one', state: 'succeeded', progress: 1, outputPath: plan.outputRelativePath } as const
  const accept = vi.fn(), load = vi.fn().mockRejectedValueOnce(Error('synthetic read failure')).mockResolvedValue(new Blob(['synthetic protocol-only bytes'])), client = { startRender: vi.fn().mockResolvedValue(job), renderStatus: vi.fn(), cancelRender: vi.fn(), loadTimelinePreview: load }, publish = vi.fn()
  const session = new ShortPreviewSession(plan, { client, accept, publish }); await session.run(); expect(publish.mock.lastCall![0].phase).toBe('loadFailed'); await session.run(); expect(client.startRender).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledTimes(2); expect(accept).toHaveBeenCalledOnce()
  let release!: (b: Blob) => void; client.loadTimelinePreview = vi.fn(() => new Promise(resolve => { release = resolve })); const late = new ShortPreviewSession(plan, { client, accept, publish }), pending = late.run(); await Promise.resolve(); late.detach(); release(new Blob()); await pending; expect(accept).toHaveBeenCalledOnce()
})
it.each(['de', 'en', 'fr'] as const)('contains honest %s preview boundaries', language => {
  for (const key of ['imageInterval.previewHelp', 'imageInterval.previewLength', 'imageInterval.previewUnavailable', 'imageInterval.previewWorker'] as const) expect(translateUi(language, key).length).toBeGreaterThan(30)
})
it.each(['de', 'en', 'fr'] as const)('exposes only bounded localized %s seek shortcuts, disabled until actual metadata is loaded', language => {
  const label = translateUi(language, 'imageInterval.jumpStart'), html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(PreviewPlayback, { url: 'blob:synthetic-render-only', durationSeconds: 2, seekPoints: [{ label, seconds: 0.2 }, { label: 'Negative', seconds: -1 }, { label: 'AtEnd', seconds: 2 }, { label: 'Infinite', seconds: Infinity }, { label: 'NaN', seconds: NaN }] }) }))
  expect(html).toContain(label); expect(html).toContain('disabled=""'); for (const invalid of ['Negative', 'AtEnd', 'Infinite', 'NaN']) expect(html).not.toContain(invalid)
})
