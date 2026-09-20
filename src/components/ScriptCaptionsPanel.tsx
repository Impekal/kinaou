import { useMemo, useState } from 'react'
import { assemblyTargetTracks } from '../core/storyboardAssembly'
import { captionsFromStoryboard, type ScriptCaptionResult, type SkippedCaptionScene } from '../core/scriptCaptions'
import { alignCaptionsToScenes, planCaptionAlignment, type SkippedCaptionAlignment } from '../core/captionAlignment'
import { commitCaptionChange } from '../core/captionEditing'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  onProjectChange: (project: KinaouProject) => void
}

type Feedback = { project: KinaouProject; target: string } & (
  { kind: 'write'; result: ScriptCaptionResult } | { kind: 'align'; count: number }
)

export function ScriptCaptionsPanel({ project, history, onProjectChange }: Props) {
  const { language, t } = useUiLanguage()
  const tracks = useMemo(() => assemblyTargetTracks(project), [project])
  const [targetId, setTargetId] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const effectiveTarget = tracks.some((track) => track.id === targetId) ? targetId : tracks[0]?.id ?? ''
  const captionTrack = project.tracks.find((track) => track.type === 'caption')
  const plan = useMemo(() => {
    if (!effectiveTarget || !captionTrack) return { drifted: [], skipped: [], error: null }
    try { return { ...planCaptionAlignment(project, effectiveTarget), error: null } }
    catch (cause) { return { drifted: [], skipped: [], error: cause instanceof Error ? cause.message : String(cause) } }
  }, [project, effectiveTarget, captionTrack])

  const blockedReason = !project.storyboard.length ? 'scriptCaption.noScenes'
    : !captionTrack ? 'caption.noTrack'
    : captionTrack.locked ? 'caption.locked'
    : !effectiveTarget ? 'scriptCaption.noTrack' : null
  const visibleFeedback = feedback?.project === project && feedback.target === effectiveTarget ? feedback : null
  const range = (start: number, duration: number) => t('caption.range', {
    start: (start / 1000).toLocaleString(language, { maximumFractionDigits: 3 }),
    end: ((start + duration) / 1000).toLocaleString(language, { maximumFractionDigits: 3 })
  })
  function clear() { setError(null); setFeedback(null) }
  function reason(entry: SkippedCaptionScene | SkippedCaptionAlignment) { return t(`scriptCaption.reason.${entry.code}`, entry.values) }
  function failure(detail: string, planning = false) {
    return <div className="errorBox" role="alert">{t(planning ? 'scriptCaption.readFailed' : 'scriptCaption.failed')}
      <details><summary>{t('common.details')}</summary>{detail}</details>
    </div>
  }

  function realign() {
    if (blockedReason || plan.error !== null || !plan.drifted.length) return
    clear()
    try {
      const outcome = alignCaptionsToScenes(project, effectiveTarget)
      if (outcome.realigned.length) commitCaptionChange(project, () => outcome.project, history, onProjectChange, 'Before realigning captions to their scenes')
      setFeedback({ kind: 'align', project: outcome.project, target: effectiveTarget, count: outcome.realigned.length })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  function write() {
    if (blockedReason) return
    clear()
    try {
      const outcome = captionsFromStoryboard(project, effectiveTarget)
      if (outcome.captioned.length) commitCaptionChange(project, () => outcome.project, history, onProjectChange, 'Before writing captions from the script')
      // Never show CAPTIONED/SAVED before project persistence succeeds.
      setFeedback({ kind: 'write', project: outcome.project, target: effectiveTarget, result: outcome })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  return <div className="card availabilityPanel">
    <div>
      <div className="eyebrow">{t('scriptCaption.eyebrow')}</div>
      <h3>{t('scriptCaption.heading')}</h3>
      <p>{t('scriptCaption.help')}</p>
    </div>
    <div className="directorActions">
      <label>{t('scriptCaption.track')}<select value={effectiveTarget} onChange={(event) => { setTargetId(event.target.value); clear() }}>{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
      <button className="primary" disabled={Boolean(blockedReason)} onClick={write}>{t('scriptCaption.write')}</button>
    </div>
    {blockedReason && <div className="warning">{t(blockedReason)}</div>}
    {plan.error !== null && failure(plan.error, true)}
    {plan.drifted.length > 0 && <div className="warning">
      <strong>{t('scriptCaption.drift', { count: plan.drifted.length })}</strong>
      <p>{t('scriptCaption.alignHelp')}</p>
      <button className="secondaryButton" disabled={Boolean(blockedReason)} onClick={realign}>{t('scriptCaption.align', { count: plan.drifted.length })}</button>
      <div className="assetList">{plan.drifted.map((entry) => <div className="assetRow" key={entry.sceneId}>
        <div><strong>{entry.title}</strong><small>{t('scriptCaption.comparison', { count: entry.captions, from: range(entry.fromStartMs, entry.fromDurationMs), to: range(entry.toStartMs, entry.toDurationMs) })}</small></div>
        <span className="badge offline">{t('scriptCaption.driftBadge')}</span>
      </div>)}</div>
    </div>}
    {plan.skipped.length > 0 && <div className="warning">
      <strong>{t('scriptCaption.unaligned')}</strong>
      <div className="assetList">{plan.skipped.map((entry) => <div className="assetRow" key={entry.sceneId}><div><strong>{entry.title}</strong><small>{reason(entry)}</small></div></div>)}</div>
    </div>}
    {visibleFeedback?.kind === 'align' && <div className="successBox" role="status">{t('scriptCaption.aligned', { count: visibleFeedback.count })}</div>}
    {error !== null && failure(error)}
    {visibleFeedback?.kind === 'write' && <div className="assetList" role="status">
      {visibleFeedback.result.captioned.map((entry) => <div className="assetRow" key={entry.sceneId}>
        <div><strong>{entry.title}</strong><small>{t('scriptCaption.summary', { count: entry.captions, range: range(entry.startMs, entry.durationMs) })}</small></div>
        <span className="badge">{t('scriptCaption.savedBadge')}</span>
      </div>)}
      {visibleFeedback.result.skipped.map((entry) => <div className="assetRow" key={entry.sceneId}>
        <div><strong>{entry.title}</strong><small>{reason(entry)}</small></div>
        <span className="badge offline">{t('scriptCaption.skippedBadge')}</span>
      </div>)}
    </div>}
  </div>
}
