import { useEffect, useMemo, useRef, useState } from 'react'
import { manualSocialDestinations, ManualSocialHandoffSession, type ManualSocialDestination, type ManualSocialHandoff } from '../core/manualSocialHandoff'
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

export function ManualSocialHandoffPanel(props: Props) {
  const { t } = useUiLanguage()
  const [destination, setDestination] = useState<ManualSocialDestination>('facebook')
  const supported = props.workerConnected && Boolean(props.workerToken.trim()) &&
    props.workerCapabilities.includes('publish-package-library') && props.workerCapabilities.includes('publish-package-integrity')
  return <div className="card stack" style={{ padding: 28, minWidth: 0 }}>
    <h3>{t('manualSocial.heading')}</h3>
    <p>{t('manualSocial.help')}</p>
    <label>{t('manualSocial.destination')}<select value={destination} onChange={event => setDestination(event.target.value as ManualSocialDestination)}>
      {Object.entries(manualSocialDestinations).map(([id, target]) => <option key={id} value={id}>{target.name}</option>)}
    </select></label>
    <Handoff key={JSON.stringify([props.projectId, props.workerUrl, props.workerToken, supported, destination])}
      {...props} destination={destination} supported={supported} />
    <p>{t('manualSocial.notPublished')}</p>
  </div>
}

function Handoff({ projectId, workerUrl, workerToken, supported, destination }: Props & { destination: ManualSocialDestination; supported: boolean }) {
  const { t } = useUiLanguage()
  const target = manualSocialDestinations[destination]
  const session = useMemo(() => new ManualSocialHandoffSession(projectId, destination, {
    listPublishPackages: id => new WorkerClient({ baseUrl: workerUrl, token: workerToken }).listPublishPackages(id),
    verifyPublishPackageIntegrity: path => new WorkerClient({ baseUrl: workerUrl, token: workerToken }).verifyPublishPackageIntegrity(path)
  }), [projectId, workerUrl, workerToken, destination])
  // Also guard clipboard completions and errors; a later target must never inherit old feedback.
  const generation = useRef(0)
  useEffect(() => () => { generation.current++; session.invalidate() }, [session])
  const [packages, setPackages] = useState<PublishPackageEntry[] | null>(null)
  const [selected, setSelected] = useState('')
  const [handoff, setHandoff] = useState<ManualSocialHandoff | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [copyState, setCopyState] = useState<'copied' | 'copyFailed' | null>(null)

  async function run(mode: 'list' | 'verify') {
    if (busy || !supported || (mode === 'verify' && !selected)) return
    const current = ++generation.current
    setBusy(true); setError(false); setHandoff(null); setCopyState(null)
    if (mode === 'list') { setSelected(''); setPackages(null) }
    try {
      if (mode === 'list') {
        const result = await session.list()
        if (current === generation.current) setPackages(result)
      } else {
        const result = await session.verify(selected)
        if (current === generation.current) setHandoff(result)
      }
    } catch { if (current === generation.current) setError(true) }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function copy(value: string) {
    const current = ++generation.current
    setCopyState(null)
    try { await navigator.clipboard.writeText(value); if (current === generation.current) setCopyState('copied') }
    catch { if (current === generation.current) setCopyState('copyFailed') }
  }
  return <>
    {!supported && <p>{t('manualSocial.offline')}</p>}
    <button className="secondaryButton" disabled={!supported || busy} onClick={() => void run('list')}>{t('manualSocial.load')}</button>
    {packages?.length === 0 && <p>{t('manualSocial.empty')}</p>}
    {Boolean(packages?.length) && <label>{t('manualSocial.package')}<select value={selected} disabled={busy} onChange={event => {
      generation.current++; session.invalidate(); setSelected(event.target.value); setHandoff(null); setError(false); setCopyState(null)
    }}>
      <option value="">{t('manualSocial.choose')}</option>
      {packages?.map(entry => <option key={entry.path} value={entry.path}>{entry.document.title} · {entry.document.createdAt} · {entry.path}</option>)}
    </select></label>}
    <button className="secondaryButton" disabled={!supported || busy || !selected} onClick={() => void run('verify')}>{t('manualSocial.verify')}</button>
    {busy && <p role="status">{t('manualSocial.busy')}</p>}
    {error && <p role="alert">{t('manualSocial.error')}</p>}
    {handoff && <>
      <h4>{t('manualSocial.ready', { destination: target.name })}</h4>
      <label>{t('manualSocial.file')}<input readOnly value={handoff.sourcePath} /></label>
      <button className="secondaryButton" onClick={() => void copy(handoff.sourcePath)}>{t('manualSocial.copyPath')}</button>
      <small>{t('manualSocial.fileHelp')}</small>
      <small>{t('manualSocial.dates', { packagedAt: handoff.packagedAt, checkedAt: handoff.checkedAt })}</small>
      <code style={{ overflowWrap: 'anywhere' }}>SHA-256: {handoff.sha256}</code>
      <label>{t('manualSocial.caption')}<textarea readOnly rows={6} value={handoff.caption} /></label>
      <button className="secondaryButton" onClick={() => void copy(handoff.caption)}>{t('manualSocial.copyText')}</button>
      <label>{t('manualSocial.tags')}<textarea readOnly rows={2} value={handoff.tags.join(', ')} /></label>
      <small>{t('manualSocial.tagsHelp')}</small>
      <button className="secondaryButton" disabled={!handoff.tags.length} onClick={() => void copy(handoff.tags.join(', '))}>{t('manualSocial.copyTags')}</button>
      {copyState && <p role="status">{t(copyState === 'copied' ? 'manualSocial.copied' : 'manualSocial.copyFailed')}</p>}
      <p>{t('manualSocial.review')}</p>
      <a href={target.url} target="_blank" rel="noopener noreferrer">{t('manualSocial.open', { destination: target.name })}</a>
    </>}
  </>
}
