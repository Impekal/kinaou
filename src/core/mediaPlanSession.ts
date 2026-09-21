import { parseProject, touchProject, type KinaouProject } from './project'
import { describeAcquisitionItem, parseMediaAcquisitionPlan, type MediaAcquisitionItem, type MediaAcquisitionPlan } from './mediaAcquisition'
import { assignAssetToScene } from './storyboardFulfillment'

export interface MediaPlanItemRun { status: 'running' | 'succeeded' | 'failed'; message?: string; outcome?: 'assigned' | 'alternative' }

export class MediaPlanDetachedError extends Error {
  constructor() { super('Media plan session detached. Accepted work may continue; inspect worker outputs before starting again.') }
}

/** One plan/run lifetime; accepted own writes advance its baseline, external edits never do. */
export class MediaPlanSession {
  private projectKey: string
  private ended = false
  private detached = false
  constructor(project: KinaouProject, private connection: string, private environment: () => { project: KinaouProject; connection: string }) {
    this.projectKey = JSON.stringify(project)
  }
  observe(project: KinaouProject, connection: string) {
    if (!this.ended && (JSON.stringify(project) !== this.projectKey || connection !== this.connection)) this.detach()
  }
  detach() { this.detached = true; this.ended = true }
  finish() { this.ended = true }
  get wasDetached() { return this.detached }
  get active() { return !this.ended }
  assertCurrent = () => {
    const current = this.environment()
    this.observe(current.project, current.connection)
    if (this.ended) throw new MediaPlanDetachedError()
  }
  save(next: KinaouProject, persist: (project: KinaouProject) => void) {
    this.assertCurrent()
    // Advance before synchronous React subscribers can observe this owned write.
    this.projectKey = JSON.stringify(next)
    try { persist(next) } catch (cause) { this.finish(); throw cause }
  }
}

/** Serial polling; a detached request cannot perform another read or publish its reply. */
export async function pollMediaPlanJob<T extends { id: string; state: string }>(job: T, status: (id: string) => Promise<T>, assertCurrent: () => void, wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 1000))): Promise<T> {
  const terminal = new Set(['succeeded', 'failed', 'cancelled'])
  let current = job
  assertCurrent()
  while (!terminal.has(current.state)) {
    await wait(); assertCurrent()
    const next = await status(job.id); assertCurrent()
    if (next.id !== job.id) throw new Error('Media job identity changed during polling')
    current = next
  }
  return current
}

export async function runMediaPlanItems(options: {
  session: MediaPlanSession; plan: MediaAcquisitionPlan; mode: 'auto' | 'reviewed'; project: KinaouProject
  snapshot: (project: KinaouProject) => void
  persist: (project: KinaouProject) => void
  acquire: (item: MediaAcquisitionItem, project: KinaouProject) => Promise<{ project: KinaouProject; uri: string }>
  onItem: (index: number, run: MediaPlanItemRun) => void
}) {
  const { session } = options
  session.assertCurrent()
  const plan = parseMediaAcquisitionPlan(options.plan, options.project)
  options.snapshot(options.project)
  let current = options.project
  const results: Array<{ sceneId: string; summary: string; status: string; message: string }> = []
  for (const [index, item] of plan.items.entries()) {
    session.assertCurrent()
    options.onItem(index, { status: 'running' })
    try {
      const result = await options.acquire(item, current)
      session.assertCurrent()
      let next = result.project
      const asset = next.assets.find(candidate => candidate.uri === result.uri)
      const scene = next.storyboard.find(candidate => candidate.id === item.sceneId)
      if (!asset || !scene) throw new Error('Acquisition result has no matching asset or scene')
      const message = !scene.assetId ? 'acquired and assigned to its scene' : 'acquired; kept as alternative because the scene is already fulfilled'
      if (!scene.assetId) next = assignAssetToScene(next, scene.id, asset.id)
      session.save(next, options.persist)
      current = next
      options.onItem(index, { status: 'succeeded', outcome: scene.assetId ? 'alternative' : 'assigned' })
      results.push({ sceneId: item.sceneId, summary: describeAcquisitionItem(item), status: 'succeeded', message })
    } catch (cause) {
      if (!session.wasDetached) options.onItem(index, { status: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
      // Never advance after unknown acceptance, registration failure or failed persistence.
      throw cause
    }
  }
  session.assertCurrent()
  const next = parseProject(touchProject({ ...current, metadata: { ...current.metadata, mediaAcquisition: { plan, mode: options.mode, completedAt: new Date().toISOString(), results } } }))
  session.save(next, options.persist)
  return next
}
