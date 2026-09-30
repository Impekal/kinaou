import { useEffect, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { retainedSearchTrends } from '../core/searchTrends'
import { projectResearchBrief, researchBriefAssessmentsCurrent, researchBriefDraft, researchBriefKey, saveResearchBrief, type ResearchBriefDraft } from '../core/researchBrief'
import { useUiLanguage } from './UiLanguageProvider'

const empty: ResearchBriefDraft = { title: '', question: '', angle: '', uncertainties: '', selected: [] }
export function ResearchBriefPanel({ project, history, onProjectChange, onOpenDirector }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenDirector?: () => void }) {
  const { t } = useUiLanguage()
  let observations: ReturnType<typeof retainedSearchTrends> = [], initial = empty, readError = '', savedBrief: ReturnType<typeof projectResearchBrief> = null, assessmentsCurrent = true
  try { observations = retainedSearchTrends(project); initial = researchBriefDraft(project); savedBrief = projectResearchBrief(project); assessmentsCurrent = researchBriefAssessmentsCurrent(project) } catch (cause) { readError = String(cause) }
  const [draft, setDraft] = useState(initial), [baseline, setBaseline] = useState(researchBriefKey(project)), [dirty, setDirty] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('')
  const key = researchBriefKey(project), stale = baseline !== key
  useEffect(() => { if (!dirty && baseline !== key && !readError) { setDraft(initial); setBaseline(key); setSaved(false); setError('') } }, [key, dirty, baseline, readError])
  function edit(patch: Partial<ResearchBriefDraft>) { setDraft(current => ({ ...current, ...patch })); setDirty(true); setSaved(false); setError('') }
  function save() {
    if (stale || readError) return
    setSaved(false); setError('')
    try {
      const next = saveResearchBrief(project, draft, baseline)
      if (next !== project) { history.snapshot(project, 'Before saving research brief', 'system'); onProjectChange(next) }
      setDraft(researchBriefDraft(next)); setBaseline(researchBriefKey(next)); setDirty(false); setSaved(true)
    } catch (cause) { setError(String(cause)) }
  }
  function reload() { if (readError) return; setDraft(initial); setBaseline(key); setDirty(false); setSaved(false); setError('') }
  return <div className="card stack">
    <h3>{t('researchBrief.heading')}</h3><p>{t('researchBrief.help')}</p>
    <fieldset className="researchBriefSources"><legend>{t('researchBrief.sources')}</legend>
      {observations.map((entry, index) => <label key={index}><input type="checkbox" checked={draft.selected.includes(index)} disabled={stale || !!readError || (!draft.selected.includes(index) && draft.selected.length >= 5)} onChange={event => edit({ selected: event.target.checked ? [...draft.selected, index] : draft.selected.filter(value => value !== index) })} />
        <span>{entry.items[0].query} · {entry.country} · {entry.retrievedAt}</span></label>)}
      {!observations.length && <p>{t('research.historyEmpty')}</p>}
    </fieldset>
    <label>{t('researchBrief.title')}<input maxLength={120} value={draft.title} onChange={event => edit({ title: event.target.value })} /></label>
    {(['question', 'angle', 'uncertainties'] as const).map(field => <label key={field}>{t(`researchBrief.${field}`)}<textarea maxLength={field === 'uncertainties' ? 4000 : 2000} value={draft[field]} onChange={event => edit({ [field]: event.target.value })} /></label>)}
    {dirty && <p role="status">{t('researchBrief.dirty')}</p>}{stale && <p role="alert">{t('researchBrief.stale')}</p>}
    <button className="primary" disabled={stale || !!readError || !draft.selected.length || !draft.title.trim() || !draft.question.trim() || !draft.angle.trim() || !draft.uncertainties.trim()} onClick={save}>{t('researchBrief.save')}</button>
    {(dirty || stale) && <button className="secondaryButton" disabled={!!readError} onClick={reload}>{t('researchBrief.reload')}</button>}
    {saved && <p role="status">{t('researchBrief.saved')}</p>}
    {(error || readError) && <div role="alert">{t('researchBrief.failed')}<details><summary>{t('common.details')}</summary>{error || readError}</details></div>}
    {savedBrief && <p>{t('researchBrief.details', { revision: savedBrief.revision, count: savedBrief.evidence.length, date: savedBrief.savedAt })}</p>}
    {!!savedBrief?.sourceAssessments?.length && <details><summary>{t('assessment.briefIncluded', { count: savedBrief.sourceAssessments.length })}</summary><p>{t('assessment.boundary')}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(savedBrief.sourceAssessments, null, 2)}</pre></details>}
    {!assessmentsCurrent && <p role="alert">{t('assessment.briefStale')}</p>}
    {onOpenDirector && <button className="secondaryButton" disabled={dirty || stale || !!readError || !savedBrief || !assessmentsCurrent} onClick={onOpenDirector}>{t('researchBrief.open')}</button>}
  </div>
}
