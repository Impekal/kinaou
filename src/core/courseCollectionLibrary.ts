import { validateCollectionLibraryQuery, validateCollectionLibraryLookup, validateCollectionLibraryPage, validateCollectionLibraryInspection, type CollectionLibraryQuery, type CollectionLibraryLookup, type CollectionLibraryPage } from '../../worker/course-collection-library-protocol.mjs'
import type { CourseCollectionJob } from './courseDeliveryCollection'
export type { CollectionLibraryQuery, CollectionLibraryLookup, CollectionLibraryPage }
export interface CollectionLibraryFeedback { phase: 'listing' | 'checking' | 'page' | 'job' | 'failed'; page?: CollectionLibraryPage; job?: CourseCollectionJob; detail?: string }
/** Read-only discovery. No local-storage writes, copy routes or automatic retry. */
export class CollectionLibrarySession {
  private active = true
  private busy = false
  constructor(private readonly projectId: string, private readonly deps: { current: () => boolean; client: {
    listCourseCollections: (query: CollectionLibraryQuery) => Promise<CollectionLibraryPage>
    inspectCourseCollection: (lookup: CollectionLibraryLookup) => Promise<CourseCollectionJob>
  }; publish: (value: CollectionLibraryFeedback) => void }) {}
  detach() { this.active = false }
  private current() { if (!this.deps.current()) this.detach(); return this.active }
  async list(after?: string) {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      const query = validateCollectionLibraryQuery({ projectId: this.projectId, ...(after === undefined ? {} : { after }) })
      this.deps.publish({ phase: 'listing' })
      const page = validateCollectionLibraryPage(await this.deps.client.listCourseCollections(query), query)
      if (this.current()) this.deps.publish({ phase: 'page', page })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
  async inspect(requestId: string) {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      const lookup = validateCollectionLibraryLookup({ projectId: this.projectId, requestId })
      this.deps.publish({ phase: 'checking' })
      const job = validateCollectionLibraryInspection(await this.deps.client.inspectCourseCollection(lookup), lookup)
      if (this.current()) this.deps.publish({ phase: 'job', job })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
}
