import { z } from 'zod'

export const publicSourceLimits = Object.freeze({ htmlBytes: 1024 * 1024, textCharacters: 30000, redirects: 3, timeoutMs: 20000 })
export function publicSourceUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 2048 || /[\x00-\x20\x7f\\]/.test(value)) throw Error('Invalid public source URL')
  const url = new URL(value), host = url.hostname
  if (url.protocol !== 'https:' || url.username || url.password || url.port || host.length > 253 || !host.includes('.') ||
      !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /^[\d.]+$/.test(host) ||
      /(?:^|\.)(localhost|local|internal|test|invalid|example|onion|home|lan|arpa)$/.test(host)) throw Error('Only public HTTPS domain URLs on port 443 are supported')
  url.hash = ''
  return url.href
}
const urlSchema = z.string().transform(publicSourceUrl)
export const publicSourceRequestSchema = z.object({ url: urlSchema }).strict()
const clean = max => z.string().max(max).refine(value => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), 'Invalid source text')
export const publicSourceAttributionSchema = z.object({
  schemaVersion: z.literal(1), requestedUrl: urlSchema, finalUrl: urlSchema,
  redirectUrls: z.array(urlSchema).max(publicSourceLimits.redirects), retrievedAt: z.iso.datetime(),
  htmlSha256: z.string().regex(/^[a-f0-9]{64}$/), htmlBytes: z.number().int().positive().max(publicSourceLimits.htmlBytes),
  title: clean(500), declaredLanguage: z.string().regex(/^[a-zA-Z0-9-]{1,35}$/).nullable(),
  extraction: z.enum(['article','main','body']), verified: z.literal(false)
}).strict()
export const publicSourceResultSchema = publicSourceAttributionSchema.extend({ text: clean(publicSourceLimits.textCharacters).min(1), truncated: z.boolean() }).strict()
export function validatePublicSourceAttribution(value, request) {
  const expected = publicSourceRequestSchema.parse(request), result = publicSourceAttributionSchema.parse(value)
  const chain = [result.requestedUrl, ...result.redirectUrls]
  if (result.requestedUrl !== expected.url || chain.at(-1) !== result.finalUrl || new Set(chain).size !== chain.length) throw Error('Source response does not match the requested URL/redirect chain')
  return result
}
export function validatePublicSourceResult(value, request) {
  const result = publicSourceResultSchema.parse(value), {text,truncated,...attribution} = result
  validatePublicSourceAttribution(attribution,request)
  return result
}
