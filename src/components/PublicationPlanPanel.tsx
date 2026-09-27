import { useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { projectContentProfile } from '../core/contentProfile'
import { applyPublicationPlan, projectPublicationPlan, publicationPlanCalendar, publicationPlanChoices, publicationPlanDraftFromSaved, publicationPlanMissingReceipts, reviewPublicationPlan, suggestedShortOffsets, type PublicationPlan, type PublicationPlanDraft, type PublicationPlanReview } from '../core/publicationPlan'
import { useUiLanguage } from './UiLanguageProvider'
import { PublicationTimeError, type PublicationTimeIssue } from '../core/publicationTime'
import './PublicationPlanPanel.css'

export function PublicationPlanPanel({ project, history, onProjectChange }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }) {
  const { t } = useUiLanguage(), choices = publicationPlanChoices(project)
  const [draft, setDraft] = useState<PublicationPlanDraft>(() => ({ mainJobId: '', shorts: [{ jobId: '', offsetHours: 24 }], mainLocal: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, targetMarket: projectContentProfile(project).targetMarket, rationale: '' }))
  const [review, setReview] = useState<{ value: PublicationPlanReview; scope: number } | null>(null), [ack, setAck] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const [timeIssue, setTimeIssue] = useState<PublicationTimeIssue | null>(null)
  const identity = JSON.stringify([project, draft]), observed = useRef({ identity, generation: 0 })
  if (observed.current.identity !== identity) observed.current = { identity, generation: observed.current.generation + 1 }
  const scope = observed.current.generation, visibleReview = review?.scope === scope ? review.value : null
  let current: PublicationPlan | null = null, readError = ''
  try { current = projectPublicationPlan(project) } catch (cause) { readError = String(cause) }
  function edit(patch: Partial<PublicationPlanDraft>) { setDraft(value => ({ ...value, ...patch })); setReview(null); setAck(false); setError(''); setTimeIssue(null); setSaved(false) }
  function prepare() { setReview(null); setAck(false); setError(''); setTimeIssue(null); setSaved(false); try { setReview({ value: reviewPublicationPlan(project, draft), scope }) } catch (cause) { setError(String(cause)); if (cause instanceof PublicationTimeError) setTimeIssue(cause.code) } }
  function save() {
    if (!visibleReview || !ack || readError) return
    setError(''); setSaved(false)
    try { const next = applyPublicationPlan(project, visibleReview, ack); history.snapshot(project, 'Before saving local publication plan', 'system'); onProjectChange(next); setReview(null); setAck(false); setSaved(true) }
    catch (cause) { setError(String(cause)) }
  }
  function download() {
    if (!current) return
    try {
      const body = publicationPlanCalendar(current, { main: t('publicationPlan.main'), short: t('publicationPlan.short'), warning: t('publicationPlan.calendarWarning') })
      const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' })), anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'kinaou-publication-' + current.id + '-r' + current.revision + '.ics'
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(String(cause)) }
  }
  function preview(plan: PublicationPlan) {
    return <><p>{t('publicationPlan.summary', { revision: plan.revision, market: plan.targetMarket, zone: plan.timeZone })}</p><p>{plan.rationale}</p>
      <ol>{plan.events.map((event, index) => <li key={index}><strong>{t(event.kind === 'main' ? 'publicationPlan.main' : 'publicationPlan.short')}: {event.receipt.label}</strong><p>{event.local.replace('T', ' ')} · {plan.timeZone} (+{event.offsetHours} h)<br /><small>UTC: {event.at}</small></p><code>{event.receipt.outputRelativePath}</code></li>)}</ol></>
  }
  return <section className="card stack publicationPlanPanel">
    <h3>{t('publicationPlan.heading')}</h3><p>{t('publicationPlan.help')}</p><p>{t('publicationPlan.files')}</p>
    <label>{t('publicationPlan.main')}<select value={draft.mainJobId} onChange={event => edit({ mainJobId: event.target.value })}><option value="">{t('publicationPlan.choose')}</option>{choices.main.map(receipt => <option key={receipt.jobId} value={receipt.jobId}>{receipt.label} · {receipt.completedAt}</option>)}</select></label>
    <div className="publicationPlanFields"><label>{t('publicationPlan.local')}<input type="datetime-local" value={draft.mainLocal} onChange={event => edit({ mainLocal: event.target.value })} /></label>
      <label>{t('publicationPlan.zone')}<input maxLength={100} value={draft.timeZone} onChange={event => edit({ timeZone: event.target.value })} /></label>
      <label>{t('publicationPlan.market')}<input maxLength={5} value={draft.targetMarket} onChange={event => edit({ targetMarket: event.target.value })} /></label></div>
    <p>{t('publicationPlan.offsetHelp')}</p>
    {draft.shorts.map((short, index) => <fieldset key={index}><legend>{t('publicationPlan.short')} {index + 1}</legend>
      <label>{t('publicationPlan.short')} {index + 1}<select value={short.jobId} onChange={event => edit({ shorts: draft.shorts.map((value, i) => i === index ? { ...value, jobId: event.target.value } : value) })}><option value="">{t('publicationPlan.choose')}</option>{choices.shorts.map(receipt => <option key={receipt.jobId} value={receipt.jobId}>{receipt.label} · {receipt.completedAt}</option>)}</select></label>
      <label>{t('publicationPlan.offset')}<input type="number" min={1} max={720} step={1} value={Number.isNaN(short.offsetHours) ? '' : short.offsetHours} onChange={event => edit({ shorts: draft.shorts.map((value, i) => i === index ? { ...value, offsetHours: event.target.valueAsNumber } : value) })} /></label>
      {draft.shorts.length > 1 && <button className="secondaryButton" onClick={() => edit({ shorts: draft.shorts.filter((_, i) => i !== index) })}>{t('publicationPlan.remove')}</button>}
    </fieldset>)}
    <button className="secondaryButton" disabled={draft.shorts.length >= 3} onClick={() => edit({ shorts: [...draft.shorts, { jobId: '', offsetHours: suggestedShortOffsets[draft.shorts.length] }] })}>{t('publicationPlan.add')}</button>
    <label>{t('publicationPlan.rationale')}<textarea maxLength={2000} value={draft.rationale} onChange={event => edit({ rationale: event.target.value })} /></label>
    <button className="secondaryButton" disabled={!!readError || !draft.mainJobId || !draft.mainLocal || !draft.rationale.trim() || draft.shorts.some(short => !short.jobId)} onClick={prepare}>{t('publicationPlan.review')}</button>
    {visibleReview && <div className="publicationPlanReview"><h4>{t('publicationPlan.proposal')}</h4>{preview(visibleReview.plan)}
      <label className="publicationPlanAck"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} />{t('publicationPlan.ack')}</label><button className="primary" disabled={!ack || !!readError} onClick={save}>{t('publicationPlan.save')}</button></div>}
    {saved && <p role="status">{t('publicationPlan.saved')}</p>}
    {(error || readError) && <div role="alert">{t(timeIssue ? `publicationPlan.${timeIssue}` : 'publicationPlan.failed')}<details><summary>{t('common.details')}</summary>{error || readError}</details></div>}
    {current && <div className="publicationPlanReview"><h4>{t('publicationPlan.current')}</h4>{preview(current)}
      <button className="secondaryButton" onClick={() => edit(publicationPlanDraftFromSaved(project))}>{t('publicationPlan.editSaved')}</button>
      {!!publicationPlanMissingReceipts(project, current) && <p role="status">{t('publicationPlan.historical', { count: publicationPlanMissingReceipts(project, current) })}</p>}
      {current.events.some(event => Date.parse(event.at) <= Date.now()) && <p role="status">{t('publicationPlan.past')}</p>}
      <p>{t('publicationPlan.calendarHelp')}</p><button className="secondaryButton" onClick={download}>{t('publicationPlan.download')}</button>
    </div>}
  </section>
}
