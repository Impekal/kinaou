import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { editorialProposalSchema, validateEditorialLanguagePass } from '../../worker/publication-editorial.mjs'
import { applyPublicationEditorial, projectPublicationEditorial, publicationEditorialContext, publicationEditorialCurrent, publicationEditorialDraft, reviewPublicationEditorial, type EditorialContext, type EditorialItem, type EditorialProposal, type EditorialProvenance, type PublicationEditorialReview } from '../core/publicationEditorial'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
const generatedSchema = z.object({ proposal: editorialProposalSchema, modelId: z.string().min(1).max(200), adapterId: z.literal('ollama') }).strict()
const languageSchema = generatedSchema.extend({ outputLanguage: z.enum(['de', 'en', 'fr']) }).strict()

export function PublicationEditorialPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const [draft, setDraft] = useState<{ context: EditorialContext; proposal: EditorialProposal; origin: EditorialProvenance } | null>(null)
  const [review, setReview] = useState<{ value: PublicationEditorialReview; identity: string; epoch: number } | null>(null)
  const [languageProposal, setLanguageProposal] = useState<{ proposal: EditorialProposal; modelId: string; identity: string; epoch: number } | null>(null)
  const [languageAck, setLanguageAck] = useState(false)
  const [ack, setAck] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const [models, setModels] = useState<{ connection: string; values: Array<{ id: string; sizeBytes: number }> } | null>(null), [model, setModel] = useState('')
  const [pending, setPending] = useState<{ current: () => boolean } | null>(null)
  const inFlight = useRef<(() => boolean) | null>(null), scope = useRef(new AiEditorRequestScope())
  const supported = workerConnected && !!workerToken.trim() && workerCapabilities.includes('publication-editorial') && workerCapabilities.includes('publication-editorial-completion-v2')
  const languageSupported = supported && workerCapabilities.includes('publication-editorial-language')
  const connection = JSON.stringify([workerUrl, workerToken, supported, languageSupported]), identity = JSON.stringify([project, draft, connection])
  const observed = useRef({ identity, epoch: 0 })
  if (observed.current.identity !== identity) observed.current = { identity, epoch: observed.current.epoch + 1 }
  scope.current.update(identity)
  useEffect(() => { scope.current.attach(); return () => scope.current.detach() }, [])
  const busy = !!pending?.current(), installed = models?.connection === connection ? models.values : []
  let context: EditorialContext | null = null, current: ReturnType<typeof projectPublicationEditorial> = null, contextError = '', recordError = ''
  try { context = publicationEditorialContext(project) } catch (cause) { contextError = String(cause) }
  try { current = projectPublicationEditorial(project) } catch (cause) { recordError = String(cause) }
  const stale = !!draft && JSON.stringify(draft.context) !== JSON.stringify(context)
  const visibleReview = review?.identity === identity && review.epoch === observed.current.epoch ? review.value : null
  const visibleLanguage = languageProposal?.identity === identity && languageProposal.epoch === observed.current.epoch ? languageProposal : null
  function resetReview() { setReview(null); setAck(false); setLanguageProposal(null); setLanguageAck(false); setError(''); setSaved(false) }
  function prepare() {
    if (busy || !context || recordError) return
    resetReview(); setDraft({ context, proposal: publicationEditorialDraft(project), origin: { kind: 'authored', edited: false } })
  }
  function edit(index: number, patch: Partial<EditorialItem>) {
    if (!draft || busy) return
    resetReview(); setDraft({ ...draft, proposal: { ...draft.proposal, items: draft.proposal.items.map((item, i) => i === index ? { ...item, ...patch } : item) }, origin: { ...draft.origin, edited: true } })
  }
  async function request(kind: 'models' | 'generate' | 'translate') {
    if (!supported || busy || inFlight.current?.() || (kind === 'translate' && !languageSupported) || (kind !== 'models' && (!draft || stale || !installed.some(value => value.id === model)))) return
    const active = scope.current.begin(); inFlight.current = active; setPending({ current: active }); resetReview()
    try {
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      if (kind === 'models') {
        const values = await client.listLocalModels()
        if (active()) { setModels({ connection, values }); setModel('') }
      } else if (draft) {
        if (kind === 'translate') {
          // Validate the existing complete draft before sending text; translating
          // is never an automatic retry or a substitute for a fresh review.
          reviewPublicationEditorial(project, draft.context, draft.proposal, draft.origin)
          const result = languageSchema.parse(await client.translatePublicationEditorial(model, draft.context, draft.proposal))
          if (active()) {
            if (result.modelId !== model || result.outputLanguage !== draft.context.outputLanguage) throw Error('Returned language/model does not match selection')
            const proposal = validateEditorialLanguagePass(draft.context, draft.proposal, result.proposal)
            setLanguageProposal({ proposal, modelId: model, identity, epoch: observed.current.epoch })
          }
          return
        }
        const result = generatedSchema.parse(await client.generatePublicationEditorial(model, draft.context))
        if (active()) {
          if (result.modelId !== model) throw Error('Returned model identity does not match selection')
          // Validate IDs/quotes before replacing any authored text.
          reviewPublicationEditorial(project, draft.context, result.proposal, { kind: 'local-model', modelId: model, adapterId: 'ollama', edited: false })
          setDraft({ ...draft, proposal: result.proposal, origin: { kind: 'local-model', modelId: model, adapterId: 'ollama', edited: false } })
        }
      }
    } catch (cause) { if (active()) setError(String(cause)) }
    finally { if (active()) { inFlight.current = null; setPending(null) } }
  }
  function prepareReview() {
    if (!draft || busy || stale) return
    resetReview()
    try { setReview({ value: reviewPublicationEditorial(project, draft.context, draft.proposal, draft.origin), identity, epoch: observed.current.epoch }) }
    catch (cause) { setError(String(cause)) }
  }
  function save() {
    if (!visibleReview || !ack || busy || recordError) return
    setError(''); setSaved(false)
    try { const next = applyPublicationEditorial(project, visibleReview, ack); history.snapshot(project, 'Before saving publication editorial copy', 'system'); onProjectChange(next); setReview(null); setAck(false); setSaved(true) }
    catch (cause) { setError(String(cause)) }
  }
  return <section className="card stack" style={{ padding: 28, minWidth: 0 }}>
    <h3>{t('editorial.heading')}</h3><p>{t('editorial.help')}</p>
    <p className="note">{t('editorial.inferenceBudget')}</p>
    <button className="secondaryButton" disabled={!context || !!recordError || busy} onClick={prepare}>{t('editorial.prepare')}</button><small>{t('editorial.replace')}</small>
    {context && <p>{t('editorial.context', { language: context.outputLanguage, market: context.targetMarket, revision: context.planRevision })}</p>}
    <button className="secondaryButton" disabled={!supported || busy} onClick={() => void request('models')}>{t('editorial.models')}</button>
    {models?.connection === connection && !installed.length && <p>{t('editorial.noModels')}</p>}
    <label>{t('editorial.model')}<select value={model} disabled={!supported || busy} onChange={event => { setModel(event.target.value); resetReview() }}><option value="">{t('editorial.chooseModel')}</option>{installed.map(value => <option key={value.id} value={value.id}>{value.id}</option>)}</select></label>
    <button className="secondaryButton" disabled={!supported || !draft || stale || busy || !installed.some(value => value.id === model)} onClick={() => void request('generate')}>{t('editorial.generate')}</button><small>{t('editorial.localHelp')}</small>
    <button className="secondaryButton" disabled={!languageSupported || !draft || stale || busy || !installed.some(value => value.id === model)} onClick={() => void request('translate')}>{t('editorial.languageRequest')}</button><small>{t('editorial.languageHelp')}</small>
    {busy && <p role="status">{t('editorial.busy')}</p>}
    {draft && <>
      <p>{draft.origin.languagePass && t('editorial.baseOrigin')}{draft.origin.kind === 'authored' ? t('editorial.authored') : t('editorial.generated', { model: draft.origin.modelId ?? '', edited: t(draft.origin.edited ? 'editorial.yes' : 'editorial.no') })}</p>
      {draft.origin.languagePass && <p>{t('editorial.languageOrigin', { model: draft.origin.languagePass.modelId, language: draft.origin.languagePass.outputLanguage })}</p>}
      {stale && <p role="alert">{t('editorial.stale')}</p>}
      {draft.proposal.items.map((item, index) => <fieldset key={item.jobId}><legend>{t(index === 0 ? 'publicationPlan.main' : 'publicationPlan.short')} · {draft.context.exports[index].label}</legend>
        <label>{t('editorial.title')}<input maxLength={200} disabled={busy || stale} value={item.title} onChange={event => edit(index, { title: event.target.value })} /></label>
        <label>{t('editorial.description')}<textarea rows={4} maxLength={5000} disabled={busy || stale} value={item.description} onChange={event => edit(index, { description: event.target.value })} /></label>
        <label>{t('editorial.tags')}<input disabled={busy || stale} value={item.tags.join(',')} onChange={event => edit(index, { tags: event.target.value ? event.target.value.split(',') : [] })} /></label>
        <label>{t('editorial.rationale')}<textarea maxLength={1500} disabled={busy || stale} value={item.rationale} onChange={event => edit(index, { rationale: event.target.value })} /></label>
        <label>{t('editorial.quote')}<textarea maxLength={500} disabled={busy || stale} value={item.sourceQuote} onChange={event => edit(index, { sourceQuote: event.target.value })} /></label>
      </fieldset>)}
      <details><summary>{t('editorial.source')}</summary><p style={{ whiteSpace: 'pre-wrap' }}>{draft.context.sourceText}</p></details>
      <button className="secondaryButton" disabled={busy || stale || !!recordError} onClick={prepareReview}>{t('editorial.review')}</button>
    </>}
    {visibleLanguage && draft && <div className="stack note">
      <h4>{t('editorial.languageCandidate')}</h4><p>{t('editorial.languageWarning')}</p>
      {visibleLanguage.proposal.items.map((item, index) => <fieldset key={item.jobId}><legend>{draft.context.exports[index].label}</legend>
        <strong>{t('editorial.languageBefore')}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{[draft.proposal.items[index].title, draft.proposal.items[index].description, draft.proposal.items[index].tags.join(', '), draft.proposal.items[index].rationale].join('\n\n')}</p>
        <strong>{t('editorial.languageAfter')}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{[item.title, item.description, item.tags.join(', '), item.rationale].join('\n\n')}</p>
      </fieldset>)}
      <label><input type="checkbox" checked={languageAck} onChange={event => setLanguageAck(event.target.checked)} />{t('editorial.languageAck')}</label>
      <button className="secondaryButton" disabled={!languageAck || busy || stale} onClick={() => {
        if (!languageAck || busy || stale) return
        const next = { ...draft, proposal: validateEditorialLanguagePass(draft.context, draft.proposal, visibleLanguage.proposal), origin: { ...draft.origin, edited: true, languagePass: { modelId: visibleLanguage.modelId, adapterId: 'ollama' as const, outputLanguage: draft.context.outputLanguage } } }
        resetReview(); setDraft(next)
      }}>{t('editorial.languageApply')}</button>
      <button className="secondaryButton" disabled={busy} onClick={() => { setLanguageProposal(null); setLanguageAck(false) }}>{t('editorial.languageDiscard')}</button>
    </div>}
    {visibleReview && <div className="stack"><p>{t('editorial.reviewed')}</p><label><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} />{t('editorial.ack')}</label><button className="primary" disabled={!ack || busy} onClick={save}>{t('editorial.save')}</button></div>}
    {saved && <p role="status">{t('editorial.saved')}</p>}
    {contextError && <p>{t('editorial.requirements')}</p>}
    {(error || contextError || recordError) && <div role="alert">{t('editorial.error')}<details><summary>{t('common.details')}</summary>{error || contextError || recordError}</details></div>}
    {current && <div className="stack"><h4>{t('editorial.savedHeading')}</h4><small>{current.savedAt} · r{current.revision}</small>
      {current.provenance.languagePass && <p>{t('editorial.languageOrigin', { model: current.provenance.languagePass.modelId, language: current.provenance.languagePass.outputLanguage })}</p>}
      {current.proposal.items.map(item => <p key={item.jobId}><strong>{item.title}</strong><br />{item.description}</p>)}
      {!publicationEditorialCurrent(project, current) && <p>{t('editorial.stale')}</p>}
      <button className="secondaryButton" disabled={busy || !publicationEditorialCurrent(project, current)} onClick={() => { resetReview(); setDraft({ context: current!.context, proposal: current!.proposal, origin: current!.provenance }) }}>{t('editorial.loadSaved')}</button><small>{t('editorial.replace')}</small>
    </div>}
  </section>
}
