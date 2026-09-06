import type { KinaouAsset, KinaouProject, TimelineClip, TimelineTrack } from '../core/project'
import { touchProject } from '../core/project'
import { applyTimelineOperation } from '../core/timeline'

interface TimelineEditorProps {
  project: KinaouProject
  onProjectChange: (project: KinaouProject) => void
}

const audioTrackTypes = new Set(['voice', 'dialog', 'music', 'sfx'])

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
                  <div className="clipActions">
                    <button disabled={track.locked} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: Math.max(0, clip.startMs - 1000) })}>← 1s</button>
                    <button disabled={track.locked} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: clip.startMs + 1000 })}>1s →</button>
                    <button disabled={track.locked} onClick={() => trim(track, clip, -1000)}>Trim −1s</button>
                    <button disabled={track.locked} onClick={() => trim(track, clip, 1000)}>Trim +1s</button>
                    {audioTrackTypes.has(track.type) && <><button disabled={track.locked} onClick={() => gain(track, clip, -0.1)}>Gain −</button><button disabled={track.locked} onClick={() => gain(track, clip, 0.1)}>Gain +</button></>}
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
