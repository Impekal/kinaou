import { useRef, useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { ImageIntervalError, ImageIntervalPlacement } from '../core/imageIntervalPlacement'
import { parseExcerptSeconds } from '../core/mediaExcerpt'
import { compatibleTracks } from '../core/timelinePlacement'
import { displayTrackName } from '../core/uiSystemLabels'
import { useUiLanguage } from './UiLanguageProvider'
import { RangePreviewPlayback } from './ShortPreviewPanel'
import type { RenderPlan } from '../core/render'

export function ImageIntervalPlacementControl({ project, asset, history, onProjectChange, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: { project: KinaouProject; asset: KinaouAsset; history: PersistentVersionHistory; onProjectChange: (p: KinaouProject) => unknown; workerUrl?: string; workerToken?: string; workerConnected?: boolean; workerCapabilities?: string[] }) {
  const { t, language } = useUiLanguage(), tracks = compatibleTracks(project, asset)
  const [form, setForm] = useState({ start: '0', duration: '5', trackId: tracks[0]?.id ?? '' })
  const [placement, setPlacement] = useState<ImageIntervalPlacement | null>(null), [ack, setAck] = useState(false)
  const [open, setOpen] = useState(false), [previewBusy, setPreviewBusy] = useState(false)
  const [error, setError] = useState(''), [saved, setSaved] = useState(''), errorScope = useRef(0)
  const signature = JSON.stringify([project, form, language]), environment = useRef({ signature, epoch: 0 })
  if (signature !== environment.current.signature) environment.current = { signature, epoch: environment.current.epoch + 1 }
  const epoch = environment.current.epoch, scope = String(epoch)
  placement?.observe(project, scope)
  const review = placement?.current ? placement.review : null
  let preview: RenderPlan | null = null, previewError = ''
  if (review) { try { preview = placement!.preview(project, scope) } catch (cause) { previewError = t(cause instanceof ImageIntervalError && cause.code === 'previewLength' ? 'imageInterval.previewLength' : 'imageInterval.previewUnavailable') } }
  const blocked = Boolean(preview?.requiredCapabilities.some(capability => !workerCapabilities.includes(capability)))
  const previewScope = JSON.stringify([epoch, placement?.clipId, workerUrl, workerToken, workerConnected, workerCapabilities])
  function edit(key: keyof typeof form, value: string) { setForm(old => ({ ...old, [key]: value })); setAck(false); setError(''); setSaved('') }
  function report(cause: unknown, saving: boolean) { errorScope.current = epoch; setError(t(`imageInterval.${cause instanceof ImageIntervalError ? cause.code : saving ? 'save' : 'input'}`)) }
  function prepare() {
    setPlacement(null); setAck(false); setError(''); setSaved('')
    try { setPlacement(new ImageIntervalPlacement(project, { assetId: asset.id, trackId: form.trackId, startMs: parseExcerptSeconds(form.start), durationMs: parseExcerptSeconds(form.duration) }, scope)) }
    catch (cause) { report(cause, false) }
  }
  function save() {
    if (!placement || !review || !ack || previewBusy) return
    try { const next = placement.commit(project, scope, ack, p => history.snapshot(p, t('imageInterval.history'), 'system'), onProjectChange); setSaved(JSON.stringify(next)); setError('') }
    catch (cause) { report(cause, true) }
  }
  if (asset.kind !== 'image') return null
  return <details className="mediaExcerptPanel" onToggle={event => setOpen(event.currentTarget.open)}><summary>{t('imageInterval.heading')}</summary><div className="stack"><p>{t('imageInterval.help')}</p>
    <div className="mediaExcerptFields">{(['start', 'duration'] as const).map(key => <label key={key}>{t(`imageInterval.${key}`)}<input inputMode="decimal" value={form[key]} onChange={e => edit(key, e.target.value)} /></label>)}
      <label>{t('mediaExcerpt.track')}<select value={form.trackId} onChange={e => edit('trackId', e.target.value)}><option value="">—</option>{tracks.map(track => <option key={track.id} value={track.id}>{displayTrackName(track, t)}{track.locked ? ' · 🔒' : ''}</option>)}</select></label></div>
    <button className="secondaryButton" onClick={prepare}>{t('imageInterval.review')}</button>
    {review && <div className="renderJob stack"><strong>{review.name} · {review.trackName}</strong><p>{t('imageInterval.summary', { start: review.startMs / 1000, end: review.endMs / 1000, duration: review.durationMs / 1000 })}</p><p>{t('imageInterval.framing')}</p>{review.layered && <p className="note">{t('imageInterval.layered')}</p>}
      <section className="stack"><strong>{t('imageInterval.preview')}</strong><p>{t('imageInterval.previewHelp')}</p><p className="note">{t('preview.scopeHelp')}</p>
        {previewError && <p>{previewError}</p>}{blocked && workerConnected && <p>{t('imageInterval.previewWorker')}</p>}
        {open && preview && <RangePreviewPlayback key={previewScope} plan={preview} disabled={blocked} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} onBusyChange={setPreviewBusy} />}
      </section>
      <label className="sourceReportAck"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />{t('imageInterval.ackLabel')}</label><button className="primary" disabled={!ack || previewBusy} onClick={save}>{t('imageInterval.place')}</button></div>}
    {saved === JSON.stringify(project) && <p role="status">{t('imageInterval.saved')}</p>}{error && errorScope.current === epoch && <p role="alert">{error}</p>}
  </div></details>
}
