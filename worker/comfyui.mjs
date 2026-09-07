const MAX_PROMPT_LENGTH = 20_000
const MAX_WORKFLOW_BYTES = 1_000_000
const BINDING_KEYS = ['positivePrompt', 'negativePrompt', 'seed', 'width', 'height']

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
  if (!['png', 'jpg', 'webp'].includes(extension)) throw new Error('Unsupported generated image extension')
  return `KINAOU/Assets/GeneratedImages/${jobId}.${extension}`
}

export function validateComfyTemplate(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('Invalid ComfyUI template schema')
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
