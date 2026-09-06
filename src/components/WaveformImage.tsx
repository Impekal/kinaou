import { useEffect, useState } from 'react'
import { WorkerClient } from '../core/workerClient'

export function WaveformImage({ path, workerUrl, workerToken, workerConnected, alt }: { path: string; workerUrl: string; workerToken: string; workerConnected: boolean; alt: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => { if (!path || !workerConnected) return; let cancelled = false; new WorkerClient({ baseUrl: workerUrl, token: workerToken }).loadWaveform(path).then((blob) => { if (!cancelled) setUrl(URL.createObjectURL(blob)) }).catch(() => {}); return () => { cancelled = true } }, [path, workerConnected, workerToken, workerUrl])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url ? <img className="waveformImage" src={url} alt={alt} /> : null
}
