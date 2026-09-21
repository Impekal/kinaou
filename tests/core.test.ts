import { describe, expect, it } from 'vitest'
import { createProject, trackSchema, clipSchema, assetSchema } from '../src/core/project'
import { assertSafeManagedPath, isSafeManagedPath } from '../src/core/storage'
import { applyTimelineOperation } from '../src/core/timeline'
import { VersionHistory } from '../src/core/versioning'
import { JobQueue } from '../src/core/jobs'
import { ModelRegistry } from '../src/core/models'

describe('project engine', () => {
  it('creates a valid non-destructive project document', () => {
    const project = createProject('First film', new Date('2026-09-06T00:00:00.000Z'))
    expect(project.schemaVersion).toBe(1)
    expect(project.title).toBe('First film')
    expect(project.assets).toEqual([])
    expect(project.tracks).toEqual([])
  })

  it('applies timeline operations without mutating the source project', () => {
    const base = createProject('Timeline')
    const track = trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main video', clips: [] })
    const clip = clipSchema.parse({ id: 'clip-1', assetId: 'asset-1', startMs: 0, durationMs: 5000 })
    const withTrack = applyTimelineOperation(base, { type: 'add-track', track })
    const withClip = applyTimelineOperation(withTrack, { type: 'add-clip', trackId: track.id, clip })
    const moved = applyTimelineOperation(withClip, { type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: 2500 })

    expect(base.tracks).toHaveLength(0)
    expect(withClip.tracks[0].clips[0].startMs).toBe(0)
    expect(moved.tracks[0].clips[0].startMs).toBe(2500)
  })

  it('reorders tracks as persistent render layer order', () => {
    let project = createProject('Layers')
    const lower = trackSchema.parse({ id: 'lower', type: 'video', name: 'Lower' })
    const upper = trackSchema.parse({ id: 'upper', type: 'overlay', name: 'Upper' })
    project = applyTimelineOperation(project, { type: 'add-track', track: lower })
    project = applyTimelineOperation(project, { type: 'add-track', track: upper })
    const reordered = applyTimelineOperation(project, { type: 'reorder-track', trackId: 'lower', toIndex: 1 })
    expect(reordered.tracks.map((track) => track.id)).toEqual(['upper', 'lower'])
    expect(project.tracks.map((track) => track.id)).toEqual(['lower', 'upper'])
    expect(() => applyTimelineOperation(project, { type: 'reorder-track', trackId: 'lower', toIndex: 2 })).toThrow(/out of range/)
  })

  it('stores validated non-destructive clip transforms', () => {
    let project = createProject('Transform')
    const track = trackSchema.parse({ id: 'video', type: 'video', name: 'Video' })
    const clip = clipSchema.parse({ id: 'clip', assetId: 'asset', startMs: 0, durationMs: 1000 })
    project = applyTimelineOperation(project, { type: 'add-track', track })
    project = applyTimelineOperation(project, { type: 'add-clip', trackId: track.id, clip })
    const transform = { x: 20, y: -10, scale: 1.2, cropLeft: 1, cropTop: 2, cropRight: 3, cropBottom: 4 }
    expect(applyTimelineOperation(project, { type: 'set-clip-transform', trackId: track.id, clipId: clip.id, transform }).tracks[0].clips[0].transform).toEqual(transform)
    expect(() => applyTimelineOperation(project, { type: 'set-clip-transform', trackId: track.id, clipId: clip.id, transform: { ...transform, scale: 5 } })).toThrow(/scale/)
  })

  it('stores and removes a bounded dissolve transition', () => {
    let project = createProject('Transition')
    const track = trackSchema.parse({ id: 'video', type: 'video', name: 'Video' })
    const clip = clipSchema.parse({ id: 'clip', assetId: 'asset', startMs: 0, durationMs: 1000 })
    project = applyTimelineOperation(project, { type: 'add-track', track })
    project = applyTimelineOperation(project, { type: 'add-clip', trackId: track.id, clip })
    project = applyTimelineOperation(project, { type: 'set-clip-transition', trackId: track.id, clipId: clip.id, transitionIn: { type: 'dissolve', durationMs: 500 } })
    expect(project.tracks[0].clips[0].transitionIn).toEqual({ type: 'dissolve', durationMs: 500 })
    expect(() => applyTimelineOperation(project, { type: 'set-clip-transition', trackId: track.id, clipId: clip.id, transitionIn: { type: 'dissolve', durationMs: 1100 } })).toThrow(/fit the clip/)
    expect(applyTimelineOperation(project, { type: 'set-clip-transition', trackId: track.id, clipId: clip.id }).tracks[0].clips[0].transitionIn).toBeUndefined()
  })

  it('stores bounded clip fade envelopes', () => {
    let project = createProject('Fades')
    const track = trackSchema.parse({ id: 'audio', type: 'music', name: 'Music' })
    const clip = clipSchema.parse({ id: 'clip', assetId: 'asset', startMs: 0, durationMs: 1000 })
    project = applyTimelineOperation(project, { type: 'add-track', track })
    project = applyTimelineOperation(project, { type: 'add-clip', trackId: track.id, clip })
    project = applyTimelineOperation(project, { type: 'set-clip-fades', trackId: track.id, clipId: clip.id, fades: { inMs: 300, outMs: 500 } })
    expect(project.tracks[0].clips[0].fades).toEqual({ inMs: 300, outMs: 500 })
    expect(() => applyTimelineOperation(project, { type: 'set-clip-fades', trackId: track.id, clipId: clip.id, fades: { inMs: 600, outMs: 500 } })).toThrow(/exceed clip/)
  })

  it('stores only supported clip speed factors', () => {
    let project = createProject('Speed')
    const track = trackSchema.parse({ id: 'video', type: 'video', name: 'Video' })
    const clip = clipSchema.parse({ id: 'clip', assetId: 'asset', startMs: 0, durationMs: 1000 })
    project = applyTimelineOperation(project, { type: 'add-track', track })
    project = applyTimelineOperation(project, { type: 'add-clip', trackId: track.id, clip })
    expect(applyTimelineOperation(project, { type: 'set-clip-speed', trackId: track.id, clipId: clip.id, speed: 0.5 }).tracks[0].clips[0].speed).toBe(0.5)
    expect(() => applyTimelineOperation(project, { type: 'set-clip-speed', trackId: track.id, clipId: clip.id, speed: 5 })).toThrow(/between/)
  })
})

