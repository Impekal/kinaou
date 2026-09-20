import { useEffect, useState } from 'react'
import { contentLanguageLabels, defaultProjectContentProfile, projectContentProfile, setProjectContentProfile, type ContentLanguage, type ProjectContentProfile } from '../core/contentProfile'
import type { KinaouProject } from '../core/project'

export function ContentProfilePanel({ project, onProjectChange }: { project: KinaouProject; onProjectChange: (project: KinaouProject) => void }) {
  const stored = projectContentProfile(project)
  const signature = JSON.stringify(stored)
  const [draft, setDraft] = useState<ProjectContentProfile>(stored)
  const [message, setMessage] = useState('')

  useEffect(() => { setDraft(projectContentProfile(project)); setMessage('') }, [project.id, signature])

  function save() {
    try {
      onProjectChange(setProjectContentProfile(project, draft))
      setMessage('Language and audience profile saved with this project.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the content profile.')
    }
  }

  const languages = Object.keys(contentLanguageLabels) as ContentLanguage[]
  return <div className="card settingsPanel">
    <div><div className="eyebrow">LANGUAGE &amp; AUDIENCE</div><h3>One clear brief for every creative engine</h3><p>Choose the source language, final content language and market once. Director receives these instructions locally; later voice, avatar and publishing adapters can reuse the same project truth.</p></div>
    <div className="formStack">
      <label>Source language<select value={draft.sourceLanguage} onChange={(event) => setDraft({ ...draft, sourceLanguage: event.target.value as ContentLanguage })}>{languages.map((id) => <option key={id} value={id}>{contentLanguageLabels[id]}</option>)}</select></label>
      <label>Output language<select value={draft.outputLanguage} onChange={(event) => setDraft({ ...draft, outputLanguage: event.target.value as ContentLanguage })}>{languages.map((id) => <option key={id} value={id}>{contentLanguageLabels[id]}</option>)}</select></label>
      <label>Target market<input value={draft.targetMarket} maxLength={5} placeholder="WORLD, DE, US, FR…" onChange={(event) => setDraft({ ...draft, targetMarket: event.target.value.toUpperCase() })} /></label>
      <small>Use WORLD or a two-letter country code.</small>
      <label>Audience<textarea value={draft.audience} maxLength={1000} placeholder="Who should watch, care and act?" onChange={(event) => setDraft({ ...draft, audience: event.target.value })} /></label>
      <label>Objective<textarea value={draft.objective} maxLength={2000} placeholder="What should viewers understand or do afterwards?" onChange={(event) => setDraft({ ...draft, objective: event.target.value })} /></label>
      <label>Voice and tone<input value={draft.tone} maxLength={500} placeholder="e.g. precise, warm, fast, credible" onChange={(event) => setDraft({ ...draft, tone: event.target.value })} /></label>
      <div className="directorActions"><button disabled={signature === JSON.stringify(draft)} onClick={() => { setDraft(defaultProjectContentProfile); setMessage('Defaults loaded for review. Save to apply them.') }}>Reset draft</button><button className="primary" disabled={signature === JSON.stringify(draft)} onClick={save}>Save language profile</button></div>
      {message && <div className="note">{message}</div>}
    </div>
  </div>
}
