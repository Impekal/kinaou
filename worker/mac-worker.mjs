import http from 'node:http'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { managedUploadPaths } from './asset-upload.mjs'
import { buildAssDocument, captionTempPaths, escapeSubtitleFilterPath } from './captions.mjs'

const HOST = '127.0.0.1'
const PORT = Number(process.env.KINAOU_WORKER_PORT ?? 43117)
const TOKEN = process.env.KINAOU_WORKER_TOKEN ?? crypto.randomBytes(24).toString('hex')
const MANAGED_ROOT = normalizeRoot(process.env.KINAOU_MANAGED_ROOT ?? '')
const WORKER_ID = process.env.KINAOU_WORKER_ID ?? `mac-${crypto.randomUUID()}`
const MAX_UPLOAD_BYTES = Number(process.env.KINAOU_MAX_UPLOAD_BYTES ?? 250 * 1024 * 1024 * 1024)
const VERSION = '0.5.0'
const renderJobs = new Map()
const visualTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])
const audioTrackTypes = new Set(['voice', 'dialog', 'music', 'sfx'])

if (!MANAGED_ROOT) {
  console.error('KINAOU_MANAGED_ROOT is required and must point to the dedicated KINAOU directory on the selected disk.')
  process.exit(1)
}
if (!Number.isFinite(MAX_UPLOAD_BYTES) || MAX_UPLOAD_BYTES <= 0) {
  console.error('KINAOU_MAX_UPLOAD_BYTES must be a positive number.')
  process.exit(1)
}

await assertManagedRootExists(MANAGED_ROOT)

const versions = {
  ffmpeg: await readVersion('ffmpeg'),
  ffprobe: await readVersion('ffprobe')
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(request, response)
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    return response.end()
  }
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')

  if (!isAuthorized(request)) return send(response, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid worker token' } })

  try {
    if (request.method === 'GET' && request.url === '/health') {
      return send(response, 200, {
        ok: true,
        type: 'health',
        handshake: {
          workerId: WORKER_ID,
          name: 'KINAOU Mac Worker',
          platform: process.platform,
          version: VERSION,
          capabilities: ['filesystem', 'ffmpeg', 'media-probe', 'asset-upload'],
          managedRoots: [MANAGED_ROOT],
          ffmpegVersion: versions.ffmpeg,
          ffprobeVersion: versions.ffprobe
        }
      })
    }

    if (request.method === 'POST' && request.url === '/assets/import') {
      const result = await importAssetStream(request)
      return send(response, 201, { ok: true, type: 'asset-upload', result })
    }

    if (request.method === 'POST' && request.url === '/probe') {
      const body = await readJson(request)
      const relativePath = requireManagedRelativePath(body.path)
      const absolutePath = resolveManaged(relativePath)
      await access(absolutePath)
      const result = await probeMedia(absolutePath)
      return send(response, 200, { ok: true, type: 'probe-media', result })
    }

    if (request.method === 'POST' && request.url === '/render') {
      const body = await readJson(request)
      const plan = validateRenderPlan(body.plan)
      const job = createRenderJob(plan)
      queueMicrotask(() => executeRenderJob(job.id).catch(() => {}))
      return send(response, 202, { ok: true, type: 'render-job', job: publicJob(job) })
    }

    const statusMatch = request.url?.match(/^\/render\/jobs\/([^/]+)$/)
    if (request.method === 'GET' && statusMatch) {
      const job = requireRenderJob(decodeURIComponent(statusMatch[1]))
      return send(response, 200, { ok: true, type: 'render-job', job: publicJob(job) })
    }

    const cancelMatch = request.url?.match(/^\/render\/jobs\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && cancelMatch) {
      const job = requireRenderJob(decodeURIComponent(cancelMatch[1]))
      cancelRenderJob(job)
      return send(response, 200, { ok: true, type: 'render-job', job: publicJob(job) })
    }

    return send(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown worker endpoint' } })
  } catch (error) {
    const status = error?.code === 'UNAUTHORIZED_PATH' ? 403 : error?.code === 'NOT_FOUND' ? 404 : error?.code === 'UPLOAD_TOO_LARGE' ? 413 : 400
    return send(response, status, { ok: false, error: normalizeError(error) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`KINAOU Mac Worker ${VERSION} listening on http://${HOST}:${PORT}`)
  console.log(`Managed root: ${MANAGED_ROOT}`)
  if (!process.env.KINAOU_WORKER_TOKEN) console.log(`Generated one-time token: ${TOKEN}`)
})

function setCorsHeaders(request, response) {
  const origin = request.headers.origin
  if (isLoopbackOrigin(origin)) response.setHeader('access-control-allow-origin', origin)
  response.setHeader('vary', 'origin')
  response.setHeader('access-control-allow-headers', 'authorization, content-type, x-kinaou-filename')
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
}

function isLoopbackOrigin(origin) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname)
  } catch {
    return false
  }
}

