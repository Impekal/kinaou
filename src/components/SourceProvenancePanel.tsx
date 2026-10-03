import { useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { SourceProvenanceSession, type SourceProvenanceReview } from '../core/sourceProvenance'
import { useUiLanguage } from './UiLanguageProvider'
import { buildFrameProvenance, hasFrameProvenance } from '../core/frameProvenance'

export function SourceProvenancePanel({ project, assetId }: { project: KinaouProject; assetId: string }) {
  const { t, language } = useUiLanguage(), session = useRef(new SourceProvenanceSession())
  const asset = project.assets.find(a => a.id === assetId), frame = hasFrameProvenance(asset)
  const [review, setReview] = useState<SourceProvenanceReview | null>(null), [ack, setAck] = useState(false)
  const [error, setError] = useState(''), [started, setStarted] = useState(false)
  const scope = session.current.observe(project, assetId, language), errorScope = useRef(scope)
  const current = review && session.current.current(review)
  function prepare() {
    setReview(null); setAck(false); setStarted(false); setError(''); errorScope.current = scope
    try { setReview(session.current.prepare(project, assetId, language, new Date(), frame ? buildFrameProvenance : undefined)) } catch (cause) { setError(String(cause)) }
  }
  function download(format: 'json' | 'text') {
    if (!review || !current) return
    setError(''); setStarted(false); errorScope.current = scope
    try {
      const file = session.current.download(review, format, ack), url = URL.createObjectURL(new Blob([file.text], { type: file.mimeType })), link = document.createElement('a')
      try { link.href = url; link.download = file.filename; document.body.appendChild(link); link.click() }
      finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
      setStarted(true)
    } catch (cause) { setError(String(cause)) }
  }
  if (!frame && asset?.metadata.sourceImport === undefined) return null
  return <details className="sourceProvenancePanel"><summary>{t(frame ? 'frameReport.heading' : 'sourceReport.heading')}</summary><div className="stack">
    <p className="note">{t('sourceReport.private')}</p><p>{t(frame ? 'frameReport.boundary' : 'sourceReport.boundary')}</p>
    <button className="secondaryButton" onClick={prepare}>{t('sourceReport.prepare')}</button>
    {current && review && <><strong>{review.name} · {t('sourceReport.uses', { count: review.uses })}</strong>
      <details open><summary>{t('sourceReport.textPreview')}</summary><pre>{review.files.text.text}</pre></details>
      <details><summary>{t('sourceReport.jsonPreview')}</summary><pre>{review.files.json.text}</pre></details>
      <label className="sourceReportAck"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} />{t('sourceReport.ack')}</label>
      <div className="directorActions"><button className="secondaryButton" disabled={!ack} onClick={() => download('text')}>{t('sourceReport.textDownload')}</button><button className="secondaryButton" disabled={!ack} onClick={() => download('json')}>{t('sourceReport.jsonDownload')}</button></div>
      {started && <p role="status">{t('sourceReport.started')}</p>}</>}
    {error && errorScope.current === scope && <div role="alert">{t('sourceReport.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
  </div></details>
}
