import { useRef, useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { MediaExcerptError, MediaExcerptPlacement, parseExcerptSeconds } from '../core/mediaExcerpt'
import { compatibleTracks } from '../core/timelinePlacement'
import { useUiLanguage } from './UiLanguageProvider'
import { displayTrackName } from '../core/uiSystemLabels'
import { RangePreviewPlayback } from './ShortPreviewPanel'
import type { RenderPlan } from '../core/render'

export function MediaExcerptPlacementControl({ project, asset, history, onProjectChange, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: { project: KinaouProject; asset: KinaouAsset; history: PersistentVersionHistory; onProjectChange: (p: KinaouProject) => unknown; workerUrl?: string; workerToken?: string; workerConnected?: boolean; workerCapabilities?: string[] }) {
  const { t, language } = useUiLanguage(), tracks = compatibleTracks(project, asset)
  const [form, setForm] = useState({ sourceIn: '0', sourceOut: '', timelineIn: '0', speed: '1', trackId: tracks[0]?.id ?? '', includeAudio: asset.kind === 'audio' })
  const [placement, setPlacement] = useState<MediaExcerptPlacement | null>(null), [ack, setAck] = useState(false)
  const [open, setOpen] = useState(false), [previewBusy, setPreviewBusy] = useState(false)
  const [error, setError] = useState(''), [saved, setSaved] = useState(''), errorScope = useRef(0)
  const signature = JSON.stringify([project, form, language]), environment = useRef({ signature, epoch: 0 })
  if (signature !== environment.current.signature) environment.current = { signature, epoch: environment.current.epoch + 1 }
  const epoch = environment.current.epoch, scope = String(epoch)
  placement?.observe(project, scope)
  const review = placement?.current ? placement.review : null
  let preview: RenderPlan | null = null
  if (review && review.durationMs <= 60000) preview = placement!.preview(project, scope)
  const blocked = Boolean(preview?.requiredCapabilities.some(capability => !workerCapabilities.includes(capability)))
  const previewScope = JSON.stringify([epoch, placement?.clipId, workerUrl, workerToken, workerConnected, workerCapabilities])
  function edit<T extends keyof typeof form>(key: T, value: typeof form[T]) { setForm(old => ({ ...old, [key]: value })); setAck(false); setError(''); setSaved('') }
  function report(cause: unknown, saving: boolean) {
    errorScope.current = epoch
    const code = cause instanceof MediaExcerptError ? cause.code : saving ? 'save' : 'media'
    setError(t(code === 'track' ? 'mediaExcerpt.trackError' : code === 'ack' ? 'mediaExcerpt.ackError' : code === 'save' ? 'mediaExcerpt.retry' : `mediaExcerpt.${code}`))
  }
  function prepare() {
    setPlacement(null); setAck(false); setError(''); setSaved('')
    try { setPlacement(new MediaExcerptPlacement(project, { assetId: asset.id, trackId: form.trackId, sourceInMs: parseExcerptSeconds(form.sourceIn), sourceOutMs: parseExcerptSeconds(form.sourceOut), timelineInMs: parseExcerptSeconds(form.timelineIn), speed: Number(form.speed), includeAudio: form.includeAudio }, scope)) }
    catch (cause) { report(cause, false) }
  }
  function save() {
    if (!placement || !review || !ack || previewBusy) return
    try { const next = placement.commit(project, scope, ack, p => history.snapshot(p, t('mediaExcerpt.history'), 'system'), onProjectChange); setSaved(JSON.stringify(next)); setError('') }
    catch (cause) { report(cause, true) }
  }
  if (!['video', 'audio'].includes(asset.kind)) return null
  return <details className="mediaExcerptPanel" onToggle={event => setOpen(event.currentTarget.open)}><summary>{t('mediaExcerpt.heading')}</summary><div className="stack"><p>{t('mediaExcerpt.help')}</p>
    {typeof asset.metadata.durationMs === 'number' && Number.isFinite(asset.metadata.durationMs) && <p>{t('mediaExcerpt.duration', { duration: asset.metadata.durationMs / 1000 })}</p>}
    <div className="mediaExcerptFields">{(['sourceIn', 'sourceOut', 'timelineIn'] as const).map(key => <label key={key}>{t(key === 'sourceIn' ? 'mediaExcerpt.in' : key === 'sourceOut' ? 'mediaExcerpt.out' : 'mediaExcerpt.start')}<input inputMode="decimal" value={form[key]} onChange={e => edit(key, e.target.value)} /></label>)}
      <label>{t('mediaExcerpt.speed')}<select value={form.speed} onChange={e => edit('speed', e.target.value)}>{['0.25', '0.5', '1', '1.25', '1.5', '2', '4'].map(s => <option key={s} value={s}>{s}×</option>)}</select></label>
      <label>{t('mediaExcerpt.track')}<select value={form.trackId} onChange={e => edit('trackId', e.target.value)}><option value="">—</option>{tracks.map(track => <option key={track.id} value={track.id}>{displayTrackName(track, t)}{track.locked ? ' · 🔒' : ''}</option>)}</select></label></div>
    <label className="sourceReportAck"><input type="checkbox" checked={form.includeAudio} onChange={e => edit('includeAudio', e.target.checked)} />{t('mediaExcerpt.audio')}</label><small>{t('mediaExcerpt.audioHelp')}</small>
    <button className="secondaryButton" onClick={prepare}>{t('mediaExcerpt.review')}</button>
    {review && <div className="renderJob stack"><strong>{review.name} · {review.trackName}</strong><p>{t('mediaExcerpt.summary', { in: review.sourceInMs / 1000, out: review.sourceOutMs / 1000, speed: review.speed, start: review.timelineInMs / 1000, end: review.endMs / 1000, duration: review.durationMs / 1000 })}</p><p>{t(review.includeAudio ? 'mediaExcerpt.audioOn' : 'mediaExcerpt.audioOff')}</p>{review.layered && <p className="note">{t('mediaExcerpt.layered')}</p>}
      <section className="stack"><strong>{t('mediaExcerpt.preview')}</strong><p>{t('mediaExcerpt.previewHelp')}</p><p className="note">{t('preview.scopeHelp')}</p>
        {!preview && <p>{t('mediaExcerpt.previewLength')}</p>}{blocked && workerConnected && <p>{t('mediaExcerpt.previewWorker')}</p>}
        {open && preview && <RangePreviewPlayback key={previewScope} plan={preview} disabled={blocked} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} onBusyChange={setPreviewBusy} />}
      </section>
      <label className="sourceReportAck"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />{t('mediaExcerpt.ack')}</label><button className="primary" disabled={!ack || previewBusy} onClick={save}>{t('mediaExcerpt.place')}</button></div>}
    {saved === JSON.stringify(project) && <p role="status">{t('mediaExcerpt.saved')}</p>}{error && errorScope.current === epoch && <p role="alert">{error}</p>}
  </div></details>
}
