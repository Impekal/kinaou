import { useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { commitPortraitPresenter, planPortraitPresenter, presenterAssetAvailable, PresenterValidationError } from '../core/portraitPresenter'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenStudio: () => void }

export function PortraitPresenterPanel({ project, history, onProjectChange, onOpenStudio }: Props) {
  const { language, t } = useUiLanguage()
  const [name, setName] = useState(() => t('presenter.defaultName'))
  const [portraitAssetId, setPortrait] = useState('')
  const [narrationAssetId, setNarration] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReturnType<typeof commitPortraitPresenter> | null>(null)
  const seconds = (ms: number) => (ms / 1000).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const portraits = project.assets.filter((asset) => asset.kind === 'image' && presenterAssetAvailable(asset))
  const narrations = project.assets.filter((asset) => asset.kind === 'audio' && presenterAssetAvailable(asset))
  const input = { name, portraitAssetId, narrationAssetId }
  let plan: ReturnType<typeof planPortraitPresenter> | undefined
  let reason: PresenterValidationError['code'] | 'unknown' = 'input'
  let reasonDetail = ''
  try { plan = planPortraitPresenter(project, input) }
  catch (cause) {
    reason = cause instanceof PresenterValidationError ? cause.code : 'unknown'
    reasonDetail = cause instanceof Error ? cause.message : String(cause)
  }

  function append() {
    setError(''); setResult(null)
    try {
      const saved = commitPortraitPresenter(project, input, history, onProjectChange)
      setResult(saved)
      setPortrait(''); setNarration('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">{t('presenter.eyebrow')}</div><h2>{t('presenter.heading')}</h2><p>{t('presenter.help')}</p></div><span className="badge">{t('presenter.badge')}</span></div>
    <div className="card availabilityPanel">
      <p>{t('presenter.boundary')}</p>
      <p>{t('presenter.videoHelp')}</p>
      {!portraits.length && <div className="warning">{t('presenter.noPortrait')}</div>}
      {!narrations.length && <div className="warning">{t('presenter.noNarration')}</div>}
      <label>{t('presenter.name')}<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{t('presenter.portrait')}<select value={portraitAssetId} onChange={(event) => setPortrait(event.target.value)}><option value="">{t('presenter.choosePortrait')}</option>{portraits.map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}</select></label>
      <label>{t('presenter.narration')}<select value={narrationAssetId} onChange={(event) => setNarration(event.target.value)}><option value="">{t('presenter.chooseNarration')}</option>{narrations.map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)} · {typeof asset.metadata.durationMs === 'number' && Number.isFinite(asset.metadata.durationMs) ? seconds(asset.metadata.durationMs) + ' s' : t('presenter.unknownDuration')}</option>)}</select></label>
      {plan ? <p>{t('presenter.review', { duration: seconds(plan.durationMs), start: seconds(plan.startMs) })}</p> : <div><small>{t(`presenter.reason.${reason}`)}</small>{reason === 'unknown' && <details><summary>{t('common.details')}</summary>{reasonDetail}</details>}</div>}
      <div className="directorActions"><button className="primary" disabled={!plan} onClick={append}>{t('presenter.add')}</button><button className="secondaryButton" onClick={onOpenStudio}>{t('presenter.openStudio')}</button></div>
      {result && <div className="successBox" role="status">{t('presenter.success', { name: result.name, start: seconds(result.startMs), duration: seconds(result.durationMs) })}</div>}
      {error && <div className="errorBox" role="alert">{t('presenter.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    </div>
  </section>
}
