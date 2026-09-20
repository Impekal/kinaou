import { useMemo, useState } from 'react'
import { CROSSFADE_MS, assembleTimelineFromStoryboard, assemblyTargetTracks, fulfilledSceneCount, type AssemblyResult } from '../core/storyboardAssembly'
import type { KinaouProject } from '../core/project'
import { planSceneVisualSync, syncSceneVisuals, type SceneVisualSyncResult } from '../core/sceneVisualSync'
import type { PersistentVersionHistory } from '../core/versioning'
import { commitStoryboardChange, type SceneVisualReason } from '../core/storyboardEditing'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }

function SkippedScenes({ entries }: { entries: Array<SceneVisualReason & { sceneId: string; title: string }> }) {
  const { t } = useUiLanguage()
  return <div className="assetList">{entries.map((entry) => <div className="assetRow" key={entry.sceneId}>
    <div><strong>{entry.title}</strong><small>{t(`assembly.reason.${entry.code}`, entry.values)}</small></div>
    <span className="badge offline">{t('assembly.skipped')}</span>
  </div>)}</div>
}

export function StoryboardAssemblyPanel({ project, history, onProjectChange }: Props) {
  const { language, t } = useUiLanguage()
  const seconds = (ms: number) => (ms / 1000).toLocaleString(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const tracks = useMemo(() => assemblyTargetTracks(project), [project])
  const [targetId, setTargetId] = useState('')
  const [result, setResult] = useState<AssemblyResult | null>(null)
  const [synced, setSynced] = useState<SceneVisualSyncResult | null>(null)
  const [motion, setMotion] = useState(true)
  const [crossfade, setCrossfade] = useState(true)
  const [error, setError] = useState('')
  const effectiveTarget = tracks.some((track) => track.id === targetId) ? targetId : tracks[0]?.id ?? ''
  const selectedTrack = tracks.find((track) => track.id === effectiveTarget)
  const fulfilled = fulfilledSceneCount(project)
  const plan = useMemo(() => {
    if (!effectiveTarget) return { outdated: [], skipped: [], error: '' }
    try { return { ...planSceneVisualSync(project, effectiveTarget), error: '' } }
    catch (cause) { return { outdated: [], skipped: [], error: cause instanceof Error ? cause.message : String(cause) } }
  }, [project, effectiveTarget])
  const blockedReason = !project.storyboard.length ? t('assembly.noScenes')
    : !tracks.length ? t('assembly.noTrack')
      : selectedTrack?.locked ? t('assembly.locked', { track: selectedTrack.name })
        : !fulfilled ? t('assembly.noAssigned') : ''
  const visibleResult = result?.project === project ? result : null
  const visibleSynced = synced?.project === project ? synced : null
  function clearFeedback() { setResult(null); setSynced(null); setError('') }

  function syncVisuals() {
    if (!plan.outdated.length || selectedTrack?.locked || plan.error) return
    clearFeedback()
    try {
      const outcome = commitStoryboardChange(project, () => syncSceneVisuals(project, effectiveTarget), history, onProjectChange, 'Before updating replaced scene visuals')
      setSynced(outcome)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  function assemble() {
    if (blockedReason) return
    clearFeedback()
    try {
      const outcome = commitStoryboardChange(project, () => assembleTimelineFromStoryboard(project, effectiveTarget, { motion, crossfade }), history, onProjectChange, 'Before assembling scenes on the timeline')
      setResult(outcome)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <div className="card availabilityPanel">
    <div><div className="eyebrow">{t('assembly.eyebrow')}</div><h3>{t('assembly.heading')}</h3><p>{t('assembly.help')}</p></div>
    <div className="assemblyOptions">
      <label className="optionToggle"><input type="checkbox" checked={motion} onChange={(event) => { setMotion(event.target.checked); clearFeedback() }} />{t('assembly.motion')}<small>{t('assembly.motionHelp')}</small></label>
      <label className="optionToggle"><input type="checkbox" checked={crossfade} onChange={(event) => { setCrossfade(event.target.checked); clearFeedback() }} />{t('assembly.crossfade')}<small>{t('assembly.crossfadeHelp', { duration: seconds(CROSSFADE_MS) })}</small></label>
    </div>
    <div className="directorActions">
      <label>{t('assembly.target')}<select value={effectiveTarget} onChange={(event) => { setTargetId(event.target.value); clearFeedback() }}>{tracks.map((track) => <option key={track.id} value={track.id}>{track.locked ? t('assembly.lockedLabel', { track: track.name }) : track.name}</option>)}</select></label>
      <button className="primary" disabled={Boolean(blockedReason)} onClick={assemble}>{t('assembly.assemble')}</button>
      <small>{t('assembly.count', { total: project.storyboard.length, assigned: fulfilled })}</small>
    </div>
    {blockedReason && <div className="warning">{blockedReason}</div>}
    {plan.error && <div className="errorBox" role="alert">{t('assembly.planFailed')}<details><summary>{t('common.details')}</summary>{plan.error}</details></div>}
    {plan.outdated.length > 0 && <div className="warning">
      <strong>{t('assembly.outdated', { count: plan.outdated.length })}</strong><p>{t('assembly.syncHelp')}</p>
      <div className="directorActions"><button className="secondaryButton" disabled={Boolean(selectedTrack?.locked)} onClick={syncVisuals}>{t('assembly.sync', { count: plan.outdated.length })}</button></div>
      <div className="assetList">{plan.outdated.map((entry) => <div className="assetRow" key={entry.sceneId}>
        <div><strong>{entry.title}</strong><small>{t('assembly.previewTiming', { start: seconds(entry.startMs), duration: seconds(entry.durationMs) })}{entry.trimmedToSource && <> · {t('assembly.shortened')}</>}</small></div>
        <span className="badge offline">{t('assembly.outdatedBadge')}</span>
      </div>)}</div>
    </div>}
    {plan.skipped.length > 0 && <div className="warning"><strong>{t('assembly.unavailable')}</strong><SkippedScenes entries={plan.skipped} /></div>}
    {visibleSynced && <div className="successBox" role="status">{t('assembly.synced', { count: visibleSynced.updated.length, shortened: visibleSynced.updated.filter((entry) => entry.trimmedToSource).length })}</div>}
    {error && <div className="errorBox" role="alert">{t('assembly.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {visibleResult && <>
      <div className={visibleResult.placed.length ? 'successBox' : 'note'} role="status">{visibleResult.placed.length ? t('assembly.saved', { count: visibleResult.placed.length }) : t('assembly.noAdded')}</div>
      <div className="assetList">{visibleResult.placed.map((entry) => <div className="assetRow" key={entry.sceneId}>
        <div><strong>{entry.title}</strong><small>{t('assembly.timing', { start: seconds(entry.startMs), duration: seconds(entry.durationMs) })}{entry.trimmedToSource && <> · {t('assembly.shortened')}</>}{entry.motion && <> · {t(entry.motion === 'zoom-in' ? 'timeline.zoomIn' : 'timeline.zoomOut')}</>}{entry.crossfadeMs ? <> · {t('timeline.dissolveSummary', { duration: seconds(entry.crossfadeMs) })}</> : null}</small></div>
        <span className="badge">{t('assembly.placed')}</span>
      </div>)}</div>
      <SkippedScenes entries={visibleResult.skipped} />
    </>}
  </div>
}
