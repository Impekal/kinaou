import { MediaPreviewImage } from './MediaPreviewImage'

export function WaveformImage(props: { path: string; workerUrl: string; workerToken: string; workerConnected: boolean; alt: string; scope?: string }) {
  return <MediaPreviewImage {...props} kind="waveform" />
}
