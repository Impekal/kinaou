import { useState } from 'react'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'
import { loadSourcePreview } from '../core/previewSession'
import { useUiLanguage } from './UiLanguageProvider'
import { PreviewPlayback, PreviewStatus, usePreviewSession } from './PreviewFeedback'

interface Props { project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean }

export function StudioProxyPreview(props: Props) {
  return <SourceSelection key={props.project.id} {...props} />
}

function SourceSelection({ project, ...connection }: Props) {
  const { t } = useUiLanguage()
  const proxies = project.assets.filter((asset) => asset.kind === 'video' && typeof asset.metadata.proxyPath === 'string')
  const [assetId, setAssetId] = useState('')
  const selected = proxies.find((asset) => asset.id === assetId) ?? proxies[0]
  return <section className="card previewPanel">
    <div><div className="eyebrow">{t('preview.source')}</div><h3>{t(selected ? 'preview.proxyHeading' : 'preview.noProxy')}</h3><p>{t(selected ? 'preview.proxyHelp' : 'preview.noProxyHelp')}</p></div>
    {selected && <>
      <label>{t('preview.asset')}<select value={selected.id} onChange={(event) => setAssetId(event.target.value)}>{proxies.map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}</select></label>
      <SourcePlayback key={JSON.stringify([project.id, selected.id, selected.uri, selected.metadata.proxyPath, selected.offline, connection])} path={String(selected.metadata.proxyPath)} offline={selected.offline} {...connection} />
    </>}
  </section>
}

function SourcePlayback({ path, offline, workerUrl, workerToken, workerConnected }: Omit<Props, 'project'> & { path: string; offline: boolean }) {
  const { t } = useUiLanguage()
  const { url, feedback, perform, busy } = usePreviewSession()
  return <div aria-busy={busy}>
    <button className="secondaryButton" disabled={busy || !workerConnected || offline} onClick={() => void perform((current, publish, accept) => loadSourcePreview(() => new WorkerClient({ baseUrl: workerUrl, token: workerToken }).loadVideoProxy(path), current, publish, accept))}>{t(busy ? 'preview.loading' : 'preview.load')}</button>
    {!workerConnected && <p>{t('preview.connect')}</p>}
    {offline && <p className="warning">{t('preview.reason.offline')}</p>}
    <PreviewStatus feedback={feedback} />
    {url && <PreviewPlayback key={url} url={url} />}
  </div>
}
