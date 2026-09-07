import { useState } from 'react'
import { applyAiEditorProposal, describeAiEdit, parseAiEditorProposal, type AiEditorProposal } from '../core/aiEditor'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'

export function AiEditorPanel({ project, history, onProjectChange }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }) {
  const [source, setSource] = useState('')
  const [proposal, setProposal] = useState<AiEditorProposal | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  function review() { try { const next = parseAiEditorProposal(JSON.parse(source)); next.operations.forEach((operation) => describeAiEdit(project, operation)); setProposal(next); setSelected([]); setMessage('Proposal is valid. Select operations to apply.') } catch (error) { setProposal(null); setSelected([]); setMessage(error instanceof Error ? error.message : 'Invalid proposal') } }
  function apply() { if (!proposal || !selected.length) return; history.snapshot(project, `Before AI Editor: ${proposal.title}`, 'system'); onProjectChange(applyAiEditorProposal(project, proposal, selected)); setMessage(`${selected.length} operation(s) applied. The previous state is in Version History.`); setProposal(null); setSelected([]); setSource('') }
  return <div className="card aiEditorPanel"><div><div className="eyebrow">AI EDITOR</div><h3>Review structured timeline changes</h3><p>Nothing changes until individual operations are selected and applied.</p></div><label>Editor proposal JSON<textarea value={source} onChange={(event) => { setSource(event.target.value); setProposal(null); setSelected([]); setMessage('') }} placeholder='{"schemaVersion":1,"title":"…","objective":"…","operations":[…],"provenance":{"kind":"manual"}}' /></label><div className="directorActions"><button className="secondaryButton" disabled={!source.trim()} onClick={review}>Validate and preview diff</button>{proposal && <button className="primary" disabled={!selected.length} onClick={apply}>Apply {selected.length} selected</button>}</div>{message && <div className={proposal ? 'note' : 'warning'}>{message}</div>}{proposal && <div className="aiDiffs">{proposal.operations.map((operation) => { const diff = describeAiEdit(project, operation); return <label key={operation.id}><input type="checkbox" checked={selected.includes(operation.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, operation.id] : current.filter((id) => id !== operation.id))} /><span><strong>{operation.reason}</strong><small>Before: {diff.before}</small><small>After: {diff.after}</small></span></label> })}</div>}</div>
}
