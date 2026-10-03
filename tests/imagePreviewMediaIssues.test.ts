import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { ImageIntervalPlacement, ImagePreviewMediaError, imagePreviewMediaIssues } from '../src/core/imageIntervalPlacement'
import { translateUi } from '../src/core/uiMessages'
function fixture() { return parseProject({ ...createProject('Unavailable preview source'), assets: [{ id: 'image', kind: 'image', managed: true, uri: 'KINAOU/Assets/image.png', metadata: {} }, { id: 'source', kind: 'video', managed: true, uri: 'KINAOU/Assets/source.mp4', metadata: { name: 'Original source', durationMs: 1000 } }], tracks: [{ id: 'v', name: 'Background', type: 'video', clips: [{ id: 'existing', assetId: 'source', startMs: 0, durationMs: 1000 }] }, { id: 'i', name: 'Image layer', type: 'image', clips: [] }] }) }
it.each(['missing', 'offline', 'ambiguous'] as const)('refuses full preview for %s source without hiding it or preventing separate placement', status => {
  const p = fixture(); if (status === 'missing') p.assets.pop(); if (status === 'offline') p.assets[1].offline = true; if (status === 'ambiguous') p.assets.push(structuredClone(p.assets[1]))
  const before = JSON.stringify(p), placement = new ImageIntervalPlacement(p, { assetId: 'image', trackId: 'i', startMs: 200, durationMs: 400 }), snapshot = vi.fn(), persist = vi.fn()
  expect(imagePreviewMediaIssues(p)).toEqual([{ trackName: 'Background', assetName: status === 'missing' ? 'source' : 'Original source', status }])
  expect(() => placement.preview(p)).toThrow(ImagePreviewMediaError); expect(snapshot).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled()
  const next = placement.commit(p, '', true, snapshot, persist); expect(next.tracks[0]).toEqual(p.tracks[0]); expect(next.assets).toEqual(p.assets); expect(next.tracks[1].clips).toHaveLength(1); expect(JSON.stringify(p)).toBe(before)
})
it('ignores intentionally muted tracks and unreferenced offline assets, not missing active sources', () => {
  const p = fixture(); p.assets[1].offline = true; p.tracks[0].muted = true
  expect(imagePreviewMediaIssues(p)).toEqual([]); expect(new ImageIntervalPlacement(p, { assetId: 'image', trackId: 'i', startMs: 0, durationMs: 1000 }).preview(p).clips).toHaveLength(1)
  p.tracks[0].muted = false; expect(imagePreviewMediaIssues(p)).toHaveLength(1)
})
it('returns independent bounded labels and counts each affected clip, without network IO', () => {
  const p = fixture(); p.assets[1].offline = true; p.assets[1].metadata.name = 'x'.repeat(1000); p.tracks[0].name = 't'.repeat(1000); p.tracks[0].clips = Array.from({ length: 12 }, (_, i) => ({ ...p.tracks[0].clips[0], id: String(i) }))
  const fetch = vi.spyOn(globalThis, 'fetch'); try { const issues = imagePreviewMediaIssues(p); expect(issues).toHaveLength(12); expect(issues[0].assetName).toHaveLength(160); expect(issues[0].trackName).toHaveLength(160); issues[0].assetName = 'changed'; expect(imagePreviewMediaIssues(p)[0].assetName).toHaveLength(160); expect(fetch).not.toHaveBeenCalled() } finally { fetch.mockRestore() }
})
it.each(['de', 'en', 'fr'] as const)('has actionable %s metadata-only diagnostics', language => {
  for (const key of ['imageInterval.mediaIssues', 'imageInterval.mediaIssue.missing', 'imageInterval.mediaIssue.offline', 'imageInterval.mediaIssue.ambiguous', 'imageInterval.mediaIssueHelp'] as const) expect(translateUi(language, key, { count: 12 })).not.toContain('imageInterval.')
})
