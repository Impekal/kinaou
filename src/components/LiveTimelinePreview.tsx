import { useEffect, useRef, useState } from 'react'

import type { KinaouProject } from '../core/project'
import { liveLayerCss, liveVisualLayers, type LiveVisualLayer } from '../core/liveTimelinePreview'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface Props {
  project: KinaouProject
  playheadMs: number
  workerUrl: string
  workerToken: string
  workerConnected: boolean
}

interface LoadedLayer {
  url?: string
  loading: boolean
  error?: string
}

function LiveLayer({
  layer,
  workerUrl,
  workerToken,
  workerConnected
}: {
  layer: LiveVisualLayer
  workerUrl: string
  workerToken: string
  workerConnected: boolean
}) {
  const { t } = useUiLanguage()
  const [loaded, setLoaded] = useState<LoadedLayer>({ loading: false })
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let current = true
    let objectUrl = ''

    setLoaded({ loading: false })

    if (!workerConnected || !layer.path) {
      return () => { current = false }
    }

    setLoaded({ loading: true })

    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const request = layer.kind === 'video'
      ? client.loadVideoProxy(layer.path)
      : client.loadVideoThumbnail(layer.path)

    void request.then((blob) => {
      if (!current) return
      objectUrl = URL.createObjectURL(blob)
      setLoaded({ loading: false, url: objectUrl })
    }).catch((cause) => {
      if (!current) return
      setLoaded({
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause)
      })
    })

    return () => {
      current = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [layer.assetId, layer.kind, layer.path, workerConnected, workerToken, workerUrl])

  useEffect(() => {
    if (layer.kind !== 'video' || !video.current || !loaded.url) return

    const seconds = Math.max(0, layer.sourceTimeMs / 1000)
    if (Math.abs(video.current.currentTime - seconds) > 0.02) {
      video.current.currentTime = seconds
    }
  }, [layer.kind, layer.sourceTimeMs, loaded.url])

  const style = liveLayerCss(layer)

  return <div
    className="liveTimelineLayer"
    style={style}
    data-track={layer.trackId}
    data-clip={layer.clipId}
    data-source-time={layer.sourceTimeMs}
  >
    {loaded.url && layer.kind === 'video' && <video
      ref={video}
      className="liveTimelineMedia"
      src={loaded.url}
      muted
      playsInline
      preload="auto"
      aria-label={t('preview.liveVideo')}
    />}
    {loaded.url && layer.kind === 'image' && <img
      className="liveTimelineMedia"
      src={loaded.url}
      alt={t('preview.liveImage')}
    />}
    {loaded.loading && <div className="liveTimelinePlaceholder">{t('preview.liveLoading')}</div>}
    {!loaded.loading && !loaded.url && <div className="liveTimelinePlaceholder">
      {layer.path
        ? t(workerConnected ? 'preview.liveLoadFailed' : 'preview.liveConnect')
        : t(layer.kind === 'video' ? 'preview.liveNeedsProxy' : 'preview.liveNeedsThumbnail')}
      {loaded.error && <small>{loaded.error}</small>}
    </div>}
  </div>
}

export function LiveTimelinePreview({
  project,
  playheadMs,
  workerUrl,
  workerToken,
  workerConnected
}: Props) {
  const { language, t } = useUiLanguage()
  const layers = liveVisualLayers(project, playheadMs)
  const cached = layers.filter((layer) => Boolean(layer.path)).length

  return <section className="liveTimelinePreview" aria-label={t('preview.liveHeading')}>
    <div className="liveTimelineHeader">
      <div>
        <div className="eyebrow">{t('preview.liveEyebrow')}</div>
        <h3>{t('preview.liveHeading')}</h3>
      </div>
      <span className="status">
        {t('preview.liveTime', {
          time: (playheadMs / 1000).toLocaleString(language, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })
        })}
      </span>
    </div>

    <p>{t('preview.liveHelp')}</p>

    <div className="liveTimelineStage">
      {layers.length === 0 && <div className="liveTimelineEmpty">{t('preview.liveEmpty')}</div>}
      {layers.map((layer) => <LiveLayer
        key={`${layer.trackId}:${layer.clipId}`}
        layer={layer}
        workerUrl={workerUrl}
        workerToken={workerToken}
        workerConnected={workerConnected}
      />)}
    </div>

    {layers.length > 0 && cached < layers.length && <small className="liveTimelineNotice">
      {t('preview.liveCacheNotice', {
        available: cached,
        total: layers.length
      })}
    </small>}
  </section>
}
