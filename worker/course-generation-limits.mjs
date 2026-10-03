export const courseGenerationLimits = Object.freeze({ sourceBytes: 12000, requestBytes: 24000, contextTokens: 32768, outputTokens: 4096 })
/** Conservative UTF-8 bounds, not a tokenizer or a claim of semantic completeness. Never trim input. */
export function assertCourseSourceBudget(context) {
  if (new TextEncoder().encode(JSON.stringify(context)).length > courseGenerationLimits.sourceBytes) throw Error('Complete course drafting source exceeds 12,000 UTF-8 bytes; use a shorter complete lesson source, not a truncated request')
}
export function assertCourseRequestBudget(body) {
  if (!body || typeof body.prompt !== 'string' || typeof body.system !== 'string' || !body.format || new TextEncoder().encode(JSON.stringify(body)).length > courseGenerationLimits.requestBytes) throw Error('Complete course drafting prompt/schema exceeds the safe request budget; nothing was sent')
}
