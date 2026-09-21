import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useUiLanguage } from './UiLanguageProvider'
import { displayTrackName } from '../core/uiSystemLabels'
import { commitTimelineChange, timelineTrimFits } from '../core/timelineEditing'
import type { PersistentVersionHistory } from '../core/versioning'
import type { KinaouAsset, KinaouProject, TimelineClip, TimelineTrack } from '../core/project'
import { touchProject } from '../core/project'
import { applyTimelineOperation, clipSpeedFitsSource, MIN_TIMELINE_SPLIT_MS } from '../core/timeline'
import { snapClipGroupDelta, snapTimelinePoint, timelineExtentMs, timelineMsToPx, timelinePxToMs, trimClipEdge, type TimelineMoveMember, type TimelineTrimEdge } from '../core/timelineInteraction'
import { TimelineUndoSession } from '../core/timelineUndo'
import { WaveformImage } from './WaveformImage'

interface TimelineEditorProps {
  project: KinaouProject
  history: PersistentVersionHistory
  onProjectChange: (project: KinaouProject) => void
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  playheadMs?: number
  onPlayheadChange?: (value: number) => void
}

const audioTrackTypes = new Set(['voice', 'dialog', 'music', 'sfx'])
const visualTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])

interface ClipDragState {
  anchorTrackId: string
  anchorClipId: string
  pointerId: number
  originClientX: number
  members: TimelineMoveMember[]
  previewDeltaMs: number
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

export function TimelineEditor({ project, history, onProjectChange, workerUrl, workerToken, workerConnected, playheadMs: controlledPlayheadMs, onPlayheadChange }: TimelineEditorProps) {
  const { language, t } = useUiLanguage()
  const [feedback, setFeedback] = useState<{ saved?: KinaouProject; error?: string; action?: 'edit' | 'undo' | 'redo' } | null>(null)
  const [selectedClipKeys, setSelectedClipKeys] = useState<Set<string>>(() => new Set())
  const [drag, setDrag] = useState<ClipDragState | null>(null)
  const [trim, setTrim] = useState<ClipTrimState | null>(null)
  const [localPlayheadMs, setLocalPlayheadMs] = useState(0)
  const undoSessionRef = useRef<TimelineUndoSession | null>(null)

  if (!undoSessionRef.current) undoSessionRef.current = new TimelineUndoSession(project)

  const undoSession = undoSessionRef.current
  undoSession.observe(project)

  const number = (value: number, digits = 1) => value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits })

  const playheadMs = controlledPlayheadMs ?? localPlayheadMs

  function changePlayhead(value: number) {
    const normalized = Math.max(0, Math.round(value))
    if (onPlayheadChange) onPlayheadChange(normalized)
    else setLocalPlayheadMs(normalized)
  }

  const draggedExtentMs = drag
    ? Math.max(...drag.members.map((member) => member.startMs + drag.previewDeltaMs + member.durationMs))
    : 0

  const interactionExtentMs = Math.max(
    timelineExtentMs(project.tracks),
    draggedExtentMs,
    trim ? trim.previewStartMs + trim.previewDurationMs : 0
  )

  const extentMs = Math.max(10000, interactionExtentMs)
  const canvasEndMs = extentMs + 1000
  const effectivePlayheadMs = Math.min(playheadMs, canvasEndMs)
  const canvasWidthPx = Math.max(720, timelineMsToPx(canvasEndMs))

  const singleSelectedKey = selectedClipKeys.size === 1 ? [...selectedClipKeys][0] : ''
  const selectedTrack = project.tracks.find((track) =>
    track.clips.some((clip) => `${track.id}:${clip.id}` === singleSelectedKey)
  )
  const selectedClip = selectedTrack?.clips.find((clip) => `${selectedTrack.id}:${clip.id}` === singleSelectedKey)
  const selectedVisualClip = Boolean(selectedTrack && selectedClip && visualTrackTypes.has(selectedTrack.type))
  const canSplitSelected = Boolean(
    selectedTrack
    && selectedClip
    && !selectedTrack.locked
    && effectivePlayheadMs >= selectedClip.startMs + MIN_TIMELINE_SPLIT_MS
    && effectivePlayheadMs <= selectedClip.startMs + selectedClip.durationMs - MIN_TIMELINE_SPLIT_MS
  )
  function change(makeNext: () => KinaouProject) {
    setFeedback(null)

    try {
      const next = commitTimelineChange(project, makeNext, history, onProjectChange)
      undoSession.record(project, next)
      setFeedback({ saved: next, action: 'edit' })
    } catch (cause) {
      setFeedback({ error: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  function apply(operation: Parameters<typeof applyTimelineOperation>[1]) {
    change(() => applyTimelineOperation(project, operation))
  }

  function resetTransientEditing() {
    setSelectedClipKeys(new Set())
    setDrag(null)
    setTrim(null)
  }

  function undoTimeline() {
    setFeedback(null)

    try {
      const restored = undoSession.undo(project, onProjectChange)
      if (!restored) return
      resetTransientEditing()
      setFeedback({ saved: restored, action: 'undo' })
    } catch (cause) {
      setFeedback({ error: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  function redoTimeline() {
    setFeedback(null)

    try {
      const restored = undoSession.redo(project, onProjectChange)
      if (!restored) return
      resetTransientEditing()
      setFeedback({ saved: restored, action: 'redo' })
    } catch (cause) {
      setFeedback({ error: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  function handleTimelineKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tag = String((event.target as HTMLElement | null)?.tagName ?? '').toUpperCase()
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

    const modifier = event.metaKey || event.ctrlKey
    if (!modifier) return

    const key = event.key.toLowerCase()

    if (key === 'z' && event.shiftKey) {
      if (!undoSession.canRedo) return
      event.preventDefault()
      redoTimeline()
      return
    }

    if (key === 'z') {
      if (!undoSession.canUndo) return
      event.preventDefault()
      undoTimeline()
      return
    }

    if (key === 'y') {
      if (!undoSession.canRedo) return
      event.preventDefault()
      redoTimeline()
    }
  }

  function moveMembers(keys: Set<string>): TimelineMoveMember[] {
    return project.tracks.flatMap((entry) =>
      entry.clips
        .filter((item) => keys.has(`${entry.id}:${item.id}`))
        .map((item) => ({
          trackId: entry.id,
          clipId: item.id,
          startMs: item.startMs,
          durationMs: item.durationMs
        }))
    )
  }

  function toggleClipSelection(key: string) {
    setSelectedClipKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function beginClipDrag(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (track.locked || event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    const key = `${track.id}:${clip.id}`

    if (event.metaKey || event.ctrlKey) {
      toggleClipSelection(key)
      setDrag(null)
      return
    }

    const nextSelection = selectedClipKeys.has(key) ? new Set(selectedClipKeys) : new Set([key])
    const members = moveMembers(nextSelection)

    if (!members.length) return

    setSelectedClipKeys(nextSelection)
    setTrim(null)
    event.currentTarget.setPointerCapture(event.pointerId)

    setDrag({
      anchorTrackId: track.id,
      anchorClipId: clip.id,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      members,
      previewDeltaMs: 0
    })
  }

  function moveClipDrag(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (
      !drag
      || drag.pointerId !== event.pointerId
      || drag.anchorTrackId !== track.id
      || drag.anchorClipId !== clip.id
    ) return

    const rawDeltaMs = timelinePxToMs(event.clientX - drag.originClientX)

    const previewDeltaMs = snapClipGroupDelta(
      project.tracks,
      drag.members,
      drag.anchorTrackId,
      drag.anchorClipId,
      rawDeltaMs,
      !event.altKey
    )

    if (previewDeltaMs !== drag.previewDeltaMs) {
      setDrag({ ...drag, previewDeltaMs })
    }
  }

  function finishClipDrag(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (
      !drag
      || drag.pointerId !== event.pointerId
      || drag.anchorTrackId !== track.id
      || drag.anchorClipId !== clip.id
    ) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const completed = drag
    setDrag(null)

    if (completed.previewDeltaMs === 0) return

    apply({
      type: 'move-clips',
      moves: completed.members.map((member) => ({
        trackId: member.trackId,
        clipId: member.clipId,
        startMs: member.startMs + completed.previewDeltaMs
      }))
    })
  }

  function cancelClipDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDrag(null)
  }

  function nudgeClip(event: ReactKeyboardEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip) {
    if (track.locked || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return

    event.preventDefault()

    const key = `${track.id}:${clip.id}`
    const selection = selectedClipKeys.has(key) ? new Set(selectedClipKeys) : new Set([key])
    const members = moveMembers(selection)

    if (!members.length) return

    const step = event.shiftKey ? 1000 : 100
    const requestedDelta = event.key === 'ArrowLeft' ? -step : step
    const minimumDelta = -Math.min(...members.map((member) => member.startMs))
    const delta = Math.max(minimumDelta, requestedDelta)

    setSelectedClipKeys(selection)

    if (delta === 0) return

    apply({
      type: 'move-clips',
      moves: members.map((member) => ({
        trackId: member.trackId,
        clipId: member.clipId,
        startMs: member.startMs + delta
      }))
    })
  }

  function beginClipTrim(event: ReactPointerEvent<HTMLButtonElement>, track: TimelineTrack, clip: TimelineClip, edge: TimelineTrimEdge) {
    if (track.locked || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedClipKeys(new Set([`${track.id}:${clip.id}`]))
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

    setSelectedClipKeys(new Set([`${track.id}:${clip.id}`]))

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

  function placePlayhead(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const rawMs = timelinePxToMs(event.clientX - bounds.left)
    const next = Math.min(canvasEndMs, snapTimelinePoint(project.tracks, '', '', rawMs, !event.altKey))
    changePlayhead(next)
  }

  function splitSelectedClip() {
    if (!selectedTrack || !selectedClip || !canSplitSelected) return

    const rightClipId = crypto.randomUUID()

    apply({
      type: 'split-clip',
      trackId: selectedTrack.id,
      clipId: selectedClip.id,
      splitMs: effectivePlayheadMs,
      rightClipId
    })

    setSelectedClipKeys(new Set([`${selectedTrack.id}:${rightClipId}`]))
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

  function transformKeyframesFor(clip: TimelineClip): NonNullable<TimelineClip['transformKeyframes']> {
    const base = {
      x: clip.transform?.x ?? 0,
      y: clip.transform?.y ?? 0,
      scale: clip.transform?.scale ?? 1
    }

    return clip.transformKeyframes ?? {
      start: { ...base },
      end: { ...base }
    }
  }

  function enableTransformKeyframes(track: TimelineTrack, clip: TimelineClip) {
    apply({
      type: 'set-clip-transform-keyframes',
      trackId: track.id,
      clipId: clip.id,
      keyframes: transformKeyframesFor(clip)
    })
  }

  function adjustTransformKeyframe(
    track: TimelineTrack,
    clip: TimelineClip,
    edge: 'start' | 'end',
    change: Partial<NonNullable<TimelineClip['transformKeyframes']>['start']>
  ) {
    const keyframes = transformKeyframesFor(clip)
    const nextPoint = {
      ...keyframes[edge],
      ...change
    }

    nextPoint.scale = Math.max(0.1, Math.min(4, Math.round(nextPoint.scale * 10) / 10))

    apply({
      type: 'set-clip-transform-keyframes',
      trackId: track.id,
      clipId: clip.id,
      keyframes: {
        ...keyframes,
        [edge]: nextPoint
      }
    })
  }

  function removeTransformKeyframes(track: TimelineTrack, clip: TimelineClip) {
    apply({
      type: 'set-clip-transform-keyframes',
      trackId: track.id,
      clipId: clip.id
    })
  }

  function toggleFade(track: TimelineTrack, clip: TimelineClip, edge: 'inMs' | 'outMs') {
    const current = { inMs: 0, outMs: 0, ...clip.fades }
    const next = current[edge] ? 0 : Math.min(500, clip.durationMs - current[edge === 'inMs' ? 'outMs' : 'inMs'])
    if (next === current[edge]) return
    apply({ type: 'set-clip-fades', trackId: track.id, clipId: clip.id, fades: { ...current, [edge]: next } })
  }

  return (
    <div className="timeline card" tabIndex={0} onKeyDown={handleTimelineKeyDown}>
      <p>{t('timeline.help')}</p>
      <small>{t('timeline.planningHelp')}</small>
      <div className="timelineTransport">
        <label>
          {t('timeline.playheadPosition', { time: number(effectivePlayheadMs / 1000, 3) })}
          <input
            type="range"
            min="0"
            max={canvasEndMs}
            step="100"
            value={effectivePlayheadMs}
            onChange={(event) => changePlayhead(Number(event.target.value))}
          />
        </label>
        <button className="secondaryButton" disabled={!canSplitSelected} onClick={splitSelectedClip}>{t('timeline.split')}</button>
        <div className="timelineUndoActions">
          <button className="secondaryButton" disabled={!undoSession.canUndo} onClick={undoTimeline}>{t('timeline.undo')}</button>
          <button className="secondaryButton" disabled={!undoSession.canRedo} onClick={redoTimeline}>{t('timeline.redo')}</button>
        </div>
        <div className="timelineSelectionStatus" role="status">
          {t('timeline.selectionCount', { count: selectedClipKeys.size })}
          <button disabled={selectedClipKeys.size === 0} onClick={() => setSelectedClipKeys(new Set())}>{t('timeline.clearSelection')}</button>
        </div>
      </div>
      <small className="timelineUndoHelp">{t('timeline.undoHelp')}</small>
      <section className="timelineEffectInspector" aria-label={t('timeline.effects')}>
        <strong>{t('timeline.effects')}</strong>
        {!selectedTrack || !selectedClip || !selectedVisualClip ? (
          <small>{t('timeline.effectsSelectOne')}</small>
        ) : (
          <>
            <small>{t('timeline.keyframesHelp')}</small>
            {!selectedClip.transformKeyframes ? (
              <button
                className="secondaryButton"
                disabled={selectedTrack.locked}
                onClick={() => enableTransformKeyframes(selectedTrack, selectedClip)}
              >
                {t('timeline.keyframesEnable')}
              </button>
            ) : (
              <>
                {(['start', 'end'] as const).map((edge) => {
                  const point = selectedClip.transformKeyframes![edge]
                  return <div className="timelineKeyframeRow" key={edge}>
                    <strong>{t(edge === 'start' ? 'timeline.keyframeStart' : 'timeline.keyframeEnd')}</strong>
                    <small>{t('timeline.keyframeSummary', {
                      x: number(point.x, 0),
                      y: number(point.y, 0),
                      scale: number(point.scale, 1)
                    })}</small>
                    <div className="timelineKeyframeActions">
                      <button disabled={selectedTrack.locked} onClick={() => adjustTransformKeyframe(selectedTrack, selectedClip, edge, { x: point.x - 50 })} aria-label={t('timeline.left')}>←</button>
                      <button disabled={selectedTrack.locked} onClick={() => adjustTransformKeyframe(selectedTrack, selectedClip, edge, { x: point.x + 50 })} aria-label={t('timeline.right')}>→</button>
                      <button disabled={selectedTrack.locked} onClick={() => adjustTransformKeyframe(selectedTrack, selectedClip, edge, { y: point.y - 50 })} aria-label={t('timeline.top')}>↑</button>
                      <button disabled={selectedTrack.locked} onClick={() => adjustTransformKeyframe(selectedTrack, selectedClip, edge, { y: point.y + 50 })} aria-label={t('timeline.bottom')}>↓</button>
                      <button disabled={selectedTrack.locked || point.scale <= 0.1} onClick={() => adjustTransformKeyframe(selectedTrack, selectedClip, edge, { scale: point.scale - 0.1 })}>{t('timeline.scaleDown')}</button>
                      <button disabled={selectedTrack.locked || point.scale >= 4} onClick={() => adjustTransformKeyframe(selectedTrack, selectedClip, edge, { scale: point.scale + 0.1 })}>{t('timeline.scaleUp')}</button>
                    </div>
                  </div>
                })}
                <button
                  className="secondaryButton"
                  disabled={selectedTrack.locked}
                  onClick={() => removeTransformKeyframes(selectedTrack, selectedClip)}
                >
                  {t('timeline.keyframesRemove')}
                </button>
              </>
            )}
          </>
        )}
      </section>
      {feedback?.saved === project && <div className="successBox" role="status">{t(feedback.action === 'undo' ? 'timeline.undone' : feedback.action === 'redo' ? 'timeline.redone' : 'timeline.saved')}</div>}
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
            <div className="trackCanvas" style={{ width: `${canvasWidthPx}px` }} onPointerDown={placePlayhead}>
            <div className="timelinePlayheadLine" aria-hidden="true" style={{ left: `${timelineMsToPx(effectivePlayheadMs)}px` }} />
            {track.clips.length === 0 ? <span className="laneHint">{t('timeline.empty')}</span> : track.clips.map((clip) => {
              const asset = project.assets.find((item) => item.id === clip.assetId)
              const clipName = asset?.uri.startsWith('kinaou://planning/') && asset.metadata.label === 'Planning block'
                ? t('timeline.planningName')
                : String(asset?.metadata.name ?? asset?.metadata.label ?? t('timeline.clip'))
              const clipKey = `${track.id}:${clip.id}`
              const selected = selectedClipKeys.has(clipKey)
              const dragMember = drag?.members.find((member) => member.trackId === track.id && member.clipId === clip.id)
              const dragging = Boolean(dragMember)
              const trimming = trim?.trackId === track.id && trim.clipId === clip.id
              const visibleStartMs = trimming
                ? trim.previewStartMs
                : dragMember
                  ? dragMember.startMs + drag!.previewDeltaMs
                  : clip.startMs
              const visibleDurationMs = trimming ? trim.previewDurationMs : clip.durationMs
              const className = ['clip', track.locked ? 'lockedClip' : '', selected ? 'selectedClip' : '', dragging ? 'draggingClip' : '', trimming ? 'trimmingClip' : ''].filter(Boolean).join(' ')
              return (
                <div
                  className={className}
                  key={clip.id}
                  aria-selected={selected}
                  style={{ left: `${timelineMsToPx(visibleStartMs)}px`, width: `${timelineMsToPx(visibleDurationMs)}px` }}
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
                    onClick={(event) => event.stopPropagation()}
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
