import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, parseProject, trackSchema, type KinaouProject } from '../src/core/project'
import { createRenderPlan, createTimelinePreviewPlan, defaultFormatReframing, formatProfiles, formatReframingRequiresWorker, projectFormatPreset, projectFormatReframing, projectTargetFormat, setProjectFormatReframing, setProjectTargetFormat } from '../src/core/render'
import { renderOutputPath } from '../src/core/renderUi'
import { buildCompositeFilter } from '../src/core/localWorker'

function projectWithClip(): KinaouProject {
  const asset = assetSchema.parse({ id: 'a1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: { durationMs: 5000 } })
  const clip = clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 0, durationMs: 4000 })
  const track = trackSchema.parse({ id: 't1', type: 'video', name: 'Main Video', clips: [clip] })
  return { ...createProject('Formats'), assets: [asset], tracks: [track] }
}

describe('platform target formats', () => {
  it('defaults to landscape and only accepts known formats', () => {
    const project = projectWithClip()
    expect(projectTargetFormat(project)).toBe('landscape')
    expect(projectTargetFormat({ ...project, metadata: { targetFormat: 'nonsense' } })).toBe('landscape')
    expect(() => setProjectTargetFormat(project, 'portrait' as never)).toThrow(/Unknown target format/)
  })

  it('persists the chosen format on the project and is a no-op when unchanged', () => {
    const project = projectWithClip()
    const vertical = setProjectTargetFormat(project, 'vertical')
    expect(projectTargetFormat(vertical)).toBe('vertical')
    expect(setProjectTargetFormat(vertical, 'vertical')).toBe(vertical)
    expect(projectTargetFormat(setProjectTargetFormat(vertical, 'landscape'))).toBe('landscape')
  })

  it('persists independent, validated reframing for each output format', () => {
    const project = projectWithClip()
    expect(defaultFormatReframing('landscape')).toEqual({ fit: 'contain', focusX: 0.5, focusY: 0.5 })
    expect(defaultFormatReframing('vertical')).toEqual({ fit: 'cover', focusX: 0.5, focusY: 0.5 })

    const shifted = setProjectFormatReframing(project, 'vertical', { fit: 'cover', focusX: 0.2, focusY: 0.8 }, new Date('2026-09-13T08:00:00.000Z'))
    expect(projectFormatReframing(shifted, 'vertical')).toEqual({ fit: 'cover', focusX: 0.2, focusY: 0.8 })
    expect(projectFormatReframing(shifted, 'square')).toEqual(defaultFormatReframing('square'))
    expect(projectFormatReframing(parseProject(JSON.parse(JSON.stringify(shifted))), 'vertical')).toEqual({ fit: 'cover', focusX: 0.2, focusY: 0.8 })
    expect(shifted.updatedAt).toBe('2026-09-13T08:00:00.000Z')
    expect(setProjectFormatReframing(shifted, 'vertical', { fit: 'cover', focusX: 0.2, focusY: 0.8 })).toBe(shifted)

    const reset = setProjectFormatReframing(shifted, 'vertical', defaultFormatReframing('vertical'))
    expect(reset.metadata.formatReframing).toBeUndefined()
    expect(projectFormatReframing({ ...project, metadata: { formatReframing: { vertical: { fit: 'cover', focusX: '0.2', focusY: 0.8 } } } }, 'vertical')).toEqual(defaultFormatReframing('vertical'))
    expect(() => setProjectFormatReframing(project, 'vertical', { fit: 'cover', focusX: -0.01, focusY: 0.5 })).toThrow(/between 0 and 1/)
    expect(() => setProjectFormatReframing(project, 'vertical', { fit: 'stretch' as never, focusX: 0.5, focusY: 0.5 })).toThrow(/contain or cover/)
  })

  it('drives both the export preset and the matching composed preview', () => {
    const vertical = setProjectTargetFormat(projectWithClip(), 'vertical')
    expect(formatProfiles.vertical.export).toMatchObject({ width: 1080, height: 1920, fit: 'cover' })

    const preview = createTimelinePreviewPlan(vertical)
    expect(preview.preset).toMatchObject({ width: 540, height: 960, fit: 'cover' })
    expect(preview.purpose).toBe('preview')

    const landscapePreview = createTimelinePreviewPlan(projectWithClip())
    expect(landscapePreview.preset).toMatchObject({ width: 960, height: 540, fit: 'contain' })
  })

  it('uses the same reframing in preview and export and declares the worker capability only when needed', () => {
    const shifted = setProjectFormatReframing(setProjectTargetFormat(projectWithClip(), 'vertical'), 'vertical', { fit: 'cover', focusX: 0.1, focusY: 0.9 })
    expect(projectFormatPreset(shifted, 'vertical', 'preview')).toMatchObject({ width: 540, height: 960, fit: 'cover', focusX: 0.1, focusY: 0.9 })
    expect(projectFormatPreset(shifted, 'vertical', 'export')).toMatchObject({ width: 1080, height: 1920, fit: 'cover', focusX: 0.1, focusY: 0.9 })
    expect(formatReframingRequiresWorker(shifted, 'vertical')).toBe(true)
    expect(createTimelinePreviewPlan(shifted).requiredCapabilities).toContain('format-reframing')
    expect(formatReframingRequiresWorker(projectWithClip(), 'landscape')).toBe(false)
    expect(createTimelinePreviewPlan(projectWithClip()).requiredCapabilities).not.toContain('format-reframing')
  })

  it('names render outputs after the format without breaking the default path', () => {
    const project = projectWithClip()
    const at = new Date('2026-09-10T08:30:00.000Z')
    expect(renderOutputPath(project, at)).toBe('KINAOU/Renders/formats_2026-09-10_08-30-00-000.mp4')
    expect(renderOutputPath(project, at, 'vertical')).toBe('KINAOU/Renders/formats_vertical_2026-09-10_08-30-00-000.mp4')
    expect(renderOutputPath(project, at, '../escape')).toBe('KINAOU/Renders/formats_escape_2026-09-10_08-30-00-000.mp4')
  })
})

describe('compositor fit modes', () => {
  function videoFilterFor(fit: 'contain' | 'cover' | undefined, focus?: { focusX: number; focusY: number }) {
    const project = projectWithClip()
    const preset = { ...formatProfiles.landscape.export, width: 1080, height: 1920, ...(fit ? { fit } : {}), ...focus }
    const plan = createRenderPlan(project, preset, 'KINAOU/Renders/out.mp4')
    return buildCompositeFilter(plan).graph
  }

  it('letterboxes by default and crops cover mode at its selected focus', () => {
    expect(videoFilterFor(undefined)).toContain('scale=1080:1920:force_original_aspect_ratio=decrease')
    expect(videoFilterFor('contain')).toContain('scale=1080:1920:force_original_aspect_ratio=decrease')

    const cover = videoFilterFor('cover')
    expect(cover).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)*0.5:(ih-1920)*0.5')
    expect(cover).not.toContain('force_original_aspect_ratio=decrease')

    expect(videoFilterFor('cover', { focusX: 0, focusY: 1 })).toContain('crop=1080:1920:(iw-1080)*0:(ih-1920)*1')
    expect(() => videoFilterFor('contain', { focusX: 0, focusY: 1 })).toThrow(/requires cover/)
  })
})
