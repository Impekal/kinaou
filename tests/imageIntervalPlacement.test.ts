import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { ImageIntervalPlacement } from '../src/core/imageIntervalPlacement'
import { ImageIntervalPlacementControl } from '../src/components/ImageIntervalPlacementControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = parseProject({ ...createProject('Image placement'), assets: [{ id: 'image', kind: 'image', managed: true, uri: 'KINAOU/Assets/image.png', metadata: { name: 'Own image', retained: { original: true } } }], tracks: [{ id: 'v', type: 'image', name: 'Images', clips: [{ id: 'old', assetId: 'image', startMs: 0, durationMs: 1000 }] }, { id: 'other', type: 'overlay', name: 'Other images', clips: [] }] })
  return { project, request: { assetId: 'image', trackId: 'v', startMs: 1000, durationMs: 2500 } }
}
it('inserts exactly the reviewed interval with one snapshot and identical private bytes after two mutating save failures', () => {
  const { project, request } = fixture(), before = JSON.stringify(project), placement = new ImageIntervalPlacement(project, request, 'A'), attempts: string[] = [], snapshot = vi.fn(p => { p.assets = [] })
  expect(placement.review).toMatchObject({ startMs: 1000, endMs: 3500, durationMs: 2500, layered: false })
  const fail = (p: typeof project) => { attempts.push(JSON.stringify(p)); p.tracks = []; throw Error('synthetic storage failure') }
  expect(() => placement.commit(project, 'A', true, snapshot, fail)).toThrow(); expect(() => placement.commit(project, 'A', true, snapshot, fail)).toThrow()
  const next = placement.commit(project, 'A', true, snapshot, p => { attempts.push(JSON.stringify(p)); p.assets = [] })
  expect(snapshot).toHaveBeenCalledOnce(); expect(new Set(attempts).size).toBe(1); expect(JSON.stringify(project)).toBe(before)
  expect(next.assets).toEqual(project.assets); expect(next.tracks[1]).toEqual(project.tracks[1]); expect(next.tracks[0].clips[0]).toEqual(project.tracks[0].clips[0])
  expect(next.tracks[0].clips[1]).toMatchObject({ id: placement.clipId, assetId: 'image', startMs: 1000, durationMs: 2500, sourceOffsetMs: 0, speed: 1, gain: 1 })
  expect(next.tracks[0].clips).toHaveLength(2); expect(() => placement.commit(project, 'A', true, snapshot, vi.fn())).toThrow()
})
it('requires approval and honors false snapshot/persistence without duplicate snapshots or reentrancy', () => {
  const { project, request } = fixture(), placement = new ImageIntervalPlacement(project, request), save = vi.fn()
  expect(() => placement.commit(project, '', false, vi.fn(), save)).toThrow(); expect(() => placement.commit(project, '', true, () => false, save)).toThrow(); expect(save).not.toHaveBeenCalled()
  const snapshot = vi.fn(() => { expect(() => placement.commit(project, '', true, vi.fn(), save)).toThrow() })
  expect(() => placement.commit(project, '', true, snapshot, () => false)).toThrow(); placement.commit(project, '', true, snapshot, save); expect(snapshot).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledOnce()
})
it.each(['project', 'scope'])('permanently invalidates observed %s A/B/A', kind => {
  const { project, request } = fixture(), placement = new ImageIntervalPlacement(project, request, 'A')
  placement.observe(kind === 'project' ? { ...project, title: 'B' } : project, kind === 'scope' ? 'B' : 'A'); placement.observe(project, 'A')
  expect(placement.current).toBe(false); expect(() => placement.commit(project, 'A', true, vi.fn(), vi.fn())).toThrow()
})
it.each(['negative', 'zero', 'fraction', 'overflow', 'infinite', 'overlap', 'offline', 'external', 'kind', 'missing', 'duplicate-asset', 'locked', 'muted', 'wrong-track', 'duplicate-track', 'traversal', 'backslash', 'control', 'broken-frame'])('refuses %s without mutation', kind => {
  const { project, request } = fixture()
  if (kind === 'negative') request.startMs = -1
  if (kind === 'zero') request.durationMs = 0
  if (kind === 'fraction') request.durationMs = 0.5
  if (kind === 'overflow') request.startMs = 86400000
  if (kind === 'infinite') request.durationMs = Infinity
  if (kind === 'overlap') request.startMs = 999
  if (kind === 'offline') project.assets[0].offline = true
  if (kind === 'external') project.assets[0].managed = false
  if (kind === 'kind') project.assets[0].kind = 'video'
  if (kind === 'missing') request.assetId = 'missing'
  if (kind === 'duplicate-asset') project.assets.push(structuredClone(project.assets[0]))
  if (kind === 'locked') project.tracks[0].locked = true
  if (kind === 'muted') project.tracks[0].muted = true
  if (kind === 'wrong-track') project.tracks[0].type = 'voice'
  if (kind === 'duplicate-track') project.tracks.push(structuredClone(project.tracks[0]))
  if (kind === 'traversal') project.assets[0].uri = 'KINAOU/Assets/../outside.png'
  if (kind === 'backslash') project.assets[0].uri = 'KINAOU/Assets/sub\\outside.png'
  if (kind === 'control') project.assets[0].uri = 'KINAOU/Assets/image\n.png'
  if (kind === 'broken-frame') project.assets[0].metadata.extraction = { invalid: true }
  const before = JSON.stringify(project); expect(() => new ImageIntervalPlacement(project, request)).toThrow(); expect(JSON.stringify(project)).toBe(before)
})
it('warns about other active visual layers but not audio or muted layers; accepts exact 24-hour boundary', () => {
  const { project, request } = fixture(); project.tracks[1].clips = [{ ...project.tracks[0].clips[0], startMs: 1000 }]
  expect(new ImageIntervalPlacement(project, request).review.layered).toBe(true)
  project.tracks[1].muted = true; expect(new ImageIntervalPlacement(project, request).review.layered).toBe(false)
  project.tracks[1].muted = false; project.tracks[1].type = 'voice'; expect(new ImageIntervalPlacement(project, request).review.layered).toBe(false)
  request.startMs = 86399999; request.durationMs = 1; expect(new ImageIntervalPlacement(project, request).review.endMs).toBe(86400000)
})
it.each(['de', 'en', 'fr'] as const)('renders explicit-only localized %s controls without IO', language => {
  const { project } = fixture(), save = vi.fn(), fetch = vi.spyOn(globalThis, 'fetch'), before = JSON.stringify(project), history = new PersistentVersionHistory({ getItem: () => null, setItem: () => {}, removeItem: () => {} })
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ImageIntervalPlacementControl, { project, asset: project.assets[0], history, onProjectChange: save }) }))
    expect(html).toContain(translateUi(language, 'imageInterval.heading')); expect(html).toContain(translateUi(language, 'imageInterval.review')); expect(html).not.toContain(translateUi(language, 'imageInterval.place')); expect(fetch).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(JSON.stringify(project)).toBe(before)
  } finally { fetch.mockRestore() }
})
