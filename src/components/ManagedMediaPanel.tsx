import { useEffect, useRef, useState } from 'react'
import { ManagedMediaSession, type ManagedMediaDraft, type ManagedMediaFeedback } from '../core/managedMediaSession'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; onProjectChange: (project: KinaouProject) => void }
export function ManagedMediaStatus({ feedback }: { feedback: ManagedMediaFeedback }) {
  const { t, language } = useUiLanguage(), probe = feedback.probe
  const number = (value: number) => value.toLocaleString(language, { maximumFractionDigits: 2 })
  return <div role="status"><strong>{t(`managed.${feedback.phase}`)}</strong><p>{feedback.draft.name || feedback.draft.path.split('/').at(-1)} · {t(`kind.${feedback.draft.kind}`)}</p><code>{feedback.draft.path}</code>
    {probe && <p>{t('managed.measurements', { duration: probe.durationMs ? `${number(probe.durationMs / 1000)} s` : '—', size: `${number(probe.sizeBytes! / 1024 / 1024)} MB`, dimensions: probe.width && probe.height ? `${probe.width}×${probe.height}` : '—', audio: probe.sampleRate ? `${number(probe.sampleRate)} Hz` : '—' })}</p>}
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}
export function ManagedMediaPanel({ project, history, workerUrl, workerToken, workerConnected, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const [draft, setDraft] = useState<ManagedMediaDraft>({ path: 'KINAOU/Assets/', kind: 'video', name: '' })
  const [feedback, setFeedback] = useState<ManagedMediaFeedback | null>(null)
  const session = useRef<ManagedMediaSession | null>(null), mounted = useRef(true)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected]), environment = useRef({ project, connection })
  environment.current = { project, connection }; session.current?.observe(project, connection)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  function edit(value: Partial<ManagedMediaDraft>) { session.current?.detach(); setFeedback(null); setDraft(previous => ({ ...previous, ...value })) }
  async function inspect() {
    if (!workerConnected || !workerToken.trim() || session.current?.running) return
    session.current?.detach()
    const task = new ManagedMediaSession(project, connection, draft, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before registering existing media', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task; await task.inspect()
  }
  const shown = feedback && session.current?.wasDetached ? { phase: 'detached' as const, draft } : feedback
  return <div className="card settingsPanel"><div><h3>{t('managed.heading')}</h3><p>{t('managed.help')}</p><p className="note">{t('managed.boundary')}</p></div>
    <div className="formStack">
      <label>{t('managed.path')}<input value={draft.path} onChange={event => edit({ path: event.target.value })} placeholder="KINAOU/Assets/clip.mp4" /></label>
      <label>{t('managed.kind')}<select value={draft.kind} onChange={event => edit({ kind: event.target.value as ManagedMediaDraft['kind'] })}>{(['video', 'audio', 'image'] as const).map(kind => <option key={kind} value={kind}>{t(`kind.${kind}`)}</option>)}</select></label>
      <label>{t('managed.name')}<input value={draft.name} onChange={event => edit({ name: event.target.value })} /></label>
      <button className="primary" disabled={!workerConnected || !workerToken.trim() || Boolean(session.current?.running)} onClick={inspect}>{t(session.current?.running ? 'managed.checking' : 'managed.inspect')}</button>
      {!workerConnected && <small>{t('preview.connect')}</small>}
    </div>
    {shown && <ManagedMediaStatus feedback={shown} />}
    {session.current?.canSave && <button className="primary" onClick={() => session.current?.save()}>{t('managed.save')}</button>}
  </div>
}
