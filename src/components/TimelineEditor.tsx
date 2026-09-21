import { useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useUiLanguage } from './UiLanguageProvider'
import { displayTrackName } from '../core/uiSystemLabels'
import { commitTimelineChange, timelineTrimFits } from '../core/timelineEditing'
import type { PersistentVersionHistory } from '../core/versioning'
import type { KinaouAsset, KinaouProject, TimelineClip, TimelineTrack } from '../core/project'
import { touchProject } from '../core/project'
import { applyTimelineOperation, clipSpeedFitsSource } from '../core/timeline'
import { snapClipStart, timelineExtentMs, timelineMsToPx, timelinePxToMs, trimClipEdge, type TimelineTrimEdge } from '../core/timelineInteraction'
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

interface ClipDragState {
  trackId: string
  clipId: string
  pointerId: number
  originClientX: number
  originStartMs: number
  previewStartMs: number
}

interface ClipTrimState {
  trackId: string
  clipId: string
  edge: TimelineTrimEdge
  pointerId: number
  originClientX: number
  originEdgeMs: number
  previewStartMs: number
  previewDurationMs: number
  previewSourceOffsetMs: number
}

export function TimelineEditor({ project, history, onProjectChange, workerUrl, workerToken, workerConnected }: TimelineEditorProps) {
  const { language, t } = useUiLanguage()
  const [feedback, setFeedback] = useState<{ saved?: KinaouProject; error?: string } | null>(null)
  const [selectedClipKey, setSelectedClipKey] = useState('')
  const [drag, setDrag] = useState<ClipDragState | null>(null)
  const [trim, setTrim] = useState<ClipTrimState | null>(null)
  const number = (value: number, digits = 1) => value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits })

  const draggedClip = drag
    ? project.tracks.find((track) => track.id === drag.trackId)?.clips.find((clip) => clip.id === drag.clipId)
    : undefined

  const interactionExtentMs = Math.max(
    timelineExtentMs(project.tracks),
    draggedClip ? drag!.previewStartMs + draggedClip.durationMs : 0,
    trim ? trim.previewStartMs + trim.previewDurationMs : 0
  )

  const extentMs = Math.max(10000, interactionExtentMs)
  const canvasWidthPx = Math.max(720, timelineMsToPx(extentMs + 1000))
  function change(makeNext: () => KinaouProject) {
    setFeedback(null)
    try { setFeedback({ saved: commitTimelineChange(project, makeNext, history, onProjectChange) }) }
    catch (cause) { setFeedback({ error: cause instanceof Error ? cause.message : String(cause) }) }
  }
  function apply(operation: Parameters<typeof applyTimelineOperation>[1]) {
    change(() => applyTimelineOperation(project, operation))
  }

  function beginClipDrag(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (track.locked || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedClipKey(`${track.id}:${clip.id}`)
    setTrim(null)
    setDrag({
      trackId: track.id,
      clipId: clip.id,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      originStartMs: clip.startMs,
      previewStartMs: clip.startMs
    })
  }

  function moveClipDrag(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (!drag || drag.pointerId !== event.pointerId || drag.trackId !== track.id || drag.clipId !== clip.id) return
    const rawStartMs = drag.originStartMs + timelinePxToMs(event.clientX - drag.originClientX)
    const previewStartMs = snapClipStart(project.tracks, track.id, clip, rawStartMs, !event.altKey)
    if (previewStartMs !== drag.previewStartMs) setDrag({ ...drag, previewStartMs })
  }

  function finishClipDrag(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (!drag || drag.pointerId !== event.pointerId || drag.trackId !== track.id || drag.clipId !== clip.id) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const startMs = drag.previewStartMs
    setDrag(null)
    if (startMs !== clip.startMs) apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs })
  }

  function cancelClipDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDrag(null)
  }

  function nudgeClip(event: ReactKeyboardEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (track.locked || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const step = event.shiftKey ? 1000 : 100
    const delta = event.key === 'ArrowLeft' ? -step : step
    const startMs = Math.max(0, clip.startMs + delta)
    setSelectedClipKey(`${track.id}:${clip.id}`)
    if (startMs !== clip.startMs) apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs })
  }

  function beginClipTrim(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip, edge: TimelineTrimEdge) {
    if (track.locked || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedClipKey(`${track.id}:${clip.id}`)
    setDrag(null)
    setTrim({
      trackId: track.id,
      clipId: clip.id,
      edge,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      originEdgeMs: edge === 'start' ? clip.startMs : clip.startMs + clip.durationMs,
      previewStartMs: clip.startMs,
      previewDurationMs: clip.durationMs,
      previewSourceOffsetMs: clip.sourceOffsetMs
    })
  }

  function moveClipTrim(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip, asset: KinaouAsset | undefined) {
    if (!trim || trim.pointerId !== event.pointerId || trim.trackId !== track.id || trim.clipId !== clip.id) return

    const rawEdgeMs = trim.originEdgeMs + timelinePxToMs(event.clientX - trim.originClientX)
    const preview = trimClipEdge(project.tracks, track.id, clip, asset, trim.edge, rawEdgeMs, !event.altKey)

    if (
      preview.startMs !== trim.previewStartMs
      || preview.durationMs !== trim.previewDurationMs
      || preview.sourceOffsetMs !== trim.previewSourceOffsetMs
    ) {
      setTrim({
        ...trim,
        previewStartMs: preview.startMs,
        previewDurationMs: preview.durationMs,
        previewSourceOffsetMs: preview.sourceOffsetMs
      })
    }
  }

  function finishClipTrim(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (!trim || trim.pointerId !== event.pointerId || trim.trackId !== track.id || trim.clipId !== clip.id) return

    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)

    const next = trim
    setTrim(null)

    if (
      next.previewStartMs !== clip.startMs
      || next.previewDurationMs !== clip.durationMs
      || next.previewSourceOffsetMs !== clip.sourceOffsetMs
    ) {
      apply({
        type: 'trim-clip',
        trackId: track.id,
        clipId: clip.id,
        startMs: next.previewStartMs,
        durationMs: next.previewDurationMs,
        sourceOffsetMs: next.previewSourceOffsetMs
      })
    }
  }

  function cancelClipTrim(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setTrim(null)
  }

  function nudgeTrim(event: ReactKeyboardEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip, asset: KinaouAsset | undefined, edge: TimelineTrimEdge) {
    if (track.locked || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return

    event.preventDefault()
    event.stopPropagation()

    const step = event.shiftKey ? 1000 : 100
    const delta = event.key === 'ArrowLeft' ? -step : step
    const edgeMs = edge === 'start' ? clip.startMs : clip.startMs + clip.durationMs
    const next = trimClipEdge(project.tracks, track.id, clip, asset, edge, edgeMs + delta, false)

    setSelectedClipKey(`${track.id}:${clip.id}`)

    if (
      next.startMs !== clip.startMs
      || next.durationMs !== clip.durationMs
      || next.sourceOffsetMs !== clip.sourceOffsetMs
    ) {
      apply({
        type: 'trim-clip',
        trackId: track.id,
        clipId: clip.id,
        startMs: next.startMs,
        durationMs: next.durationMs,
        sourceOffsetMs: next.sourceOffsetMs
      })
    }
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

  function stepTrim(track: TimelineTrack, clip: TimelineClip, deltaMs: number) {
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
            <div className="trackCanvas" style={{ width: `${canvasWidthPx}px` }}>
            {track.clips.length === 0 ? <span className="laneHint">{t('timeline.empty')}</span> : track.clips.map((clip) => {
              const asset = project.assets.find((item) => item.id === clip.assetId)
              const clipName = asset?.uri.startsWith('kinaou://planning/') && asset.metadata.label === 'Planning block'
                ? t('timeline.planningName')
                : String(asset?.metadata.name ?? asset?.metadata.label ?? t('timeline.clip'))
              const clipKey = `${track.id}:${clip.id}`
              const selected = selectedClipKey === clipKey
              const dragging = drag?.trackId === track.id && drag.clipId === clip.id
              const trimming = trim?.trackId === track.id && trim.clipId === clip.id
              const visibleStartMs = trimming ? trim.previewStartMs : dragging ? drag.previewStartMs : clip.startMs
              const visibleDurationMs = trimming ? trim.previewDurationMs : clip.durationMs
              const className = ['clip', track.locked ? 'lockedClip' : '', selected ? 'selectedClip' : '', dragging ? 'draggingClip' : '', trimming ? 'trimmingClip' : ''].filter(Boolean).join(' ')
              return (
                <div
                  className={className}
                  key={clip.id}
                  aria-selected={selected}
                  style={{ left: `${timelineMsToPx(visibleStartMs)}px`, width: `${timelineMsToPx(visibleDurationMs)}px` }}
                  onClick={() => setSelectedClipKey(clipKey)}
                >
                  <button
                    type="button"
                    className="clipDragSurface"
                    aria-label={t('timeline.dragHandle', { name: clipName })}
                    aria-pressed={selected}
                    aria-disabled={track.locked}
                    onPointerDown={(event) => beginClipDrag(event, track, clip)}
                    onPointerMove={(event) => moveClipDrag(event, track, clip)}
                    onPointerUp={(event) => finishClipDrag(event, track, clip)}
                    onPointerCancel={cancelClipDrag}
                    onKeyDown={(event) => nudgeClip(event, track, clip)}
                  >
                    <strong>{clipName}</strong>
                    <small>{t('timeline.timing', { start: number(visibleStartMs / 1000, 3), duration: number(visibleDurationMs / 1000, 3) })}{audioTrackTypes.has(track.type) && <> · {t('timeline.gain', { value: number(clip.gain) })}</>}</small>
                    {(asset?.kind === 'video' || asset?.kind === 'audio') && <small>{t('timeline.speed', { speed: number(clip.speed, 2), duration: number(visibleDurationMs * clip.speed / 1000, 3) })}</small>}
                    {visualTrackTypes.has(track.type) && <small>{t('timeline.transform', { scale: number(clip.transform?.scale ?? 1), x: number(clip.transform?.x ?? 0, 0), y: number(clip.transform?.y ?? 0, 0) })}</small>}
                    {clip.motion && <small>{t(clip.motion === 'zoom-in' ? 'timeline.zoomIn' : 'timeline.zoomOut')}</small>}
                    {clip.transitionIn && <small>{t('timeline.dissolveSummary', { duration: number(clip.transitionIn.durationMs / 1000, 3) })}</small>}
                    {(clip.fades?.inMs || clip.fades?.outMs) && <small>{t('timeline.fadeSummary', { start: number((clip.fades?.inMs ?? 0) / 1000, 3), end: number((clip.fades?.outMs ?? 0) / 1000, 3) })}</small>}
                  </button>
                  <button
                    type="button"
                    className="clipTrimHandle clipTrimStart"
                    aria-label={t('timeline.trimStartHandle', { name: clipName })}
                    disabled={track.locked}
                    onPointerDown={(event) => beginClipTrim(event, track, clip, 'start')}
                    onPointerMove={(event) => moveClipTrim(event, track, clip, asset)}
                    onPointerUp={(event) => finishClipTrim(event, track, clip)}
                    onPointerCancel={cancelClipTrim}
                    onKeyDown={(event) => nudgeTrim(event, track, clip, asset, 'start')}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="clipTrimHandle clipTrimEnd"
                    aria-label={t('timeline.trimEndHandle', { name: clipName })}
                    disabled={track.locked}
                    onPointerDown={(event) => beginClipTrim(event, track, clip, 'end')}
                    onPointerMove={(event) => moveClipTrim(event, track, clip, asset)}
                    onPointerUp={(event) => finishClipTrim(event, track, clip)}
                    onPointerCancel={cancelClipTrim}
                    onKeyDown={(event) => nudgeTrim(event, track, clip, asset, 'end')}
                    onClick={(event) => event.stopPropagation()}
                  />
                  {audioTrackTypes.has(track.type) && typeof asset?.metadata.waveformPath === 'string' && <WaveformImage path={asset.metadata.waveformPath} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} alt={t('timeline.waveform', { name: String(asset.metadata.name ?? asset.id) })} />}
                  <div className="clipActions">
                    <button disabled={track.locked || clip.startMs === 0} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: Math.max(0, clip.startMs - 1000) })}>{t('timeline.moveLeft')}</button>
                    <button disabled={track.locked} onClick={() => apply({ type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: clip.startMs + 1000 })}>{t('timeline.moveRight')}</button>
                    <button disabled={track.locked || !timelineTrimFits(asset, clip, -1000)} onClick={() => stepTrim(track, clip, -1000)}>{t('timeline.shorten')}</button>
                    <button disabled={track.locked || !timelineTrimFits(asset, clip, 1000)} onClick={() => stepTrim(track, clip, 1000)}>{t('timeline.lengthen')}</button>
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
        </div>
      ))}
    </div>
  )
}
