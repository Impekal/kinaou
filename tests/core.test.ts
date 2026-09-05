import { describe, expect, it } from 'vitest'
import { createProject, trackSchema, clipSchema } from '../src/core/project'
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
