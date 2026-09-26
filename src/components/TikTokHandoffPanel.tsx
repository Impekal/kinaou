import { useEffect, useMemo, useState } from 'react'
import { TikTokHandoffSession, type TikTokHandoff } from '../core/tiktokHandoff'
import type { PublishPackageEntry } from '../core/publishPackage'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface Props {
  projectId: string
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
}

export function TikTokHandoffPanel(props: Props) {
  // Connection/project changes destroy all selection and evidence, including in-flight work.
  const supported = props.workerConnected && props.workerCapabilities.includes('publish-package-library') &&
    props.workerCapabilities.includes('publish-package-integrity')
  return <HandoffPanel key={JSON.stringify([props.projectId, props.workerUrl, props.workerToken, supported])} {...props} supported={supported} />
}

function HandoffPanel({ projectId, workerUrl, workerToken, supported }: Props & { supported: boolean }) {
  const { t } = useUiLanguage()
  const session = useMemo(() => new TikTokHandoffSession(projectId, {
    listPublishPackages: id => new WorkerClient({ baseUrl: workerUrl, token: workerToken }).listPublishPackages(id),
    verifyPublishPackageIntegrity: path => new WorkerClient({ baseUrl: workerUrl, token: workerToken }).verifyPublishPackageIntegrity(path)
  }), [projectId, workerUrl, workerToken])
  useEffect(() => () => session.invalidate(), [session])
  const [packages, setPackages] = useState<PublishPackageEntry[] | null>(null)
  const [selected, setSelected] = useState('')
  const [handoff, setHandoff] = useState<TikTokHandoff | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [copyState, setCopyState] = useState<'copied' | 'copyFailed' | null>(null)

  async function load() {
    if (busy || !supported) return
    setBusy(true); setError(false); setHandoff(null); setSelected(''); setPackages(null); setCopyState(null)
    try { const result = await session.list(); if (result) setPackages(result) }
    catch { setError(true) }
    finally { setBusy(false) }
  }
  async function verify() {
    if (busy || !supported || !selected) return
    setBusy(true); setError(false); setHandoff(null); setCopyState(null)
    try { setHandoff(await session.verify(selected)) }
    catch { setError(true) }
    finally { setBusy(false) }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopyState('copied') }
    catch { setCopyState('copyFailed') }
  }

  return <div className="card stack" style={{ padding: 28, minWidth: 0 }}>
    <h3>{t('tiktok.handoff.heading')}</h3>
    <p>{t('tiktok.handoff.help')}</p>
    {!supported && <p>{t('tiktok.handoff.offline')}</p>}
    <button className="secondaryButton" disabled={!supported || busy} onClick={() => void load()}>{t('tiktok.handoff.load')}</button>
    {packages?.length === 0 && <p>{t('tiktok.handoff.empty')}</p>}
    {Boolean(packages?.length) && <label>{t('tiktok.handoff.package')}
      <select value={selected} disabled={busy} onChange={event => {
        session.invalidate(); setSelected(event.target.value); setHandoff(null); setError(false); setCopyState(null)
      }}>
        <option value="">{t('tiktok.handoff.package')}</option>
        {packages?.map(entry => <option key={entry.path} value={entry.path}>{entry.document.title} · {entry.document.createdAt} · {entry.path}</option>)}
      </select>
    </label>}
    <button className="secondaryButton" disabled={!supported || busy || !selected} onClick={() => void verify()}>{t('tiktok.handoff.verify')}</button>
    {busy && <p role="status">{t('tiktok.handoff.busy')}</p>}
    {error && <p role="alert">{t('tiktok.handoff.error')}</p>}
    {handoff && <>
      <label>{t('tiktok.handoff.file')}<input readOnly value={handoff.sourcePath} /></label>
      <small>{t('tiktok.handoff.checked')} {handoff.checkedAt} · SHA-256: {handoff.sha256}</small>
      <label>{t('tiktok.handoff.caption')}<textarea readOnly rows={6} value={handoff.caption} /></label>
      <button className="secondaryButton" onClick={() => void copy(handoff.caption)}>{t('tiktok.handoff.copy')}</button>
      <label>{t('tiktok.handoff.tags')}<textarea readOnly rows={2} value={handoff.tags.join(', ')} /></label>
      <p>{t('tiktok.handoff.tagsHelp')}</p>
      <button className="secondaryButton" onClick={() => void copy(handoff.tags.join(', '))}>{t('tiktok.handoff.copy')}</button>
      {copyState && <p role="status">{t(copyState === 'copied' ? 'tiktok.handoff.copied' : 'tiktok.handoff.copyFailed')}</p>}
      <p>{t('tiktok.handoff.steps')}</p>
      <a href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer">{t('tiktok.handoff.open')}</a>
    </>}
    <p>{t('tiktok.handoff.notPublished')}</p>
  </div>
}
