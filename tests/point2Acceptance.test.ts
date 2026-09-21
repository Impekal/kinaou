import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { TimelineEditor } from '../src/components/TimelineEditor'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { buildCompositeFilter } from '../src/core/localWorker'
import { liveVisualLayers } from '../src/core/liveTimelinePreview'
import {
  assetSchema,
  clipSchema,
  createProject,
  parseProject,
  trackSchema
} from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import {
  applyTimelineOperation,
  type TimelineOperation
} from '../src/core/timeline'
import {
  snapClipGroupDelta,
  trimClipEdge
} from '../src/core/timelineInteraction'
import { TimelineUndoSession } from '../src/core/timelineUndo'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const video = assetSchema.parse({
    id: 'video',
    kind: 'video',
    uri: 'KINAOU/Assets/video.mp4',
    managed: true,
    offline: false,
    metadata: {
      name: 'Video',
      durationMs: 12_000,
      proxyPath: 'KINAOU/Cache/Proxies/video_960p.mp4'
    }
  })

  const voice = assetSchema.parse({
    id: 'voice',
    kind: 'audio',
    uri: 'KINAOU/Assets/voice.wav',
    managed: true,
    offline: false,
    metadata: {
      name: 'Voice',
      durationMs: 12_000
    }
  })

  const animated = clipSchema.parse({
    id: 'animated',
    assetId: video.id,
    startMs: 1000,
    durationMs: 4000,
    sourceOffsetMs: 1000,
    gain: 1,
    speed: 1,
    fades: {
      inMs: 500,
      outMs: 500
    },
    transformKeyframes: {
      start: {
        x: -96,
        y: 0,
        scale: 1
      },
      end: {
        x: 96,
        y: 54,
        scale: 1.5
      }
    }
  })

  const neighbor = clipSchema.parse({
    id: 'neighbor',
    assetId: video.id,
    startMs: 8000,
    durationMs: 1000,
    sourceOffsetMs: 0
  })

  const narration = clipSchema.parse({
    id: 'narration',
    assetId: voice.id,
    startMs: 1000,
    durationMs: 4000,
    sourceOffsetMs: 0
  })

  const project = parseProject({
    ...createProject('Point 2 acceptance'),
    assets: [video, voice],
    tracks: [
      trackSchema.parse({
        id: 'visual',
        type: 'video',
        name: 'Video',
        clips: [animated, neighbor]
      }),
      trackSchema.parse({
        id: 'voice',
        type: 'voice',
        name: 'Voice',
        clips: [narration]
      })
    ]
  })

  return {
    project,
    video,
    animated,
    narration
  }
}

function memoryHistory() {
  const values = new Map<string, string>()

  return new PersistentVersionHistory({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    }
  })
}

describe('completion point 2 acceptance', () => {
  it('combines precise group movement, trimming and playhead splitting without mutating source media', () => {
    const { project, video, animated, narration } = fixture()
    const before = JSON.stringify(project)

    const delta = snapClipGroupDelta(
      project.tracks,
      [
        {
          trackId: 'visual',
          clipId: animated.id,
          startMs: animated.startMs,
          durationMs: animated.durationMs
        },
        {
          trackId: 'voice',
          clipId: narration.id,
          startMs: narration.startMs,
          durationMs: narration.durationMs
        }
      ],
      'visual',
      animated.id,
      6910,
      true
    )

    expect(delta).toBe(7000)

    const grouped = applyTimelineOperation(project, {
      type: 'move-clips',
      moves: [
        {
          trackId: 'visual',
          clipId: animated.id,
          startMs: animated.startMs + delta
        },
        {
          trackId: 'voice',
          clipId: narration.id,
          startMs: narration.startMs + delta
        }
      ]
    })

    expect(grouped.tracks[0].clips[0].startMs).toBe(8000)
    expect(grouped.tracks[1].clips[0].startMs).toBe(8000)

    const trimmed = trimClipEdge(
      project.tracks,
      'visual',
      animated,
      video,
      'end',
      4500,
      false
    )

    expect(trimmed).toEqual({
      startMs: 1000,
      durationMs: 3500,
      sourceOffsetMs: 1000
    })

    const split = applyTimelineOperation(project, {
      type: 'split-clip',
      trackId: 'visual',
      clipId: animated.id,
      splitMs: 3000,
      rightClipId: 'animated-right'
    })

    expect(split.tracks[0].clips.slice(0, 2).map((clip) => [
      clip.startMs,
      clip.durationMs
    ])).toEqual([
      [1000, 2000],
      [3000, 2000]
    ])

    expect(split.tracks[0].clips[1].sourceOffsetMs).toBe(3000)
    expect(JSON.stringify(project)).toBe(before)
    expect(project.assets[0].uri).toBe('KINAOU/Assets/video.mp4')
  })

  it('treats each completed manual operation as one session-level undo/redo state', () => {
    const { project, animated, narration } = fixture()
    const session = new TimelineUndoSession(project)

    const operation: TimelineOperation = {
      type: 'move-clips',
      moves: [
        {
          trackId: 'visual',
          clipId: animated.id,
          startMs: 2500
        },
        {
          trackId: 'voice',
          clipId: narration.id,
          startMs: 2500
        }
      ]
    }

    const edited = applyTimelineOperation(project, operation)

    session.record(project, edited)

    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)

    const undone = session.undo(edited, vi.fn())!

    expect(undone.tracks[0].clips[0].startMs).toBe(1000)
    expect(undone.tracks[1].clips[0].startMs).toBe(1000)
    expect(session.canRedo).toBe(true)

    const redone = session.redo(undone, vi.fn())!

    expect(redone.tracks[0].clips[0].startMs).toBe(2500)
    expect(redone.tracks[1].clips[0].startMs).toBe(2500)
  })

  it('uses the same timeline state for immediate editing preview and final render keyframes', () => {
    const { project } = fixture()

    const layers = liveVisualLayers(project, 3000)

    expect(layers).toHaveLength(1)
    expect(layers[0]).toMatchObject({
      clipId: 'animated',
      sourceTimeMs: 3000,
      x: 0,
      y: 27,
      scale: 1.25
    })

    const plan = createRenderPlan(
      project,
      formatProfiles.landscape.export,
      'KINAOU/Renders/point2-acceptance.mp4'
    )

    expect(plan.clips.find((clip) => clip.clipId === 'animated')?.transformKeyframes)
      .toEqual(project.tracks[0].clips[0].transformKeyframes)

    const graph = buildCompositeFilter(plan).graph

    expect(graph).toContain('eval=frame')
    expect(graph).toContain("min(1,max(0,(t-1.000)/4.000))")
  })

  it.each(uiLanguages)('exposes the completed editing workflow truthfully in %s', (language) => {
    const { project } = fixture()

    const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
      initialLanguage: language,
      children: createElement(TimelineEditor, {
        project,
        history: memoryHistory(),
        onProjectChange: vi.fn(),
        workerUrl: '',
        workerToken: '',
        workerConnected: false,
        playheadMs: 3000,
        onPlayheadChange: vi.fn()
      })
    }))

    expect(html).toContain(translateUi(language, 'timeline.help'))
    expect(html).toContain(translateUi(language, 'timeline.undo'))
    expect(html).toContain(translateUi(language, 'timeline.redo'))
    expect(html).toContain(translateUi(language, 'preview.liveHeading'))
    expect(html).toContain(translateUi(language, 'preview.liveHelp'))
    expect(html).toContain(
      translateUi(language, 'timeline.effects').replaceAll('&', '&amp;')
    )
  })
})