describe('storage safety boundary', () => {
  it('allows only paths inside the managed KINAOU directory', () => {
    expect(isSafeManagedPath('KINAOU/Projects/demo/project.json')).toBe(true)
    expect(isSafeManagedPath('Photos/family.jpg')).toBe(false)
    expect(() => assertSafeManagedPath('../Documents/private.txt')).toThrow()
    expect(() => assertSafeManagedPath('KINAOU/../Documents/private.txt')).toThrow()
  })
})

describe('version history', () => {
  it('restores an earlier project snapshot', () => {
    const history = new VersionHistory()
    const first = createProject('Version one')
    const snapshot = history.snapshot(first, 'Initial state', 'system')
    const changed = { ...first, title: 'Version two' }
    expect(changed.title).toBe('Version two')
    expect(history.restore(snapshot.id).title).toBe('Version one')
  })
})

describe('job and model abstractions', () => {
  it('runs a registered cancellable job', async () => {
    const queue = new JobQueue()
    queue.register({
      type: 'echo',
      async run(input: unknown, _signal, report) {
        report(0.5)
        return input
      }
    })
    const job = queue.enqueue('echo', { hello: 'kinaou' })
    const finished = await queue.run(job.id)
    expect(finished.state).toBe('succeeded')
    expect(finished.progress).toBe(1)
    expect(finished.output).toEqual({ hello: 'kinaou' })
  })

  it('filters swappable model adapters by capability', () => {
    const registry = new ModelRegistry()
    registry.register({
      descriptor: { id: 'local-stt', name: 'Local STT', provider: 'local', local: true, capabilities: ['speech-to-text'] },
      async isAvailable() { return true },
      async run() { return 'transcript' }
    })
    expect(registry.list('speech-to-text')).toHaveLength(1)
    expect(registry.list('video-generation')).toHaveLength(0)
  })
})


