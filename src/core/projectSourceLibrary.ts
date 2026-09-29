import { validateSourceLibraryQuery, validateSourceLibraryPage, type SourceLibraryQuery, type SourceLibraryPage } from '../../worker/project-source-library-protocol.mjs'
import { validateSourceArchiveQuery, validateSourceArchiveJob, type SourceArchiveQuery, type SourceArchiveJob } from '../../worker/project-source-protocol.mjs'
export type { SourceLibraryPage, SourceLibraryQuery }
export interface SourceLibraryFeedback { phase: 'listing' | 'checking' | 'page' | 'job' | 'failed'; page?: SourceLibraryPage; job?: SourceArchiveJob; detail?: string }
/** Read-only, all-project discovery in the connected managed root. No ticket or storage writes. */
export class SourceLibrarySession {
  private active = true
  private busy = false
  constructor(private readonly deps: { current: () => boolean; client: {
    listProjectSourceArchives: (query: SourceLibraryQuery) => Promise<SourceLibraryPage>
    projectSourceArchiveStatus: (query: SourceArchiveQuery) => Promise<SourceArchiveJob>
  }; publish: (value: SourceLibraryFeedback) => void }) {}
  detach() { this.active = false }
  private current() { if (!this.deps.current()) this.detach(); return this.active }
  async list(after?: string) {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      const query = validateSourceLibraryQuery(after === undefined ? {} : { after })
      this.deps.publish({ phase: 'listing' })
      const page = validateSourceLibraryPage(await this.deps.client.listProjectSourceArchives(query), query)
      if (this.current()) this.deps.publish({ phase: 'page', page })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
  async inspect(value: SourceArchiveQuery) {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      const query = validateSourceArchiveQuery(value)
      this.deps.publish({ phase: 'checking' })
      const job = validateSourceArchiveJob(await this.deps.client.projectSourceArchiveStatus(query), query)
      if (this.current()) this.deps.publish({ phase: 'job', job })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
}
