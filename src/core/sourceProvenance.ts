import { z } from 'zod'
import { sourceImportRequestSchema, sourceImportResultSchema, validateSourceImportJob } from '../../worker/source-import-protocol.mjs'
import { parseProject, type KinaouProject } from './project'
import { isUiLanguage, type UiLanguage } from './uiLanguage'
import { translateUi, type UiMessageKey } from './uiMessages'

const recordSchema = z.object({ schemaVersion: z.literal(1), request: sourceImportRequestSchema, result: sourceImportResultSchema }).strict()
export interface SourceProvenanceFile { filename: string; mimeType: string; text: string }
export interface SourceProvenanceReview {
  name: string
  createdAt: string
  uses: number
  files: Record<'json' | 'text', SourceProvenanceFile>
}

/** Private, read-only inventory of retained declarations and requested timeline ranges. */
export function buildSourceProvenance(project: KinaouProject, assetId: string, language: UiLanguage, now = new Date()): SourceProvenanceReview {
  if (!isUiLanguage(language)) throw Error('Unsupported report language')
  const input = parseProject(project), assets = input.assets.filter(asset => asset.id === assetId)
  if (assets.length !== 1) throw Error('Select one unambiguous source asset')
  const asset = assets[0], record = recordSchema.parse(asset.metadata.sourceImport)
  const { request, result } = record
  validateSourceImportJob({ request, result, state: 'succeeded', receivedBytes: result.sizeBytes, createdAt: request.reviewedAt, updatedAt: result.retrievedAt })
  if (asset.kind !== 'video' || !asset.managed || asset.uri !== result.managedPath) throw Error('Source provenance is not bound to this managed video')
  const t = (key: UiMessageKey, values?: Record<string, string | number>) => translateUi(language, key, values)
  const uses = input.tracks.flatMap(track => track.clips.filter(clip => clip.assetId === asset.id).map(clip => {
    const timelineEndMs = clip.startMs + clip.durationMs, sourceEndMs = clip.sourceOffsetMs + clip.durationMs * clip.speed
    if (!Number.isSafeInteger(timelineEndMs) || !Number.isFinite(sourceEndMs) || sourceEndMs > Number.MAX_SAFE_INTEGER) throw Error('Source range exceeds safe numeric bounds')
    return { trackId: track.id, trackName: track.name, trackType: track.type, trackMuted: track.muted, clipId: clip.id,
      timelineStartMs: clip.startMs, timelineEndMs, sourceStartMs: clip.sourceOffsetMs, sourceEndMs, speed: clip.speed,
      exceedsRetainedDuration: sourceEndMs > result.probe.durationMs + 1 }
  }))
  const createdAt = now.toISOString(), name = typeof asset.metadata.name === 'string' ? asset.metadata.name : request.name
  const payload = { schemaVersion: 1, type: 'kinaou-private-source-provenance', documentLanguage: language, createdAt,
    project: { id: input.id, title: input.title }, asset: { id: asset.id, name, uri: asset.uri, reportedOffline: asset.offline },
    limitations: t('sourceReport.boundary'), legalClearance: false, currentFileHashReverified: false, finishedExportInspected: false,
    acquisition: record, timelineUses: uses }
  const lines = [t('sourceReport.heading'), t('sourceReport.private'), t('sourceReport.boundary'), '', name,
    t('sourceReport.created', { date: createdAt }), t('sourceReport.project') + ': ' + JSON.stringify(input.title),
    t('sourceImport.sourcePageUrl') + ': ' + request.sourcePageUrl, t('sourceImport.downloadUrl') + ': ' + request.downloadUrl,
    t('sourceReport.finalUrl') + ': ' + result.finalUrl, t('sourceReport.redirects') + ': ' + JSON.stringify(result.redirectUrls),
    t('sourceImport.creator') + ': ' + request.creator, t('sourceImport.permissionBasis') + ': ' + t(`sourceImport.${request.permissionBasis}`),
    t('sourceImport.evidence') + ':\n' + request.evidence, t('sourceImport.attribution') + ':\n' + request.attribution,
    t('sourceImport.intendedUse') + ':\n' + request.intendedUse, t('sourceReport.reviewed', { date: request.reviewedAt }),
    t('sourceReport.retrieved', { date: result.retrievedAt }), 'SHA-256: ' + result.sha256,
    t('sourceReport.measurements', { bytes: result.sizeBytes, duration: result.probe.durationMs, width: result.probe.width, height: result.probe.height }),
    t('sourceReport.storedPath') + ': ' + asset.uri, t(asset.offline ? 'assetList.offline' : 'assetList.available'), '', t('sourceReport.uses', { count: uses.length }), t('sourceReport.rangeRule')]
  for (const use of uses) lines.push('', JSON.stringify(use.trackName) + ' · ' + use.trackId + ' · ' + use.clipId,
    t('sourceReport.timelineRange', { start: use.timelineStartMs, end: use.timelineEndMs }), t('sourceReport.sourceRange', { start: use.sourceStartMs, end: use.sourceEndMs, speed: use.speed }),
    t(use.trackMuted ? 'sourceReport.muted' : 'sourceReport.notMuted'), ...(use.exceedsRetainedDuration ? [t('sourceReport.outOfBounds')] : []))
  const base = 'kinaou-source-' + request.id
  const files = { text: { filename: base + '.txt', mimeType: 'text/plain;charset=utf-8', text: lines.join('\n') + '\n' },
    json: { filename: base + '.json', mimeType: 'application/json;charset=utf-8', text: JSON.stringify(payload, null, 2) + '\n' } }
  for (const file of Object.values(files)) if (new TextEncoder().encode(file.text).length > 4 * 1024 ** 2) throw Error('Source provenance report exceeds 4 MiB')
  return { name, createdAt, uses: uses.length, files }
}

/** Acknowledgement is for these exact visible bytes, never an automatic public attribution. */
export class SourceProvenanceSession {
  private signature = ''
  private generation = 0
  private reviews = new WeakMap<SourceProvenanceReview, { generation: number; bytes: string }>()
  observe(project: KinaouProject, assetId: string, language: UiLanguage) {
    const signature = JSON.stringify([project, assetId, language])
    if (signature !== this.signature) { this.signature = signature; this.generation++ }
    return this.generation
  }
  prepare(project: KinaouProject, assetId: string, language: UiLanguage, now = new Date()) {
    this.observe(project, assetId, language)
    const review = buildSourceProvenance(project, assetId, language, now)
    this.reviews.set(review, { generation: this.generation, bytes: JSON.stringify(review) })
    return review
  }
  current(review: SourceProvenanceReview) {
    const retained = this.reviews.get(review)
    return !!retained && retained.generation === this.generation && retained.bytes === JSON.stringify(review)
  }
  download(review: SourceProvenanceReview, format: 'json' | 'text', acknowledged: boolean) {
    if (acknowledged !== true || !this.current(review) || !['text', 'json'].includes(format)) throw Error('Review and acknowledge the current source report first')
    return { ...review.files[format] }
  }
}