describe('timeline split operation', () => {
  it('splits timed media atomically with exact source continuity and no source mutation', () => {
    const asset = assetSchema.parse({
      id: 'source',
      kind: 'video',
      uri: 'KINAOU/Assets/source.mp4',
      managed: true,
      metadata: { durationMs: 10000 }
    })

    const clip = clipSchema.parse({
      id: 'clip',
      assetId: asset.id,
      startMs: 1000,
      durationMs: 4000,
      sourceOffsetMs: 1000,
      gain: 0.8,
      speed: 1.5,
      transform: { x: 10, y: -5, scale: 1.2, cropLeft: 1, cropTop: 2, cropRight: 3, cropBottom: 4 },
      fades: { inMs: 300, outMs: 400 },
      transitionIn: { type: 'dissolve', durationMs: 500 },
      sceneId: 'scene'
    })

    const track = trackSchema.parse({
      id: 'video',
      type: 'video',
      name: 'Video',
      clips: [clip]
    })

    const project = { ...createProject('Split'), assets: [asset], tracks: [track] }
    const before = JSON.stringify(project)

    const split = applyTimelineOperation(project, {
      type: 'split-clip',
      trackId: track.id,
      clipId: clip.id,
      splitMs: 2500,
      rightClipId: 'clip-right'
    })

    expect(split.tracks[0].clips).toHaveLength(2)

    expect(split.tracks[0].clips[0]).toMatchObject({
      id: 'clip',
      startMs: 1000,
      durationMs: 1500,
      sourceOffsetMs: 1000,
      gain: 0.8,
      speed: 1.5,
      fades: { inMs: 300, outMs: 0 },
      transitionIn: { type: 'dissolve', durationMs: 500 },
      sceneId: 'scene'
    })

    expect(split.tracks[0].clips[1]).toMatchObject({
      id: 'clip-right',
      startMs: 2500,
      durationMs: 2500,
      sourceOffsetMs: 3250,
      gain: 0.8,
      speed: 1.5,
      fades: { inMs: 0, outMs: 400 },
      sceneId: 'scene'
    })

    expect(split.tracks[0].clips[1].transitionIn).toBeUndefined()
    expect(split.tracks[0].clips[1].transform).toEqual(clip.transform)
    expect(JSON.stringify(project)).toBe(before)
  })

  it('rejects unsafe split positions, duplicate ids and locked tracks', () => {
    const clip = clipSchema.parse({ id: 'clip', assetId: 'asset', startMs: 1000, durationMs: 2000 })
    const track = trackSchema.parse({ id: 'video', type: 'video', name: 'Video', clips: [clip] })
    const project = { ...createProject('Split guards'), tracks: [track] }

    expect(() => applyTimelineOperation(project, {
      type: 'split-clip', trackId: track.id, clipId: clip.id, splitMs: 1100, rightClipId: 'right'
    })).toThrow(/at least 250ms/)

    expect(() => applyTimelineOperation(project, {
      type: 'split-clip', trackId: track.id, clipId: clip.id, splitMs: 2000, rightClipId: clip.id
    })).toThrow(/already exists/)

    const locked = { ...project, tracks: [{ ...track, locked: true }] }

    expect(() => applyTimelineOperation(locked, {
      type: 'split-clip', trackId: track.id, clipId: clip.id, splitMs: 2000, rightClipId: 'right'
    })).toThrow(/locked/)
  })

  it('keeps non-timed source offsets unchanged when a still is split', () => {
    const asset = assetSchema.parse({
      id: 'still',
      kind: 'image',
      uri: 'KINAOU/Assets/still.png',
      managed: true
    })

    const clip = clipSchema.parse({
      id: 'clip',
      assetId: asset.id,
      startMs: 0,
      durationMs: 4000,
      sourceOffsetMs: 700
    })

    const track = trackSchema.parse({ id: 'video', type: 'video', name: 'Video', clips: [clip] })
    const project = { ...createProject('Still split'), assets: [asset], tracks: [track] }

    const split = applyTimelineOperation(project, {
      type: 'split-clip',
      trackId: track.id,
      clipId: clip.id,
      splitMs: 2000,
      rightClipId: 'right'
    })

    expect(split.tracks[0].clips.map((item) => item.sourceOffsetMs)).toEqual([700, 700])
  })
})


