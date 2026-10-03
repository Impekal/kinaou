import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'

export const sourceFrameLimits = Object.freeze({ sourceBytes: 2 * 1024 ** 3, pngBytes: 16 * 1024 ** 2, durationMs: 6 * 60 * 60 * 1000, timeoutMs: 30000 })
export function parseSourceFrameRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'path,timeMs') throw Error('Source path and time are required')
  if (typeof value.path !== 'string' || value.path.length > 2000 || !value.path.startsWith('KINAOU/Assets/') || !value.path.endsWith('.mp4') || /[\\\x00-\x1f\x7f]/.test(value.path) || value.path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Select a managed MP4 source')
  if (!Number.isInteger(value.timeMs) || value.timeMs < 0 || value.timeMs >= sourceFrameLimits.durationMs) throw Error('Source frame time is outside supported bounds')
  return { path: value.path, timeMs: value.timeMs }
}
export function sourceFramePngDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > sourceFrameLimits.pngBytes || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii',12,16) !== 'IHDR') throw Error('Invalid extracted PNG')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (!width || !height || width > 1920 || height > 1080) throw Error('Extracted frame dimensions exceed bounds')
  return { width, height }
}
const fingerprint = info => JSON.stringify([info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs])
async function openSource(root, relative) {
  const canonical = await realpath(root)
  if (path.basename(canonical) !== 'KINAOU') throw Error('Invalid source root')
  let current = canonical
  const parts = relative.slice('KINAOU/'.length).split('/')
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part); const info = await lstat(current)
    if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) throw Error('Source requires regular files/directories, not links')
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat(), present = await lstat(current)
    if (!info.isFile() || !present.isFile() || info.dev !== present.dev || info.ino !== present.ino || await realpath(current) !== current) throw Error('Source changed during opening')
    if (!Number.isSafeInteger(info.size) || info.size < 12 || info.size > sourceFrameLimits.sourceBytes) throw Error('Source MP4 must be nonempty and at most 2 GiB')
    const header = Buffer.alloc(12); await handle.read(header, 0, 12, 0)
    if (header.toString('ascii',4,8) !== 'ftyp') throw Error('Source is not an MP4 file')
    return { handle, current, info }
  } catch (cause) { await handle.close(); throw cause }
}
/** Only an inherited pinned descriptor reaches libav; no arbitrary source URL or shell. */
function runPinned(executable, args, fd, maxBytes, deadline) {
  return new Promise((resolve, reject) => {
    if (Date.now() >= deadline) { reject(Error('Frame extraction timed out')); return }
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe', fd] })
    const chunks = []; let size = 0, errors = '', failure
    const timer = setTimeout(() => { failure = Error('Frame extraction timed out'); child.kill('SIGKILL') }, deadline - Date.now())
    child.stdout.on('data', data => { size += data.length; if (size > maxBytes) { failure = Error('Frame output exceeds bounds'); child.kill('SIGKILL') } else chunks.push(data) })
    child.stderr.on('data', data => { if (errors.length < 4000) errors += data.toString().slice(0, 4000 - errors.length) })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else if (code !== 0) reject(Error(`${executable} frame extraction failed: ${errors}`)); else resolve(Buffer.concat(chunks)) })
  })
}
/** Read-only extraction: no output file, persistent job or automatic import is created. */
export function createSourceFrameRuntime({ root }) {
  let active = false
  return { async extract(value) {
    const request = parseSourceFrameRequest(value)
    if (active) throw Error('Another source frame is being read; retry after it finishes')
    active = true; let source
    try {
      source = await openSource(root, request.path)
      const deadline = Date.now() + sourceFrameLimits.timeoutMs
      const input = ['-protocol_whitelist', 'file,pipe', '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0', '-i', '/dev/fd/3']
      const probe = JSON.parse((await runPinned('ffprobe', ['-v','error',...input,'-show_entries','format=duration:stream=codec_type,width,height,sample_aspect_ratio','-of','json'], source.handle.fd, 65536, deadline)).toString())
      const video = probe.streams?.find(stream => stream.codec_type === 'video'), durationMs = Math.round(Number(probe.format?.duration) * 1000)
      if (!video || !Number.isInteger(video.width) || !Number.isInteger(video.height) || video.width < 1 || video.height < 1 || video.width > 7680 || video.height > 7680 || video.width * video.height > 33177600 || !Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > sourceFrameLimits.durationMs || request.timeMs >= durationMs) throw Error('Source video or requested frame is outside measured bounds')
      if (video.sample_aspect_ratio && !['1:1','0:1','N/A'].includes(video.sample_aspect_ratio)) throw Error('Non-square-pixel sources are not supported for still extraction')
      const png = await runPinned('ffmpeg', ['-v','error','-threads','2','-ss',(request.timeMs / 1000).toFixed(3),...input,'-map','0:v:0','-an','-sn','-dn','-frames:v','1','-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease,setsar=1",'-threads','2','-c:v','png','-f','image2pipe','pipe:1'], source.handle.fd, sourceFrameLimits.pngBytes, deadline)
      if (!png.length) throw Error('No frame decoded at the requested time; choose an earlier source time')
      const dimensions = sourceFramePngDimensions(png)
      const after = await source.handle.stat(), present = await lstat(source.current)
      if (fingerprint(after) !== fingerprint(source.info) || !present.isFile() || fingerprint(present) !== fingerprint(source.info) || await realpath(source.current) !== source.current) throw Error('Source changed during extraction')
      return { schemaVersion: 1, sourcePath: request.path, requestedMs: request.timeMs, sourceDurationMs: durationMs, sourceSizeBytes: source.info.size, sourceWidth: video.width, sourceHeight: video.height, ...dimensions, sizeBytes: png.length, sha256: createHash('sha256').update(png).digest('hex'), pngBase64: png.toString('base64'), extractedAt: new Date().toISOString() }
    } finally { try { await source?.handle.close() } finally { active = false } }
  } }
}
