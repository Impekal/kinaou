import { useEffect, useRef, useState } from 'react'
import {
  defaultProductionFormatDeclaration, productionAgeBands, productionFormatDeclarationSchema, productionFormats, productionFormatSignature,
  productionReviewStatuses, projectProductionFormat, recordProductionFormatReview, requiredProductionReviews, setProjectProductionFormat,
  type ProductionAgeBand, type ProductionFormat, type ProductionFormatDeclaration, type ProductionReviewItem
} from '../core/productionFormat'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }

function declarationIssue(draft: ProductionFormatDeclaration): 'needsAge' | 'needsPurpose' | null {
  const result = productionFormatDeclarationSchema.safeParse(draft)
  if (result.success) return null
  return result.error.issues.some(issue => issue.path[0] === 'ageBand') ? 'needsAge' : 'needsPurpose'
}

export function ProductionFormatPanel({ project, history, onProjectChange }: Props) {
  const { t, language } = useUiLanguage()
  const saved = projectProductionFormat(project)
  const savedKey = JSON.stringify([project.id, saved])
  const synchronized = useRef(savedKey)
  const latest = useRef(project)
  latest.current = project
  const [draft, setDraft] = useState<ProductionFormatDeclaration>(saved)
  const [message, setMessage] = useState<'saved' | null>(null)
  const [error, setError] = useState<{ key: 'failed' | 'confirmFailed' | 'changedMeanwhile'; detail?: string } | null>(null)
  const [signature, setSignature] = useState<{ project: KinaouProject; value: string } | null>(null)
  const [open, setOpen] = useState<ProductionReviewItem | null>(null)
  const [reviewer, setReviewer] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (synchronized.current === savedKey) return
    synchronized.current = savedKey
    setDraft(projectProductionFormat(project)); setMessage(null); setError(null); setOpen(null)
  }, [savedKey])

  // The signature belongs to one exact project value; a result that arrives for an older one is dropped.
  useEffect(() => {
    let cancelled = false
    productionFormatSignature(project).then(value => { if (!cancelled) setSignature({ project, value }) }, () => { if (!cancelled) setSignature(null) })
    return () => { cancelled = true }
  }, [project])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const issue = declarationIssue(draft)
  const required = requiredProductionReviews(saved)
  const statuses = signature?.project === project ? productionReviewStatuses(project, signature.value) : null
  const hasText = Boolean(project.script.trim()) || project.storyboard.length > 0

  function change(next: ProductionFormatDeclaration) { setDraft(next); setMessage(null); setError(null) }

  function save() {
    setMessage(null); setError(null)
    try {
      const next = setProjectProductionFormat(project, draft)
      if (next !== project) { history.snapshot(project, 'Before changing the production format', 'system'); onProjectChange(next) }
      synchronized.current = JSON.stringify([project.id, projectProductionFormat(next)])
      setDraft(projectProductionFormat(next)); setMessage('saved'); setOpen(null)
    } catch (cause) { setError({ key: 'failed', detail: cause instanceof Error ? cause.message : String(cause) }) }
  }

  async function confirm(item: ProductionReviewItem) {
    const started = project
    setBusy(true); setError(null); setMessage(null)
    try {
      const next = await recordProductionFormatReview(started, item, { reviewer, note })
      // The acknowledgement was computed for `started`; saving it over a newer project would vouch for text nobody read.
      if (latest.current !== started) { setError({ key: 'changedMeanwhile' }); return }
      history.snapshot(started, 'Before recording a format check', 'system')
      onProjectChange(next)
      setOpen(null); setNote('')
    } catch (cause) { setError({ key: 'confirmFailed', detail: cause instanceof Error ? cause.message : String(cause) }) }
    finally { setBusy(false) }
  }

  return <div className="card settingsPanel">
    <div><h3>{t('format.heading')}</h3><p>{t('format.help')}</p><p><small>{t('format.boundary')}</small></p></div>
    <div className="formStack">
      <label>{t('format.kind')}<select value={draft.format} onChange={event => change({ ...draft, format: event.target.value as ProductionFormat })}>{productionFormats.map(id => <option key={id} value={id}>{t(`format.kind.${id}`)}</option>)}</select></label>
      <label>{t('format.age')}<select value={draft.ageBand} onChange={event => change({ ...draft, ageBand: event.target.value as ProductionAgeBand })}>{productionAgeBands.map(id => <option key={id} value={id}>{t(`format.age.${id}`)}</option>)}</select></label>
      <label>{t('format.purpose')}<textarea value={draft.purpose} maxLength={1000} onChange={event => change({ ...draft, purpose: event.target.value })} /></label>
      {dirty && issue && <div className="warning" role="status">{t(`format.${issue}`)}</div>}
      <div className="directorActions">
        <button disabled={JSON.stringify(draft) === JSON.stringify(defaultProductionFormatDeclaration)} onClick={() => change(defaultProductionFormatDeclaration)}>{t('profile.reset')}</button>
        <button className="primary" disabled={!dirty || Boolean(issue)} onClick={save}>{t('format.save')}</button>
      </div>
      {message && <div className="note" role="status">{t('format.saved')}</div>}
      {error && <div className="errorBox" role="alert">{t(`format.${error.key}`)}{error.detail && <details><summary>{t('common.details')}</summary>{error.detail}</details>}</div>}
    </div>
    <div className="formStack">
      <h4>{t('format.checks')}</h4>
      {required.length === 0 && <p>{t('format.noChecks')}</p>}
      {required.length > 0 && !hasText && <div className="warning" role="status">{t('format.noText')}</div>}
      {required.length > 0 && dirty && <div className="warning" role="status">{t('format.unsavedFirst')}</div>}
      {(statuses ?? required.map(item => ({ item, state: 'missing' as const, review: undefined }))).map(status => <div className="assetRow" key={status.item}>
        <div>
          <strong>{t(`format.item.${status.item}`)}</strong>
          <small>{t(`format.itemHelp.${status.item}`)}</small>
          {status.review && <small>{t('format.confirmedBy', { reviewer: status.review.reviewer, date: new Date(status.review.reviewedAt).toLocaleString(language) })} — {status.review.note}</small>}
          {status.state === 'stale' && <small role="status">{t('format.staleHelp')}</small>}
          {open === status.item && <div className="formStack">
            <label>{t('format.reviewer')}<input value={reviewer} maxLength={120} disabled={busy} onChange={event => setReviewer(event.target.value)} /></label>
            <label>{t('format.note')}<textarea value={note} maxLength={2000} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
            <div className="directorActions"><button disabled={busy} onClick={() => setOpen(null)}>{t('format.cancel')}</button><button className="primary" disabled={busy || !reviewer.trim() || !note.trim()} onClick={() => { void confirm(status.item) }}>{t('format.confirm')}</button></div>
          </div>}
          {open !== status.item && status.state !== 'current' && <div className="directorActions"><button className="secondaryButton" disabled={busy || dirty || !hasText || !statuses} onClick={() => { setOpen(status.item); setError(null) }}>{t('format.confirm')}</button></div>}
        </div>
        <span className={status.state === 'current' ? 'badge' : 'badge offline'}>{t(`format.state.${status.state}`)}</span>
      </div>)}
    </div>
  </div>
}
