const MAX_PROMPT_LENGTH = 20_000
const MAX_WORKFLOW_BYTES = 1_000_000
const BINDING_KEYS = ['positivePrompt', 'negativePrompt', 'seed', 'width', 'height']
const IMAGE_EXTENSIONS = ['png', 'jpg', 'webp']
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov']
const OUTPUT_FILENAME_PATTERN = /^[\w()][\w ().-]*\.(png|jpg|jpeg|webp|mp4|webm|mov)$/i
const EXTENSION_PATTERNS = { image: /\.(png|jpg|jpeg|webp)$/i, video: /\.(mp4|webm|mov)$/i }

export const MAX_WORKFLOW_FILE_BYTES = 2_000_000
export const MAX_GENERATED_IMAGE_BYTES = 100 * 1024 * 1024
export const MAX_GENERATED_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeComfyUrl(value = 'http://127.0.0.1:8188') {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('ComfyUI URL must be a localhost HTTP endpoint')
  if (url.username || url.password || url.search || url.hash) throw new Error('ComfyUI URL must not contain credentials, query parameters or a fragment')
  return url.toString().replace(/\/$/, '')
}

export function comfyWorkflowRelativePaths(entries) {
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry) => entry.isFile() && /^[a-zA-Z0-9][\w.-]*\.json$/.test(entry.name))
    .map((entry) => `KINAOU/Models/ComfyUI/Workflows/${entry.name}`)
    .sort()
}

export function generatedImageRelativePath(jobId, extension = 'png') {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid image job ID')
  if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error('Unsupported generated image extension')
  return `KINAOU/Assets/GeneratedImages/${jobId}.${extension}`
}

export function generatedVideoRelativePath(jobId, extension = 'mp4') {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid video job ID')
  if (!VIDEO_EXTENSIONS.includes(extension)) throw new Error('Unsupported generated video extension')
  return `KINAOU/Assets/GeneratedVideo/${jobId}.${extension}`
}

export function templateMediaType(template) {
  return template.mediaType === 'video' ? 'video' : 'image'
}

export function validateComfyTemplate(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('Invalid ComfyUI template schema')
  if (value.mediaType !== undefined && !['image', 'video'].includes(value.mediaType)) throw new Error('Invalid ComfyUI template media type')
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9][\w.-]{0,99}$/.test(value.id)) throw new Error('Invalid ComfyUI template ID')
  if (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 200) throw new Error('Invalid ComfyUI template label')
  if (!isRecord(value.workflow) || !Object.keys(value.workflow).length) throw new Error('ComfyUI workflow is required')
  if (JSON.stringify(value.workflow).length > MAX_WORKFLOW_BYTES) throw new Error('ComfyUI workflow is too large')
  for (const [nodeId, node] of Object.entries(value.workflow)) {
    if (!/^\d+$/.test(nodeId) || !isRecord(node) || typeof node.class_type !== 'string' || !node.class_type || !isRecord(node.inputs)) throw new Error(`Invalid ComfyUI workflow node ${nodeId}`)
  }
  if (!isRecord(value.bindings)) throw new Error('ComfyUI template bindings are required')
  for (const key of Object.keys(value.bindings)) if (!BINDING_KEYS.includes(key)) throw new Error(`Unsupported ComfyUI binding ${key}`)
  if (!value.bindings.positivePrompt) throw new Error('ComfyUI positivePrompt binding is required')
  for (const key of BINDING_KEYS) {
    const binding = value.bindings[key]
    if (binding === undefined) continue
    if (!isRecord(binding) || typeof binding.nodeId !== 'string' || typeof binding.input !== 'string' || !binding.input) throw new Error(`Invalid ComfyUI ${key} binding`)
    const node = value.workflow[binding.nodeId]
    if (!node || !Object.hasOwn(node.inputs, binding.input)) throw new Error(`ComfyUI ${key} binding does not reference an existing input`)
  }
  return value
}

function prompt(value, label, optional = false) {
  if (value === undefined && optional) return ''
  if (typeof value !== 'string') throw new Error(`${label} is required`)
  const normalized = value.trim()
  if ((!normalized && !optional) || normalized.length > MAX_PROMPT_LENGTH) throw new Error(`${label} must contain ${optional ? '0' : '1'}–${MAX_PROMPT_LENGTH} characters`)
  return normalized
}

function dimension(value, name) {
  if (!Number.isInteger(value) || value < 64 || value > 4096 || value % 8 !== 0) throw new Error(`${name} must be a multiple of 8 between 64 and 4096`)
  return value
}

export function materializeComfyWorkflow(templateValue, parameters) {
  const template = validateComfyTemplate(templateValue)
  if (!isRecord(parameters)) throw new Error('Image generation parameters are required')
  const values = {
    positivePrompt: prompt(parameters.positivePrompt, 'Positive prompt'),
    negativePrompt: prompt(parameters.negativePrompt, 'Negative prompt', true),
    seed: parameters.seed,
    width: parameters.width,
    height: parameters.height
  }
  if (!Number.isSafeInteger(values.seed) || values.seed < 0) throw new Error('Seed must be a non-negative safe integer')
  if (template.bindings.width) values.width = dimension(values.width, 'Width')
  if (template.bindings.height) values.height = dimension(values.height, 'Height')
  const workflow = structuredClone(template.workflow)
  for (const key of BINDING_KEYS) {
    const binding = template.bindings[key]
    if (binding) workflow[binding.nodeId].inputs[binding.input] = values[key]
  }
  return { workflow, provenance: { kind: 'local-model', adapterId: 'comfyui', templateId: template.id, seed: values.seed, width: template.bindings.width ? values.width : null, height: template.bindings.height ? values.height : null } }
}

