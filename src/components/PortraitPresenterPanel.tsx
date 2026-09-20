import { useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { appendPortraitPresenter, planPortraitPresenter, presenterAssetAvailable } from '../core/portraitPresenter'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenStudio: () => void }

export function PortraitPresenterPanel({ project, history, onProjectChange, onOpenStudio }: Props) {
  const [name, setName] = useState('Presenter')
  const [portraitAssetId, setPortrait] = useState('')
  const [narrationAssetId, setNarration] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const portraits = project.assets.filter((asset) => asset.kind === 'image' && presenterAssetAvailable(asset))
  const narrations = project.assets.filter((asset) => asset.kind === 'audio' && presenterAssetAvailable(asset))
  const input = { name, portraitAssetId, narrationAssetId }
  let plan: ReturnType<typeof planPortraitPresenter> | undefined
  let reason = ''
  try { plan = planPortraitPresenter(project, input) }
  catch (cause) { reason = cause instanceof Error ? cause.message : 'Choose the portrait and narration first.' }

  function append() {
    setError(''); setResult('')
    try {
      const reviewed = planPortraitPresenter(project, input)
      const next = appendPortraitPresenter(project, input)
      history.snapshot(project, 'Before adding a voiced portrait presenter', 'system')
      onProjectChange(next)
      setResult(`Added ${name.trim()} at ${(reviewed.startMs / 1000).toFixed(2)}s for ${(reviewed.durationMs / 1000).toFixed(2)}s. Open Studio to preview or export the real composition. Version History can undo this addition.`)
      setPortrait(''); setNarration('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Presenter composition failed') }
  }

  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">LOCAL PRESENTER</div><h2>A portrait with your narration</h2><p>Combine an existing portrait with an existing voice recording. The portrait stays on screen for the full recording, without cutting the voice.</p></div><span className="badge">VOICED STILL · NO LIP SYNC</span></div>
    <div className="card availabilityPanel">
      <p>This is a still-image presenter, not animated speech. Generate an attributable fictional portrait in Images or import an image you may use in Assets. Generate narration in Audio or import your recording. Their original source metadata remains unchanged.</p>
      <p>For an installed audio-driven video workflow, open Video and check its required references. Compatible templates can receive your portrait and your own speech recording. Animation and lip-sync quality still depend on that local model; this panel remains a voiced still.</p>
      {!portraits.length && <div className="warning">No online managed portrait yet. Generate an image in Images or import one in Assets.</div>}
      {!narrations.length && <div className="warning">No online managed recording yet. Generate a voice in Audio or import a recording in Assets.</div>}
      <label>Presenter name<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Portrait<select value={portraitAssetId} onChange={(event) => setPortrait(event.target.value)}><option value="">Choose an existing image</option>{portraits.map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}</select></label>
      <label>Narration<select value={narrationAssetId} onChange={(event) => setNarration(event.target.value)}><option value="">Choose an existing recording</option>{narrations.map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}{typeof asset.metadata.durationMs === 'number' ? ` · ${(asset.metadata.durationMs / 1000).toFixed(2)}s` : ' · duration unknown'}</option>)}</select></label>
      {plan ? <p>Review: append {(plan.durationMs / 1000).toFixed(2)}s at {(plan.startMs / 1000).toFixed(2)}s, on two new editable tracks. Existing clips stay untouched. The project's output framing applies to the portrait; inspect its crop in Studio.</p> : <small>{reason}</small>}
      <div className="directorActions"><button className="primary" disabled={!plan} onClick={append}>Add portrait + narration</button><button className="secondaryButton" onClick={onOpenStudio}>Open Studio</button></div>
      {result && <div className="successBox" role="status">{result}</div>}
      {error && <div className="errorBox" role="alert">{error}</div>}
    </div>
  </section>
}
