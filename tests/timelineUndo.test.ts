import { describe, expect, it, vi } from 'vitest'
import { clipSchema, createProject, trackSchema } from '../src/core/project'
import { applyTimelineOperation } from '../src/core/timeline'
import { TimelineUndoSession } from '../src/core/timelineUndo'

function fixture() {
  const clip = clipSchema.parse({
    id: 'clip',
    assetId: 'asset',
    startMs: 1000,
    durationMs: 1000
  })

  const track = trackSchema.parse({
    id: 'video',
    type: 'video',
    name: 'Video',
    clips: [clip]
  })

  return {
    project: {
      ...createProject('Undo'),
      tracks: [track]
    },
    track,
    clip
  }
}

describe('timeline editing session undo/redo', () => {
  it('undoes and redoes manual timeline states without touching persistent version history', () => {
    const { project, track, clip } = fixture()
    const now = () => new Date('2026-09-22T00:00:00.000Z')
    const session = new TimelineUndoSession(project, 100, now)

    const moved = applyTimelineOperation(project, {
      type: 'move-clip',
      trackId: track.id,
      clipId: clip.id,
      startMs: 2500
    })

    session.record(project, moved)

    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)

    const persisted: typeof project[] = []
    const undo = session.undo(moved, (next) => { persisted.push(next) })!

    expect(undo.tracks[0].clips[0].startMs).toBe(1000)
    expect(undo.updatedAt).toBe('2026-09-22T00:00:00.000Z')
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    const redo = session.redo(undo, (next) => { persisted.push(next) })!

    expect(redo.tracks[0].clips[0].startMs).toBe(2500)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)
    expect(persisted).toHaveLength(2)
  })

  it('clears redo after a new edit following undo', () => {
    const { project, track, clip } = fixture()
    const session = new TimelineUndoSession(project)

    const moved = applyTimelineOperation(project, {
      type: 'move-clip',
      trackId: track.id,
      clipId: clip.id,
      startMs: 2000
    })

    session.record(project, moved)

    const undone = session.undo(moved, vi.fn())!
    expect(session.canRedo).toBe(true)

    const alternative = applyTimelineOperation(undone, {
      type: 'move-clip',
      trackId: track.id,
      clipId: clip.id,
      startMs: 3000
    })

    session.record(undone, alternative)

    expect(session.canRedo).toBe(false)
    expect(session.undoDepth).toBe(1)
  })

  it('resets the session when the project changes outside the timeline editor', () => {
    const { project, track, clip } = fixture()
    const session = new TimelineUndoSession(project)

    const moved = applyTimelineOperation(project, {
      type: 'move-clip',
      trackId: track.id,
      clipId: clip.id,
      startMs: 2000
    })

    session.record(project, moved)
    expect(session.canUndo).toBe(true)

    const external = {
      ...moved,
      title: 'Changed elsewhere'
    }

    expect(session.observe(external)).toBe(true)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(false)
    expect(session.undo(external, vi.fn())).toBeNull()
  })

  it('does not mutate history stacks when persistence fails', () => {
    const { project, track, clip } = fixture()
    const session = new TimelineUndoSession(project)

    const moved = applyTimelineOperation(project, {
      type: 'move-clip',
      trackId: track.id,
      clipId: clip.id,
      startMs: 2000
    })

    session.record(project, moved)

    expect(() => session.undo(moved, () => { throw new Error('quota') })).toThrow('quota')
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)

    const undone = session.undo(moved, vi.fn())!

    expect(() => session.redo(undone, () => { throw new Error('quota') })).toThrow('quota')
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)
  })

  it('retains only the configured number of undo states', () => {
    const { project, track, clip } = fixture()
    const session = new TimelineUndoSession(project, 2)

    let current = project

    for (const startMs of [2000, 3000, 4000]) {
      const next = applyTimelineOperation(current, {
        type: 'move-clip',
        trackId: track.id,
        clipId: clip.id,
        startMs
      })

      session.record(current, next)
      current = next
    }

    expect(session.undoDepth).toBe(2)

    const one = session.undo(current, vi.fn())!
    expect(one.tracks[0].clips[0].startMs).toBe(3000)

    const two = session.undo(one, vi.fn())!
    expect(two.tracks[0].clips[0].startMs).toBe(2000)

    expect(session.undo(two, vi.fn())).toBeNull()
  })

  it('does not create an undo entry for an identical state', () => {
    const { project } = fixture()
    const session = new TimelineUndoSession(project)

    session.record(project, structuredClone(project))

    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(false)
  })
})
