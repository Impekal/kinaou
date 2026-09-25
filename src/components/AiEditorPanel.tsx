import { useEffect, useRef, useState } from 'react'
import { buildAiEditorContext, describeAiEdit, type AiEditorProposal } from '../core/aiEditor'
import { AiEditorRequestScope, aiEditorProjectKey, commitAiEditorReview, reviewAiEditorProposal, type AiEditorReview } from '../core/aiEditorReview'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }

export function AiEditorDiff({ project, operation }: { project: KinaouProject; operation: AiEditorProposal['operations'][number] }) {
  const { language, t } = useUiLanguage()
  const original =
    describeAiEdit(
      project,
      operation
    )

  const n =
    (value: number) =>
      value.toLocaleString(
        language
      )

  const edit =
    operation.edit

  let before =
    original.before

  let after =
    original.after

  if (
    edit.type
      === 'move-clips'
  ) {
    return (
      <span>
        <strong>
          {operation.reason}
        </strong>

        <small>
          {t('editor.before')}:
          {' '}
          {before}
        </small>

        <small>
          {t('editor.after')}:
          {' '}
          {after}
        </small>
      </span>
    )
  }

  const clip =
    project.tracks
      .find(
        track =>
          track.id
            === edit.trackId
      )!
      .clips
      .find(
        clip =>
          clip.id
            === edit.clipId
      )!
  if (edit.type === 'move-clip') { before = t('editor.start', { value: n(clip.startMs) }); after = t('editor.start', { value: n(edit.startMs) }) }
  if (edit.type === 'trim-clip') { before = t('editor.trim', { start: n(clip.startMs), duration: n(clip.durationMs), offset: n(clip.sourceOffsetMs) }); after = t('editor.trim', { start: n(edit.startMs), duration: n(edit.durationMs), offset: n(edit.sourceOffsetMs) }) }
  if (edit.type === 'set-clip-gain') { before = t('editor.gain', { value: n(clip.gain) }); after = t('editor.gain', { value: n(edit.gain) }) }
  if (edit.type === 'set-clip-speed') { before = t('editor.speed', { value: n(clip.speed) }); after = t('editor.speed', { value: n(edit.speed) }) }
  if (edit.type === 'set-clip-fades') {
    before = t(
      'editor.fades',
      {
        in:
          n(
            clip.fades?.inMs
            ?? 0
          ),
        out:
          n(
            clip.fades?.outMs
            ?? 0
          )
      }
    )

    after = t(
      'editor.fades',
      {
        in:
          n(edit.inMs),
        out:
          n(edit.outMs)
      }
    )
  }

  if (
    edit.type
      === 'set-clip-transition'
  ) {
    before =
      t(
        'editor.transition',
        {
          value:
            clip.transitionIn
              ? `${n(clip.transitionIn.durationMs)} ms`
              : t(
                  'editor.none'
                )
        }
      )

    after =
      t(
        'editor.transition',
        {
          value:
            edit.durationMs > 0
              ? `${n(edit.durationMs)} ms`
              : t(
                  'editor.none'
                )
        }
      )
  }

  if (
    edit.type
      === 'set-clip-motion'
  ) {
    before =
      t(
        'editor.motion',
        {
          value:
            clip.motion
            ?? t(
              'editor.none'
            )
        }
      )

    after =
      t(
        'editor.motion',
        {
          value:
            edit.motion
              === 'none'
              ? t(
                  'editor.none'
                )
              : edit.motion
        }
      )
  }

  return (
    <span>
      <strong>
        {operation.reason}
      </strong>

      <small>
        {t('editor.before')}: {before}
      </small>

      <small>
        {t('editor.after')}: {after}
      </small>
    </span>
  )
}

