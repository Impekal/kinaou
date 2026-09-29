import { useRef, useState } from 'react'
import { projectPublicationEditorial, publicationEditorialCurrent, type EditorialItem } from '../core/publicationEditorial'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

export function PublicationEditorialControl({ project, jobId, busy, onApply }: { project: KinaouProject; jobId?: string; busy: boolean; onApply: (item: EditorialItem) => void }) {
  const { t } = useUiLanguage(), [ackKey, setAckKey] = useState(''), [appliedKey, setAppliedKey] = useState('')
  let record: ReturnType<typeof projectPublicationEditorial> = null, error = ''
  try { record = projectPublicationEditorial(project) } catch (cause) { error = String(cause) }
  const identity = JSON.stringify([project, jobId]), seen = useRef({ identity, epoch: 0 })
  if (seen.current.identity !== identity) seen.current = { identity, epoch: seen.current.epoch + 1 }
  const key = JSON.stringify([identity, seen.current.epoch]), item = record?.proposal.items.find(value => value.jobId === jobId)
  if (!record && !error) return null
  if (error) return <p role="alert">{t('editorial.error')}</p>
  if (!record || !publicationEditorialCurrent(project, record)) return <p>{t('editorial.stale')}</p>
  if (!item) return null
  return <div className="note stack"><strong>{t('editorial.savedHeading')}: {item.title}</strong><p>{item.description}</p><small>{item.tags.join(', ')}</small>
    <label><input type="checkbox" disabled={busy} checked={ackKey === key} onChange={event => setAckKey(event.target.checked ? key : '')} />{t('editorial.applyAck')}</label>
    <button className="secondaryButton" disabled={busy || ackKey !== key} onClick={() => { if (busy || ackKey !== key) return; onApply(structuredClone(item)); setAckKey(''); setAppliedKey(key) }}>{t('editorial.apply')}</button>
    {appliedKey === key && <p role="status">{t('editorial.applied')}</p>}
  </div>
}
