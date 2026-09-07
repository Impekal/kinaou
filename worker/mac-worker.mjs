import http from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { managedUploadPaths } from './asset-upload.mjs'
import { buildAssDocument, captionTempPaths, escapeSubtitleFilterPath } from './captions.mjs'
import { buildProxyArgs, buildThumbnailArgs, buildWaveformArgs, previewMediaType, proxyRelativePath, thumbnailRelativePath, waveformRelativePath } from './proxies.mjs'
import { generateAiEditorProposal, generateDirectorPlan, listOllamaModels, normalizeOllamaUrl } from './ollama.mjs'
import { MAX_GENERATED_IMAGE_BYTES, MAX_GENERATED_VIDEO_BYTES, MAX_WORKFLOW_FILE_BYTES, buildComfyPromptRequest, comfyHistoryStatus, comfyOutputQuery, comfyQueuePhase, comfyTempImageRelativePath, comfyTempVideoRelativePath, comfyWorkflowRelativePaths, detectComfyUi, generatedMediaExtensionFor, generatedImageRelativePath, generatedVideoRelativePath, normalizeComfyUrl, parseComfyPromptResponse, pickComfyOutputForMediaType, templateMediaType, validateComfyTemplate } from './comfyui.mjs'
import { buildSttCommands, normalizeWhisperTranscript, sttPaths, whisperModelRelativePaths } from './whisper.mjs'
import { buildPiperCommand, piperVoiceRelativePaths, ttsPaths, validateTtsText } from './piper.mjs'