function isAuthorized(request) {
  return (request.headers.authorization ?? '') === `Bearer ${TOKEN}`
}

async function importAssetStream(request) {
  const declared = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) throw uploadTooLarge()
  const originalName = request.headers['x-kinaou-filename']
  const id = crypto.randomUUID()
  const paths = managedUploadPaths(id, Array.isArray(originalName) ? originalName[0] : originalName)
  const tempAbsolute = resolveManaged(paths.tempRelativePath)
  const assetAbsolute = resolveManaged(paths.assetRelativePath)
  await mkdir(path.dirname(tempAbsolute), { recursive: true })
  await mkdir(path.dirname(assetAbsolute), { recursive: true })

  let bytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (bytes > MAX_UPLOAD_BYTES) return callback(uploadTooLarge())
      callback(null, chunk)
    }
  })

  try {
    await pipeline(request, limiter, createWriteStream(tempAbsolute, { flags: 'wx' }))
    await rename(tempAbsolute, assetAbsolute)
  } catch (error) {
    await unlink(tempAbsolute).catch(() => {})
    throw error
  }

  return { managedPath: paths.assetRelativePath, name: paths.safeName, sizeBytes: bytes }
}

function uploadTooLarge() {
  const error = new Error(`Asset upload exceeds configured limit of ${MAX_UPLOAD_BYTES} bytes`)
  error.code = 'UPLOAD_TOO_LARGE'
  return error
}

async function readJson(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 1_000_000) throw new Error('Request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function normalizeRoot(value) {
  if (!value) return ''
  const resolved = path.resolve(value)
  return resolved.endsWith(path.sep) ? resolved.slice(0, -1) : resolved
}

async function assertManagedRootExists(root) {
  const info = await stat(root)
  if (!info.isDirectory()) throw new Error('KINAOU_MANAGED_ROOT must be a directory')
  if (path.basename(root) !== 'KINAOU') throw new Error('KINAOU_MANAGED_ROOT must point to a directory named KINAOU')
}

function requireManagedRelativePath(value) {
  if (typeof value !== 'string' || !value.startsWith('KINAOU/')) throw unauthorizedPath()
  const normalized = value.replaceAll('\\', '/')
  if (normalized.split('/').includes('..')) throw unauthorizedPath()
  return normalized
}

function requireRenderRelativePath(value) {
  const normalized = requireManagedRelativePath(value)
  if (!normalized.startsWith('KINAOU/Renders/')) throw unauthorizedPath('Render output must stay inside KINAOU/Renders')
  return normalized
}

function resolveManaged(relativePath) {
  const suffix = relativePath.slice('KINAOU/'.length)
  const candidate = path.resolve(MANAGED_ROOT, suffix)
  if (candidate !== MANAGED_ROOT && !candidate.startsWith(`${MANAGED_ROOT}${path.sep}`)) throw unauthorizedPath()
  return candidate
}

function unauthorizedPath(message = 'Path is outside the authorized KINAOU root') {
  const error = new Error(message)
  error.code = 'UNAUTHORIZED_PATH'
  return error
}

async function readVersion(executable) {
  try {
    const { stdout } = await run(executable, ['-version'])
    return stdout.split('\n')[0]?.trim() || undefined
  } catch {
    return undefined
  }
}

