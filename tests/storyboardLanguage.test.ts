import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StoryboardAssemblyPanel } from '../src/components/StoryboardAssemblyPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject, parseProject } from '../src/core/project'
import { assembleTimelineFromStoryboard } from '../src/core/storyboardAssembly'
import * as sync from '../src/core/sceneVisualSync'
import { commitStoryboardChange } from '../src/core/storyboardEditing'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages, type UiLanguage } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  return parseProject({ ...createProject('Original project'), assets: [
    { id: 'old', kind: 'image', uri: 'KINAOU/Assets/old.png', managed: true },
    { id: 'new', kind: 'video', uri: 'KINAOU/Assets/new.mp4', managed: true, metadata: { durationMs: 1500 } },
    { id: 'offline', kind: 'image', uri: 'KINAOU/Assets/offline.png', managed: true, offline: true }
  ], tracks: [{ id: 'main', type: 'video', name: 'Original <track>', clips: [
    { id: 'clip', sceneId: 'first', assetId: 'old', startMs: 0, durationMs: 4000, motion: 'zoom-in' },
    { id: 'offline-clip', sceneId: 'second', assetId: 'old', startMs: 4000, durationMs: 1000 }
  ] }], storyboard: [
    { id: 'first', title: 'Original <scene>', narration: 'Original spoken words', assetId: 'new', durationMs: 4000 },
    { id: 'second', title: 'Offline scene', assetId: 'offline', durationMs: 1000 },
    { id: 'third', title: 'New scene', assetId: 'old', durationMs: 2000 }
  ] })
}
function history() {
  const data = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: (key) => { data.delete(key) } })
}
function render(project = fixture(), language: UiLanguage = 'en') {
  return renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(StoryboardAssemblyPanel, { project, history: history(), onProjectChange: vi.fn() }) }))
}

