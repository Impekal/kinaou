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