export function AiEditorPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const [source, setSource] = useState('')
  const [reviewed, setReviewed] = useState<AiEditorReview | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState<'valid' | 'models' | 'noModels' | 'applied' | null>(null)
  const [appliedCount, setAppliedCount] = useState(0)
  const [error, setError] = useState('')
  const [models, setModels] = useState<{ connection: string; items: Array<{ id: string; sizeBytes: number }> } | null>(null)
  const [model, setModel] = useState('')
  const [instruction, setInstruction] = useState('')
  const [pending, setPending] = useState<{ current: () => boolean } | null>(null)
  const scope = useRef(new AiEditorRequestScope())
  const inFlight = useRef<(() => boolean) | null>(null)
  const projectKey = aiEditorProjectKey(project)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, workerCapabilities.includes('local-llm')])
  scope.current.update(JSON.stringify([projectKey, connection]))
  useEffect(() => { scope.current.attach(); return () => scope.current.detach() }, [])
  useEffect(() => { setSource(''); setReviewed(null); setSelected([]); setMessage(null); setError(''); setInstruction('') }, [project.id])
  const busy = Boolean(pending?.current())
  const installed = models?.connection === connection ? models.items : []
  const canGenerate = workerConnected && Boolean(workerToken.trim()) && workerCapabilities.includes('local-llm')
  const stale = Boolean(reviewed && reviewed.projectKey !== projectKey)
  const proposal = reviewed?.proposal

  function accept(input: unknown) {
    const next = reviewAiEditorProposal(project, input)
    setReviewed(next); setSelected([]); setSource(JSON.stringify(next.proposal, null, 2)); setMessage('valid'); setError('')
  }
  function review() {
    if (busy) return
    setError(''); setMessage(null)
    try { accept(JSON.parse(source)) }
    catch (cause) { setReviewed(null); setSelected([]); setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  async function detectModels() {
    if (busy || inFlight.current?.() || !canGenerate) return
    const current = scope.current.begin()
    inFlight.current = current
    setPending({ current }); setError(''); setMessage(null)
    try {
      const items = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).listLocalModels()
      if (!current()) return
      setModels({ connection, items }); setModel(items[0]?.id ?? ''); setMessage(items.length ? 'models' : 'noModels')
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current()) { inFlight.current = null; setPending(null) } }
  }
  async function generate() {
    if (busy || inFlight.current?.() || !canGenerate || !installed.some(item => item.id === model) || !instruction.trim()) return
    const current = scope.current.begin()
    inFlight.current = current
    setPending({ current }); setReviewed(null); setSelected([]); setError(''); setMessage(null)
    try {
      const input = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).generateAiEditorProposal(model, instruction, buildAiEditorContext(project))
      if (current()) accept(input)
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current()) { inFlight.current = null; setPending(null) } }
  }
  function apply() {
    if (!reviewed || !selected.length || stale || busy) return
    setError(''); setMessage(null)
    try {
      const count = commitAiEditorReview(project, reviewed, selected, history, onProjectChange)
      setAppliedCount(count); setMessage('applied'); setReviewed(null); setSelected([]); setSource('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <div className="card aiEditorPanel">
    <div><div className="eyebrow">{t('editor.eyebrow')}</div><h3>{t('editor.heading')}</h3><p>{t('editor.help')}</p><p>{t('editor.scopeHelp')}</p></div>
    <div className="localAiEditor">
      <label>{t('editor.instruction')}<input disabled={busy} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder={t('editor.instructionHint')} /></label>
      <label>{t('editor.model')}<select disabled={busy} value={installed.some(item => item.id === model) ? model : ''} onChange={event => setModel(event.target.value)}><option value="">{t('editor.chooseModel')}</option>{installed.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
      <div className="directorActions"><button className="secondaryButton" disabled={busy || !canGenerate} onClick={detectModels}>{t('editor.detect')}</button><button className="primary" disabled={busy || !canGenerate || !installed.some(item => item.id === model) || !instruction.trim()} onClick={generate}>{t(busy ? 'editor.busy' : 'editor.generate')}</button></div>
    </div>
    <label>{t('editor.source')}<textarea value={source} onChange={event => { scope.current.invalidate(); setPending(null); setSource(event.target.value); setReviewed(null); setSelected([]); setMessage(null); setError('') }} placeholder='{"schemaVersion":1,"title":"…","objective":"…","operations":[…],"provenance":{"kind":"manual"}}' /></label>
    <div className="directorActions"><button className="secondaryButton" disabled={busy || !source.trim()} onClick={review}>{t('editor.review')}</button>{proposal && <button className="primary" disabled={busy || stale || !selected.length} onClick={apply}>{t('editor.apply', { count: selected.length })}</button>}</div>
    {stale && <div className="warning" role="status">{t('editor.stale')}</div>}
    {message && !stale && <div className="note" role="status">{t(`editor.${message}`, { count: appliedCount })}</div>}
    {error && <div className="errorBox" role="alert">{t('editor.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {proposal && !stale && <div className="aiDiffs"><p>{t('editor.individual')}</p>{proposal.operations.map(operation => <label key={operation.id}><input type="checkbox" disabled={busy} checked={selected.includes(operation.id)} onChange={event => setSelected(current => event.target.checked ? [...current, operation.id] : current.filter(id => id !== operation.id))} /><AiEditorDiff project={project} operation={operation} /></label>)}</div>}
  </div>
}