const HOST = '127.0.0.1'
const PORT = Number(process.env.KINAOU_WORKER_PORT ?? 43117)
const TOKEN = process.env.KINAOU_WORKER_TOKEN ?? crypto.randomBytes(24).toString('hex')
const MANAGED_ROOT = normalizeRoot(process.env.KINAOU_MANAGED_ROOT ?? '')
const WORKER_ID = process.env.KINAOU_WORKER_ID ?? `mac-${crypto.randomUUID()}`
const MAX_UPLOAD_BYTES = Number(process.env.KINAOU_MAX_UPLOAD_BYTES ?? 250 * 1024 * 1024 * 1024)
const VERSION = '0.8.0'
const OLLAMA_URL = normalizeOllamaUrl(process.env.KINAOU_OLLAMA_URL)
const WHISPER_CLI = process.env.KINAOU_WHISPER_CLI ?? ''
const PIPER_CLI = process.env.KINAOU_PIPER_CLI ?? ''
const COMFYUI_URL = normalizeComfyUrl(process.env.KINAOU_COMFYUI_URL)
const COMFYUI_POLL_MS = Number(process.env.KINAOU_COMFYUI_POLL_MS ?? 750)
const COMFYUI_JOB_TIMEOUT_MS = Number(process.env.KINAOU_COMFYUI_JOB_TIMEOUT_MS ?? 20 * 60_000)
const renderJobs = new Map()
const sttJobs = new Map()
const ttsJobs = new Map()
const generationJobs = new Map()
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
    if (request.method === 'GET' && request.url?.startsWith('/media?')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const requestedPath = requestUrl.searchParams.get('path')
      const contentType = previewMediaType(requestedPath)
      const relativePath = requireManagedRelativePath(requestedPath)
      const absolutePath = resolveManaged(relativePath)
      const info = await stat(absolutePath)
      response.statusCode = 200
      response.setHeader('content-type', contentType)
      response.setHeader('content-length', String(info.size))
      await pipeline(createReadStream(absolutePath), response)
      return
    }

    if (request.method === 'GET' && request.url === '/health') {
      const localModels = await listOllamaModels(OLLAMA_URL).catch(() => [])
      const whisperModels = await listWhisperModels()
      const piperVoices = await listPiperVoices()
      const comfy = await detectComfyUi(COMFYUI_URL)
      const comfyTemplates = comfy.available ? await listComfyTemplates() : []
      const hasImageTemplates = comfyTemplates.some((template) => template.mediaType === 'image')
      const hasVideoTemplates = comfyTemplates.some((template) => template.mediaType === 'video')
      return send(response, 200, {
        ok: true,
        type: 'health',
        handshake: {
          workerId: WORKER_ID,
          name: 'KINAOU Mac Worker',
          platform: process.platform,
          version: VERSION,
          capabilities: ['filesystem', 'ffmpeg', 'media-probe', 'asset-upload', 'media-proxy', 'media-thumbnail', 'media-waveform', ...(localModels.length ? ['local-llm', 'director-plan'] : []), ...(WHISPER_CLI && whisperModels.length && versions.ffmpeg ? ['speech-to-text'] : []), ...(PIPER_CLI && piperVoices.length && versions.ffprobe ? ['text-to-speech'] : []), ...(comfy.available && hasImageTemplates ? ['image-generation'] : []), ...(comfy.available && hasVideoTemplates ? ['video-generation'] : [])],
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

    if (request.method === 'GET' && request.url === '/models/local') {
      const models = await listOllamaModels(OLLAMA_URL)
      return send(response, 200, { ok: true, type: 'local-models', models })
    }

    if (request.method === 'POST' && request.url === '/director/generate') {
      const body = await readJson(request)
      const localModels = await listOllamaModels(OLLAMA_URL).catch(() => [])
      if (!localModels.some((item) => item.id === body.model)) throw capabilityError('Requested local model is not installed')
      const plan = await generateDirectorPlan(OLLAMA_URL, body.model, body.brief)
      return send(response, 200, { ok: true, type: 'director-plan', plan })
    }

    if (request.method === 'POST' && request.url === '/ai-editor/generate') {
      const body = await readJson(request)
      const localModels = await listOllamaModels(OLLAMA_URL).catch(() => [])
      if (!localModels.some((item) => item.id === body.model)) throw capabilityError('Requested local model is not installed')
      return send(response, 200, { ok: true, type: 'ai-editor-proposal', proposal: await generateAiEditorProposal(OLLAMA_URL, body.model, body.instruction, body.context) })
    }

    if (request.method === 'GET' && request.url === '/stt/models') {
      return send(response, 200, { ok: true, type: 'stt-models', models: await listWhisperModels() })
    }

    if (request.method === 'POST' && request.url === '/stt/jobs') {
      const body = await readJson(request)
      const job = await createSttJob(body)
      queueMicrotask(() => executeSttJob(job.id).catch(() => {}))
      return send(response, 202, { ok: true, type: 'stt-job', job: publicSttJob(job) })
    }

    const sttStatusMatch = request.url?.match(/^\/stt\/jobs\/([^/]+)$/)
    if (request.method === 'GET' && sttStatusMatch) return send(response, 200, { ok: true, type: 'stt-job', job: publicSttJob(requireSttJob(decodeURIComponent(sttStatusMatch[1]))) })
    const sttCancelMatch = request.url?.match(/^\/stt\/jobs\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && sttCancelMatch) {
      const job = requireSttJob(decodeURIComponent(sttCancelMatch[1]))
      cancelSttJob(job)
      return send(response, 200, { ok: true, type: 'stt-job', job: publicSttJob(job) })
    }

    if (request.method === 'GET' && request.url === '/tts/voices') return send(response, 200, { ok: true, type: 'tts-voices', voices: await listPiperVoices() })
    if (request.method === 'POST' && request.url === '/tts/jobs') {
      const job = await createTtsJob(await readJson(request))
      queueMicrotask(() => executeTtsJob(job.id).catch(() => {}))
      return send(response, 202, { ok: true, type: 'tts-job', job: publicTtsJob(job) })
    }
    const ttsStatusMatch = request.url?.match(/^\/tts\/jobs\/([^/]+)$/)
    if (request.method === 'GET' && ttsStatusMatch) return send(response, 200, { ok: true, type: 'tts-job', job: publicTtsJob(requireTtsJob(decodeURIComponent(ttsStatusMatch[1]))) })
    const ttsCancelMatch = request.url?.match(/^\/tts\/jobs\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && ttsCancelMatch) {
      const job = requireTtsJob(decodeURIComponent(ttsCancelMatch[1])); cancelTtsJob(job)
      return send(response, 200, { ok: true, type: 'tts-job', job: publicTtsJob(job) })
    }

    const templatesMatch = request.url === '/image/templates' ? 'image' : request.url === '/video/templates' ? 'video' : null
    if (request.method === 'GET' && templatesMatch) {
      const comfyui = await detectComfyUi(COMFYUI_URL)
      const templates = (await listComfyTemplates()).filter((template) => template.mediaType === templatesMatch)
      return send(response, 200, { ok: true, type: `${templatesMatch}-templates`, comfyui, templates })
    }
    const jobsMatch = request.url === '/image/jobs' ? 'image' : request.url === '/video/jobs' ? 'video' : null
    if (request.method === 'POST' && jobsMatch) {
      const job = await createGenerationJob(await readJson(request), jobsMatch)
      queueMicrotask(() => executeGenerationJob(job.id).catch(() => {}))
      return send(response, 202, { ok: true, type: `${jobsMatch}-job`, job: publicGenerationJob(job) })
    }
    const generationStatusMatch = request.url?.match(/^\/(image|video)\/jobs\/([^/]+)$/)
    if (request.method === 'GET' && generationStatusMatch) {
      const job = requireGenerationJob(decodeURIComponent(generationStatusMatch[2]), generationStatusMatch[1])
      return send(response, 200, { ok: true, type: `${generationStatusMatch[1]}-job`, job: publicGenerationJob(job) })
    }
    const generationCancelMatch = request.url?.match(/^\/(image|video)\/jobs\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && generationCancelMatch) {
      const job = requireGenerationJob(decodeURIComponent(generationCancelMatch[2]), generationCancelMatch[1])
      cancelGenerationJob(job)
      return send(response, 200, { ok: true, type: `${generationCancelMatch[1]}-job`, job: publicGenerationJob(job) })
    }

    if (request.method === 'POST' && request.url === '/probe') {
      const body = await readJson(request)
      const relativePath = requireManagedRelativePath(body.path)
      const absolutePath = resolveManaged(relativePath)
      await access(absolutePath)
      const result = await probeMedia(absolutePath)
      return send(response, 200, { ok: true, type: 'probe-media', result })
    }

    if (request.method === 'POST' && request.url === '/assets/proxy') {
      if (!versions.ffmpeg) throw capabilityError('ffmpeg is not available')
      const body = await readJson(request)
      const sourceRelativePath = requireManagedRelativePath(body.path)
      if (!sourceRelativePath.startsWith('KINAOU/Assets/')) throw unauthorizedPath('Proxy source must be inside KINAOU/Assets')
      const outputRelativePath = proxyRelativePath(sourceRelativePath)
      const sourceAbsolutePath = resolveManaged(sourceRelativePath)
      const outputAbsolutePath = resolveManaged(outputRelativePath)
      await access(sourceAbsolutePath)
      await mkdir(path.dirname(outputAbsolutePath), { recursive: true })
      await run('ffmpeg', buildProxyArgs(sourceAbsolutePath, outputAbsolutePath))
      const probe = await probeMedia(outputAbsolutePath)
      return send(response, 201, { ok: true, type: 'media-proxy', result: { path: outputRelativePath, probe } })
    }

    if (request.method === 'POST' && request.url === '/assets/thumbnail') {
      if (!versions.ffmpeg) throw capabilityError('ffmpeg is not available')
      const body = await readJson(request)
      const sourceRelativePath = requireManagedRelativePath(body.path)
      if (!sourceRelativePath.startsWith('KINAOU/Assets/')) throw unauthorizedPath('Thumbnail source must be inside KINAOU/Assets')
      const outputRelativePath = thumbnailRelativePath(sourceRelativePath)
      const sourceAbsolutePath = resolveManaged(sourceRelativePath)
      const outputAbsolutePath = resolveManaged(outputRelativePath)
      await access(sourceAbsolutePath)
      await mkdir(path.dirname(outputAbsolutePath), { recursive: true })
      await run('ffmpeg', buildThumbnailArgs(sourceAbsolutePath, outputAbsolutePath))
      const info = await stat(outputAbsolutePath)
      return send(response, 201, { ok: true, type: 'media-thumbnail', result: { path: outputRelativePath, sizeBytes: info.size } })
    }

    if (request.method === 'POST' && request.url === '/assets/waveform') {
      if (!versions.ffmpeg) throw capabilityError('ffmpeg is not available')
      const body = await readJson(request)
      const sourceRelativePath = requireManagedRelativePath(body.path)
      if (!sourceRelativePath.startsWith('KINAOU/Assets/')) throw unauthorizedPath('Waveform source must be inside KINAOU/Assets')
      const outputRelativePath = waveformRelativePath(sourceRelativePath)
      const sourceAbsolutePath = resolveManaged(sourceRelativePath)
      const outputAbsolutePath = resolveManaged(outputRelativePath)
      await access(sourceAbsolutePath)
      await mkdir(path.dirname(outputAbsolutePath), { recursive: true })
      await run('ffmpeg', buildWaveformArgs(sourceAbsolutePath, outputAbsolutePath))
      const info = await stat(outputAbsolutePath)
      return send(response, 201, { ok: true, type: 'media-waveform', result: { path: outputRelativePath, sizeBytes: info.size } })
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
  if (!normalized.startsWith('KINAOU/Renders/') && !normalized.startsWith('KINAOU/Cache/Previews/')) throw unauthorizedPath('Render output must stay inside KINAOU/Renders or KINAOU/Cache/Previews')
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
  if (!['export', 'preview'].includes(plan.purpose)) throw new Error('Invalid render purpose')
  if (plan.purpose === 'export' && !plan.outputRelativePath.startsWith('KINAOU/Renders/')) throw new Error('Export must target KINAOU/Renders')
  if (plan.purpose === 'preview' && !plan.outputRelativePath.startsWith('KINAOU/Cache/Previews/')) throw new Error('Preview must target KINAOU/Cache/Previews')
  for (const clip of plan.clips) {
    if (!Number.isFinite(clip.trackIndex) || clip.trackIndex < 0) throw new Error('Invalid track index')
    if (!Number.isFinite(clip.startMs) || clip.startMs < 0) throw new Error('Invalid clip start')
    if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) throw new Error('Invalid clip duration')
    if (!Number.isFinite(clip.sourceOffsetMs) || clip.sourceOffsetMs < 0) throw new Error('Invalid source offset')
    if (!Number.isFinite(clip.speed) || clip.speed < 0.25 || clip.speed > 4) throw new Error('Invalid clip speed')
    if ((clip.asset?.kind === 'image' || clip.asset?.kind === 'caption') && clip.speed !== 1) throw new Error('Speed retiming only supports video and audio')
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
    args.push('-ss', seconds(clip.sourceOffsetMs), '-t', seconds(clip.durationMs * (clip.asset.kind === 'image' ? 1 : clip.speed)), '-i', inputPaths[index])
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
    const timing = clip.asset.kind === 'image' || clip.speed === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${clip.speed}`
    parts.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,crop=iw-${transform.cropLeft}-${transform.cropRight}:ih-${transform.cropTop}-${transform.cropBottom}:${transform.cropLeft}:${transform.cropTop},scale=iw*${transform.scale}:ih*${transform.scale}${fadeFilters},setpts=${timing}+${start}/TB[${prepared}]`)
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
      const tempo = buildAtempoFilters(clip.speed)
      parts.push(`[${index}:a]atrim=0:${seconds(clip.durationMs * clip.speed)},asetpts=PTS-STARTPTS${tempo},atrim=0:${seconds(clip.durationMs)},volume=${clip.gain}${fades},adelay=${delay}|${delay}[${label}]`)
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

async function listWhisperModels() {
  if (!WHISPER_CLI || !path.isAbsolute(WHISPER_CLI)) return []
  try {
    await access(WHISPER_CLI)
    return whisperModelRelativePaths(await readdir(resolveManaged('KINAOU/Models'), { withFileTypes: true }))
  } catch { return [] }
}

async function createSttJob(input) {
  if (!versions.ffmpeg || !WHISPER_CLI) throw capabilityError('FFmpeg and KINAOU_WHISPER_CLI are required')
  const sourcePath = requireManagedRelativePath(input.sourcePath)
  if (!sourcePath.startsWith('KINAOU/Assets/')) throw unauthorizedPath('STT input must be inside KINAOU/Assets')
  const models = await listWhisperModels()
  if (!models.includes(input.modelPath)) throw capabilityError('Requested whisper.cpp model is not available in KINAOU/Models')
  await access(resolveManaged(sourcePath))
  const now = new Date().toISOString()
  const job = { id: crypto.randomUUID(), state: 'queued', progress: 0, createdAt: now, updatedAt: now, sourcePath, modelPath: input.modelPath, language: input.language ?? 'auto', child: null }
  sttJobs.set(job.id, job)
  return job
}

function requireSttJob(id) {
  const job = sttJobs.get(id)
  if (!job) { const error = new Error('STT job not found'); error.code = 'NOT_FOUND'; throw error }
  return job
}

function publicSttJob(job) {
  return { id: job.id, state: job.state, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt, ...(job.transcriptPath ? { transcriptPath: job.transcriptPath, transcript: job.transcript } : {}), ...(job.error ? { error: job.error } : {}) }
}

function touchSttJob(job) { job.updatedAt = new Date().toISOString() }

async function executeSttJob(id) {
  const job = requireSttJob(id)
  if (job.state === 'cancelled') return
  const relative = sttPaths(job.id)
  const absolute = Object.fromEntries(Object.entries(relative).map(([key, value]) => [key, resolveManaged(value)]))
  job.state = 'running'; job.progress = 0.05; touchSttJob(job)
  try {
    await mkdir(path.dirname(absolute.wav), { recursive: true })
    await mkdir(path.dirname(absolute.transcript), { recursive: true })
    const commands = buildSttCommands({ whisperCli: WHISPER_CLI, modelPath: resolveManaged(job.modelPath), sourcePath: resolveManaged(job.sourcePath), wavPath: absolute.wav, outputBase: absolute.outputBase, language: job.language })
    await runSttCommand(job, commands[0]); if (job.state === 'cancelled') return
    job.progress = 0.35; touchSttJob(job)
    await runSttCommand(job, commands[1]); if (job.state === 'cancelled') return
    const transcript = normalizeWhisperTranscript(JSON.parse(await readFile(absolute.transcript, 'utf8')))
    await writeFile(absolute.transcript, JSON.stringify(transcript, null, 2), 'utf8')
    job.state = 'succeeded'; job.progress = 1; job.transcriptPath = relative.transcript; job.transcript = transcript; touchSttJob(job)
  } catch (error) {
    if (job.state !== 'cancelled') { job.state = 'failed'; job.error = error instanceof Error ? error.message : String(error); touchSttJob(job) }
  } finally { await unlink(absolute.wav).catch(() => {}) }
}

async function runSttCommand(job, command) {
  const child = spawn(command.executable, command.args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
  job.child = child
  let stderr = ''
  child.stderr.on('data', (data) => { stderr += data.toString() })
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code) => code === 0 || job.state === 'cancelled' ? resolve() : reject(Object.assign(new Error(`STT process exited with code ${code}: ${stderr.trim()}`), { code: 'PROCESS_FAILED' }))) })
  job.child = null
}

function cancelSttJob(job) {
  if (['succeeded', 'failed', 'cancelled'].includes(job.state)) return
  job.state = 'cancelled'; touchSttJob(job)
  if (job.child && !job.child.killed) job.child.kill('SIGTERM')
}

async function listPiperVoices() {
  if (!PIPER_CLI || !path.isAbsolute(PIPER_CLI)) return []
  try { await access(PIPER_CLI); return piperVoiceRelativePaths(await readdir(resolveManaged('KINAOU/Models'), { withFileTypes: true })) } catch { return [] }
}

async function createTtsJob(input) {
  if (!PIPER_CLI || !versions.ffprobe) throw capabilityError('KINAOU_PIPER_CLI and ffprobe are required')
  const voices = await listPiperVoices()
  if (!voices.includes(input.voicePath)) throw capabilityError('Requested Piper voice is not available in KINAOU/Models')
  const now = new Date().toISOString()
  const job = { id: crypto.randomUUID(), state: 'queued', progress: 0, createdAt: now, updatedAt: now, voicePath: input.voicePath, text: validateTtsText(input.text), child: null }
  ttsJobs.set(job.id, job)
  return job
}

function requireTtsJob(id) {
  const job = ttsJobs.get(id)
  if (!job) { const error = new Error('TTS job not found'); error.code = 'NOT_FOUND'; throw error }
  return job
}

function publicTtsJob(job) {
  return { id: job.id, state: job.state, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt, voicePath: job.voicePath, ...(job.audioPath ? { audioPath: job.audioPath, durationMs: job.durationMs, sizeBytes: job.sizeBytes } : {}), ...(job.error ? { error: job.error } : {}) }
}

function touchTtsJob(job) { job.updatedAt = new Date().toISOString() }

async function executeTtsJob(id) {
  const job = requireTtsJob(id)
  if (job.state === 'cancelled') return
  const relative = ttsPaths(job.id)
  const textPath = resolveManaged(relative.text); const audioPath = resolveManaged(relative.audio)
  job.state = 'running'; job.progress = 0.1; touchTtsJob(job)
  try {
    await mkdir(path.dirname(textPath), { recursive: true }); await mkdir(path.dirname(audioPath), { recursive: true })
    await writeFile(textPath, job.text, { encoding: 'utf8', flag: 'wx' })
    const command = buildPiperCommand({ piperCli: PIPER_CLI, modelPath: resolveManaged(job.voicePath), textPath, audioPath })
    await runTtsCommand(job, command)
    if (job.state === 'cancelled') { await unlink(audioPath).catch(() => {}); return }
    const probe = await probeMedia(audioPath)
    job.state = 'succeeded'; job.progress = 1; job.audioPath = relative.audio; job.durationMs = probe.durationMs; job.sizeBytes = probe.sizeBytes; touchTtsJob(job)
  } catch (error) {
    await unlink(audioPath).catch(() => {})
    if (job.state !== 'cancelled') { job.state = 'failed'; job.error = error instanceof Error ? error.message : String(error); touchTtsJob(job) }
  } finally { await unlink(textPath).catch(() => {}) }
}

async function runTtsCommand(job, command) {
  const child = spawn(command.executable, command.args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] }); job.child = child
  let stderr = ''; child.stderr.on('data', (data) => { stderr += data.toString() })
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code) => code === 0 || job.state === 'cancelled' ? resolve() : reject(Object.assign(new Error(`TTS process exited with code ${code}: ${stderr.trim()}`), { code: 'PROCESS_FAILED' }))) })
  job.child = null
}

