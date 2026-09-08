const MAX_BRIEF_LENGTH = 50_000

export function normalizeOllamaUrl(value = 'http://127.0.0.1:11434') {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Ollama URL must be a localhost HTTP endpoint')
  return url.toString().replace(/\/$/, '')
}

export async function listOllamaModels(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(1500) })
  if (!response.ok) throw new Error(`Ollama model list failed with HTTP ${response.status}`)
  const payload = await response.json()
  if (!Array.isArray(payload.models)) throw new Error('Invalid Ollama model list')
  return payload.models.map((item) => ({ id: String(item.model ?? item.name ?? ''), sizeBytes: Number(item.size ?? 0) })).filter((item) => item.id && Number.isFinite(item.sizeBytes))
}

export async function generateDirectorPlan(baseUrl, model, brief, fetchImpl = fetch) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('Local model is required')
  if (typeof brief !== 'string' || !brief.trim() || brief.length > MAX_BRIEF_LENGTH) throw new Error('Brief must contain 1–50000 characters')
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10 * 60_000),
    body: JSON.stringify({ model: model.trim(), stream: false, options: { temperature: 0 }, format: directorJsonSchema(), prompt: `Create a production-ready video DirectorPlan from this brief. Return only the requested schema.\n\n${brief.trim()}` })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Ollama generation failed with HTTP ${response.status}`)
  if (typeof payload.response !== 'string') throw new Error('Ollama returned no structured response')
  const plan = JSON.parse(payload.response)
  plan.provenance = { kind: 'local-model', adapterId: 'ollama', modelId: model.trim() }
  return plan
}

export async function generateAiEditorProposal(baseUrl, model, instruction, context, fetchImpl = fetch) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('Local model is required')
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 4000) throw new Error('Edit instruction must contain 1–4000 characters')
  const contextJson = JSON.stringify(context)
  if (contextJson.length > 200_000) throw new Error('AI Editor context is too large')
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10 * 60_000), body: JSON.stringify({ model: model.trim(), stream: false, options: { temperature: 0 }, format: aiEditorJsonSchema(), prompt: `Propose safe edits for the supplied KINAOU timeline. Use only existing trackId/clipId values and allowed operation types. Return only the schema.\nInstruction: ${instruction.trim()}\nTimeline: ${contextJson}` }) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Ollama generation failed with HTTP ${response.status}`)
  if (typeof payload.response !== 'string') throw new Error('Ollama returned no structured response')
  const proposal = JSON.parse(payload.response)
  proposal.provenance = { kind: 'local-model', adapterId: 'ollama', modelId: model.trim() }
  return proposal
}

export async function generateMediaAcquisitionPlan(baseUrl, model, context, fetchImpl = fetch) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('Local model is required')
  const contextJson = JSON.stringify(context)
  if (contextJson.length > 200_000) throw new Error('Media plan context is too large')
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10 * 60_000),
    body: JSON.stringify({
      model: model.trim(), stream: false, options: { temperature: 0 }, format: mediaAcquisitionJsonSchema(),
      prompt: `For each storyboard scene below, propose how KINAOU should obtain its visual. Use exactly one item per scene that needs a visual, referencing the scene's exact id. Prefer "web-capture" with one concrete public https URL when the scene shows a real website; "app-capture" with the exact macOS application name when it shows a real desktop app; "generate-image" with a concrete visual prompt for illustrative or fictional visuals. Give a short rationale per item. Return only the schema.\nScenes: ${contextJson}`
    })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Ollama generation failed with HTTP ${response.status}`)
  if (typeof payload.response !== 'string') throw new Error('Ollama returned no structured response')
  const plan = JSON.parse(payload.response)
  plan.provenance = { kind: 'local-model', adapterId: 'ollama', modelId: model.trim() }
  return plan
}

function mediaAcquisitionJsonSchema() {
  const item = (kind, properties, required) => ({ type: 'object', properties: { kind: { const: kind }, sceneId: { type: 'string' }, rationale: { type: 'string' }, ...properties }, required: ['kind', 'sceneId', 'rationale', ...required] })
  return {
    type: 'object',
    required: ['schemaVersion', 'items'],
    properties: {
      schemaVersion: { const: 1 },
      items: {
        type: 'array', minItems: 1, maxItems: 100,
        items: { oneOf: [
          item('web-capture', { url: { type: 'string' } }, ['url']),
          item('app-capture', { appName: { type: 'string' } }, ['appName']),
          item('generate-image', { positivePrompt: { type: 'string' }, negativePrompt: { type: 'string' } }, ['positivePrompt'])
        ] }
      }
    }
  }
}

function aiEditorJsonSchema() {
  const target = { trackId: { type: 'string' }, clipId: { type: 'string' } }
  const edit = (type, properties, required = []) => ({ type: 'object', properties: { type: { const: type }, ...target, ...properties }, required: ['type', 'trackId', 'clipId', ...required] })
  return { type: 'object', properties: { schemaVersion: { const: 1 }, title: { type: 'string' }, objective: { type: 'string' }, operations: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' }, edit: { oneOf: [edit('move-clip', { startMs: { type: 'integer', minimum: 0 } }, ['startMs']), edit('trim-clip', { startMs: { type: 'integer', minimum: 0 }, durationMs: { type: 'integer', minimum: 1 }, sourceOffsetMs: { type: 'integer', minimum: 0 } }, ['startMs', 'durationMs', 'sourceOffsetMs']), edit('set-clip-gain', { gain: { type: 'number', minimum: 0, maximum: 4 } }, ['gain']), edit('set-clip-speed', { speed: { type: 'number', minimum: .25, maximum: 4 } }, ['speed']), edit('set-clip-fades', { inMs: { type: 'integer', minimum: 0, maximum: 5000 }, outMs: { type: 'integer', minimum: 0, maximum: 5000 } }, ['inMs', 'outMs']), edit('update-caption-text', { text: { type: 'string' } }, ['text'])] } }, required: ['id', 'reason', 'edit'] } } }, required: ['schemaVersion', 'title', 'objective', 'operations'] }
}

function directorJsonSchema() {
  return {
    type: 'object',
    required: ['schemaVersion', 'title', 'objective', 'script', 'scenes'],
    properties: {
      schemaVersion: { const: 1 },
      title: { type: 'string' },
      objective: { type: 'string' },
      script: { type: 'string' },
      scenes: {
        type: 'array', minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'title', 'description', 'durationMs', 'narration', 'visualBrief', 'requiredMedia'],
          properties: {
            id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
            durationMs: { type: 'integer', minimum: 500 }, narration: { type: 'string' }, visualBrief: { type: 'string' },
            requiredMedia: { type: 'array', items: { enum: ['video', 'image', 'voice', 'music', 'sfx'] } }
          }
        }
      }
    }
  }
}
