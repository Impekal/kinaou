import http from 'node:http'
import { spawn } from 'node:child_process'
import { access, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const HOST = '127.0.0.1'
const PORT = Number(process.env.KINAOU_WORKER_PORT ?? 43117)
const TOKEN = process.env.KINAOU_WORKER_TOKEN ?? crypto.randomBytes(24).toString('hex')
const MANAGED_ROOT = normalizeRoot(process.env.KINAOU_MANAGED_ROOT ?? '')
const WORKER_ID = process.env.KINAOU_WORKER_ID ?? `mac-${crypto.randomUUID()}`
const VERSION = '0.2.0'
const renderJobs = new Map()

if (!MANAGED_ROOT) {
  console.error('KINAOU_MANAGED_ROOT is required and must point to the dedicated KINAOU directory on the selected disk.')
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
          capabilities: ['filesystem', 'ffmpeg', 'media-probe'],
          managedRoots: [MANAGED_ROOT],
          ffmpegVersion: versions.ffmpeg,
          ffprobeVersion: versions.ffprobe
        }
      })
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
      const plan = validateSingleClipRender(body.plan)
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
    const status = error?.code === 'UNAUTHORIZED_PATH' ? 403 : error?.code === 'NOT_FOUND' ? 404 : 400
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
  response.setHeader('access-control-allow-headers', 'authorization, content-type')
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
}

function isLoopbackOrigin(origin) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  } catch {
    return false
  }
}

function isAuthorized(request) {
  const auth = request.headers.authorization ?? ''
  return auth === `Bearer ${TOKEN}`
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

function validateSingleClipRender(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('Render plan required')
  if (!Array.isArray(plan.clips) || plan.clips.length !== 1) throw new Error('Worker runtime currently supports exactly one render clip')
  const clip = plan.clips[0]
  if (clip.startMs !== 0) throw new Error('Worker runtime currently supports clips starting at 0 only')
  if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) throw new Error('Invalid clip duration')
  if (!Number.isFinite(clip.sourceOffsetMs) || clip.sourceOffsetMs < 0) throw new Error('Invalid source offset')
  if (!plan.preset || !Number.isFinite(plan.preset.width) || !Number.isFinite(plan.preset.height) || !Number.isFinite(plan.preset.fps)) throw new Error('Invalid render preset')
  requireRenderRelativePath(plan.outputRelativePath)
  requireManagedRelativePath(clip.asset?.uri)
  return plan
}

function createRenderJob(plan) {
  const now = new Date().toISOString()
  const job = {
    id: crypto.randomUUID(),
    state: 'queued',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    plan,
    child: null
  }
  renderJobs.set(job.id, job)
  return job
}

function publicJob(job) {
  return {
    id: job.id,
    state: job.state,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
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
    const clip = plan.clips[0]
    const inputPath = resolveManaged(requireManagedRelativePath(clip.asset.uri))
    const outputPath = resolveManaged(requireRenderRelativePath(plan.outputRelativePath))
    await access(inputPath)
    await mkdir(path.dirname(outputPath), { recursive: true })
    const codec = plan.preset.videoCodec === 'hevc' ? 'libx265' : 'libx264'
    const args = [
      '-y', '-ss', seconds(clip.sourceOffsetMs), '-t', seconds(clip.durationMs), '-i', inputPath,
      '-c:v', codec, '-c:a', 'aac', '-r', String(plan.preset.fps), '-s', `${plan.preset.width}x${plan.preset.height}`,
      '-progress', 'pipe:1', '-nostats', outputPath
    ]
    const child = spawn('ffmpeg', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    job.child = child
    let progressBuffer = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      progressBuffer += data.toString()
      const lines = progressBuffer.split('\n')
      progressBuffer = lines.pop() ?? ''
      for (const line of lines) updateFfmpegProgress(job, line, clip.durationMs)
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
    job.durationMs = clip.durationMs
    job.sizeBytes = info.size
    touchJob(job)
  } catch (error) {
    if (job.state === 'cancelled') return
    job.state = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
    touchJob(job)
  }
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

function normalizeError(error) {
  return { code: error?.code ?? 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}

function send(response, status, body) {
  response.statusCode = status
  response.end(JSON.stringify(body))
}
