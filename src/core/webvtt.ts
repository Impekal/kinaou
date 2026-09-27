export interface WebVttCue { startMs: number; endMs: number; text: string }
export const webVttLimits = { cues: 1000, bytes: 1024 * 1024 } as const

export function webVttTimestamp(ms: number): string {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > 86400000) throw new Error('Invalid WebVTT timestamp')
  const hours = Math.floor(ms / 3600000), minutes = Math.floor(ms / 60000) % 60, seconds = Math.floor(ms / 1000) % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

/** Plain-text profile of https://www.w3.org/TR/webvtt1/; no user-supplied markup/settings. */
export function serializeWebVtt(cues: readonly WebVttCue[]): string {
  if (!cues.length || cues.length > webVttLimits.cues) throw new Error('WebVTT cue count limit')
  let previousEnd = 0, bytes = 8
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  const blocks = cues.map((cue, index) => {
    const start = webVttTimestamp(cue.startMs), end = webVttTimestamp(cue.endMs)
    if (cue.endMs <= cue.startMs || cue.startMs < previousEnd) throw new Error('Unordered or overlapping WebVTT cues')
    previousEnd = cue.endMs
    if (typeof cue.text !== 'string' || !cue.text.trim()) throw new Error('Invalid WebVTT cue text')
    if (cue.text.length > webVttLimits.bytes) throw new Error('WebVTT size limit')
    if (decoder.decode(encoder.encode(cue.text)) !== cue.text) throw new Error('Invalid WebVTT cue text')
    // Normalize line endings only; blank payload lines would terminate the cue.
    const normalized = cue.text.replace(/\r\n?/g, '\n')
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized) || normalized.split('\n').some(line => !line.trim())) throw new Error('WebVTT cue contains an empty line or control character')
    const escaped = normalized.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const block = `${index + 1}\n${start} --> ${end}\n${escaped}\n`
    bytes += encoder.encode(block).length + (index > 0 ? 1 : 0)
    if (bytes > webVttLimits.bytes) throw new Error('WebVTT size limit')
    return block
  })
  const text = `WEBVTT\n\n${blocks.join('\n')}`
  if (encoder.encode(text).length > webVttLimits.bytes) throw new Error('WebVTT size limit')
  return text
}
