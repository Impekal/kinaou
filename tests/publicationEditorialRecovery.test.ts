import { expect, it, vi } from 'vitest'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { applyPublicationPlan, reviewPublicationPlan } from '../src/core/publicationPlan'
import { applyPublicationEditorial, commitPublicationEditorial, invalidatePublicationEditorialReview, projectPublicationEditorial, publicationEditorialContext, publicationEditorialDraft, publicationEditorialReviewIsCurrent, reviewPublicationEditorial } from '../src/core/publicationEditorial'
import { PersistentVersionHistory } from '../src/core/versioning'

function fixture() {
  let project = createProject('Recovery fixture')
  project.script = 'A triangle has three sides.'
  const now = new Date('2026-09-29T00:00:00Z')
  for (const [jobId, format] of [['main', 'landscape'], ['short', 'vertical']] as const) project = recordSuccessfulExport(project, { jobId, label: jobId, format, outputRelativePath: `KINAOU/Renders/${jobId}.mp4`, range: { inMs: 0, outMs: 1000 }, durationMs: 1000, sceneIds: [], completedAt: now.toISOString() })
  return applyPublicationPlan(project, reviewPublicationPlan(project, { mainJobId: 'main', shorts: [{ jobId: 'short', offsetHours: 24 }], mainLocal: '2026-10-24T18:00', timeZone: 'Europe/Berlin', targetMarket: 'DE', rationale: 'Synthetic experiment' }, now), true, now)
}
function inspect(project: KinaouProject) {
  const proposal = publicationEditorialDraft(project)
  proposal.items = proposal.items.map(item => ({ ...item, title: 'Triangle', description: 'Three sides', tags: ['geometry'], rationale: 'Explain sides', sourceQuote: project.script }))
  return reviewPublicationEditorial(project, publicationEditorialContext(project), proposal, { kind: 'local-model', adapterId: 'ollama', modelId: 'synthetic-local', edited: true, languagePass: { adapterId: 'ollama', modelId: 'synthetic-translator', outputLanguage: 'de' } })
}
const dependencies = () => ({ snapshot: vi.fn((_project: KinaouProject) => {}), persist: vi.fn((_project: KinaouProject) => {}) })

