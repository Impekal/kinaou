import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { clearCourseInstructorReviews, courseInstructorInputSchema, courseInstructorReviewState, courseInstructorSignature, CourseInstructorReviewSession, projectCourseInstructorReviews, recordCourseInstructorReview, type CourseInstructorInput } from '../src/core/courseInstructorReview'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { CourseInstructorReviewPanel } from '../src/components/CourseInstructorReviewPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'

const input: CourseInstructorInput = { reviewer: 'TEST Reviewer', notes: 'Synthetic test assertion, not an actual teaching review.', checks: { accuracy: true, demonstrations: true, exercises: true } }
function memory(): KeyValueStore {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function fixture() {
  const project = createProject('Review course')
  const outline = newCourseOutline(project)
  outline.modules = [{ id: 'module', title: 'Module', lessons: [
    { id: 'lesson', title: 'Lesson', objective: '', script: 'Original', range: { inMs: 0, outMs: 1000 } },
    { id: 'second', title: 'Second', objective: '', range: { inMs: 1000, outMs: 2000 } }
  ] }]
  return saveCourseOutline(project, outline)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

it('requires explicit authored identity, scope notes and every review assertion', () => {
  expect(courseInstructorInputSchema.safeParse(input).success).toBe(true)
  for (const value of [{ ...input, reviewer: ' ' }, { ...input, notes: '' }, { ...input, notes: 'x'.repeat(4001) }, { ...input, verifiedByAi: true }]) {
    expect(courseInstructorInputSchema.safeParse(value).success).toBe(false)
  }
  for (const check of ['accuracy', 'demonstrations', 'exercises']) expect(courseInstructorInputSchema.safeParse({ ...input, checks: { ...input.checks, [check]: false } }).success).toBe(false)
})

it('records an explicit metadata-bound assertion without changing course revision or media', async () => {
  const project = fixture(), before = JSON.stringify(project)
  expect(projectCourseInstructorReviews(project)).toEqual([])
  expect(courseInstructorReviewState(project, 'lesson', await courseInstructorSignature(project))).toBe('none')
  const next = await recordCourseInstructorReview(project, 'lesson', input, new Date('2026-09-27T01:00:00Z'))
  expect(projectCourse(next)).toEqual(projectCourse(project))
  expect(next.assets).toEqual(project.assets); expect(next.tracks).toEqual(project.tracks)
  expect(JSON.stringify(project)).toBe(before)
  const record = projectCourseInstructorReviews(next)[0]
  expect(record.reviewedAt).toBe('2026-09-27T01:00:00.000Z')
  expect(record.scope).toBe('course-project-metadata-v1')
  expect(record.signature).toMatch(/^[a-f0-9]{64}$/)
  expect(record).not.toHaveProperty('platformApproved')
  expect(courseInstructorReviewState(next, 'lesson', await courseInstructorSignature(next))).toBe('current')
})

it('persists records, replaces only the same lesson and permits history restore/withdrawal', async () => {
  const first = await recordCourseInstructorReview(fixture(), 'lesson', input)
  const second = await recordCourseInstructorReview(first, 'second', { ...input, notes: 'Second lesson checked in test' })
  expect(projectCourseInstructorReviews(second)).toHaveLength(2)
  expect(courseInstructorReviewState(second, 'lesson', await courseInstructorSignature(second))).toBe('current')
  const replaced = await recordCourseInstructorReview(second, 'lesson', { ...input, notes: 'Explicit repeated assertion' })
  expect(projectCourseInstructorReviews(replaced)).toHaveLength(2)
  const storage = memory(), history = new PersistentVersionHistory(storage), repo = new ProjectRepository(storage)
  repo.save(parseProject(JSON.parse(JSON.stringify(replaced))))
  expect(projectCourseInstructorReviews(repo.load(replaced.id)!)).toEqual(projectCourseInstructorReviews(replaced))
  const checkpoint = history.snapshot(replaced, 'Before changing course instructor review', 'system')
  const cleared = clearCourseInstructorReviews(replaced)
  expect(projectCourseInstructorReviews(cleared)).toEqual([])
  expect(projectCourse(cleared)).toEqual(projectCourse(replaced))
  const restored = history.restoreReversibly(cleared, checkpoint.id)
  expect(projectCourseInstructorReviews(restored.project)).toEqual(projectCourseInstructorReviews(replaced))
  expect(projectCourseInstructorReviews(restored.safetyVersion.project)).toEqual([])
})

it.each(['course', 'assets', 'tracks', 'storyboard', 'script', 'metadata', 'identity'] as const)('invalidates an earlier assertion after %s changes', async kind => {
  const reviewed = await recordCourseInstructorReview(fixture(), 'lesson', input)
  let changed = structuredClone(reviewed)
  if (kind === 'course') { const outline = projectCourse(changed)!; outline.modules[0].lessons[1].objective = 'Changed another lesson'; changed = saveCourseOutline(changed, outline) }
  if (kind === 'assets') changed.assets.push({ id: 'new', uri: 'KINAOU/Assets/new.mp4', kind: 'video', managed: true, offline: false, metadata: {} })
  if (kind === 'tracks') changed.tracks.push({ id: 'new', type: 'video', name: 'New', muted: false, locked: false, clips: [] })
  if (kind === 'storyboard') changed.storyboard.push({ id: 'scene', title: 'Scene', description: '', durationMs: 1000 })
  if (kind === 'script') changed.script = 'New production script'
  if (kind === 'metadata') changed.metadata.exportSettings = { format: 'vertical' }
  if (kind === 'identity') changed.id = 'another-project'
  expect(courseInstructorReviewState(changed, 'lesson', await courseInstructorSignature(changed))).toBe('stale')
})

it('ignores timestamps and object-key order but never claims to detect changed file bytes', async () => {
  const project = fixture()
  project.metadata.example = { a: 1, b: 2 }
  const reviewed = await recordCourseInstructorReview(project, 'lesson', input)
  const changed = { ...reviewed, updatedAt: '2026-09-28T00:00:00Z', metadata: { ...reviewed.metadata, example: { b: 2, a: 1 } } }
  expect(await courseInstructorSignature(changed)).toBe(await courseInstructorSignature(reviewed))
  expect(courseInstructorReviewState(changed, 'lesson', await courseInstructorSignature(changed))).toBe('current')
})

it('fails closed for malformed or duplicate records and unknown lessons', async () => {
  const project = fixture()
  await expect(recordCourseInstructorReview(project, 'unknown', input)).rejects.toThrow()
  await expect(recordCourseInstructorReview(createProject('Empty'), 'lesson', input)).rejects.toThrow()
  const reviewed = await recordCourseInstructorReview(project, 'lesson', input)
  const record = projectCourseInstructorReviews(reviewed)[0]
  for (const ledger of [{ schemaVersion: 1, records: [record, record] }, { schemaVersion: 1, records: [{ ...record, signature: 'forged' }] },
    { schemaVersion: 1, records: Array.from({ length: 201 }, (_, index) => ({ ...record, lessonId: 'old-' + index })) }]) {
    const corrupt = { ...reviewed, metadata: { ...reviewed.metadata, courseInstructorReviews: ledger } }
    expect(() => projectCourseInstructorReviews(corrupt)).toThrow()
    expect(() => clearCourseInstructorReviews(corrupt)).toThrow()
    await expect(recordCourseInstructorReview(corrupt, 'lesson', input)).rejects.toThrow()
  }
})

it.each(['project-change', 'detach', 'newer-operation'] as const)('rejects a late digest after %s without invoking persistence', async kind => {
  const project = fixture(), gate = deferred<KinaouProject>(), commit = vi.fn()
  const session = new CourseInstructorReviewSession(() => gate.promise)
  session.bind(project)
  const pending = session.record(project, 'lesson', input, commit)
  let newer: Promise<boolean> | undefined
  if (kind === 'project-change') session.bind({ ...project, script: 'New' })
  if (kind === 'detach') session.detach()
  if (kind === 'newer-operation') newer = session.record(project, 'second', input, commit)
  gate.resolve(project)
  expect(await pending).toBe(false)
  if (newer) { expect(await newer).toBe(true); expect(commit).toHaveBeenCalledTimes(1) }
  else expect(commit).not.toHaveBeenCalled()
})

it('propagates persistence failure and retries only a new local record operation', async () => {
  const project = fixture(), session = new CourseInstructorReviewSession()
  session.bind(project)
  await expect(session.record(project, 'lesson', input, () => { throw new Error('Storage unavailable') })).rejects.toThrow('Storage unavailable')
  const commit = vi.fn()
  expect(await session.record(project, 'lesson', input, commit)).toBe(true)
  expect(commit).toHaveBeenCalledTimes(1)
})

it.each(uiLanguages)('renders unconfirmed review controls in %s without mutating or submitting', language => {
  const project = fixture(), changed = vi.fn(), before = JSON.stringify(project)
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseInstructorReviewPanel, { project, dirty: true, history: new PersistentVersionHistory(memory()), onProjectChange: changed }) }))
  expect(html).toContain(translateUi(language, 'course.review.heading'))
  expect(html).toContain(translateUi(language, 'course.review.draft'))
  expect(html).toContain('<button disabled="">' + translateUi(language, 'course.review.record'))
  expect(changed).not.toHaveBeenCalled(); expect(JSON.stringify(project)).toBe(before)
})