it.each(uiLanguages)('renders assembly, replacement preview and visible skipped replacements in %s', (language) => {
  const project = fixture(), before = JSON.stringify(project), html = render(project, language)
  for (const key of ['assembly.heading', 'assembly.assemble', 'assembly.target', 'assembly.unavailable', 'assembly.reason.offline', 'assembly.shortened'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain(translateUi(language, 'assembly.sync', { count: 1 }))
  expect(html).toContain('Original &lt;track&gt;'); expect(html).toContain('Original &lt;scene&gt;')
  expect(JSON.stringify(project)).toBe(before)
})

it.each(uiLanguages)('disables both writes on locked tracks in %s and keeps the replacement warning', (language) => {
  const project = fixture(); project.tracks[0].locked = true
  const html = render(project, language)
  expect(html).toContain(`disabled="">${translateUi(language, 'assembly.assemble')}`)
  expect(html).toContain(`disabled="">${translateUi(language, 'assembly.sync', { count: 1 })}`)
  expect(html).toContain(translateUi(language, 'assembly.outdated', { count: 1 }))
})

it.each(uiLanguages)('shows no-scenes and no-assigned-media guidance in %s', (language) => {
  expect(render(createProject('Empty'), language)).toContain(translateUi(language, 'assembly.noScenes'))
  const project = fixture(); project.storyboard = [{ id: 'blank', title: 'Blank', description: '', durationMs: 1000 }]
  expect(render(project, language)).toContain(translateUi(language, 'assembly.noAssigned'))
})

it.each(uiLanguages)('shows planning failures with escaped original details in %s', (language) => {
  const spy = vi.spyOn(sync, 'planSceneVisualSync').mockImplementationOnce(() => { throw new Error('<script>broken planning') })
  try {
    const html = render(fixture(), language)
    expect(html).toContain(translateUi(language, 'assembly.planFailed'))
    expect(html).toContain('&lt;script&gt;broken planning')
  } finally { spy.mockRestore() }
})

it('publishes an actual assembly only after its safety version and successful persistence', () => {
  const project = fixture(), versions = history(), order: string[] = []
  const snapshot = versions.snapshot.bind(versions)
  vi.spyOn(versions, 'snapshot').mockImplementation((...args) => { order.push('snapshot'); return snapshot(...args) })
  const result = commitStoryboardChange(project, () => { order.push('calculate'); return assembleTimelineFromStoryboard(project, 'main') }, versions, (next) => { order.push('persist'); expect(next.tracks[0].clips).toHaveLength(3) }, 'Assembly')
  order.push('result')
  expect(order).toEqual(['calculate', 'snapshot', 'persist', 'result'])
  expect(result.placed.map((scene) => scene.sceneId)).toEqual(['third'])
  expect(project.tracks[0].clips).toHaveLength(2)
  expect(versions.restoreReversibly(result.project, versions.list(project.id)[0].id).project.tracks).toEqual(project.tracks)
})

it('keeps replacement starts, caps footage, retains narration and reverses the saved swap', () => {
  const project = fixture(), versions = history(), persist = vi.fn()
  const result = commitStoryboardChange(project, () => sync.syncSceneVisuals(project, 'main'), versions, persist, 'Swap')
  expect(persist).toHaveBeenCalledWith(result.project)
  expect(result.project.tracks[0].clips[0]).toMatchObject({ assetId: 'new', startMs: 0, durationMs: 1500 })
  expect(result.project.tracks[0].clips[0].motion).toBeUndefined()
  expect(result.project.storyboard).toEqual(project.storyboard)
  expect(result.project.assets).toEqual(project.assets)
  expect(versions.restoreReversibly(result.project, versions.list(project.id)[0].id).project.tracks).toEqual(project.tracks)
})

it('also safety-snapshots legacy clip-to-scene adoption, but leaves true no-ops untouched', () => {
  const project = fixture(), versions = history(), persist = vi.fn()
  project.storyboard = [{ id: 'legacy', title: 'Legacy', description: '', assetId: 'old', durationMs: 1000 }]
  project.tracks[0].clips = [{ ...project.tracks[0].clips[0], sceneId: undefined }]
  const adopted = commitStoryboardChange(project, () => assembleTimelineFromStoryboard(project, 'main'), versions, persist, 'Adopt')
  expect(adopted.placed).toHaveLength(0); expect(adopted.project.tracks[0].clips[0].sceneId).toBe('legacy')
  expect(versions.list(project.id)).toHaveLength(1)
  const noop = commitStoryboardChange(adopted.project, () => assembleTimelineFromStoryboard(adopted.project, 'main'), versions, persist, 'Repeat')
  expect(noop.project).toBe(adopted.project); expect(persist).toHaveBeenCalledTimes(1)
  expect(versions.list(project.id)).toHaveLength(1)
})

it('rejects calculation/validation errors before history or persistence', () => {
  const project = fixture(), versions = history(), persist = vi.fn()
  project.tracks[0].locked = true
  expect(() => commitStoryboardChange(project, () => sync.syncSceneVisuals(project, 'main'), versions, persist, 'Swap')).toThrow('locked')
  expect(() => commitStoryboardChange(project, () => ({ project: { ...project, title: '' } }), versions, persist, 'Invalid')).toThrow()
  expect(versions.list(project.id)).toHaveLength(0); expect(persist).not.toHaveBeenCalled()
})

it('does not return success on history or project-storage failure', () => {
  const project = fixture(), versions = history(), persist = vi.fn()
  vi.spyOn(versions, 'snapshot').mockImplementationOnce(() => { throw new Error('history full') })
  expect(() => commitStoryboardChange(project, () => sync.syncSceneVisuals(project, 'main'), versions, persist, 'Swap')).toThrow('history full')
  expect(persist).not.toHaveBeenCalled()
  expect(() => commitStoryboardChange(project, () => sync.syncSceneVisuals(project, 'main'), versions, () => { throw new Error('project full') }, 'Swap')).toThrow('project full')
  expect(versions.list(project.id)).toHaveLength(1)
  expect(project.tracks[0].clips[0].assetId).toBe('old')
})

it('provides stable codes for every assembly and replacement skip without parsing diagnostics', () => {
  const project = fixture()
  project.tracks[0].clips = []
  project.assets.push({ id: 'external', kind: 'image', uri: 'external.png', managed: false, offline: false, metadata: {} }, { id: 'audio', kind: 'audio', uri: 'KINAOU/Assets/audio.wav', managed: true, offline: false, metadata: {} })
  project.storyboard = [undefined, 'absent', 'offline', 'external', 'audio'].map((assetId, index) => ({ id: `s${index}`, title: `Scene ${index}`, description: '', durationMs: 1000, assetId }))
  const skipped = assembleTimelineFromStoryboard(project, 'main').skipped
  expect(skipped.map((entry) => entry.code)).toEqual(['empty', 'missing', 'offline', 'unmanaged', 'kind'])
  project.tracks[0].clips = project.storyboard.map((scene, index) => ({ id: `c${index}`, sceneId: scene.id, assetId: 'old', startMs: index * 1000, durationMs: 1000, sourceOffsetMs: 0, gain: 1, speed: 1 }))
  const syncSkipped = sync.planSceneVisualSync(project, 'main').skipped
  expect(syncSkipped.map((entry) => entry.code)).toEqual(['cleared', 'missing', 'offline', 'unmanaged', 'kind'])
  for (const entry of [...skipped, ...syncSkipped]) for (const language of uiLanguages) expect(translateUi(language, `assembly.reason.${entry.code}`, entry.values)).not.toContain('{track}')
})

it.each([50, 99])('uses a safe hard cut for a %i ms scene rather than invalid dissolve data', (durationMs) => {
  const project = fixture(); project.tracks[0].clips = []
  project.storyboard = [1000, durationMs].map((durationMs, index) => ({ id: `s${index}`, title: 'Short', description: '', assetId: 'old', durationMs }))
  const result = assembleTimelineFromStoryboard(project, 'main', { crossfade: true })
  expect(result.project.tracks[0].clips[1]).toMatchObject({ startMs: 1000, durationMs })
  expect(result.project.tracks[0].clips[1].transitionIn).toBeUndefined()
  expect(() => parseProject(result.project)).not.toThrow()
})