function cancelTtsJob(job) {
  if (['succeeded', 'failed', 'cancelled'].includes(job.state)) return
  job.state = 'cancelled'; touchTtsJob(job)
  if (job.child && !job.child.killed) job.child.kill('SIGTERM')
}

async function listComfyTemplates() {
  let entries
  try { entries = await readdir(resolveManaged('KINAOU/Models/ComfyUI/Workflows'), { withFileTypes: true }) } catch { return [] }
  const templates = []
  for (const relativePath of comfyWorkflowRelativePaths(entries)) {
    try {
      const absolutePath = resolveManaged(relativePath)
      if ((await stat(absolutePath)).size > MAX_WORKFLOW_FILE_BYTES) continue
      const template = validateComfyTemplate(JSON.parse(await readFile(absolutePath, 'utf8')))
      templates.push({ path: relativePath, id: template.id, label: template.label, mediaType: templateMediaType(template), supportsNegativePrompt: Boolean(template.bindings.negativePrompt), supportsWidth: Boolean(template.bindings.width), supportsHeight: Boolean(template.bindings.height) })
    } catch { /* an unreadable or invalid template file must not break discovery of the valid ones */ }
  }
  return templates
}

async function createGenerationJob(input, mediaType) {
  if (!(await detectComfyUi(COMFYUI_URL)).available) throw capabilityError('ComfyUI is not reachable on the configured localhost endpoint')
  const templatePath = requireManagedRelativePath(input?.templatePath)
  if (!templatePath.startsWith('KINAOU/Models/ComfyUI/Workflows/')) throw unauthorizedPath('ComfyUI templates must stay inside KINAOU/Models/ComfyUI/Workflows')
  const templates = await listComfyTemplates()
  if (!templates.some((template) => template.path === templatePath && template.mediaType === mediaType)) throw capabilityError(`Requested ComfyUI ${mediaType} workflow template is not available`)
  const template = JSON.parse(await readFile(resolveManaged(templatePath), 'utf8'))
  const id = crypto.randomUUID()
  const request = buildComfyPromptRequest(template, { positivePrompt: input.positivePrompt, negativePrompt: input.negativePrompt, seed: input.seed, width: input.width, height: input.height }, id)
  const now = new Date().toISOString()
  const job = {
    id, mediaType, state: 'queued', progress: 0, createdAt: now, updatedAt: now, templatePath,
    request: request.body, promptId: null, tempPath: null, missingPolls: 0,
    provenance: { ...request.provenance, mediaType, positivePrompt: String(input.positivePrompt).trim(), negativePrompt: typeof input.negativePrompt === 'string' ? input.negativePrompt.trim() : '' }
  }
  generationJobs.set(job.id, job)
  return job
}

