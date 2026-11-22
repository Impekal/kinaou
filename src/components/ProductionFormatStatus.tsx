import { useEffect, useState } from 'react'
import { productionFormatSignature, productionReviewStatuses, projectProductionFormat, requiredProductionReviews, summarizeProductionReviews } from '../core/productionFormat'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

/**
 * Shown where a production leaves KINAOU. It reports; it does not gate. A general
 * production with no check due renders nothing at all.
 */
export function ProductionFormatStatus({ project }: { project: KinaouProject }) {
  const { t } = useUiLanguage()
  const [signature, setSignature] = useState<{ project: KinaouProject; value: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    productionFormatSignature(project).then(value => { if (!cancelled) setSignature({ project, value }) }, () => { if (!cancelled) setSignature(null) })
    return () => { cancelled = true }
  }, [project])

  let declaration
  try { declaration = projectProductionFormat(project) } catch { return null }
  const required = requiredProductionReviews(declaration)
  if (!required.length) return null

  // Until the hash for exactly this project value is known, nothing is claimed as confirmed.
  const statuses = signature?.project === project ? productionReviewStatuses(project, signature.value) : required.map(item => ({ item, state: 'missing' as const }))
  const summary = summarizeProductionReviews(statuses)
  const clear = summary.current === summary.due
  return <div className={clear ? 'note' : 'warning'} role="status">
    <strong>{t('format.status.heading')}</strong> — {t('format.status.declared', { format: t(`format.kind.${declaration.format}`), age: t(`format.age.${declaration.ageBand}`) })}
    <div>{clear ? t('format.status.allCurrent', { due: summary.due }) : t('format.status.outstanding', { open: summary.due - summary.current, due: summary.due, missing: summary.missing, stale: summary.stale })}</div>
    {!clear && <ul>{statuses.filter(status => status.state !== 'current').map(status => <li key={status.item}>{t(`format.item.${status.item}`)} · {t(`format.state.${status.state}`)}</li>)}</ul>}
    {!clear && <small>{t('format.status.where')} </small>}
    <small>{t('format.status.selfReport')}</small>
  </div>
}
