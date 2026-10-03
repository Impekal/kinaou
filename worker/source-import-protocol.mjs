import { z } from 'zod'
import { publicSourceUrl } from './public-source-protocol.mjs'
export const sourceImportLimits = Object.freeze({ bytes: 512 * 1024 ** 2, timeoutMs: 300000, redirects: 3 })
const text = max => z.string().trim().min(1).max(max).refine(s => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))
export function sourceDownloadUrl(value) {
  const normalized = publicSourceUrl(value), url = new URL(normalized)
  if (url.search || /(?:^|\.)(youtube\.com|youtu\.be|googlevideo\.com|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com)$/.test(url.hostname) || !/\.mp4$/i.test(url.pathname)) throw Error('Only authorized direct public HTTPS MP4 URLs without queries are supported; platform page/player links are not download endpoints')
  return normalized
}
export const sourceImportIdSchema = z.string().uuid()
export const sourceImportRequestSchema = z.object({
  id: sourceImportIdSchema, projectId: text(200), name: text(150), downloadUrl: z.string().transform(sourceDownloadUrl), sourcePageUrl: z.string().transform(publicSourceUrl),
  creator: text(200), permissionBasis: z.enum(['own','permission','license']), evidence: text(4000), attribution: text(2000), intendedUse: text(2000),
  acquisitionConfirmed: z.literal(true), reuseConfirmed: z.literal(true), reviewedAt: z.iso.datetime()
}).strict()
const probe = z.object({ path: z.string(), sizeBytes: z.number().int().positive().max(sourceImportLimits.bytes), durationMs: z.number().positive().max(21600000), width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384), videoCodec: text(100), audioCodec: text(100).optional(), fps: z.number().positive().max(240).optional(), sampleRate: z.number().positive().max(384000).optional(), channels: z.number().int().positive().max(64).optional() }).strict()
export const sourceImportResultSchema = z.object({ managedPath:z.string(), sizeBytes:z.number().int().positive().max(sourceImportLimits.bytes), sha256:z.string().regex(/^[a-f0-9]{64}$/), requestedUrl:z.string().transform(sourceDownloadUrl), finalUrl:z.string().transform(sourceDownloadUrl), redirectUrls:z.array(z.string().transform(sourceDownloadUrl)).max(sourceImportLimits.redirects), retrievedAt:z.iso.datetime(), mimeType:z.literal('video/mp4'), probe, legalClearance:z.literal(false) }).strict()
export const sourceImportJobSchema = z.object({ request:sourceImportRequestSchema, state:z.enum(['queued','downloading','probing','committing','succeeded','failed','cancelled']), createdAt:z.iso.datetime(), updatedAt:z.iso.datetime(), receivedBytes:z.number().int().min(0).max(sourceImportLimits.bytes), result:sourceImportResultSchema.optional(), error:z.string().max(4000).optional() }).strict()
export const sourceImportPath = id => `KINAOU/Assets/SourceImports/${sourceImportIdSchema.parse(id)}/original.mp4`
export function validateSourceImportJob(value, request) {
  const job=sourceImportJobSchema.parse(value)
  if(request && JSON.stringify(job.request)!==JSON.stringify(sourceImportRequestSchema.parse(request)))throw Error('Source import acknowledgement differs from the reviewed request')
  if((job.state==='succeeded')!==Boolean(job.result))throw Error('Source import completion is inconsistent')
  if(job.result){const r=job.result,chain=[r.requestedUrl,...r.redirectUrls];if(r.managedPath!==sourceImportPath(job.request.id)||r.probe.path!==r.managedPath||r.sizeBytes!==r.probe.sizeBytes||job.receivedBytes!==r.sizeBytes||r.requestedUrl!==job.request.downloadUrl||chain.at(-1)!==r.finalUrl||new Set(chain).size!==chain.length)throw Error('Source import file/provenance mismatch')}
  return job
}