export function buildComfyPromptRequest(template, parameters, clientId) {
  if (typeof clientId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(clientId)) throw new Error('Invalid ComfyUI client ID')
  const result = materializeComfyWorkflow(template, parameters)
  return { body: { prompt: result.workflow, client_id: clientId }, provenance: result.provenance }
}

export async function detectComfyUi(baseUrl, fetchImpl = fetch) {
  const url = normalizeComfyUrl(baseUrl)
  try {
    const response = await fetchImpl(`${url}/system_stats`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return { available: false }
    const payload = await response.json()
    const version = typeof payload?.system?.comfyui_version === 'string' ? payload.system.comfyui_version : undefined
    return { available: true, ...(version ? { version } : {}) }
  } catch {
    return { available: false }
  }
}

export function parseComfyPromptResponse(payload) {
  if (!isRecord(payload)) throw new Error('Invalid ComfyUI prompt response')
  if (isRecord(payload.node_errors) && Object.keys(payload.node_errors).length) throw new Error(`ComfyUI rejected workflow nodes: ${Object.keys(payload.node_errors).join(', ')}`)
  if (typeof payload.prompt_id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(payload.prompt_id)) throw new Error('ComfyUI returned an invalid prompt ID')
  return payload.prompt_id
}

export function comfyHistoryStatus(payload, promptId) {
  if (!isRecord(payload)) throw new Error('Invalid ComfyUI history response')
  const entry = payload[promptId]
  if (!isRecord(entry)) return { phase: 'waiting' }
  const status = isRecord(entry.status) ? entry.status : {}
  if (status.status_str === 'error') {
    const messages = Array.isArray(status.messages) ? status.messages : []
    const failure = messages.find((message) => Array.isArray(message) && message[0] === 'execution_error')
    const detail = isRecord(failure?.[1]) && typeof failure[1].exception_message === 'string' ? failure[1].exception_message : 'ComfyUI reported an execution error'
    return { phase: 'failed', message: detail }
  }
  if (status.completed !== true) return { phase: 'waiting' }
  const outputs = []
  for (const node of Object.values(isRecord(entry.outputs) ? entry.outputs : {})) {
    if (!isRecord(node)) continue
    for (const key of ['images', 'videos', 'gifs']) {
      if (!Array.isArray(node[key])) continue
      for (const item of node[key]) {
        if (isRecord(item) && item.type === 'output' && typeof item.filename === 'string') outputs.push({ filename: item.filename, subfolder: typeof item.subfolder === 'string' ? item.subfolder : '', type: 'output' })
      }
    }
  }
  if (!outputs.length) return { phase: 'failed', message: 'ComfyUI completed without a saved output' }
  return { phase: 'completed', outputs }
}

export function pickComfyOutputForMediaType(outputs, mediaType) {
  const pattern = EXTENSION_PATTERNS[mediaType]
  if (!pattern) throw new Error('Unsupported generation media type')
  const match = (Array.isArray(outputs) ? outputs : []).find((output) => pattern.test(String(output?.filename)))
  if (!match) throw new Error(`ComfyUI completed without a saved ${mediaType} output`)
  return match
}

export function comfyQueuePhase(payload, promptId) {
  if (!isRecord(payload)) return 'absent'
  const contains = (list) => Array.isArray(list) && list.some((entry) => Array.isArray(entry) && entry[1] === promptId)
  if (contains(payload.queue_running)) return 'running'
  if (contains(payload.queue_pending)) return 'pending'
  return 'absent'
}

export function comfyOutputQuery(output) {
  if (!isRecord(output) || output.type !== 'output') throw new Error('Only ComfyUI output files may be retrieved')
  if (typeof output.filename !== 'string' || output.filename.length > 200 || !OUTPUT_FILENAME_PATTERN.test(output.filename)) throw new Error('ComfyUI reported an unsupported output filename')
  const subfolder = output.subfolder ?? ''
  if (typeof subfolder !== 'string' || subfolder.length > 200 || subfolder.includes('..') || subfolder.includes('\\') || subfolder.startsWith('/')) throw new Error('ComfyUI reported an invalid output subfolder')
  return new URLSearchParams({ filename: output.filename, subfolder, type: 'output' }).toString()
}

export function generatedMediaExtensionFor(filename, mediaType = 'image') {
  const pattern = EXTENSION_PATTERNS[mediaType]
  if (!pattern) throw new Error('Unsupported generation media type')
  const match = pattern.exec(String(filename))
  if (!match) throw new Error(`Unsupported generated ${mediaType} extension`)
  const extension = match[1].toLowerCase()
  return extension === 'jpeg' ? 'jpg' : extension
}

export function comfyTempImageRelativePath(jobId, extension) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid image job ID')
  if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error('Unsupported generated image extension')
  return `KINAOU/Temp/GeneratedImages/${jobId}.${extension}.part`
}

export function comfyTempVideoRelativePath(jobId, extension) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid video job ID')
  if (!VIDEO_EXTENSIONS.includes(extension)) throw new Error('Unsupported generated video extension')
  return `KINAOU/Temp/GeneratedVideo/${jobId}.${extension}.part`
}
