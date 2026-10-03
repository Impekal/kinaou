import { z } from 'zod'
import { normalizeOllamaUrl } from './ollama.mjs'
async function boundedJson(response) {
  if (!response.ok) throw Error(`Local script request failed with HTTP ${response.status}`)
  const reader = response.body?.getReader(); if (!reader) throw Error('Local model returned no body')
  const decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, raw = ''
  try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 1_000_000) throw Error('Local script response too large'); raw += decoder.decode(part.value, { stream: true }) } raw += decoder.decode() }
  catch (cause) { await reader.cancel().catch(() => {}); throw cause } finally { reader.releaseLock() }
  return JSON.parse(raw)
}
/** Only trusted adapter code builds body; caller data belongs inside the prompt. */
export async function requestLocalCourseDraft(baseUrl, model, body, fetchImpl = fetch, contextTokens = 8192) {
  const modelId = z.string().trim().min(1).max(200).parse(model), base = normalizeOllamaUrl(baseUrl)
  const metadata = await boundedJson(await fetchImpl(`${base}/api/show`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: modelId, verbose: false }) }))
  if (metadata.remote_host || metadata.remote_model || typeof metadata.model_info?.['general.architecture'] !== 'string' || !metadata.model_info['general.architecture'].trim()) throw Error('Local course drafting requires verified local model metadata; remote or unknown models are blocked')
  if (contextTokens > 8192) {
    const maximum = metadata.model_info[`${metadata.model_info['general.architecture']}.context_length`]
    if (!Number.isSafeInteger(maximum) || maximum < contextTokens) throw Error('Exercise drafting requires a verified local model context window of at least 32768 tokens')
  }
  const response = await fetchImpl(`${base}/api/generate`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10 * 60000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, model: modelId, stream: false, options: { temperature: 0, num_ctx: contextTokens, num_predict: 4096 } }) })
  const payload = await boundedJson(response)
  if (payload.remote_host || payload.remote_model || typeof payload.response !== 'string') throw Error('Invalid or remote course response')
  return { proposal: JSON.parse(payload.response), modelId }
}
