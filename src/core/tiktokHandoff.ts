import { publishIntegrityResultSchema, publishPackageEntrySchema, publishPackageListSchema, type PublishIntegrityResult, type PublishPackageEntry } from './publishPackage'

export interface TikTokHandoff {
  sourcePath: string
  title: string
  caption: string
  tags: string[]
  checkedAt: string
  sha256: string
}

/** Local evidence only: this is neither a platform approval nor a publication receipt. */
export function prepareTikTokHandoff(projectId: string, input: PublishPackageEntry, evidence: PublishIntegrityResult): TikTokHandoff {
  const entry = publishPackageEntrySchema.parse(input)
  const result = publishIntegrityResultSchema.parse(evidence)
  const doc = entry.document
  if (doc.projectId !== projectId || doc.schemaVersion !== 3 || doc.platform !== 'tiktok' ||
      doc.placement !== 'tiktok-video' || !entry.sourceAvailable ||
      result.status !== 'unchanged' || result.packagePath !== entry.path ||
      result.sourcePath !== doc.media.outputRelativePath ||
      result.expectedSha256 !== doc.integrity.sha256 || result.actualSha256 !== doc.integrity.sha256 ||
      result.sizeBytes !== doc.media.sizeBytes) throw new Error('TikTok handoff evidence mismatch')
  return {
    sourcePath: doc.media.outputRelativePath,
    title: doc.title,
    caption: [doc.title, doc.description].filter(Boolean).join('\n\n'),
    tags: [...doc.tags],
    checkedAt: result.checkedAt,
    sha256: doc.integrity.sha256
  }
}

interface HandoffReader {
  listPublishPackages(projectId: string): Promise<PublishPackageEntry[]>
  verifyPublishPackageIntegrity(path: string): Promise<PublishIntegrityResult>
}

/** Only two local read/hash operations are exposed. Superseded requests cannot restore old evidence. */
export class TikTokHandoffSession {
  private generation = 0
  private entries = new Map<string, PublishPackageEntry>()
  constructor(private readonly projectId: string, private readonly reader: HandoffReader) {}
  invalidate() { this.generation++ }
  async list(): Promise<PublishPackageEntry[] | null> {
    const generation = ++this.generation
    this.entries.clear()
    const entries = publishPackageListSchema.parse(await this.reader.listPublishPackages(this.projectId))
    if (generation !== this.generation) return null
    const eligible = entries.filter(({ document, sourceAvailable }) =>
      sourceAvailable && document.projectId === this.projectId && document.schemaVersion === 3 &&
      document.platform === 'tiktok' && document.placement === 'tiktok-video')
    this.entries = new Map(eligible.map(entry => [entry.path, structuredClone(entry)]))
    return eligible
  }
  async verify(path: string): Promise<TikTokHandoff | null> {
    const entry = this.entries.get(path)
    if (!entry) throw new Error('Load a TikTok package first')
    const generation = ++this.generation
    const result = await this.reader.verifyPublishPackageIntegrity(path)
    if (generation !== this.generation) return null
    return prepareTikTokHandoff(this.projectId, entry, result)
  }
}