it('retries identical prepared editorial bytes with one safety snapshot and unchanged source/media/plan', () => {
  const project = fixture(), before = JSON.stringify(project), review = inspect(project), deps = dependencies(), payloads: string[] = []
  deps.persist.mockImplementation(value => { payloads.push(JSON.stringify(value)); if (payloads.length < 3) throw Error('disk unavailable') })
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow('disk unavailable')
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow('disk unavailable')
  const next = commitPublicationEditorial(project, review, true, deps)
  expect(new Set(payloads).size).toBe(1); expect(deps.snapshot).toHaveBeenCalledTimes(1)
  expect(projectPublicationEditorial(next)?.revision).toBe(1)
  expect(next.script).toBe(project.script); expect(next.tracks).toEqual(project.tracks); expect(next.metadata.publicationPlan).toEqual(project.metadata.publicationPlan)
  expect(JSON.stringify(project)).toBe(before)
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow('current unchanged')
  expect(deps.persist).toHaveBeenCalledTimes(3)
})
it('failed safety snapshot prevents persistence and is retried before the first write', () => {
  const project = fixture(), review = inspect(project), deps = dependencies()
  deps.snapshot.mockImplementationOnce(() => { throw Error('history unavailable') })
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow('history unavailable')
  expect(deps.persist).not.toHaveBeenCalled()
  commitPublicationEditorial(project, review, true, deps)
  expect(deps.snapshot).toHaveBeenCalledTimes(2); expect(deps.persist).toHaveBeenCalledTimes(1)
})
it.each(['title', 'script', 'plan', 'tracks', 'metadata'] as const)('permanently retires observed project %s A–B–A changes', field => {
  const project = fixture(), changed = structuredClone(project), review = inspect(project), deps = dependencies()
  if (field === 'title') changed.title += ' changed'
  if (field === 'script') changed.script += ' changed'
  if (field === 'plan') delete changed.metadata.publicationPlan
  if (field === 'tracks') changed.tracks = []
  if (field === 'metadata') changed.metadata.other = 'changed'
  if (field === 'tracks' && JSON.stringify(changed.tracks) === JSON.stringify(project.tracks)) changed.tracks.push({ id: 'new', name: 'New', type: 'video', locked: false, muted: false, clips: [] })
  expect(publicationEditorialReviewIsCurrent(changed, review)).toBe(false)
  expect(publicationEditorialReviewIsCurrent(project, review)).toBe(false)
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow()
  expect(deps.snapshot).not.toHaveBeenCalled(); expect(deps.persist).not.toHaveBeenCalled()
})
it('keeps acknowledgement refusal recoverable without taking history', () => {
  const project = fixture(), review = inspect(project), deps = dependencies()
  expect(() => commitPublicationEditorial(project, review, false, deps)).toThrow()
  expect(deps.snapshot).not.toHaveBeenCalled(); expect(publicationEditorialReviewIsCurrent(project, review)).toBe(true)
  commitPublicationEditorial(project, review, true, deps)
})
it.each(['copy', 'edit-and-return', 'explicit-invalidation'] as const)('rejects %s review without side effects', kind => {
  const project = fixture(), review = inspect(project), deps = dependencies()
  if (kind === 'edit-and-return') { const title = review.record.proposal.items[0].title; review.record.proposal.items[0].title = 'changed'; expect(publicationEditorialReviewIsCurrent(project, review)).toBe(false); review.record.proposal.items[0].title = title }
  if (kind === 'explicit-invalidation') invalidatePublicationEditorialReview(review)
  expect(() => commitPublicationEditorial(project, kind === 'copy' ? { ...review } : review, true, deps)).toThrow()
  expect(deps.snapshot).not.toHaveBeenCalled(); expect(deps.persist).not.toHaveBeenCalled()
})
it('isolates failed persistence callback mutations from the retained prepared retry', () => {
  const project = fixture(), review = inspect(project), deps = dependencies()
  deps.persist.mockImplementationOnce(value => { value.title = 'callback mutation'; (value.metadata.publicationEditorial as any).proposal.items[0].title = 'mutated'; throw Error('disk') })
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow('disk')
  const next = commitPublicationEditorial(project, review, true, deps)
  expect(next.title).toBe(project.title); expect(projectPublicationEditorial(next)?.proposal.items[0].title).toBe('Triangle')
  expect(deps.snapshot).toHaveBeenCalledTimes(1)
})
it('isolates safety callback mutations and blocks synchronous reentrant writes', () => {
  const project = fixture(), before = JSON.stringify(project), review = inspect(project), deps = dependencies()
  deps.snapshot.mockImplementation(value => { value.title = 'snapshot copy'; expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow('already in progress') })
  commitPublicationEditorial(project, review, true, deps)
  expect(JSON.stringify(project)).toBe(before); expect(deps.snapshot).toHaveBeenCalledTimes(1); expect(deps.persist).toHaveBeenCalledTimes(1)
})
it('detects baseline mutation during the safety callback before persisting', () => {
  const project = fixture(), review = inspect(project), deps = dependencies(), title = project.title
  deps.snapshot.mockImplementation(() => { project.title = 'external change' })
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow('changed during save')
  project.title = title
  expect(() => commitPublicationEditorial(project, review, true, deps)).toThrow()
  expect(deps.persist).not.toHaveBeenCalled()
})
it('serializes provenance and permits a new review after prior completion without replaying the old review', () => {
  const project = fixture(), review = inspect(project), deps = dependencies()
  const next = parseProject(JSON.parse(JSON.stringify(commitPublicationEditorial(project, review, true, deps))))
  expect(projectPublicationEditorial(next)?.provenance).toEqual(review.record.provenance)
  expect(() => applyPublicationEditorial(project, review, true)).toThrow()
  const second = commitPublicationEditorial(next, inspect(next), true, deps)
  expect(projectPublicationEditorial(second)?.revision).toBe(2); expect(deps.snapshot).toHaveBeenCalledTimes(2)
})
it('one real persistent safety version restores the project before editorial copy', () => {
  const project = fixture(), memory = new Map<string,string>(), history = new PersistentVersionHistory({ getItem: key => memory.get(key) ?? null, setItem: (key,value) => { memory.set(key,value) }, removeItem: key => { memory.delete(key) } })
  const next = commitPublicationEditorial(project, inspect(project), true, { snapshot: value => { history.snapshot(value, 'Before saving publication editorial copy', 'system') }, persist: () => {} })
  expect(history.list(project.id)).toHaveLength(1)
  const restored = history.restoreReversibly(next, history.list(project.id)[0].id).project
  expect(projectPublicationEditorial(restored)).toBeNull(); expect(restored.script).toBe(project.script); expect(restored.metadata.publicationPlan).toEqual(project.metadata.publicationPlan)
})
