import { useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { projectResearchBrief, researchBriefToDirectorText } from '../core/researchBrief'
import { useUiLanguage } from './UiLanguageProvider'

export function ResearchBriefDirectorControl({ project, busy, onApply }: { project: KinaouProject; busy: boolean; onApply: (text: string) => void }) {
  const { t } = useUiLanguage(), [ackKey, setAckKey] = useState(''), [appliedKey, setAppliedKey] = useState('')
  const observed = useRef({ key: '', generation: 0 })
  let brief: ReturnType<typeof projectResearchBrief> = null, error = ''
  try { brief = projectResearchBrief(project) } catch (cause) { error = String(cause) }
  const identity = JSON.stringify([project.id, brief])
  if (observed.current.key !== identity) { observed.current = { key: identity, generation: observed.current.generation + 1 } }
  const key = JSON.stringify([identity, observed.current.generation]), ack = ackKey === key
  if (!brief && !error) return null
  function apply() { if (busy || !ack || !brief) return; onApply(researchBriefToDirectorText(brief)); setAppliedKey(key); setAckKey('') }
  return <section className="note stack"><h3>{t('researchBrief.director')}</h3>
    {error ? <div role="alert">{t('researchBrief.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div> : brief && <>
      <strong>{brief.title}</strong><p>{t('researchBrief.details', { revision: brief.revision, count: brief.evidence.length, date: brief.savedAt })}</p>
      <p>{brief.question}</p><p>{brief.uncertainties}</p>
      <label className="researchBriefAck"><input type="checkbox" checked={ack} disabled={busy} onChange={event => setAckKey(event.target.checked ? key : '')} />{t('researchBrief.replaceAck')}</label>
      <button className="secondaryButton" disabled={busy || !ack} onClick={apply}>{t('researchBrief.apply')}</button>
      {appliedKey === key && <p role="status">{t('researchBrief.applied')}</p>}
    </>}
  </section>
}
