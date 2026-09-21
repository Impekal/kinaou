import { useEffect, useRef, useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { MediaPreviewSession, type MediaPreviewFeedback } from '../core/mediaPreviewSession'
import { mediaPreviewDefinitions, type MediaPreviewKind } from '../core/previewAssets'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { MediaPreviewImage } from './MediaPreviewImage'
import { useUiLanguage } from './UiLanguageProvider'

export interface MediaPreviewProps { project: KinaouProject; asset: KinaouAsset; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
export function MediaPreviewStatus({ feedback }: { feedback: MediaPreviewFeedback }) {
  const { t } = useUiLanguage()
  return <div role="status"><strong>{t(`cache.${feedback.phase}`)}</strong><small>{feedback.sourceName} · {t(`cache.${feedback.kind}`)}</small>{feedback.path && <code>{feedback.path}</code>}{feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}</div>
}
function Control({ kind, project, asset, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: MediaPreviewProps & { kind: MediaPreviewKind }) {
  const { t } = useUiLanguage(), definition = mediaPreviewDefinitions[kind]
  const [feedback, setFeedback] = useState<MediaPreviewFeedback | null>(null)
  const session = useRef<MediaPreviewSession | null>(null), mounted = useRef(true)
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes(definition.capability)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, available]), environment = useRef({ project, connection })
  environment.current = { project, connection }; session.current?.observe(project, connection)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  const existing = typeof asset.metadata[definition.field] === 'string' ? String(asset.metadata[definition.field]) : ''
  const blocked = Boolean(session.current?.blocksGeneration)
  async function generate() {
    if (!available || asset.offline || session.current?.blocksGeneration) return
    session.current?.detach()
    const task = new MediaPreviewSession(project, connection, asset.id, kind, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before saving media preview reference', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task; await task.generate()
  }
  function detach() { session.current?.detach(); session.current = null; setFeedback(previous => previous ? { ...previous, phase: 'detached' } : previous) }
  const shown = feedback && session.current?.wasDetached ? { ...feedback, phase: 'detached' as const } : feedback
  return <div className={`${kind}Control`}><strong>{t(`cache.${kind}`)}</strong>
    {existing && <><small>{t('cache.reference')}</small><code>{existing}</code></>}
    {existing && kind !== 'proxy' && !blocked && <MediaPreviewImage kind={kind} path={existing} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} scope={JSON.stringify(project)} alt={t(kind === 'thumbnail' ? 'cache.thumbnailAlt' : 'cache.waveformAlt', { name: String(asset.metadata.name ?? asset.id) })} />}
    <button className="secondaryButton" disabled={!available || asset.offline || blocked} onClick={generate}>{t(`cache.${kind}.${existing ? 'regenerate' : 'generate'}`)}</button>
    {asset.offline ? <small>{t('cache.offline')}</small> : !available && <small>{t('cache.unavailable')}</small>}
    <details><summary>{t('cache.notes')}</summary><p>{t('cache.boundary')}</p></details>
    {shown && <MediaPreviewStatus feedback={shown} />}
    {session.current?.canSave && <button className="primary" onClick={() => session.current?.save()}>{t('cache.retrySave')}</button>}
    {blocked && <div><button className="secondaryButton" onClick={detach}>{t('cache.detach')}</button><small>{t('cache.detachHelp')}</small></div>}
  </div>
}
export function MediaPreviewControl(props: MediaPreviewProps & { kind: MediaPreviewKind }) {
  const { asset, project, kind } = props
  if (!asset.managed || !asset.uri.startsWith('KINAOU/Assets/') || !(kind === 'waveform' ? ['audio', 'video'] : ['video']).includes(asset.kind)) return null
  return <Control key={JSON.stringify([project.id, asset.id, asset.uri, kind])} {...props} />
}
