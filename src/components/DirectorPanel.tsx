import { useState } from 'react'
import { applyDirectorPlan, parseDirectorPlan, type DirectorPlan } from '../core/director'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}

export function DirectorPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const [source, setSource] = useState('')
  const [reviewed, setReviewed] = useState<DirectorPlan | null>(null)
  const [message, setMessage] = useState('')
  const [models, setModels] = useState<Array<{ id: string; sizeBytes: number }>>([])
  const [model, setModel] = useState('')
  const [brief, setBrief] = useState(String((project.metadata.sourceInput as { content?: unknown } | undefined)?.content ?? ''))
  const [busy, setBusy] = useState(false)

  async function loadModels() {
    setBusy(true); setMessage('')
    try { const next = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).listLocalModels(); setModels(next); setModel(next[0]?.id ?? ''); setMessage(next.length ? 'Installed local models loaded.' : 'Ollama is reachable, but no local models are installed.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load local models.') }
    finally { setBusy(false) }
  }

  async function generate() {
    setBusy(true); setMessage(''); setReviewed(null)
    try { const plan = parseDirectorPlan(await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).generateDirectorPlan(model, brief)); setReviewed(plan); setSource(JSON.stringify(plan, null, 2)); setMessage('Local model output passed KINAOU validation. Review it before applying.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Local generation failed.') }
    finally { setBusy(false) }
  }

  function review() {
    try {
      const parsed = parseDirectorPlan(JSON.parse(source))
      setReviewed(parsed)
      setMessage('Plan is valid and ready for review. Nothing has been changed yet.')
    } catch (error) {
      setReviewed(null)
      setMessage(error instanceof Error ? error.message : 'Director plan is invalid.')
    }
  }

  function apply() {
    if (!reviewed) return
    history.snapshot(project, `Before Director plan: ${reviewed.title}`, 'system')
    onProjectChange(applyDirectorPlan(project, reviewed))
    setMessage('Director plan applied. The previous project state is available in Version History.')
    setReviewed(null)
    setSource('')
  }

  const current = project.metadata.directorPlan

  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">STRUCTURED DIRECTION</div><h2>Director</h2><p>Review a versioned plan from a human or local model before it changes the project.</p></div><span className="status">NO CLOUD REQUIRED</span></div>
    <div className="card directorPanel">
      <div className="localDirector"><label>Creative brief<textarea value={brief} onChange={(event) => setBrief(event.target.value)} /></label><label>Installed Ollama model<select value={model} onChange={(event) => setModel(event.target.value)}><option value="">Select a detected model</option>{models.map((item) => <option key={item.id} value={item.id}>{item.id} · {(item.sizeBytes / 1024 / 1024 / 1024).toFixed(1)} GB</option>)}</select></label><div className="directorActions"><button className="secondaryButton" disabled={busy || !workerConnected || !workerCapabilities.includes('local-llm')} onClick={loadModels}>Detect local models</button><button className="primary" disabled={busy || !model || !brief.trim()} onClick={generate}>{busy ? 'Working locally…' : 'Generate plan locally'}</button></div></div>
      <label>DirectorPlan JSON<textarea value={source} onChange={(event) => { setSource(event.target.value); setReviewed(null); setMessage('') }} placeholder='{"schemaVersion":1,"title":"…","objective":"…","script":"…","scenes":[…],"provenance":{"kind":"manual"}}' /></label>
      <div className="directorActions"><button className="secondaryButton" disabled={!source.trim()} onClick={review}>Validate and review</button>{reviewed && <button className="primary" onClick={apply}>Apply reviewed plan</button>}</div>
      {message && <div className={reviewed ? 'note' : 'warning'}>{message}</div>}
      {reviewed && <div className="directorReview"><div><strong>{reviewed.title}</strong><small>{reviewed.scenes.length} scenes · {(reviewed.scenes.reduce((total, scene) => total + scene.durationMs, 0) / 1000).toFixed(1)} seconds · {reviewed.provenance.kind}</small></div><p>{reviewed.objective}</p><ol>{reviewed.scenes.map((scene) => <li key={scene.id}><strong>{scene.title}</strong><span>{scene.description}</span><small>{(scene.durationMs / 1000).toFixed(1)}s · {scene.requiredMedia.join(', ') || 'no requested media'}</small></li>)}</ol></div>}
    </div>
    {Boolean(current) && <div className="card directorCurrent"><div className="eyebrow">ACCEPTED PLAN</div><strong>{String((current as { title?: unknown }).title ?? 'Director plan')}</strong><p>This project contains an accepted DirectorPlan. Applying another valid plan creates a safety version first.</p></div>}
    <div className="card note"><strong>Model boundary:</strong> this slice validates and applies real structured output. It does not claim that a local model is installed or generate placeholder AI results.</div>
  </section>
}
