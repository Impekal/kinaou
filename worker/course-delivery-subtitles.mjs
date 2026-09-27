/** Validate only KINAOU's bounded, numbered, escaped plain-text WebVTT profile. */
export function inspectDeliverySubtitles(text, durationMs) {
  if (typeof text !== 'string' || !text.startsWith('WEBVTT\n\n') || !text.endsWith('\n') || text.includes('\r') || text.length > 512 * 1024
    || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 86400000) throw Error('Invalid delivery subtitle profile')
  const blocks = text.slice(8, -1).split('\n\n')
  if (!blocks.length || blocks.length > 1000) throw Error('Invalid delivery subtitle count')
  const timestamp = value => {
    if (!/^\d{2}:[0-5]\d:[0-5]\d\.\d{3}$/.test(value)) throw Error('Invalid delivery subtitle timestamp')
    const [hours, minutes, seconds, ms] = value.split(/[:.]/).map(Number)
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms
  }
  let previousEnd = 0
  for (const [index, block] of blocks.entries()) {
    const [id, timing, ...lines] = block.split('\n'), times = timing?.split(' --> ')
    if (id !== String(index + 1) || times?.length !== 2 || !lines.length || lines.some(line => !line.trim() || /[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(line) || /&(?!amp;|lt;|gt;)/.test(line))) throw Error('Unsupported delivery subtitle content')
    const start = timestamp(times[0]), end = timestamp(times[1])
    if (start < previousEnd || end <= start || end > durationMs) throw Error('Delivery subtitle times exceed lesson or overlap')
    previousEnd = end
  }
  return { cueCount: blocks.length }
}
