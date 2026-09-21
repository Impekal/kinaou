import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LiveTimelinePreview } from '../src/components/LiveTimelinePreview'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { liveLayerCss, liveVisualLayers } from '../src/core/liveTimelinePreview'
import { assetSchema, clipSchema, createProject, trackSchema } from '../src/core/project'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'

function fixture() {
  const video = assetSchema.parse({
    id: 'video',
    kind: 'video',
    uri: 'KINAOU/Assets/video.mp4',
    managed: true,
    metadata: {
      durationMs: 10_000,
      proxyPath: 'KINAOU/Cache/Proxies/video_960p.mp4'
    }
  })

  const image = assetSchema.parse({
    id: 'image',
    kind: 'image',
    uri: 'KINAOU/Assets/image.png',
    managed: true,
    metadata: {
      thumbnailPath: 'KINAOU/Cache/Thumbnails/image_poster.jpg'
    }
  })

  const lower = trackSchema.parse({
    id: 'lower',
    type: 'video',
    name: 'Lower',
    clips: [clipSchema.parse({
      id: 'video-clip',
      assetId: video.id,
      startMs: 1000,
      durationMs: 4000,
      sourceOffsetMs: 2000,
      speed: 2,
      fades: { inMs: 1000, outMs: 1000 },
      transformKeyframes: {
        start: { x: -96, y: 0, scale: 1 },
        end: { x: 96, y: 54, scale: 1.5 }
      }
    })]
  })

  const upper = trackSchema.parse({
    id: 'upper',
    type: 'overlay',
    name: 'Upper',
    clips: [clipSchema.parse({
      id: 'image-clip',
      assetId: image.id,
      startMs: 2000,
      durationMs: 2000,
      motion: 'zoom-in',
      transform: {
        x: 0,
        y: 0,
        scale: 1,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0
      }
    })]
  })

  return {
    ...createProject('Live preview'),
    assets: [video, image],
    tracks: [lower, upper]
  }
}

describe('live timeline preview model', () => {
  it('finds active visual layers in track order and calculates source time', () => {
    const layers = liveVisualLayers(fixture(), 2500)

    expect(layers.map((layer) => layer.clipId)).toEqual([
      'video-clip',
      'image-clip'
    ])

    expect(layers[0].sourceTimeMs).toBe(5000)
    expect(layers[0].localTimeMs).toBe(1500)
    expect(layers[0].path).toBe('KINAOU/Cache/Proxies/video_960p.mp4')
    expect(layers[1].path).toBe('KINAOU/Cache/Thumbnails/image_poster.jpg')
  })

  it('interpolates keyframes immediately at the playhead', () => {
    const layer = liveVisualLayers(fixture(), 3000)[0]

    expect(layer.x).toBe(0)
    expect(layer.y).toBe(27)
    expect(layer.scale).toBe(1.25)
  })

  it('applies clip-local fade opacity and still-image motion', () => {
    const early = liveVisualLayers(fixture(), 1500)[0]
    expect(early.opacity).toBeCloseTo(0.5)

    const still = liveVisualLayers(fixture(), 3000)[1]
    expect(still.scale).toBeCloseTo(1.09)
  })

  it('ignores muted, offline and out-of-range visuals', () => {
    const project = fixture()

    project.tracks[0].muted = true
    project.assets[1].offline = true

    expect(liveVisualLayers(project, 2500)).toEqual([])
    expect(liveVisualLayers(fixture(), 9000)).toEqual([])
  })

  it('maps render-pixel offsets proportionally onto the 960x540 editing stage', () => {
    expect(liveLayerCss({
      x: 96,
      y: -54,
      scale: 1.25,
      opacity: 0.5
    })).toEqual({
      left: '60%',
      top: '40%',
      transform: 'translate(-50%, -50%) scale(1.25)',
      opacity: 0.5
    })
  })
})

it.each(uiLanguages)('renders truthful live-preview guidance in %s', (language) => {
  const project = fixture()
  project.assets[0].metadata.proxyPath = undefined

  const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(LiveTimelinePreview, {
      project,
      playheadMs: 2500,
      workerUrl: '',
      workerToken: '',
      workerConnected: false
    })
  }))

  expect(html).toContain(translateUi(language, 'preview.liveHeading'))
  expect(html).toContain(translateUi(language, 'preview.liveHelp'))
  expect(html).toContain(translateUi(language, 'preview.liveNeedsProxy'))
  expect(html).toContain(translateUi(language, 'preview.liveConnect'))
})