function requireGenerationJob(id, mediaType) {
  const job = generationJobs.get(id)
  if (!job || job.mediaType !== mediaType) { const error = new Error(`${mediaType === 'video' ? 'Video' : 'Image'} job not found`); error.code = 'NOT_FOUND'; throw error }
  return job
}

function publicGenerationJob(job) {
  const result = job.mediaType === 'video'
    ? (job.videoPath ? { videoPath: job.videoPath, sizeBytes: job.sizeBytes, durationMs: job.durationMs, ...(job.width !== undefined ? { width: job.width, height: job.height } : {}) } : {})
    : (job.imagePath ? { imagePath: job.imagePath, sizeBytes: job.sizeBytes } : {})
  return { id: job.id, mediaType: job.mediaType, state: job.state, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt, templatePath: job.templatePath, provenance: job.provenance, ...result, ...(job.error ? { error: job.error } : {}) }
}

function touchGenerationJob(job) { job.updatedAt = new Date().toISOString() }

async function executeGenerationJob(id) {
  const job = generationJobs.get(id)
  if (!job || job.state === 'cancelled') return
  job.state = 'running'; job.progress = 0.05; touchGenerationJob(job)
  try {
    const submitted = await comfyJson('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job.request) })
    job.promptId = parseComfyPromptResponse(submitted)
    job.progress = 0.1; touchGenerationJob(job)
    const outputs = await waitForComfyOutputs(job)
    if (job.state === 'cancelled') return
    const output = pickComfyOutputForMediaType(outputs, job.mediaType)
    const extension = generatedMediaExtensionFor(output.filename, job.mediaType)
    const tempAbsolute = resolveManaged(job.mediaType === 'video' ? comfyTempVideoRelativePath(job.id, extension) : comfyTempImageRelativePath(job.id, extension))
    const finalRelative = job.mediaType === 'video' ? generatedVideoRelativePath(job.id, extension) : generatedImageRelativePath(job.id, extension)
    const finalAbsolute = resolveManaged(finalRelative)
    await mkdir(path.dirname(tempAbsolute), { recursive: true })
    await mkdir(path.dirname(finalAbsolute), { recursive: true })
    job.tempPath = tempAbsolute
    const sizeBytes = await downloadComfyOutputTo(tempAbsolute, output, job.mediaType === 'video' ? MAX_GENERATED_VIDEO_BYTES : MAX_GENERATED_IMAGE_BYTES)
    if (job.state === 'cancelled') return
    if (job.mediaType === 'video') {
      const probe = await probeMedia(tempAbsolute)
      if (!probe.durationMs || probe.durationMs <= 0) throw processFailed('Generated video has no readable duration')
      job.durationMs = probe.durationMs
      job.width = probe.width
      job.height = probe.height
    }
    if (job.state === 'cancelled') return
    await rename(tempAbsolute, finalAbsolute)
    job.tempPath = null
    job.state = 'succeeded'; job.progress = 1; job.sizeBytes = sizeBytes
    if (job.mediaType === 'video') job.videoPath = finalRelative
    else job.imagePath = finalRelative
    touchGenerationJob(job)
  } catch (error) {
    if (job.state !== 'cancelled') { job.state = 'failed'; job.error = error instanceof Error ? error.message : String(error); touchGenerationJob(job) }
  } finally {
    if (job.tempPath) { await unlink(job.tempPath).catch(() => {}); job.tempPath = null }
  }
}

async function waitForComfyOutputs(job) {
  const deadline = Date.now() + COMFYUI_JOB_TIMEOUT_MS
  while (true) {
    if (job.state === 'cancelled') return []
    const status = comfyHistoryStatus(await comfyJson(`/history/${job.promptId}`, { method: 'GET' }), job.promptId)
    if (status.phase === 'completed') return status.outputs
    if (status.phase === 'failed') throw processFailed(status.message)
    const queue = await comfyJson('/queue', { method: 'GET' }).catch(() => null)
    if (queue) {
      const phase = comfyQueuePhase(queue, job.promptId)
      if (phase === 'running') { job.missingPolls = 0; job.progress = Math.max(job.progress, 0.5) }
      else if (phase === 'pending') { job.missingPolls = 0; job.progress = Math.max(job.progress, 0.15) }
      else if ((job.missingPolls += 1) > 5) throw processFailed('ComfyUI no longer reports the submitted prompt')
      touchGenerationJob(job)
    }
    if (Date.now() > deadline) throw processFailed(`ComfyUI ${job.mediaType} generation timed out`)
    await sleep(COMFYUI_POLL_MS)
  }
}

async function downloadComfyOutputTo(absolutePath, output, maxBytes) {
  const response = await fetch(`${COMFYUI_URL}/view?${comfyOutputQuery(output)}`, { signal: AbortSignal.timeout(10 * 60_000) })
  if (!response.ok || !response.body) throw processFailed(`ComfyUI output download failed with HTTP ${response.status}`)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maxBytes) throw processFailed('Generated output exceeds the size limit')
  let bytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (bytes > maxBytes) return callback(processFailed('Generated output exceeds the size limit'))
      callback(null, chunk)
    }
  })
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(absolutePath, { flags: 'wx' }))
  } catch (error) {
    await unlink(absolutePath).catch(() => {})
    throw error
  }
  if (!bytes) { await unlink(absolutePath).catch(() => {}); throw processFailed('Generated output is empty') }
  return bytes
}

