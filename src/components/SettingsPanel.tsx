import { useState } from 'react'
import { storageTarget, type StorageBackend, type StorageSettings } from '../core/storage'
import type { WorkerHandshake } from '../core/workerProtocol'
import { useUiLanguage } from './UiLanguageProvider'

export interface SettingsPanelProps {
  workerUrl: string; workerToken: string; workerBusy: boolean; workerError: string; workerHandshake: WorkerHandshake | null
  onWorkerUrlChange: (value: string) => void; onWorkerTokenChange: (value: string) => void; onTestConnection: () => void
  storage: StorageSettings; workspaceRoot: string; storageBackend: StorageBackend
  onWorkspaceRootChange: (value: string) => void; onStorageBackendChange: (value: StorageBackend) => void; onSaveStorage: () => void
}
const storageAreas = ['models', 'projects', 'assets', 'cache', 'temp', 'renders', 'archive'] as const

export function SettingsPanel(props: SettingsPanelProps) {
  const { t } = useUiLanguage()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'failed'>('idle')
  const [saveError, setSaveError] = useState('')
  function save() {
    setSaveStatus('idle'); setSaveError('')
    try { props.onSaveStorage(); setSaveStatus('saved') }
    catch (cause) { setSaveStatus('failed'); setSaveError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <section className="stack">
    <div className="card settingsPanel">
      <div><div className="eyebrow">{t('settings.worker')}</div><h2>{t('settings.connect')}</h2><p>{t('settings.connectionHelp')}</p></div>
      <div className="formStack">
        <label>{t('settings.url')}<input disabled={props.workerBusy} value={props.workerUrl} onChange={(event) => props.onWorkerUrlChange(event.target.value)} /></label>
        <label>{t('settings.token')}<input type="password" autoComplete="off" disabled={props.workerBusy} value={props.workerToken} onChange={(event) => props.onWorkerTokenChange(event.target.value)} placeholder={t('settings.tokenHint')} /></label>
        <button className="primary" disabled={props.workerBusy || !props.workerToken.trim()} onClick={props.onTestConnection}>{t(props.workerBusy ? 'settings.connecting' : 'settings.test')}</button>
      </div>
    </div>
    {props.workerHandshake && <div className="card workerCard"><div className="sectionLead"><div><div className="eyebrow">{t('settings.online')}</div><h3>{props.workerHandshake.name}</h3></div><span className="status online">{t('settings.connected')}</span></div><p>{props.workerHandshake.platform} · {props.workerHandshake.version}</p><p>{t('settings.capabilities')}</p><div className="chipRow">{props.workerHandshake.capabilities.map((capability) => <span className="chip" key={capability}>{capability}</span>)}</div></div>}
    {props.workerError && <div className="card errorBox" role="alert">{t('settings.failed')}<details><summary>{t('common.details')}</summary>{props.workerError}</details></div>}
    <div className="card settingsPanel">
      <div><div className="eyebrow">{t('settings.profile')}</div><h2>{t('settings.storage')}</h2><p>{t('settings.storageHelp')}</p></div>
      <div className="formStack">
        <label>{t('settings.backend')}<select value={props.storageBackend} onChange={(event) => { setSaveStatus('idle'); props.onStorageBackendChange(event.target.value as StorageBackend) }}><option value="browser">{t('settings.browser')}</option><option value="desktop-worker">{t('settings.desktop')}</option></select></label>
        <label>{t('settings.root')}<input value={props.workspaceRoot} onChange={(event) => { setSaveStatus('idle'); props.onWorkspaceRootChange(event.target.value) }} placeholder={t('settings.rootHint')} /></label>
        <button className="primary" onClick={save}>{t('settings.save')}</button>
      </div>
    </div>
    {saveStatus === 'saved' && <div className="successBox" role="status">{t('settings.saved')}</div>}
    {saveStatus === 'failed' && <div className="errorBox" role="alert">{t('settings.saveFailed')}<details><summary>{t('common.details')}</summary>{saveError}</details></div>}
    <div className="card"><div className="eyebrow">{t('settings.targets')}</div><ul className="paths">{storageAreas.map((area) => <li key={area}><span>{t(`storage.${area}`)}</span><code>{storageTarget(props.storage, area)}</code></li>)}</ul><div className="note">{t(props.storage.backend === 'desktop-worker' ? 'settings.desktopNote' : 'settings.browserNote')}</div></div>
  </section>
}
