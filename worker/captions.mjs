import path from 'node:path'

export function captionTempPaths(managedRoot, jobId) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid render job id')
  const directory = path.join(managedRoot, 'Temp', 'Captions')
  return { directory, file: path.join(directory, `${jobId}.ass`) }
}

export function buildAssDocument(captionClips, width, height) {
  const events = captionClips.slice().sort((a, b) => a.startMs - b.startMs || String(a.clipId).localeCompare(String(b.clipId))).map((clip) => `Dialogue: 0,${assTime(clip.startMs)},${assTime(clip.startMs + clip.durationMs)},Default,,0,0,0,,${escapeAssText(clip.asset.metadata.text)}`)
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,54,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,70,70,55,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`
}

export function escapeAssText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Caption text is required')
  return value.replaceAll('\\', '＼').replaceAll('{', '｛').replaceAll('}', '｝').replace(/\r?\n/g, '\\N')
}

export function escapeSubtitleFilterPath(value) {
  return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "'\\''").replaceAll(',', '\\,').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function assTime(ms) {
  const centiseconds = Math.max(0, Math.round(ms / 10))
  const hours = Math.floor(centiseconds / 360000)
  const minutes = Math.floor((centiseconds % 360000) / 6000)
  const seconds = Math.floor((centiseconds % 6000) / 100)
  const fraction = centiseconds % 100
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`
}
