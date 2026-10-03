import { useEffect, useRef, useState } from 'react'
import type { MediaPreviewProps } from './MediaPreviewControl'
import { sourceFrameSource, sourceFrameMetadata, validateSourceFrameProbe } from '../core/sourceFrame'
import { parseExcerptSeconds } from '../core/mediaExcerpt'
import { WorkerClient } from '../core/workerClient'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import { AssetImportSession, type AssetImportFeedback } from '../core/assetImportSession'
import { AssetImportStatus } from './AssetUploadPanel'
import { useUiLanguage } from './UiLanguageProvider'
import { FrameAnnotationEditor } from './FrameAnnotationEditor'
import type { AnnotatedFrame } from '../core/frameAnnotations'

type Frame = Awaited<ReturnType<WorkerClient['extractSourceFrame']>>
export function SourceFrameControl({ project, asset, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: MediaPreviewProps) {
  const { t, language } = useUiLanguage(), [time, setTime] = useState('0'), [preparing, setPreparing] = useState(false)
  const [review, setReview] = useState<{ frame: Frame; metadata: ReturnType<typeof sourceFrameMetadata>; url: string; current: () => boolean } | null>(null)
  const [annotationMode, setAnnotationMode] = useState(false), [annotated, setAnnotated] = useState<{value: AnnotatedFrame; url: string} | null>(null)
  const [ack, setAck] = useState(false), [feedback, setFeedback] = useState<AssetImportFeedback | null>(null), [error, setError] = useState<{ message: string; current: () => boolean } | null>(null)
  const scope = useRef(new AiEditorRequestScope()), mounted = useRef(true), flight = useRef(false), session = useRef<AssetImportSession | null>(null)
  const persist = useRef(onProjectChange); persist.current = onProjectChange
  const successScope = useRef('')
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, [...workerCapabilities].sort(), language, time, asset.id, asset.uri])
  const environment = useRef({ project, connection }); environment.current = { project, connection }
  session.current?.observe(project, connection); scope.current.update(JSON.stringify([project, connection]))
  useEffect(() => { mounted.current = true; scope.current.attach(); return () => { mounted.current = false; scope.current.detach(); session.current?.detach() } }, [])
  useEffect(() => () => { if (review) URL.revokeObjectURL(review.url) }, [review])
  useEffect(() => () => { if (annotated) URL.revokeObjectURL(annotated.url) }, [annotated])
  const supported = asset.kind === 'video' && asset.managed && !asset.offline && asset.uri.endsWith('.mp4')
  const available = supported && workerConnected && !!workerToken.trim() && ['source-video-frame', 'asset-upload', 'media-probe'].every(c => workerCapabilities.includes(c))
  const locked = preparing || Boolean(session.current?.unresolved), current = review?.current()
  async function prepare() {
    if (!available || locked || flight.current) return
    flight.current = true; setPreparing(true); setReview(null); setAck(false); setError(null); setFeedback(null)
    setAnnotated(null); setAnnotationMode(false)
    const isCurrent = scope.current.begin()
    try {
      const source = sourceFrameSource(project, asset.id), client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      const frame = await client.extractSourceFrame({ path: source.uri, timeMs: parseExcerptSeconds(time) })
      if (!mounted.current || !isCurrent()) return
      const metadata = sourceFrameMetadata(project, asset.id, frame)
      setReview({ frame, metadata, url: URL.createObjectURL(frame.file), current: isCurrent })
    } catch (cause) { if (mounted.current && isCurrent()) setError({ message: String(cause), current: isCurrent }) }
    finally { flight.current = false; if (mounted.current) setPreparing(false) }
  }
  async function save() {
    if (!available || locked || flight.current || !review?.current() || !ack || (annotationMode && !annotated)) return
    flight.current = true; const accepted = review, client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const selectedFrame = annotated && annotationMode ? { ...accepted.frame, file: annotated.value.file } : accepted.frame
    const metadata = annotated && annotationMode ? { ...accepted.metadata, sourceKind: 'annotated-video-frame-v1', extractionOnly: false, modified: true, annotations: annotated.value.provenance } : accepted.metadata
    try {
      const task = new AssetImportSession(project, connection, selectedFrame.file, 'image', {
        client: { importAsset: (file, name) => client.importAsset(file, name), probe: async path => validateSourceFrameProbe(await client.probe(path), selectedFrame) },
        environment: () => environment.current, assetMetadata: metadata,
        snapshot: value => { history.snapshot(structuredClone(value), t('sourceFrame.history'), 'system') },
        persist: value => {
          if ((persist.current as (p: typeof project) => unknown)(structuredClone(value)) === false) throw Error('Project save was not acknowledged')
          environment.current = { project: structuredClone(value), connection }
        },
        publish: value => { if (mounted.current && session.current === task) { setFeedback(value); if (value.phase === 'succeeded') { successScope.current = JSON.stringify(environment.current); setReview(null); setAnnotated(null); setAck(false) } } }
      })
      session.current = task; await task.run()
    } catch (cause) { if (mounted.current && accepted.current()) setError({ message: String(cause), current: accepted.current }) }
    finally { flight.current = false }
  }
  if (asset.kind !== 'video') return null
  const scopedFeedback = feedback?.phase === 'succeeded' && successScope.current !== JSON.stringify(environment.current) ? null : feedback
  const visibleFeedback = scopedFeedback && session.current?.wasDetached ? { ...scopedFeedback, phase: 'detached' as const } : scopedFeedback
  return <details className="mediaExcerptPanel"><summary>{t('sourceFrame.heading')}</summary><div className="stack">
    <p>{t('sourceFrame.help')}</p><p className="note">{t('sourceFrame.boundary')}</p>
    <label>{t('sourceFrame.time')}<input inputMode="decimal" value={time} disabled={locked} onChange={e => { setTime(e.target.value); setReview(null); setAnnotated(null); setAnnotationMode(false); setAck(false); setError(null) }} /></label>
    <button className="secondaryButton" disabled={!available || locked} onClick={() => void prepare()}>{t(preparing ? 'sourceFrame.reading' : 'sourceFrame.read')}</button>
    {!available && <p>{t('sourceFrame.unavailable')}</p>}
    {review && !current && <p role="alert">{t('sourceFrame.stale')}</p>}
    {review && current && <div className="stack">{!annotationMode && <img className="explainerPreview" src={review.url} alt={t('sourceFrame.preview')} />}<p>{t('sourceFrame.facts', { time: review.frame.record.requestedMs / 1000, width: review.frame.record.width, height: review.frame.record.height, bytes: review.frame.file.size })}</p>
      <button className="secondaryButton" disabled={locked} onClick={() => { setAnnotationMode(!annotationMode); setAnnotated(null); setAck(false) }}>{t(annotationMode ? 'frameMarks.original' : 'frameMarks.open')}</button>
      {annotationMode && <FrameAnnotationEditor key={review.frame.file.name} frame={review.frame} disabled={locked} onChange={() => { setAnnotated(null); setAck(false) }} onReviewed={value => { if (review.current()) { setAnnotated({value,url:URL.createObjectURL(value.file)}); setAck(false) } }} />}
      {annotationMode && (annotated ? <><img className="explainerPreview" src={annotated.url} alt={t('frameMarks.preview')} /><p>{t('frameMarks.ready',{count:annotated.value.provenance.marks.length,bytes:annotated.value.file.size})}</p></> : <p>{t('frameMarks.pending')}</p>)}
      <label className="sourceReportAck"><input type="checkbox" disabled={locked || (annotationMode && !annotated)} checked={ack} onChange={e => setAck(e.target.checked)} />{t('sourceFrame.ack')}</label>
      <button className="primary" disabled={!ack || locked || !available || (annotationMode && !annotated)} onClick={() => void save()}>{t('sourceFrame.save')}</button></div>}
    {visibleFeedback && <AssetImportStatus feedback={visibleFeedback} onRetry={() => void session.current?.run()} onDetach={() => { session.current?.detach(); setReview(null); setAnnotated(null); setAck(false); setFeedback(value => value ? { ...value, phase: 'detached' } : null) }} />}
    {visibleFeedback?.phase === 'succeeded' && <p>{t('sourceFrame.saved')}</p>}
    {error?.current() && <div role="alert">{t('sourceFrame.error')}<details><summary>{t('common.details')}</summary>{error.message}</details></div>}
  </div></details>
}
