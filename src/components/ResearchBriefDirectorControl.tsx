import { useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { projectResearchBrief, researchBriefAssessmentsCurrent, researchBriefToDirectorText } from '../core/researchBrief'
import { useUiLanguage } from './UiLanguageProvider'

export function ResearchBriefDirectorControl({ project, busy, onApply }: { project: KinaouProject; busy: boolean; onApply: (text: string) => void }) {
  const { t } = useUiLanguage(), [ackKey, setAckKey] = useState(''), [appliedKey, setAppliedKey] = useState('')
  const observed = useRef({ key: '', generation: 0 })
  let brief: ReturnType<typeof projectResearchBrief> = null, error = '', assessmentsCurrent = true
  try { brief = projectResearchBrief(project); assessmentsCurrent = researchBriefAssessmentsCurrent(project) } catch (cause) { error = String(cause) }
  const identity = JSON.stringify([project.id, brief, project.metadata.researchSourceAssessmentsV1 ?? null])
  if (observed.current.key !== identity) { observed.current = { key: identity, generation: observed.current.generation + 1 } }
  const key = JSON.stringify([identity, observed.current.generation]), ack = ackKey === key
  if (!brief && !error) return null
  function apply() { if (busy || !ack || !brief || !assessmentsCurrent || error) return; onApply(researchBriefToDirectorText(brief)); setAppliedKey(key); setAckKey('') }
  return <section className="note stack"><h3>{t('researchBrief.director')}</h3>
    {error ? <div role="alert">{t('researchBrief.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div> : brief && <>
      <strong>{brief.title}</strong><p>{t('researchBrief.details', { revision: brief.revision, count: brief.evidence.length, date: brief.savedAt })}</p>
      <p>{brief.question}</p><p>{brief.uncertainties}</p>
      {!!brief.sourceAssessments?.length && <details><summary>{t('assessment.briefIncluded', { count: brief.sourceAssessments.length })}</summary><p>{t('assessment.boundary')}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(brief.sourceAssessments, null, 2)}</pre></details>}
      {!assessmentsCurrent && <p role="alert">{t('assessment.briefStale')}</p>}
      <label className="researchBriefAck"><input type="checkbox" checked={ack} disabled={busy || !assessmentsCurrent} onChange={event => setAckKey(event.target.checked ? key : '')} />{t('researchBrief.replaceAck')}</label>
      <button className="secondaryButton" disabled={busy || !ack || !assessmentsCurrent} onClick={apply}>{t('researchBrief.apply')}</button>
      {appliedKey === key && <p role="status">{t('researchBrief.applied')}</p>}
    </>}
  </section>
}
