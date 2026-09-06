import { useState } from 'react'
import { applyDirectorPlan, parseDirectorPlan, type DirectorPlan } from '../core/director'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  onProjectChange: (project: KinaouProject) => void
}

export function DirectorPanel({ project, history, onProjectChange }: Props) {
  const [source, setSource] = useState('')
  const [reviewed, setReviewed] = useState<DirectorPlan | null>(null)
  const [message, setMessage] = useState('')

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
      <label>DirectorPlan JSON<textarea value={source} onChange={(event) => { setSource(event.target.value); setReviewed(null); setMessage('') }} placeholder='{"schemaVersion":1,"title":"…","objective":"…","script":"…","scenes":[…],"provenance":{"kind":"manual"}}' /></label>
      <div className="directorActions"><button className="secondaryButton" disabled={!source.trim()} onClick={review}>Validate and review</button>{reviewed && <button className="primary" onClick={apply}>Apply reviewed plan</button>}</div>
      {message && <div className={reviewed ? 'note' : 'warning'}>{message}</div>}
      {reviewed && <div className="directorReview"><div><strong>{reviewed.title}</strong><small>{reviewed.scenes.length} scenes · {(reviewed.scenes.reduce((total, scene) => total + scene.durationMs, 0) / 1000).toFixed(1)} seconds · {reviewed.provenance.kind}</small></div><p>{reviewed.objective}</p><ol>{reviewed.scenes.map((scene) => <li key={scene.id}><strong>{scene.title}</strong><span>{scene.description}</span><small>{(scene.durationMs / 1000).toFixed(1)}s · {scene.requiredMedia.join(', ') || 'no requested media'}</small></li>)}</ol></div>}
    </div>
    {Boolean(current) && <div className="card directorCurrent"><div className="eyebrow">ACCEPTED PLAN</div><strong>{String((current as { title?: unknown }).title ?? 'Director plan')}</strong><p>This project contains an accepted DirectorPlan. Applying another valid plan creates a safety version first.</p></div>}
    <div className="card note"><strong>Model boundary:</strong> this slice validates and applies real structured output. It does not claim that a local model is installed or generate placeholder AI results.</div>
  </section>
}