async function probeMedia(absolutePath) {
  if (!versions.ffprobe) throw capabilityError('ffprobe is not available')
  const args = ['-v', 'error', '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', absolutePath]
  const { stdout } = await run('ffprobe', args)
  const parsed = JSON.parse(stdout)
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
  const file = await stat(absolutePath)
  return {
    path: absolutePath,
    durationMs: parsed.format?.duration ? Math.round(Number(parsed.format.duration) * 1000) : undefined,
    sizeBytes: parsed.format?.size ? Number(parsed.format.size) : file.size,
    width: video?.width,
    height: video?.height,
    fps: video?.r_frame_rate ? parseRate(video.r_frame_rate) : undefined,
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
    channels: audio?.channels
  }
}

function validateRenderPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('Render plan required')
  if (!Array.isArray(plan.clips) || plan.clips.length < 1) throw new Error('Render plan requires at least one clip')
  if (!Number.isFinite(plan.durationMs) || plan.durationMs <= 0) throw new Error('Invalid render duration')
  if (!plan.preset || !Number.isFinite(plan.preset.width) || plan.preset.width <= 0 || !Number.isFinite(plan.preset.height) || plan.preset.height <= 0 || !Number.isFinite(plan.preset.fps) || plan.preset.fps <= 0) throw new Error('Invalid render preset')
  requireRenderRelativePath(plan.outputRelativePath)
  for (const clip of plan.clips) {
    if (!Number.isFinite(clip.trackIndex) || clip.trackIndex < 0) throw new Error('Invalid track index')
    if (!Number.isFinite(clip.startMs) || clip.startMs < 0) throw new Error('Invalid clip start')
    if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) throw new Error('Invalid clip duration')
    if (!Number.isFinite(clip.sourceOffsetMs) || clip.sourceOffsetMs < 0) throw new Error('Invalid source offset')
    if (clip.speed !== 1) throw new Error('Multi-track compositor currently requires clip speed 1')
    const transform = clip.transform
    if (!transform || ![transform.x, transform.y, transform.scale, transform.cropLeft, transform.cropTop, transform.cropRight, transform.cropBottom].every(Number.isFinite)) throw new Error('Invalid clip transform')
    if (transform.scale < 0.1 || transform.scale > 4 || ![transform.cropLeft, transform.cropTop, transform.cropRight, transform.cropBottom].every((value) => Number.isInteger(value) && value >= 0)) throw new Error('Invalid clip transform range')
    if (clip.transitionIn && (clip.transitionIn.type !== 'dissolve' || !Number.isInteger(clip.transitionIn.durationMs) || clip.transitionIn.durationMs < 100 || clip.transitionIn.durationMs > Math.min(5000, clip.durationMs))) throw new Error('Invalid dissolve transition')
    if (!clip.fades || ![clip.fades.inMs, clip.fades.outMs].every((value) => Number.isInteger(value) && value >= 0 && value <= 5000) || clip.fades.inMs + clip.fades.outMs > clip.durationMs) throw new Error('Invalid clip fades')
    if (clip.asset?.kind === 'caption') {
      if (clip.trackType !== 'caption' || typeof clip.asset.metadata?.text !== 'string' || !clip.asset.metadata.text.trim()) throw new Error('Invalid caption clip')
    } else requireManagedRelativePath(clip.asset?.uri)
  }
  return plan
}

function createRenderJob(plan) {
  const now = new Date().toISOString()
  const job = { id: crypto.randomUUID(), state: 'queued', progress: 0, createdAt: now, updatedAt: now, plan, child: null }
  renderJobs.set(job.id, job)
  return job
}

function publicJob(job) {
  return {
    id: job.id, state: job.state, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt,
    ...(job.outputPath ? { outputPath: job.outputPath } : {}),
    ...(job.durationMs !== undefined ? { durationMs: job.durationMs } : {}),
    ...(job.sizeBytes !== undefined ? { sizeBytes: job.sizeBytes } : {}),
    ...(job.error ? { error: job.error } : {})
  }
}

function requireRenderJob(id) {
  const job = renderJobs.get(id)
  if (!job) {
    const error = new Error('Render job not found')
    error.code = 'NOT_FOUND'
    throw error
  }
  return job
}

