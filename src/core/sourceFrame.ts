import { z } from 'zod'
import type { KinaouProject } from './project'
import type { MediaProbeResult } from './workerProtocol'
import { buildSourceProvenance } from './sourceProvenance'

const pathSchema = z.string().max(2000).refine(p => p.startsWith('KINAOU/Assets/') && p.endsWith('.mp4') && !/[\\\x00-\x1f\x7f]/.test(p) && !p.split('/').some(part => !part || part === '.' || part === '..'))
export const sourceFrameRequestSchema = z.object({ path: pathSchema, timeMs: z.number().int().min(0).max(21600000 - 1) }).strict()
export type SourceFrameRequest = z.infer<typeof sourceFrameRequestSchema>
export const sourceFrameResultSchema = z.object({ schemaVersion: z.literal(1), sourcePath: pathSchema, requestedMs: z.number().int().min(0).max(21600000 - 1), sourceDurationMs: z.number().int().positive().max(21600000), sourceSizeBytes: z.number().int().min(12).max(2 * 1024 ** 3), sourceWidth: z.number().int().positive().max(7680), sourceHeight: z.number().int().positive().max(7680), width: z.number().int().positive().max(1920), height: z.number().int().positive().max(1080), sizeBytes: z.number().int().min(33).max(16 * 1024 ** 2), sha256: z.string().regex(/^[a-f0-9]{64}$/), pngBase64: z.string().max(Math.ceil(16 * 1024 ** 2 / 3) * 4), extractedAt: z.string().datetime() }).strict()
export function sourceFrameSource(project: KinaouProject, assetId: string) {
  const matches = project.assets.filter(a => a.id === assetId), asset = matches[0]
  if (matches.length !== 1 || !asset || asset.kind !== 'video' || !asset.managed || asset.offline) throw Error('Select one available managed video')
  pathSchema.parse(asset.uri)
  if (asset.metadata.sourceImport !== undefined) buildSourceProvenance(project, assetId, 'en')
  if (new TextEncoder().encode(JSON.stringify(asset)).length > 48000) throw Error('Source provenance is too large to retain safely in a still image')
  return structuredClone(asset)
}
export async function parseSourceFrameResult(value: unknown, request: SourceFrameRequest) {
  const result = sourceFrameResultSchema.parse(value), expected = sourceFrameRequestSchema.parse(request)
  if (result.sourcePath !== expected.path || result.requestedMs !== expected.timeMs || result.requestedMs >= result.sourceDurationMs || result.sourceWidth * result.sourceHeight > 33177600) throw Error('Frame does not match the requested source/time')
  const binary = atob(result.pngBase64), bytes = new Uint8Array(binary.length)
  if (btoa(binary) !== result.pngBase64) throw Error('Invalid frame encoding')
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const header = new DataView(bytes.buffer)
  if (bytes.length !== result.sizeBytes || ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) || header.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR' || header.getUint32(16) !== result.width || header.getUint32(20) !== result.height) throw Error('Frame bytes do not match measured PNG')
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('')
  if (hash !== result.sha256) throw Error('Frame PNG hash differs')
  const { pngBase64: _data, ...record } = result
  return { record, file: new File([bytes], `source-frame-${crypto.randomUUID()}.png`, { type: 'image/png' }) }
}
export function sourceFrameMetadata(project: KinaouProject, assetId: string, frame: Awaited<ReturnType<typeof parseSourceFrameResult>>) {
  const sourceAsset = sourceFrameSource(project, assetId)
  if (frame.record.sourcePath !== sourceAsset.uri) throw Error('Frame source changed')
  const duration = sourceAsset.metadata.durationMs
  if (typeof duration === 'number' && Math.abs(duration - frame.record.sourceDurationMs) > 1) throw Error('Source duration differs from retained measurement; inspect the original first')
  return { sourceKind: 'extracted-video-frame-v1', extractionOnly: true, sourceAsset, extraction: structuredClone(frame.record), timing: 'requested-time-frame-quantized', sourceHashVerified: false }
}
export function validateSourceFrameProbe(probe: MediaProbeResult, frame: Awaited<ReturnType<typeof parseSourceFrameResult>>) {
  if (probe.videoCodec !== 'png' || probe.width !== frame.record.width || probe.height !== frame.record.height || probe.sizeBytes !== frame.file.size || probe.audioCodec) throw Error('Imported PNG does not match the reviewed source frame')
  return probe
}