describe('atomic multi-clip timeline movement', () => {
  it('moves clips across tracks together without mutating the source project', () => {
    const clipA = clipSchema.parse({ id: 'a', assetId: 'asset', startMs: 1000, durationMs: 1000 })
    const clipB = clipSchema.parse({ id: 'b', assetId: 'asset', startMs: 3000, durationMs: 1000 })

    const video = trackSchema.parse({ id: 'video', type: 'video', name: 'Video', clips: [clipA] })
    const voice = trackSchema.parse({ id: 'voice', type: 'voice', name: 'Voice', clips: [clipB] })

    const project = { ...createProject('Group move'), tracks: [video, voice] }
    const before = JSON.stringify(project)

    const moved = applyTimelineOperation(project, {
      type: 'move-clips',
      moves: [
        { trackId: video.id, clipId: clipA.id, startMs: 1500 },
        { trackId: voice.id, clipId: clipB.id, startMs: 3500 }
      ]
    })

    expect(moved.tracks[0].clips[0].startMs).toBe(1500)
    expect(moved.tracks[1].clips[0].startMs).toBe(3500)
    expect(JSON.stringify(project)).toBe(before)
  })

  it('validates the whole group before changing anything', () => {
    const clipA = clipSchema.parse({ id: 'a', assetId: 'asset', startMs: 1000, durationMs: 1000 })
    const clipB = clipSchema.parse({ id: 'b', assetId: 'asset', startMs: 3000, durationMs: 1000 })

    const video = trackSchema.parse({ id: 'video', type: 'video', name: 'Video', clips: [clipA] })
    const locked = trackSchema.parse({ id: 'voice', type: 'voice', name: 'Voice', locked: true, clips: [clipB] })

    const project = { ...createProject('Atomic guards'), tracks: [video, locked] }
    const before = JSON.stringify(project)

    expect(() => applyTimelineOperation(project, {
      type: 'move-clips',
      moves: [
        { trackId: video.id, clipId: clipA.id, startMs: 1500 },
        { trackId: locked.id, clipId: clipB.id, startMs: 3500 }
      ]
    })).toThrow(/locked/)

    expect(JSON.stringify(project)).toBe(before)
  })

  it('rejects duplicate identities, missing clips and negative movement', () => {
    const clip = clipSchema.parse({ id: 'a', assetId: 'asset', startMs: 1000, durationMs: 1000 })
    const track = trackSchema.parse({ id: 'video', type: 'video', name: 'Video', clips: [clip] })
    const project = { ...createProject('Group guards'), tracks: [track] }

    expect(() => applyTimelineOperation(project, {
      type: 'move-clips',
      moves: [
        { trackId: track.id, clipId: clip.id, startMs: 1200 },
        { trackId: track.id, clipId: clip.id, startMs: 1300 }
      ]
    })).toThrow(/Duplicate/)

    expect(() => applyTimelineOperation(project, {
      type: 'move-clips',
      moves: [{ trackId: track.id, clipId: 'missing', startMs: 1200 }]
    })).toThrow(/not found/)

    expect(() => applyTimelineOperation(project, {
      type: 'move-clips',
      moves: [{ trackId: track.id, clipId: clip.id, startMs: -1 }]
    })).toThrow(/non-negative/)
  })
})
