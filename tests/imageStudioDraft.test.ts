import { expect, it, vi } from 'vitest'
import { reviewImageDraft } from '../src/core/imageStudioDraft'
import { createProject, parseProject } from '../src/core/project'
import { commitSceneAssignment } from '../src/core/sceneAssignmentCommit'
import { PersistentVersionHistory } from '../src/core/versioning'
import { ProjectRepository } from '../src/core/persistence'
const template = { path: 'KINAOU/Models/ComfyUI/Workflows/test.json', id: 'test', label: 'Test', mediaType: 'image' as const, supportsNegativePrompt: true, supportsWidth: true, supportsHeight: true }
const draft = { positivePrompt: 'Original prompt', negativePrompt: 'blur', seed: '42', width: '64', height: '4096' }
it('validates worker-compatible parameters without mutating the draft', () => {
  expect(reviewImageDraft(template, draft).parameters).toEqual({ templatePath: template.path, positivePrompt: draft.positivePrompt, negativePrompt: 'blur', seed: 42, width: 64, height: 4096 })
  expect(draft.seed).toBe('42')
})
it.each(['', ' ', '-1', '1.2', '9007199254740992'])('rejects invalid or blank seed %j', seed => expect(reviewImageDraft(template, { ...draft, seed }).issue).toBe('seed'))
it.each(['', '63', '65', '4104', 'Infinity'])('rejects worker-incompatible dimension %j', width => expect(reviewImageDraft(template, { ...draft, width }).issue).toBe('dimensions'))
it('does not silently drop unsupported negative prompts or submit a video template', () => {
  expect(reviewImageDraft({ ...template, supportsNegativePrompt: false }, draft).issue).toBe('unsupportedNegative')
  expect(reviewImageDraft({ ...template, mediaType: 'video' }, draft).issue).toBe('template')
  expect(reviewImageDraft(null, draft).issue).toBe('template')
  expect(reviewImageDraft(template, { ...draft, positivePrompt: ' ' }).issue).toBe('prompt')
  expect(reviewImageDraft(template, { ...draft, negativePrompt: 'x'.repeat(20001) }).issue).toBe('negative')
  expect(reviewImageDraft({ ...template, supportsWidth: false, supportsHeight: false }, { ...draft, width: '', height: '' }).parameters).not.toHaveProperty('width')
})
function fixture() {
  const data = new Map<string, string>(), store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const history = new PersistentVersionHistory(store), repository = new ProjectRepository(store)
  let project = repository.save(parseProject({ ...createProject('Original'), storyboard: [{ id: 'scene', title: 'Scene', description: 'Visual direction', narration: 'Original spoken words', durationMs: 1000 }], assets: [{ id: 'image', kind: 'image', uri: 'KINAOU/Assets/image.png', managed: true }] }))
  const persist = vi.fn((next: typeof project) => { project = repository.save(next) })
  return { history, repository, persist, get project() { return project } }
}
it('assigns and clears reversibly, preserving narration, original media and reload', () => {
  const f = fixture(), initial = f.project
  commitSceneAssignment(f.project, 'scene', 'image', f.history, f.persist)
  expect(f.project.storyboard[0].assetId).toBe('image')
  commitSceneAssignment(f.project, 'scene', undefined, f.history, f.persist)
  expect(f.repository.load(f.project.id)?.storyboard).toEqual(initial.storyboard)
  expect(f.project.assets).toEqual(initial.assets)
  expect(f.history.restoreReversibly(f.project, f.history.list(f.project.id).at(-1)!.id).project.storyboard[0].assetId).toBe('image')
})
it('does not write or snapshot invalid assignments; history failure blocks the save', () => {
  const f = fixture(), snapshot = vi.fn(() => { throw Error('history full') })
  expect(() => commitSceneAssignment(f.project, 'missing', 'image', { snapshot }, f.persist)).toThrow()
  expect(snapshot).not.toHaveBeenCalled()
  expect(() => commitSceneAssignment(f.project, 'scene', 'image', { snapshot }, f.persist)).toThrow('history full')
  expect(f.persist).not.toHaveBeenCalled()
})
it('preserves saved assignment after a failed clear and preserves explicitly silent narration', () => {
  const f = fixture(); commitSceneAssignment(f.project, 'scene', 'image', f.history, f.persist)
  f.persist.mockImplementationOnce(() => { throw Error('project full') })
  expect(() => commitSceneAssignment(f.project, 'scene', undefined, f.history, f.persist)).toThrow('project full')
  expect(f.repository.load(f.project.id)?.storyboard[0].assetId).toBe('image')
  const silent = parseProject({ ...f.project, storyboard: f.project.storyboard.map(scene => ({ ...scene, narration: '' })) })
  commitSceneAssignment(silent, 'scene', undefined, f.history, f.persist)
  expect(f.project.storyboard[0].narration).toBe('')
})
