import { useMemo, useState } from 'react'
import { assemblyTargetTracks } from '../core/storyboardAssembly'
import { captionsFromStoryboard, type ScriptCaptionResult } from '../core/scriptCaptions'
import { alignCaptionsToScenes, planCaptionAlignment, type DriftedCaptions } from '../core/captionAlignment'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  onProjectChange: (project: KinaouProject) => void
}

export function ScriptCaptionsPanel({ project, history, onProjectChange }: Props) {
  const tracks = useMemo(() => assemblyTargetTracks(project), [project])
  const [targetId, setTargetId] = useState('')
  const [result, setResult] = useState<ScriptCaptionResult | null>(null)
  const [error, setError] = useState('')
  const [aligned, setAligned] = useState('')
  const effectiveTarget = tracks.some((track) => track.id === targetId) ? targetId : tracks[0]?.id ?? ''
  const captionTrack = project.tracks.find((track) => track.type === 'caption')
  const drifted = useMemo<DriftedCaptions[]>(() => {
    if (!effectiveTarget) return []
    try {
      return planCaptionAlignment(project, effectiveTarget).drifted
    } catch {
      // A project the alignment cannot read is not a reason to blank the whole panel.
      return []
    }
  }, [project, effectiveTarget])

  const blockedReason = !project.storyboard.length
    ? 'This project has no storyboard scenes yet. Create a Director plan first.'
    : !captionTrack
      ? 'This project has no caption track.'
      : captionTrack.locked
        ? 'The caption track is locked. Unlock it in the timeline below.'
        : !effectiveTarget
          ? 'No visual track to read scene timings from.'
          : ''

  function realign() {
    if (!drifted.length) return
    setError('')
    setAligned('')
    try {
      history.snapshot(project, 'Before realigning captions to their scenes', 'system')
      const outcome = alignCaptionsToScenes(project, effectiveTarget)
      onProjectChange(outcome.project)
      setAligned(outcome.realigned.length === 1 ? '1 scene now carries its captions again.' : `${outcome.realigned.length} scenes now carry their captions again.`)
      setResult(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Realigning the captions failed')
    }
  }

  function write() {
    if (blockedReason) return
    setError('')
    try {
      const outcome = captionsFromStoryboard(project, effectiveTarget)
      setResult(outcome)
      if (outcome.captioned.length) {
        history.snapshot(project, 'Before writing captions from the script', 'system')
        onProjectChange(outcome.project)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Writing captions failed')
    }
  }

  return (
    <div className="card availabilityPanel">
      <div>
        <div className="eyebrow">SCRIPT → CAPTIONS</div>
        <h3>Caption what each scene says</h3>
        <p>Turns every scene description into readable, timed captions on the caption track — split at sentence boundaries and aligned to where that scene's visual actually sits on the timeline, not to planned durations. No AI runtime needed: this is your own script text. Scenes that already have captions are skipped, every caption stays editable in the Caption Studio, and restoring the automatic version undoes the batch. Change a scene's length afterwards and this panel offers to move its captions back over it.</p>
      </div>
      <div className="directorActions">
        <label>Read scene timings from<select aria-label="Track to read scene timings from" value={effectiveTarget} onChange={(event) => { setTargetId(event.target.value); setResult(null) }}>{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
        <button className="primary" disabled={Boolean(blockedReason)} onClick={write}>Write captions from the script</button>
      </div>
      {blockedReason && <div className="warning">{blockedReason}</div>}
      {drifted.length > 0 && <div className="warning">
        <strong>{drifted.length} scene{drifted.length === 1 ? "'s" : "s'"} captions no longer line up with the scene.</strong> A scene that was stretched to cover its narration, or shortened to the footage that replaced it, leaves its captions behind. Realigning stretches them back across the scene in the same order — only the timing moves, never a word.
        <div className="directorActions">
          <button className="secondaryButton" onClick={realign}>Realign the captions of {drifted.length} scene{drifted.length === 1 ? '' : 's'}</button>
        </div>
        <div className="assetList">
          {drifted.map((entry) => <div className="assetRow" key={entry.sceneId}>
            <div><strong>{entry.title}</strong><small>{entry.captions} caption{entry.captions === 1 ? '' : 's'} run {(entry.fromStartMs / 1000).toFixed(1)}s–{((entry.fromStartMs + entry.fromDurationMs) / 1000).toFixed(1)}s, the scene runs {(entry.toStartMs / 1000).toFixed(1)}s–{((entry.toStartMs + entry.toDurationMs) / 1000).toFixed(1)}s</small></div>
            <span className="badge offline">ADRIFT</span>
          </div>)}
        </div>
      </div>}
      {aligned && <div className="successBox">{aligned}</div>}
      {error && <div className="errorBox">{error}</div>}
      {result && <div className="assetList">
        {result.captioned.map((entry) => <div className="assetRow" key={entry.sceneId}>
          <div><strong>{entry.title}</strong><small>{entry.captions} caption{entry.captions === 1 ? '' : 's'} across {(entry.startMs / 1000).toFixed(1)}s–{((entry.startMs + entry.durationMs) / 1000).toFixed(1)}s</small></div>
          <span className="badge">CAPTIONED</span>
        </div>)}
        {result.skipped.map((entry) => <div className="assetRow" key={entry.sceneId}>
          <div><strong>{entry.title}</strong><small>{entry.reason}</small></div>
          <span className="badge offline">SKIPPED</span>
        </div>)}
      </div>}
    </div>
  )
}
