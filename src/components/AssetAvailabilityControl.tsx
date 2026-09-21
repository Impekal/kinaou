import { useEffect, useRef, useState } from 'react'
import { managedAssetPaths } from '../core/assetAvailability'
import { AssetAvailabilitySession, type AvailabilityFeedback } from '../core/assetAvailabilitySession'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  onProjectChange: (project: KinaouProject) => void
}
export function AssetAvailabilityStatus({ feedback }: { feedback: AvailabilityFeedback }) {
  const { language, t } = useUiLanguage()
  return <div role="status"><strong>{t(`availability.${feedback.phase}`)}</strong>
    {feedback.summary && <><p>{t('availability.summary', { ...feedback.summary })}</p><small>{t('availability.time', { time: new Date(feedback.summary.checkedAt).toLocaleString(language) })}</small></>}
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}
export function AssetAvailabilityControl({ project, history, workerUrl, workerToken, workerConnected, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const [feedback, setFeedback] = useState<AvailabilityFeedback | null>(null)
  const session = useRef<AssetAvailabilitySession | null>(null), mounted = useRef(true)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected]), environment = useRef({ project, connection })
  environment.current = { project, connection }; session.current?.observe(project, connection)
  const resultScope = useRef('')
  const key = JSON.stringify([project, connection])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  const currentFeedback = session.current?.wasDetached ? { phase: 'detached' as const } : resultScope.current === key || feedback?.phase === 'checking' ? feedback : null
  async function check() {
    if (!workerConnected || !workerToken.trim() || session.current?.running || !managedAssetPaths(project).length) return
    const task = new AssetAvailabilitySession(project, connection, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before updating media availability', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => { if (mounted.current && session.current === task) { resultScope.current = JSON.stringify([environment.current.project, connection]); setFeedback(value) } }
    })
    session.current = task; await task.run()
  }
  return <div className="card availabilityPanel">
    <div><div className="eyebrow">{t('availability.eyebrow')}</div><h3>{t('availability.heading')}</h3><p>{t('availability.help')}</p><p>{t('availability.scope')}</p></div>
    <div className="directorActions"><button className="secondaryButton" disabled={!workerConnected || !workerToken.trim() || Boolean(session.current?.running) || !managedAssetPaths(project).length} onClick={check}>{t(session.current?.running ? 'availability.checking' : 'availability.check')}</button>
      {!managedAssetPaths(project).length && <small>{t('availability.empty')}</small>}
      {!workerConnected && <small>{t('preview.connect')}</small>}
    </div>
    {currentFeedback && <AssetAvailabilityStatus feedback={currentFeedback} />}
  </div>
}
