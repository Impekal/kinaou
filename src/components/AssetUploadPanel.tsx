import { useEffect, useRef, useState } from 'react'
import { AssetImportSession, inferImportKind, type AssetImportFeedback } from '../core/assetImportSession'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface AssetUploadPanelProps {
  project: KinaouProject
  history: PersistentVersionHistory
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}
export function AssetImportStatus({ feedback, onRetry, onDetach }: { feedback: AssetImportFeedback; onRetry: () => void; onDetach: () => void }) {
  const { t } = useUiLanguage()
  return <div role="status" className={feedback.phase === 'succeeded' ? 'successBox' : 'sttJob'}>
    <strong>{t(`import.${feedback.phase}`, { name: feedback.name })}</strong>
    {feedback.phase !== 'succeeded' && <small>{feedback.name}</small>}
    {feedback.path && <code>{feedback.path}</code>}
    <div className="directorActions">
      {['probeFailed', 'saveFailed'].includes(feedback.phase) && <button className="secondaryButton" onClick={onRetry}>{t(feedback.phase === 'saveFailed' ? 'audio.retrySave' : 'import.retryProbe')}</button>}
      {!['succeeded', 'detached'].includes(feedback.phase) && <button className="secondaryButton" onClick={onDetach}>{t('import.detach')}</button>}
    </div>
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}
export function AssetUploadPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: AssetUploadPanelProps) {
  const { language, t } = useUiLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const [feedback, setFeedback] = useState<AssetImportFeedback | null>(null)
  const session = useRef<AssetImportSession | null>(null), mounted = useRef(true)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, [...workerCapabilities].sort()])
  const environment = useRef({ project, connection }); environment.current = { project, connection }
  session.current?.observe(project, connection)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  const kind = file ? inferImportKind(file) : null
  const available = workerConnected && Boolean(workerToken.trim()) && workerCapabilities.includes('asset-upload')
  const locked = Boolean(session.current?.unresolved)
  const currentFeedback = session.current?.wasDetached && feedback ? { ...feedback, phase: 'detached' as const } : feedback
  async function importSelectedFile() {
    if (!file || !kind || !available || session.current?.unresolved) return
    const task = new AssetImportSession(project, connection, file, kind, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before saving imported media', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => {
        if (!mounted.current || session.current !== task) return
        setFeedback(value)
        if (value.phase === 'succeeded') { setFile(null); setInputKey(previous => previous + 1) }
      }
    })
    session.current = task; await task.run()
  }
  return <section className="card uploadPanel">
    <div><div className="eyebrow">{t('import.eyebrow')}</div><h3>{t('import.heading')}</h3><p>{t('import.help')}</p><p>{t('import.scope')}</p></div>
    <div className="formStack">
      <label>{t('import.file')}<input key={inputKey} type="file" accept="video/*,audio/*,image/*" disabled={!available || locked} onChange={event => { setFile(event.target.files?.[0] ?? null); setFeedback(null) }} /></label>
      {file && <div className="fileSelection"><strong>{file.name}</strong><span>{kind ? t(`import.${kind}`) : t('import.unsupported')} · {new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(file.size / 1024 / 1024)} MiB</span></div>}
      {!workerConnected && <div className="warning">{t('preview.connect')}</div>}
      {workerConnected && !available && <div className="warning">{t('import.unavailable')}</div>}
      {file && !kind && <div className="warning">{t('import.unsupported')}</div>}
      {currentFeedback && <AssetImportStatus feedback={currentFeedback} onRetry={() => void session.current?.run()} onDetach={() => { session.current?.detach(); setFeedback(previous => previous ? { ...previous, phase: 'detached' } : null) }} />}
      <button className="primary" disabled={!file || !kind || !available || locked} onClick={importSelectedFile}>{t('import.start')}</button>
    </div>
  </section>
}
