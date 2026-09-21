import { useState } from 'react'
import { useUiLanguage } from './UiLanguageProvider'
import { displayTrackName } from '../core/uiSystemLabels'
import { commitTimelineChange, timelineTrimFits } from '../core/timelineEditing'
import type { PersistentVersionHistory } from '../core/versioning'
import type { KinaouAsset, KinaouProject, TimelineClip, TimelineTrack } from '../core/project'
import { touchProject } from '../core/project'
import { applyTimelineOperation, clipSpeedFitsSource } from '../core/timeline'
import { WaveformImage } from './WaveformImage'

interface TimelineEditorProps {
  project: KinaouProject
  history: PersistentVersionHistory
  onProjectChange: (project: KinaouProject) => void
  workerUrl: string
  workerToken: string
  workerConnected: boolean
}

const audioTrackTypes = new Set(['voice', 'dialog', 'music', 'sfx'])
const visualTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])

export function TimelineEditor({ project, history, onProjectChange, workerUrl, workerToken, workerConnected }: TimelineEditorProps) {
  const { language, t } = useUiLanguage()
  const [feedback, setFeedback] = useState<{ saved?: KinaouProject; error?: string } | null>(null)
  const number = (value: number, digits = 1) => value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  function change(makeNext: () => KinaouProject) {
    setFeedback(null)
    try { setFeedback({ saved: commitTimelineChange(project, makeNext, history, onProjectChange) }) }
    catch (cause) { setFeedback({ error: cause instanceof Error ? cause.message : String(cause) }) }
  }
  function apply(operation: Parameters<typeof applyTimelineOperation>[1]) {
    change(() => applyTimelineOperation(project, operation))
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
    change(() => applyTimelineOperation(withAsset, {
      type: 'add-clip',
      trackId: track.id,
      clip: { id: crypto.randomUUID(), assetId, startMs: lastEnd, durationMs: 5000, sourceOffsetMs: 0, gain: 1, speed: 1 }
    }))
  }

  function trim(track: TimelineTrack, clip: TimelineClip, deltaMs: number) {
    if (!timelineTrimFits(project.assets.find((asset) => asset.id === clip.assetId), clip, deltaMs)) return
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

  function toggleFade(track: TimelineTrack, clip: TimelineClip, edge: 'inMs' | 'outMs') {
    const current = { inMs: 0, outMs: 0, ...clip.fades }
    const next = current[edge] ? 0 : Math.min(500, clip.durationMs - current[edge === 'inMs' ? 'outMs' : 'inMs'])
    if (next === current[edge]) return
    apply({ type: 'set-clip-fades', trackId: track.id, clipId: clip.id, fades: { ...current, [edge]: next } })
  }

  return (
    <div className="timeline card">
      <p>{t('timeline.help')}</p>
      <small>{t('timeline.planningHelp')}</small>
      {feedback?.saved === project && <div className="successBox" role="status">{t('timeline.saved')}</div>}
      {feedback?.error !== undefined && <div className="errorBox" role="alert">{t('timeline.failed')}<details><summary>{t('common.details')}</summary>{feedback.error}</details></div>}
      {project.tracks.map((track, trackIndex) => (
        <div className={track.muted ? 'trackRow mutedTrack' : 'trackRow'} key={track.id}>
          <div className="trackLabel">
            <strong>{displayTrackName(track, t)}</strong><small>{t(`track.${track.type}`)}</small>
            <div className="trackControls">
              <button onClick={() => apply({ type: 'set-track-state', trackId: track.id, muted: !track.muted })}>{t(track.muted ? 'timeline.unmute' : 'timeline.mute')}</button>
              <button onClick={() => apply({ type: 'set-track-state', trackId: track.id, locked: !track.locked })}>{t(track.locked ? 'timeline.unlock' : 'timeline.lock')}</button>
            </div>
            <div className="trackControls" aria-label={t('timeline.order', { track: displayTrackName(track, t) })}>
              <button disabled={trackIndex === project.tracks.length - 1} onClick={() => apply({ type: 'reorder-track', trackId: track.id, toIndex: trackIndex + 1 })}>{t('timeline.up')}</button>
              <button disabled={trackIndex === 0} onClick={() => apply({ type: 'reorder-track', trackId: track.id, toIndex: trackIndex - 1 })}>{t('timeline.down')}</button>
            </div>
            <button disabled={track.locked} onClick={() => addPlanningBlock(track)}>{t('timeline.planning')}</button>
          </div>
          <div className="trackLane">
            {track.clips.length === 0 ? <span className="laneHint">{t('timeline.empty')}</span> : track.clips.map((clip) => {
              const asset = project.assets.find((item) => item.id === clip.assetId)
              return (
                <div className={track.locked ? 'clip lockedClip' : 'clip'} key={clip.id} style={{ marginLeft: `${Math.min(clip.startMs / 100, 140)}px`, width: `${Math.max(110, Math.min(clip.durationMs / 25, 240))}px` }}>
                  <strong>{asset?.uri.startsWith('kinaou://planning/') && asset.metadata.label === 'Planning block' ? t('timeline.planningName') : String(asset?.metadata.name ?? asset?.metadata.label ?? t('timeline.clip'))}</strong>
                  <small>{t('timeline.timing', { start: number(clip.startMs / 1000, 3), duration: number(clip.durationMs / 1000, 3) })}{audioTrackTypes.has(track.type) && <> · {t('timeline.gain', { value: number(clip.gain) })}</>}</small>
                  {(asset?.kind === 'video' || asset?.kind === 'audio') && <small>{t('timeline.speed', { speed: number(clip.speed, 2), duration: number(clip.durationMs * clip.speed / 1000, 3) })}</small>}
                  {visualTrackTypes.has(track.type) && <small>{t('timeline.transform', { scale: number(clip.transform?.scale ?? 1), x: number(clip.transform?.x ?? 0, 0), y: number(clip.transform?.y ?? 0, 0) })}</small>}
                  {clip.motion && <small>{t(clip.motion === 'zoom-in' ? 'timeline.zoomIn' : 'timeline.zoomOut')}</small>}
                  {clip.transitionIn && <small>{t('timeline.dissolveSummary', { duration: number(clip.transitionIn.durationMs / 1000, 3) })}</small>}
                  {(clip.fades?.inMs || clip.fades?.outMs) && <small>{t('timeline.fadeSummary', { start: number((clip.fades?.inMs ?? 0) / 1000, 3), end: number((clip.fades?.outMs ?? 0) / 1000, 3) })}</small>}
                  {audioTrackTypes.has(track.type) && typeof asset?.metadata.waveformPath === 'string' && <WaveformImage path={asset.metadata.waveformPath} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} alt={t('timeline.waveform', { name: String(asset.metadata.name ?? asset.id) })} />}
                  <div className="clipActions">
                    <button disabled={track.locked || clip.startMs === 0} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: Math.max(0, clip.startMs - 1000) })}>{t('timeline.moveLeft')}</button>
                    <button disabled={track.locked} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: clip.startMs + 1000 })}>{t('timeline.moveRight')}</button>
                    <button disabled={track.locked || !timelineTrimFits(asset, clip, -1000)} onClick={() => trim(track, clip, -1000)}>{t('timeline.shorten')}</button>
                    <button disabled={track.locked || !timelineTrimFits(asset, clip, 1000)} onClick={() => trim(track, clip, 1000)}>{t('timeline.lengthen')}</button>
                    {audioTrackTypes.has(track.type) && <><button disabled={track.locked} onClick={() => gain(track, clip, -0.1)}>{t('timeline.gainDown')}</button><button disabled={track.locked} onClick={() => gain(track, clip, 0.1)}>{t('timeline.gainUp')}</button></>}
                    {visualTrackTypes.has(track.type) && <><button disabled={track.locked || (clip.transform?.scale ?? 1) <= 0.1} onClick={() => transform(track, clip, { scale: Math.max(0.1, Math.round(((clip.transform?.scale ?? 1) - 0.1) * 10) / 10) })}>{t('timeline.scaleDown')}</button><button disabled={track.locked || (clip.transform?.scale ?? 1) >= 4} onClick={() => transform(track, clip, { scale: Math.min(4, Math.round(((clip.transform?.scale ?? 1) + 0.1) * 10) / 10) })}>{t('timeline.scaleUp')}</button><button disabled={track.locked} onClick={() => transform(track, clip, { x: (clip.transform?.x ?? 0) - 50 })} aria-label={t('timeline.left')} title={t('timeline.left')}>←</button><button disabled={track.locked} onClick={() => transform(track, clip, { x: (clip.transform?.x ?? 0) + 50 })} aria-label={t('timeline.right')} title={t('timeline.right')}>→</button><button disabled={track.locked} onClick={() => transform(track, clip, { y: (clip.transform?.y ?? 0) - 50 })} aria-label={t('timeline.top')} title={t('timeline.top')}>↑</button><button disabled={track.locked} onClick={() => transform(track, clip, { y: (clip.transform?.y ?? 0) + 50 })} aria-label={t('timeline.bottom')} title={t('timeline.bottom')}>↓</button><button disabled={track.locked} onClick={() => transform(track, clip, { cropLeft: (clip.transform?.cropLeft ?? 0) + 10, cropRight: (clip.transform?.cropRight ?? 0) + 10 })}>{t('timeline.cropX')}</button><button disabled={track.locked} onClick={() => transform(track, clip, { cropTop: (clip.transform?.cropTop ?? 0) + 10, cropBottom: (clip.transform?.cropBottom ?? 0) + 10 })}>{t('timeline.cropY')}</button><button disabled={track.locked} onClick={() => transform(track, clip, { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 })}>{t('timeline.resetFrame')}</button></>}
                    {visualTrackTypes.has(track.type) && <button disabled={track.locked || clip.durationMs < 500} onClick={() => apply({ type: 'set-clip-transition', trackId: track.id, clipId: clip.id, transitionIn: clip.transitionIn ? undefined : { type: 'dissolve', durationMs: Math.min(500, clip.durationMs) } })}>{t(clip.transitionIn ? 'timeline.removeDissolve' : 'timeline.dissolve')}</button>}
                    {(visualTrackTypes.has(track.type) || audioTrackTypes.has(track.type)) && <><button disabled={track.locked} onClick={() => toggleFade(track, clip, 'inMs')}>{t(clip.fades?.inMs ? 'timeline.removeFadeIn' : 'timeline.fadeIn')}</button><button disabled={track.locked} onClick={() => toggleFade(track, clip, 'outMs')}>{t(clip.fades?.outMs ? 'timeline.removeFadeOut' : 'timeline.fadeOut')}</button></>}
                    {(asset?.kind === 'video' || asset?.kind === 'audio') && (() => {
                      const slower = Math.max(0.25, clip.speed / 2)
                      const faster = Math.min(4, clip.speed * 2)
                      const fasterFits = clipSpeedFitsSource(asset, clip, faster)
                      return <><button disabled={track.locked || clip.speed <= 0.25 || !clipSpeedFitsSource(asset, clip, slower)} title={t('timeline.speedHelp')} onClick={() => apply({ type: 'set-clip-speed', trackId: track.id, clipId: clip.id, speed: slower })}>{t('timeline.halve', { speed: number(slower, 2) })}</button><button disabled={track.locked || clip.speed >= 4 || !fasterFits} title={t('timeline.speedHelp')} onClick={() => apply({ type: 'set-clip-speed', trackId: track.id, clipId: clip.id, speed: faster })}>{t('timeline.double', { speed: number(faster, 2) })}</button><button disabled={track.locked || clip.speed === 1 || !clipSpeedFitsSource(asset, clip, 1)} onClick={() => apply({ type: 'set-clip-speed', trackId: track.id, clipId: clip.id, speed: 1 })}>{t('timeline.speedReset')}</button></>
                    })()}
                    {asset?.kind === 'image' && visualTrackTypes.has(track.type) && (['zoom-in', 'zoom-out'] as const).map((motion) => (
                      <button key={motion} disabled={track.locked} title={t(motion === 'zoom-in' ? 'timeline.zoomIn' : 'timeline.zoomOut')} onClick={() => apply({ type: 'set-clip-motion', trackId: track.id, clipId: clip.id, motion: clip.motion === motion ? undefined : motion })}>
                        {clip.motion === motion ? t('timeline.on', { label: t(motion === 'zoom-in' ? 'timeline.zoomIn' : 'timeline.zoomOut') }) : t(motion === 'zoom-in' ? 'timeline.zoomIn' : 'timeline.zoomOut')}
                      </button>
                    ))}
                    <button disabled={track.locked} onClick={() => apply({ type: 'remove-clip', trackId: track.id, clipId: clip.id })}>{t('timeline.remove')}</button>
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
