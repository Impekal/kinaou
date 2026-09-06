import type { KinaouAsset, KinaouProject, TimelineClip, TimelineTrack } from '../core/project'
import { touchProject } from '../core/project'
import { applyTimelineOperation } from '../core/timeline'

interface TimelineEditorProps {
  project: KinaouProject
  onProjectChange: (project: KinaouProject) => void
}

const audioTrackTypes = new Set(['voice', 'dialog', 'music', 'sfx'])
const visualTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])

export function TimelineEditor({ project, onProjectChange }: TimelineEditorProps) {
  function apply(operation: Parameters<typeof applyTimelineOperation>[1]) {
    onProjectChange(applyTimelineOperation(project, operation))
  }

  function addPlanningBlock(track: TimelineTrack) {
    if (track.locked) return
    const assetId = crypto.randomUUID()
    const asset: KinaouAsset = {
      id: assetId,
      kind: 'other',
      uri: `kinaou://planning/${assetId}`,
      managed: false,
      offline: false,
      metadata: { label: 'Planning block' }
    }
    const withAsset = touchProject({ ...project, assets: [...project.assets, asset] })
    const lastEnd = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
    onProjectChange(applyTimelineOperation(withAsset, {
      type: 'add-clip',
      trackId: track.id,
      clip: { id: crypto.randomUUID(), assetId, startMs: lastEnd, durationMs: 5000, sourceOffsetMs: 0, gain: 1, speed: 1 }
    }))
  }

  function trim(track: TimelineTrack, clip: TimelineClip, deltaMs: number) {
    apply({
      type: 'trim-clip',
      trackId: track.id,
      clipId: clip.id,
      startMs: clip.startMs,
      durationMs: Math.max(250, clip.durationMs + deltaMs),
      sourceOffsetMs: clip.sourceOffsetMs
    })
  }

  function gain(track: TimelineTrack, clip: TimelineClip, delta: number) {
    apply({ type: 'set-clip-gain', trackId: track.id, clipId: clip.id, gain: Math.max(0, Math.min(4, Math.round((clip.gain + delta) * 10) / 10)) })
  }

  function transform(track: TimelineTrack, clip: TimelineClip, change: Partial<NonNullable<TimelineClip['transform']>>) {
    apply({ type: 'set-clip-transform', trackId: track.id, clipId: clip.id, transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, ...clip.transform, ...change } })
  }

  return (
    <div className="timeline card">
      {project.tracks.map((track, trackIndex) => (
        <div className={track.muted ? 'trackRow mutedTrack' : 'trackRow'} key={track.id}>
          <div className="trackLabel">
            <strong>{track.name}</strong><small>{track.type}</small>
            <div className="trackControls">
              <button onClick={() => apply({ type: 'set-track-state', trackId: track.id, muted: !track.muted })}>{track.muted ? 'Unmute' : 'Mute'}</button>
              <button onClick={() => apply({ type: 'set-track-state', trackId: track.id, locked: !track.locked })}>{track.locked ? 'Unlock' : 'Lock'}</button>
            </div>
            <div className="trackControls" aria-label={`${track.name} layer order`}>
              <button disabled={trackIndex === project.tracks.length - 1} onClick={() => apply({ type: 'reorder-track', trackId: track.id, toIndex: trackIndex + 1 })}>Layer ↑</button>
              <button disabled={trackIndex === 0} onClick={() => apply({ type: 'reorder-track', trackId: track.id, toIndex: trackIndex - 1 })}>Layer ↓</button>
            </div>
            <button disabled={track.locked} onClick={() => addPlanningBlock(track)}>+ planning block</button>
          </div>
          <div className="trackLane">
            {track.clips.length === 0 ? <span className="laneHint">Empty track</span> : track.clips.map((clip) => {
              const asset = project.assets.find((item) => item.id === clip.assetId)
              return (
                <div className={track.locked ? 'clip lockedClip' : 'clip'} key={clip.id} style={{ marginLeft: `${Math.min(clip.startMs / 100, 140)}px`, width: `${Math.max(110, Math.min(clip.durationMs / 25, 240))}px` }}>
                  <strong>{String(asset?.metadata.name ?? asset?.metadata.label ?? 'Clip')}</strong>
                  <small>{(clip.startMs / 1000).toFixed(1)}s · {(clip.durationMs / 1000).toFixed(1)}s{audioTrackTypes.has(track.type) ? ` · gain ${clip.gain.toFixed(1)}` : ''}</small>
                  {visualTrackTypes.has(track.type) && <small>scale {(clip.transform?.scale ?? 1).toFixed(1)} · x {clip.transform?.x ?? 0} · y {clip.transform?.y ?? 0}</small>}
                  {clip.transitionIn && <small>dissolve {(clip.transitionIn.durationMs / 1000).toFixed(1)}s</small>}
                  <div className="clipActions">
                    <button disabled={track.locked} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: Math.max(0, clip.startMs - 1000) })}>← 1s</button>
                    <button disabled={track.locked} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: clip.startMs + 1000 })}>1s →</button>
                    <button disabled={track.locked} onClick={() => trim(track, clip, -1000)}>Trim −1s</button>
                    <button disabled={track.locked} onClick={() => trim(track, clip, 1000)}>Trim +1s</button>
                    {audioTrackTypes.has(track.type) && <><button disabled={track.locked} onClick={() => gain(track, clip, -0.1)}>Gain −</button><button disabled={track.locked} onClick={() => gain(track, clip, 0.1)}>Gain +</button></>}
                    {visualTrackTypes.has(track.type) && <><button disabled={track.locked || (clip.transform?.scale ?? 1) <= 0.1} onClick={() => transform(track, clip, { scale: Math.max(0.1, Math.round(((clip.transform?.scale ?? 1) - 0.1) * 10) / 10) })}>Scale −</button><button disabled={track.locked || (clip.transform?.scale ?? 1) >= 4} onClick={() => transform(track, clip, { scale: Math.min(4, Math.round(((clip.transform?.scale ?? 1) + 0.1) * 10) / 10) })}>Scale +</button><button disabled={track.locked} onClick={() => transform(track, clip, { x: (clip.transform?.x ?? 0) - 50 })}>←</button><button disabled={track.locked} onClick={() => transform(track, clip, { x: (clip.transform?.x ?? 0) + 50 })}>→</button><button disabled={track.locked} onClick={() => transform(track, clip, { y: (clip.transform?.y ?? 0) - 50 })}>↑</button><button disabled={track.locked} onClick={() => transform(track, clip, { y: (clip.transform?.y ?? 0) + 50 })}>↓</button><button disabled={track.locked} onClick={() => transform(track, clip, { cropLeft: (clip.transform?.cropLeft ?? 0) + 10, cropRight: (clip.transform?.cropRight ?? 0) + 10 })}>Crop X +</button><button disabled={track.locked} onClick={() => transform(track, clip, { cropTop: (clip.transform?.cropTop ?? 0) + 10, cropBottom: (clip.transform?.cropBottom ?? 0) + 10 })}>Crop Y +</button><button disabled={track.locked} onClick={() => transform(track, clip, { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 })}>Reset frame</button></>}
                    {visualTrackTypes.has(track.type) && <button disabled={track.locked || clip.durationMs < 500} onClick={() => apply({ type: 'set-clip-transition', trackId: track.id, clipId: clip.id, transitionIn: clip.transitionIn ? undefined : { type: 'dissolve', durationMs: Math.min(500, clip.durationMs) } })}>{clip.transitionIn ? 'Remove dissolve' : 'Dissolve in'}</button>}
                    <button disabled={track.locked} onClick={() => apply({ type: 'remove-clip', trackId: track.id, clipId: clip.id })}>Remove</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
