import { useEffect, useRef, useState } from 'react'
import { contentLanguageLabels, defaultProjectContentProfile, projectContentProfile, setProjectContentProfile, type ContentLanguage, type ProjectContentProfile } from '../core/contentProfile'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

export function ContentProfilePanel({ project, onProjectChange }: { project: KinaouProject; onProjectChange: (project: KinaouProject) => void }) {
  const { t } = useUiLanguage()
  const stored = projectContentProfile(project)
  const signature = JSON.stringify(stored)
  const key = JSON.stringify([project.id, signature])
  const synchronized = useRef(key)
  const [draft, setDraft] = useState<ProjectContentProfile>(stored)
  const [message, setMessage] = useState<'saved' | 'defaults' | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (synchronized.current === key) return
    synchronized.current = key
    setDraft(projectContentProfile(project)); setMessage(null); setError('')
  }, [key])
  function save() {
    setMessage(null); setError('')
    try {
      const next = setProjectContentProfile(project, draft)
      onProjectChange(next)
      const normalized = projectContentProfile(next)
      synchronized.current = JSON.stringify([project.id, JSON.stringify(normalized)])
      setDraft(normalized); setMessage('saved')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  function change(next: ProjectContentProfile) { setDraft(next); setMessage(null); setError('') }
  const languages = Object.keys(contentLanguageLabels) as ContentLanguage[]
  return <div className="card settingsPanel">
    <div><h3>{t('profile.heading')}</h3><p>{t('profile.help')}</p></div>
    <div className="formStack">
      <label>{t('profile.source')}<select value={draft.sourceLanguage} onChange={event => change({ ...draft, sourceLanguage: event.target.value as ContentLanguage })}>{languages.map(id => <option key={id} value={id}>{contentLanguageLabels[id]}</option>)}</select></label>
      <label>{t('profile.output')}<select value={draft.outputLanguage} onChange={event => change({ ...draft, outputLanguage: event.target.value as ContentLanguage })}>{languages.map(id => <option key={id} value={id}>{contentLanguageLabels[id]}</option>)}</select></label>
      <label>{t('profile.market')}<input value={draft.targetMarket} maxLength={5} placeholder="WORLD, DE, US, FR…" onChange={event => change({ ...draft, targetMarket: event.target.value.toUpperCase() })} /></label>
      <small>{t('profile.marketHelp')}</small>
      <label>{t('profile.audience')}<textarea value={draft.audience} maxLength={1000} onChange={event => change({ ...draft, audience: event.target.value })} /></label>
      <label>{t('profile.objective')}<textarea value={draft.objective} maxLength={2000} onChange={event => change({ ...draft, objective: event.target.value })} /></label>
      <label>{t('profile.tone')}<input value={draft.tone} maxLength={500} onChange={event => change({ ...draft, tone: event.target.value })} /></label>
      <div className="directorActions"><button disabled={JSON.stringify(draft) === JSON.stringify(defaultProjectContentProfile)} onClick={() => { setDraft(defaultProjectContentProfile); setMessage('defaults'); setError('') }}>{t('profile.reset')}</button><button className="primary" disabled={signature === JSON.stringify(draft)} onClick={save}>{t('profile.save')}</button></div>
      {message && <div className="note" role="status">{t(`profile.${message}`)}</div>}
      {error && <div className="errorBox" role="alert">{t('profile.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    </div>
  </div>
}
