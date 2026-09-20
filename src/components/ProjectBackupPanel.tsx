import { useLayoutEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'
import { BackupScope, runBackupAction, type BackupFeedback, type BackupRequest } from '../core/backupActions'
import { useUiLanguage } from './UiLanguageProvider'

interface Props {
  project: KinaouProject | null
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  onRestore: (payload: unknown) => void
}

export function ProjectBackupPanel(props: Props) {
  // Changing connection or project discards its list/results, never the language draft.
  return <BackupSession key={JSON.stringify([props.workerUrl, props.workerToken, props.workerConnected, props.project?.id])} {...props} />
}

function BackupSession({ project, workerUrl, workerToken, workerConnected, onRestore }: Props) {
  const { language, t } = useUiLanguage()
  const [scope] = useState(() => new BackupScope())
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<BackupFeedback>({})
  useLayoutEffect(() => () => scope.invalidate(), [scope])

  async function act(request: BackupRequest) {
    if (!workerConnected || running.current) return
    running.current = true
    setBusy(true)
    setFeedback((value) => ({ backups: value.backups }))
    const current = scope.capture()
    await runBackupAction(request, () => new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
      current, (value) => setFeedback((previous) => ({ ...previous, ...value })), onRestore)
    if (current()) { running.current = false; setBusy(false) }
  }

  function date(value: string | null) {
    if (!value || !Number.isFinite(Date.parse(value))) return t('backup.unknownDate')
    return new Date(value).toLocaleString(language)
  }
  const size = (bytes: number) => (bytes / 1024).toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <div className="card availabilityPanel" aria-busy={busy}>
      <div>
        <div className="eyebrow">{t('backup.eyebrow')}</div>
        <h3>{t('backup.heading')}</h3>
        <p>{t('backup.help')}</p>
        <p>{t('backup.restoreHelp')}</p>
      </div>
      <div className="directorActions">
        <button className="primary" disabled={!workerConnected || !project || busy} onClick={() => project && void act({ kind: 'save', project })}>{t('backup.save')}</button>
        <button className="secondaryButton" disabled={!workerConnected || busy} onClick={() => void act({ kind: 'list' })}>{t('backup.list')}</button>
        {!workerConnected && <small>{t('backup.connect')}</small>}
      </div>
      {busy && <p role="status">{t('backup.busy')}</p>}
      {feedback.message && <div className="successBox" role="status">{t(feedback.message.key, {
        title: feedback.message.title, path: feedback.message.path ?? '', size: size(feedback.message.sizeBytes ?? 0)
      })}</div>}
      {feedback.error && <div className="errorBox" role="alert">
        {t(feedback.error.key)}
        <details><summary>{t('common.details')}</summary>{feedback.error.detail}</details>
      </div>}
      {feedback.backups && (
        feedback.backups.length === 0 ? <p>{t('backup.empty')}</p> : (
          <div className="assetList">
            {feedback.backups.map((entry) => (
              <div className="assetRow" key={entry.id}>
                <div>
                  <strong>{entry.title ?? entry.id}</strong>
                  <small>{t('backup.updated', { date: date(entry.updatedAt) })} · {t('backup.file', { date: date(entry.modifiedAt), size: size(entry.sizeBytes) })}</small>
                  <code>{entry.path}</code>
                </div>
                <button className="secondaryButton" disabled={busy} onClick={() => void act({ kind: 'restore', entry })}>{t('backup.restore')}</button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