function cancelGenerationJob(job) {
  if (['succeeded', 'failed', 'cancelled'].includes(job.state)) return
  job.state = 'cancelled'; touchGenerationJob(job)
  const promptId = job.promptId
  if (!promptId) return
  queueMicrotask(async () => {
    try {
      const phase = comfyQueuePhase(await comfyJson('/queue', { method: 'GET' }), promptId)
      if (phase === 'pending') await comfyJson('/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delete: [promptId] }) })
      else if (phase === 'running') await fetch(`${COMFYUI_URL}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(15_000) })
    } catch { /* best-effort remote cancellation; the local job is already terminal */ }
  })
}

async function comfyJson(pathname, init) {
  const response = await fetch(`${COMFYUI_URL}${pathname}`, { ...init, signal: AbortSignal.timeout(15_000) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : typeof payload?.error?.message === 'string' ? payload.error.message : `ComfyUI request failed with HTTP ${response.status}`
    throw processFailed(message)
  }
  return payload
}

function processFailed(message) {
  const error = new Error(message)
  error.code = 'PROCESS_FAILED'
  return error
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

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

function buildAtempoFilters(speed) {
  const factors = []
  let remaining = speed
  while (remaining < 0.5) { factors.push(0.5); remaining /= 0.5 }
  while (remaining > 2) { factors.push(2); remaining /= 2 }
  if (Math.abs(remaining - 1) > 1e-9 || factors.length === 0) factors.push(remaining)
  return factors.filter((factor) => Math.abs(factor - 1) > 1e-9).map((factor) => `,atempo=${Number(factor.toFixed(6))}`).join('')
}

function normalizeError(error) {
  return { code: error?.code ?? 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}

function send(response, status, body) {
  response.statusCode = status
  response.end(JSON.stringify(body))
}
