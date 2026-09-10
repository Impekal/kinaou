import { useMemo, useState } from 'react'
import { CROSSFADE_MS, assembleTimelineFromStoryboard, assemblyTargetTracks, fulfilledSceneCount, type AssemblyResult } from '../core/storyboardAssembly'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  onProjectChange: (project: KinaouProject) => void
}

export function StoryboardAssemblyPanel({ project, history, onProjectChange }: Props) {
  const tracks = useMemo(() => assemblyTargetTracks(project), [project])
  const [targetId, setTargetId] = useState('')
  const [result, setResult] = useState<AssemblyResult | null>(null)
  const [motion, setMotion] = useState(true)
  const [crossfade, setCrossfade] = useState(true)
  const [error, setError] = useState('')
  const effectiveTarget = tracks.some((track) => track.id === targetId) ? targetId : tracks[0]?.id ?? ''
  const selectedTrack = tracks.find((track) => track.id === effectiveTarget)
  const fulfilled = fulfilledSceneCount(project)

  const blockedReason = !project.storyboard.length
    ? 'This project has no storyboard scenes yet. Create a Director plan first.'
    : !tracks.length
      ? 'No visual track to assemble on.'
      : !fulfilled
        ? 'No scene has a visual yet. Fulfil scenes manually or let the Scene Media Plan gather them.'
        : selectedTrack?.locked
          ? `"${selectedTrack.name}" is locked. Unlock it in the timeline below or pick another track.`
          : ''

  function assemble() {
    if (blockedReason) return
    setError('')
    try {
      // Assembly is side-effect free, so the run happens first and only a real change
      // costs a safety version — a no-op re-run leaves the history clean.
      const outcome = assembleTimelineFromStoryboard(project, effectiveTarget, { motion, crossfade })
      setResult(outcome)
      if (outcome.placed.length) {
        history.snapshot(project, 'Before assembling scenes on the timeline', 'system')
        onProjectChange(outcome.project)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Assembling the timeline failed')
    }
  }

  return (
    <div className="card availabilityPanel">
      <div>
        <div className="eyebrow">STORYBOARD → TIMELINE</div>
        <h3>Assemble the fulfilled scenes</h3>
        <p>Places every scene that already has a visual onto one visual track, in storyboard order. Stills hold for their scene duration, video clips never exceed their real footage. Existing clips are never moved or replaced, scenes already on the track are skipped, and the whole assembly is undone by restoring the automatic version created first.</p>
      </div>
      <div className="assemblyOptions">
        <label className="optionToggle"><input type="checkbox" checked={motion} onChange={(event) => { setMotion(event.target.checked); setResult(null) }} /> Gentle motion on stills<small>Alternating slow zoom, so a run of screenshots is not a static slideshow. Adjustable per clip afterwards.</small></label>
        <label className="optionToggle"><input type="checkbox" checked={crossfade} onChange={(event) => { setCrossfade(event.target.checked); setResult(null) }} /> Cross-dissolve between scenes<small>Each scene starts {(CROSSFADE_MS / 1000).toFixed(1)}s inside the previous one and fades in over it, instead of cutting hard.</small></label>
      </div>
      <div className="directorActions">
        <label>Target track<select aria-label="Track to assemble scenes on" value={effectiveTarget} onChange={(event) => { setTargetId(event.target.value); setResult(null) }}>{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}{track.locked ? ' · locked' : ''}</option>)}</select></label>
        <button className="primary" disabled={Boolean(blockedReason)} onClick={assemble}>Assemble {fulfilled} scene{fulfilled === 1 ? '' : 's'} on the timeline</button>
        <small>{project.storyboard.length} scene{project.storyboard.length === 1 ? '' : 's'} · {fulfilled} with a visual</small>
      </div>
      {blockedReason && <div className="warning">{blockedReason}</div>}
      {error && <div className="errorBox">{error}</div>}
      {result && <div className="assetList">
        {result.placed.map((entry) => <div className="assetRow" key={entry.sceneId}>
          <div><strong>{entry.title}</strong><small>placed at {(entry.startMs / 1000).toFixed(1)}s · {(entry.durationMs / 1000).toFixed(1)}s{entry.trimmedToSource ? ' · shortened to the available footage' : ''}{entry.motion ? ` · ${entry.motion === 'zoom-in' ? 'zoom in' : 'zoom out'}` : ''}{entry.crossfadeMs ? ` · ${(entry.crossfadeMs / 1000).toFixed(1)}s dissolve` : ''}</small></div>
          <span className="badge">ON TIMELINE</span>
        </div>)}
        {result.skipped.map((entry) => <div className="assetRow" key={entry.sceneId}>
          <div><strong>{entry.title}</strong><small>{entry.reason}</small></div>
          <span className="badge offline">SKIPPED</span>
        </div>)}
      </div>}
    </div>
  )
}
