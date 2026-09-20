import { useLayoutEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { createRenderPlan, formatProfiles, projectFormatPreset, formatReframingRequiresWorker, type RenderPlan, type TargetFormat } from '../core/render'
import { createRangeRenderPlan } from '../core/renderRange'
import { shortPreviewOutputPath, type ShortExportCandidate } from '../core/shortExportRanges'
import type { AudioDuckingSettings } from '../core/audioDucking'
import { defaultLoudnessNormalization } from '../core/audioLoudness'
import { WorkerClient } from '../core/workerClient'
import { freshPreviewPlan, previewBusy } from '../core/previewSession'
import { ShortPreviewSession, type ShortPreviewFeedback } from '../core/shortPreviewSession'
import { PreviewPlayback, PreviewStatus } from './PreviewFeedback'
import { useUiLanguage } from './UiLanguageProvider'

interface Props {
  project: KinaouProject; candidate: ShortExportCandidate; format: TargetFormat
  onFormatChange: (format: TargetFormat) => void; onBusyChange: (busy: boolean) => void
  audioDucking: AudioDuckingSettings; normalizeLoudness: boolean
  workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]
  disabled: boolean
}
export function ShortPreviewPanel(props: Props) {
  const { language, t } = useUiLanguage()
  const [busy, setBusy] = useState(false)
  let plan: RenderPlan | null = null, error = ''
  try {
    const path = shortPreviewOutputPath(props.project, props.candidate, props.format)
    const full = createRenderPlan(props.project, projectFormatPreset(props.project, props.format, 'preview'), path, { audioDucking: props.audioDucking, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: props.normalizeLoudness } })
    plan = createRangeRenderPlan(full, props.candidate, path)
  } catch (cause) { error = String(cause) }
  const blocked = formatReframingRequiresWorker(props.project, props.format) && !props.workerCapabilities.includes('format-reframing')
  const scope = JSON.stringify([props.project.id, plan, props.workerUrl, props.workerToken, props.workerConnected, blocked])
  useLayoutEffect(() => { props.onBusyChange(busy); return () => props.onBusyChange(false) }, [busy, props.onBusyChange])
  return <div className="renderJob">
    <div className="renderJobHead"><strong>{t('shortPreview.heading')}</strong><span>{t(`export.${props.format}`)} · {(props.candidate.durationMs / 1000).toLocaleString(language)} s</span></div>
    <p className="cardBody">{t('shortPreview.help')}</p>
    <p className="cardBody">{t('preview.scopeHelp')}</p>
    <div className="formatChooser" role="group" aria-label={t('shortPreview.format')}>
      {(Object.keys(formatProfiles) as TargetFormat[]).map(id => <button key={id} className={id === props.format ? 'formatOption active' : 'formatOption'} aria-pressed={id === props.format} disabled={props.disabled || busy} onClick={() => props.onFormatChange(id)}>
        <strong>{t(`export.${id}`)}</strong><small>{formatProfiles[id].aspect} · {formatProfiles[id].preview.width}×{formatProfiles[id].preview.height}</small>
      </button>)}
    </div>
    {error && <div className="errorBox" role="alert">{t('preview.planFailed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {blocked && <div className="warning">{t('preview.restart')}</div>}
    <ShortPlayback key={scope} plan={plan} disabled={props.disabled || blocked} workerUrl={props.workerUrl} workerToken={props.workerToken} workerConnected={props.workerConnected} onBusyChange={setBusy} />
  </div>
}

function ShortPlayback({ plan, disabled, workerUrl, workerToken, workerConnected, onBusyChange }: Pick<Props, 'workerUrl' | 'workerToken' | 'workerConnected' | 'onBusyChange' | 'disabled'> & { plan: RenderPlan | null }) {
  const { t } = useUiLanguage()
  const [feedback, setFeedback] = useState<ShortPreviewFeedback>({ phase: 'idle' })
  const [url, setUrl] = useState('')
  const objectUrl = useRef('')
  const session = useRef<ShortPreviewSession | null>(null)
  const busy = feedback.phase === 'cancelling' || (feedback.phase !== 'cancelFailed' && previewBusy(feedback.phase))
  const retry = ['pollFailed', 'loadFailed', 'cancelFailed'].includes(feedback.phase)
  useLayoutEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  useLayoutEffect(() => () => {
    session.current?.detach()
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    onBusyChange(false)
  }, [onBusyChange])
  function render() {
    if (!plan || disabled || !workerConnected || !workerToken.trim() || busy || session.current?.busy) return
    if (!retry) {
      session.current?.detach()
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = ''; setUrl('')
      session.current = new ShortPreviewSession(freshPreviewPlan(plan), {
        client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), publish: setFeedback,
        accept: blob => { objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current) }
      })
    }
    void session.current?.run()
  }
  return <div aria-busy={busy}>
    <div className="renderActions">
      <button className="secondaryButton" disabled={!plan || disabled || !workerConnected || !workerToken.trim() || busy} onClick={render}>{t(retry ? 'preview.retry' : feedback.phase === 'startFailed' ? 'shortPreview.new' : url ? 'preview.refresh' : 'preview.render')}</button>
      {feedback.job && ['queued', 'running'].includes(feedback.job.state) && <button disabled={feedback.phase === 'cancelling'} className="dangerButton" onClick={() => { void session.current?.cancel() }}>{t('shortPreview.cancel')}</button>}
    </div>
    {!workerConnected && <p>{t('preview.connect')}</p>}
    <ShortPreviewStatus feedback={feedback} />
    {url && <PreviewPlayback key={url} url={url} durationSeconds={(plan?.durationMs ?? 0) / 1000} />}
  </div>
}

export function ShortPreviewStatus({ feedback }: { feedback: ShortPreviewFeedback }) {
  const { t } = useUiLanguage()
  if (feedback.phase === 'cancelling' || feedback.phase === 'cancelFailed') return <div className={feedback.phase === 'cancelFailed' ? 'errorBox' : 'note'} role={feedback.phase === 'cancelFailed' ? 'alert' : 'status'}>
    {t(`shortPreview.${feedback.phase}`)}{feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
  return <PreviewStatus feedback={{ ...feedback, phase: feedback.phase }} />
}