function touchJob(job) {
  job.updatedAt = new Date().toISOString()
}

async function executeRenderJob(id) {
  const job = requireRenderJob(id)
  if (job.state === 'cancelled') return
  job.state = 'running'
  touchJob(job)
  try {
    if (!versions.ffmpeg) throw capabilityError('ffmpeg is not available')
    const plan = job.plan
    const outputPath = resolveManaged(requireRenderRelativePath(plan.outputRelativePath))
    const mediaClips = plan.clips.filter((clip) => clip.asset.kind !== 'caption')
    const captionClips = plan.clips.filter((clip) => clip.asset.kind === 'caption')
    const inputPaths = []
    for (const clip of mediaClips) {
      const input = resolveManaged(requireManagedRelativePath(clip.asset.uri))
      await access(input)
      inputPaths.push(input)
    }
    await mkdir(path.dirname(outputPath), { recursive: true })
    let subtitlePath
    if (captionClips.length) {
      const temp = captionTempPaths(MANAGED_ROOT, job.id)
      await mkdir(temp.directory, { recursive: true })
      await writeFile(temp.file, buildAssDocument(captionClips, plan.preset.width, plan.preset.height), { encoding: 'utf8', flag: 'wx' })
      subtitlePath = temp.file
      job.subtitlePath = temp.file
    }
    const args = buildCompositeArgs(plan, mediaClips, inputPaths, outputPath, subtitlePath)
    const child = spawn('ffmpeg', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    job.child = child
    let progressBuffer = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      progressBuffer += data.toString()
      const lines = progressBuffer.split('\n')
      progressBuffer = lines.pop() ?? ''
      for (const line of lines) updateFfmpegProgress(job, line, plan.durationMs)
    })
    child.stderr.on('data', (data) => { stderr += data.toString() })
    await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', (code, signal) => {
        job.child = null
        if (job.state === 'cancelled') return resolve()
        if (code === 0) return resolve()
        const error = new Error(`ffmpeg exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}: ${stderr.trim()}`)
        error.code = 'PROCESS_FAILED'
        reject(error)
      })
    })
    if (job.state === 'cancelled') return
    const info = await stat(outputPath)
    job.state = 'succeeded'
    job.progress = 1
    job.outputPath = outputPath
    job.durationMs = plan.durationMs
    job.sizeBytes = info.size
    touchJob(job)
  } catch (error) {
    if (job.state === 'cancelled') return
    job.state = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
    touchJob(job)
  } finally {
    if (job.subtitlePath) await unlink(job.subtitlePath).catch(() => {})
    job.subtitlePath = null
  }
}

