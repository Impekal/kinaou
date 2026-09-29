import { publishIntegrityResultSchema, publishPackageEntrySchema, publishPackageListSchema, type PublishIntegrityResult, type PublishPackageEntry } from './publishPackage'

export const manualSocialDestinations = {
  facebook: { name: 'Facebook', url: 'https://www.facebook.com/' },
  threads: { name: 'Threads', url: 'https://www.threads.com/' }
} as const
export type ManualSocialDestination = keyof typeof manualSocialDestinations

export interface ManualSocialHandoff {
  destination: ManualSocialDestination
  packagePath: string
  packagedAt: string
  sourcePath: string
  caption: string
  tags: string[]
  checkedAt: string
  sha256: string
}

/** Historical authored text + point-in-time local file evidence, never publication approval. */
export function prepareManualSocialHandoff(projectId: string, destination: ManualSocialDestination,
  input: PublishPackageEntry, evidence: PublishIntegrityResult): ManualSocialHandoff {
  if (destination !== 'facebook' && destination !== 'threads') throw new Error('Unsupported manual destination')
  const entry = publishPackageEntrySchema.parse(input)
  const result = publishIntegrityResultSchema.parse(evidence)
  const doc = entry.document
  if (doc.projectId !== projectId || doc.schemaVersion !== 3 || doc.platform !== 'generic' ||
    doc.placement !== 'generic' || !entry.sourceAvailable || result.status !== 'unchanged' ||
    result.packagePath !== entry.path || result.sourcePath !== doc.media.outputRelativePath ||
    result.expectedSha256 !== doc.integrity.sha256 || result.actualSha256 !== doc.integrity.sha256 ||
    result.sizeBytes !== doc.media.sizeBytes) throw new Error('Manual handoff evidence mismatch')
  return { destination, packagePath: entry.path, packagedAt: doc.createdAt,
    sourcePath: doc.media.outputRelativePath, caption: [doc.title, doc.description].filter(Boolean).join('\n\n'),
    tags: [...doc.tags], checkedAt: result.checkedAt, sha256: doc.integrity.sha256 }
}

interface HandoffReader {
  listPublishPackages(projectId: string): Promise<PublishPackageEntry[]>
  verifyPublishPackageIntegrity(path: string): Promise<PublishIntegrityResult>
}

/** No account, upload, write or retry operations. Late successes AND failures are discarded. */
export class ManualSocialHandoffSession {
  private generation = 0
  private entries = new Map<string, PublishPackageEntry>()
  constructor(private readonly projectId: string, private readonly destination: ManualSocialDestination,
    private readonly reader: HandoffReader) {}
  invalidate() { this.generation++ }
  async list(): Promise<PublishPackageEntry[] | null> {
    const generation = ++this.generation
    this.entries.clear()
    try {
      const response = await this.reader.listPublishPackages(this.projectId)
      if (generation !== this.generation) return null
      const eligible = publishPackageListSchema.parse(response).filter(({ document, sourceAvailable }) =>
        sourceAvailable && document.projectId === this.projectId && document.schemaVersion === 3 &&
        document.platform === 'generic' && document.placement === 'generic')
      if (new Set(eligible.map(entry => entry.path)).size !== eligible.length) throw new Error('Duplicate package paths')
      this.entries = new Map(eligible.map(entry => [entry.path, structuredClone(entry)]))
      return eligible
    } catch (cause) {
      if (generation !== this.generation) return null
      throw cause
    }
  }
  async verify(path: string): Promise<ManualSocialHandoff | null> {
    const entry = this.entries.get(path)
    if (!entry) throw new Error('Load a generic package first')
    const generation = ++this.generation
    try {
      const evidence = await this.reader.verifyPublishPackageIntegrity(path)
      if (generation !== this.generation) return null
      return prepareManualSocialHandoff(this.projectId, this.destination, entry, evidence)
    } catch (cause) {
      if (generation !== this.generation) return null
      throw cause
    }
  }
}
