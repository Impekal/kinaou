import { useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { ResearchObservationFilter } from '../core/researchObservationFilter'
import { ResearchDossierSession, type ResearchDossierReview } from '../core/researchDossier'
import { useUiLanguage } from './UiLanguageProvider'

export function ResearchDossierPanel({ project, filters, available }: { project: KinaouProject; filters: ResearchObservationFilter; available: boolean }) {
  const { t, language } = useUiLanguage(), session = useRef(new ResearchDossierSession())
  const [review, setReview] = useState<ResearchDossierReview | null>(null), [ack, setAck] = useState(false), [error, setError] = useState(''), [started, setStarted] = useState(false)
  session.current.observe(project, filters, language)
  const current = review && session.current.current(review) && available
  function prepare() {
    setReview(null); setAck(false); setError(''); setStarted(false)
    try { setReview(session.current.prepare(project, filters, language)) } catch (cause) { setError(String(cause)) }
  }
  function download(format: 'json' | 'text') {
    if (!review || !current) return
    setError(''); setStarted(false)
    try {
      const file = session.current.download(review, format, ack), url = URL.createObjectURL(new Blob([file.text], { type: file.mimeType })), link = document.createElement('a')
      try { link.href = url; link.download = file.filename; document.body.appendChild(link); link.click() }
      finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
      setStarted(true)
    } catch (cause) { setError(String(cause)) }
  }
  return <section className="researchDossier stack">
    <h4>{t('research.dossierHeading')}</h4><p>{t('research.dossierHelp')}</p>
    <button className="secondaryButton" disabled={!available} onClick={prepare}>{t('research.dossierPrepare')}</button>
    {review && !current && <p role="alert">{t('research.dossierStale')}</p>}
    {current && review && <><p>{t('research.filterCount', { matches: review.count, total: review.total })}</p>
      <label>{t('research.dossierPreview')}<textarea readOnly value={review.files.text.text} rows={12} /></label>
      <details><summary>{t('research.dossierJsonPreview')}</summary><pre>{review.files.json.text}</pre></details>
      <label className="researchBriefAck"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />{t('research.dossierAck')}</label>
      <div className="researchDossierActions"><button className="secondaryButton" disabled={!ack} onClick={() => download('text')}>{t('research.dossierText')}</button><button className="secondaryButton" disabled={!ack} onClick={() => download('json')}>{t('research.dossierJson')}</button></div>
      {started && <p role="status">{t('research.dossierStarted')}</p>}</>}
    {error && <div role="alert">{t('research.dossierError')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
  </section>
}