function buildCompositeArgs(plan, mediaClips, inputPaths, outputPath, subtitlePath) {
  const args = ['-y']
  mediaClips.forEach((clip, index) => {
    if (clip.asset.kind === 'image') args.push('-loop', '1')
    args.push('-ss', seconds(clip.sourceOffsetMs), '-t', seconds(clip.durationMs), '-i', inputPaths[index])
  })

  const width = plan.preset.width
  const height = plan.preset.height
  const fps = plan.preset.fps
  const parts = [`color=c=black:s=${width}x${height}:r=${fps}:d=${seconds(plan.durationMs)}[base]`]
  const visuals = []
  const audios = []
  mediaClips.forEach((clip, index) => {
    if (visualTrackTypes.has(clip.trackType)) visuals.push({ index, clip })
    if (audioTrackTypes.has(clip.trackType)) audios.push({ index, clip })
  })
  visuals.sort((a, b) => a.clip.trackIndex - b.clip.trackIndex || a.clip.startMs - b.clip.startMs || String(a.clip.clipId).localeCompare(String(b.clip.clipId)))

  let currentVideo = 'base'
  visuals.forEach(({ index, clip }, visualIndex) => {
    const prepared = `v${visualIndex}`
    const output = `vo${visualIndex}`
    const start = seconds(clip.startMs)
    const end = seconds(clip.startMs + clip.durationMs)
    const transform = clip.transform
    const visualFadeIn = clip.transitionIn?.durationMs ?? clip.fades.inMs
    const fadeFilters = visualFadeIn || clip.fades.outMs ? [',format=rgba', ...(visualFadeIn ? [`,fade=t=in:st=0:d=${seconds(visualFadeIn)}:alpha=1`] : []), ...(clip.fades.outMs ? [`,fade=t=out:st=${seconds(clip.durationMs - clip.fades.outMs)}:d=${seconds(clip.fades.outMs)}:alpha=1`] : [])].join('') : ''
    parts.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,crop=iw-${transform.cropLeft}-${transform.cropRight}:ih-${transform.cropTop}-${transform.cropBottom}:${transform.cropLeft}:${transform.cropTop},scale=iw*${transform.scale}:ih*${transform.scale}${fadeFilters},setpts=PTS-STARTPTS+${start}/TB[${prepared}]`)
    parts.push(`[${currentVideo}][${prepared}]overlay=(W-w)/2${signedOffset(transform.x)}:(H-h)/2${signedOffset(transform.y)}:enable='between(t,${start},${end})'[${output}]`)
    currentVideo = output
  })

  if (subtitlePath) {
    parts.push(`[${currentVideo}]subtitles=filename='${escapeSubtitleFilterPath(subtitlePath)}'[captioned]`)
    currentVideo = 'captioned'
  }

  let audioOutput = null
  if (audios.length) {
    const labels = []
    audios.forEach(({ index, clip }, audioIndex) => {
      const label = `a${audioIndex}`
      const delay = Math.round(clip.startMs)
      const fades = `${clip.fades.inMs ? `,afade=t=in:st=0:d=${seconds(clip.fades.inMs)}` : ''}${clip.fades.outMs ? `,afade=t=out:st=${seconds(clip.durationMs - clip.fades.outMs)}:d=${seconds(clip.fades.outMs)}` : ''}`
      parts.push(`[${index}:a]atrim=0:${seconds(clip.durationMs)},asetpts=PTS-STARTPTS,volume=${clip.gain}${fades},adelay=${delay}|${delay}[${label}]`)
      labels.push(`[${label}]`)
    })
    audioOutput = 'aout'
    parts.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[${audioOutput}]`)
  }

  args.push('-filter_complex', parts.join(';'), '-map', `[${currentVideo}]`)
  if (audioOutput) args.push('-map', `[${audioOutput}]`)
  else args.push('-an')
  args.push('-t', seconds(plan.durationMs), '-c:v', plan.preset.videoCodec === 'hevc' ? 'libx265' : 'libx264')
  if (audioOutput) args.push('-c:a', 'aac')
  args.push('-r', String(fps), '-pix_fmt', 'yuv420p', '-progress', 'pipe:1', '-nostats', outputPath)
  return args
}

function updateFfmpegProgress(job, line, durationMs) {
  const [key, rawValue] = line.split('=', 2)
  if (key !== 'out_time_us') return
  const elapsedMs = Number(rawValue) / 1000
  if (!Number.isFinite(elapsedMs)) return
  job.progress = Math.max(0, Math.min(0.99, elapsedMs / durationMs))
  touchJob(job)
}

function cancelRenderJob(job) {
  if (['succeeded', 'failed', 'cancelled'].includes(job.state)) return
  job.state = 'cancelled'
  touchJob(job)
  if (job.child && !job.child.killed) job.child.kill('SIGTERM')
}

function capabilityError(message) {
  const error = new Error(message)
  error.code = 'CAPABILITY_UNAVAILABLE'
  return error
}

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else {
        const error = new Error(`${executable} exited with code ${code}: ${stderr.trim()}`)
        error.code = 'PROCESS_FAILED'
        reject(error)
      }
    })
  })
}

function parseRate(rate) {
  const [n, d = '1'] = String(rate).split('/')
  const value = Number(n) / Number(d)
  return Number.isFinite(value) ? value : undefined
}

function seconds(ms) {
  return (ms / 1000).toFixed(3)
}

function signedOffset(value) { return value < 0 ? String(value) : `+${value}` }

function normalizeError(error) {
  return { code: error?.code ?? 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}

function send(response, status, body) {
  response.statusCode = status
  response.end(JSON.stringify(body))
}
