import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createFootballTactics, parseFootballTactics, footballBoardSvg, rasterizeFootballTactics, validateTacticsImageProbe, tacticsLabels } from '../src/core/footballTactics'
import { AssetImportSession, type AssetImportFeedback } from '../src/core/assetImportSession'
import { createProject, parseProject } from '../src/core/project'
import { FootballTacticsPanel } from '../src/components/FootballTacticsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages } from '../src/core/uiLanguage'
import { uiFootballTacticsMessages } from '../src/core/uiFootballTacticsMessages'
import { translateUi } from '../src/core/uiMessages'
import { placeTacticsOnNewTrack } from '../src/core/footballTacticsPlacement'
const arrow = { id: '11111111-1111-4111-8111-111111111111', from: 'home-1', to: { x: 25, y: 35 }, kind: 'pass' as const }
it('creates an editable example with exactly 22 distinct players, normalized coordinates and an independent content language', () => {
  const board = createFootballTactics('fr')
  expect(board.players).toHaveLength(22); expect(new Set(board.players.map(p => p.id)).size).toBe(22)
  expect(board.players.filter(p => p.team === 'home')).toHaveLength(11)
  expect(board.language).toBe('fr'); expect(board.home).toBe('Équipe A')
  expect(parseFootballTactics(JSON.parse(JSON.stringify(board)))).toEqual(board)
})
it.each(['version','language','players','duplicate','jersey','coordinate','label','title','arrow','origin','arrowCount','unicode'] as const)('refuses invalid %s before rendering or importing', issue => {
  const board: any = createFootballTactics('de')
  if (issue === 'version') board.schemaVersion = 2
  if (issue === 'language') board.language = 'xx'
  if (issue === 'players') board.players.pop()
  if (issue === 'duplicate') board.players[1] = board.players[0]
  if (issue === 'jersey') board.players[1].number = board.players[0].number
  if (issue === 'coordinate') board.ball.x = Infinity
  if (issue === 'label') board.players[0].label = 'bad\nlabel'
  if (issue === 'title') board.title = 'x'.repeat(61)
  if (issue === 'arrow') board.arrows = [{ ...arrow, id: '../outside' }]
  if (issue === 'origin') board.arrows = [{ ...arrow, from: 'other' }]
  if (issue === 'arrowCount') board.arrows = Array.from({ length: 13 }, () => ({ ...arrow, id: crypto.randomUUID() }))
  if (issue === 'unicode') board.title = '\ud800'
  expect(() => parseFootballTactics(board)).toThrow(); expect(() => footballBoardSvg(board)).toThrow()
})
it('escapes authored labels and has only self-contained drawing primitives and an unavoidable illustration notice', () => {
  const board = createFootballTactics('en'); board.title = '<script>alert("x")</script>'; board.home = '<image href="https://evil.invalid"/>'; board.players[0].label = '<b>& "test"'
  board.arrows = [arrow, { ...arrow, id: crypto.randomUUID(), kind: 'run' }]
  const svg = footballBoardSvg(board)
  expect(svg).toContain('&lt;script&gt;'); expect(svg).toContain('&lt;image href=&quot;'); expect(svg).not.toContain('<script>'); expect(svg).not.toContain('<image ')
  expect(svg).not.toMatch(/<foreignObject|<style|<a\s|<use\s|<iframe|onload=/i)
  expect(svg).toContain('marker-end="url(#tactics-arrow)"'); expect(svg).toContain('stroke-dasharray="18 12"')
  expect(svg).toContain(tacticsLabels.en.notice); expect(svg).toContain('width="1920" height="1080"')
})
it('retains empty optional titles, serializable edits and anchored arrow movement without changing other players', () => {
  const original = createFootballTactics('de'), board = structuredClone(original); board.title = ''; board.arrows = [arrow]
  board.players.find(p => p.id === arrow.from)!.x = 20.1234
  const changed = parseFootballTactics(board)
  expect(changed.players.find(p => p.id === arrow.from)!.x).toBe(20.12)
  expect(original.players.find(p => p.id === arrow.from)!.x).toBe(7)
  expect(footballBoardSvg(changed)).toContain('x1="434.112"')
})
it('checks actual PNG codec and dimensions before an authored graphic may be registered', () => {
  const good = { width: 1920, height: 1080, videoCodec: 'png', path: 'KINAOU/Assets/fixture.png' }
  expect(validateTacticsImageProbe(good)).toBe(good)
  for (const bad of [{ ...good, width: 1 }, { ...good, height: 1 }, { ...good, videoCodec: 'mjpeg' }]) expect(() => validateTacticsImageProbe(bad)).toThrow()
})
function store() { const map = new Map<string,string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string,v: string) => { map.set(k,v) }, removeItem: (k: string) => { map.delete(k) } } }
it('retains the exact editable source only on the new asset and retries failed persistence without uploading or decorating again', async () => {
  let project = parseProject({ ...createProject('Tactics'), assets: [{ id: 'existing', kind: 'image', uri: 'KINAOU/Assets/keep.png', managed: true, metadata: { name: 'keep' } }] }), fail = true
  const initial = structuredClone(project), board = createFootballTactics('de'), file = new File(['png-test-protocol'], 'diagram.png', { type: 'image/png' }), events: AssetImportFeedback[] = []
  const client = { importAsset: vi.fn(async () => ({ managedPath: 'KINAOU/Assets/id_diagram.png', name: 'diagram.png', sizeBytes: file.size })), probe: vi.fn(async () => ({ path: 'KINAOU/Assets/id_diagram.png', sizeBytes: file.size, width: 1920, height: 1080, videoCodec: 'png' })) }
  const history = new PersistentVersionHistory(store()), metadata = { sourceKind: 'authored-football-tactics-v1', board, illustrationOnly: true, name: 'must-not-override-copy-name', sizeBytes: -1 }
  const session = new AssetImportSession(project, 'root-A', file, 'image', { client, assetMetadata: metadata, environment: () => ({ project, connection: 'root-A' }), snapshot: p => { history.snapshot(p, 'Before saving imported media', 'system') }, persist: p => { if (fail) throw Error('Explicit persistence failure'); project = p }, publish: e => events.push(e) })
  board.title = 'Changed external object'
  await session.run(); expect(events.at(-1)?.phase).toBe('saveFailed'); expect(project).toEqual(initial)
  fail = false; await session.run(); await session.run()
  expect(events.at(-1)?.phase).toBe('succeeded'); expect(client.importAsset).toHaveBeenCalledTimes(1); expect(client.probe).toHaveBeenCalledTimes(1)
  expect(project.assets[0]).toEqual(initial.assets[0]); expect(project.assets[1].metadata).toMatchObject({ name: 'diagram.png', sizeBytes: file.size, illustrationOnly: true, board: { title: tacticsLabels.de.title } })
  expect(parseFootballTactics(project.assets[1].metadata.board)).toEqual(createFootballTactics('de'))
  expect(history.restoreReversibly(project, history.list(project.id)[0].id).project.assets).toEqual(initial.assets)
})
it('refuses oversized authored metadata before upload', () => {
  const project = createProject('Tactics'), file = new File(['x'], 'test.png'), client = { importAsset: vi.fn(), probe: vi.fn() }
  expect(() => new AssetImportSession(project, 'scope', file, 'image', { client, assetMetadata: { huge: 'x'.repeat(64001) }, environment: () => ({ project, connection: 'scope' }), snapshot: vi.fn(), persist: vi.fn(), publish: vi.fn() })).toThrow()
  expect(client.importAsset).not.toHaveBeenCalled()
})
it('places a saved authored PNG into a new real five-second image track without changing existing media or tracks', () => {
  const project = parseProject({ ...createProject('Board'), assets: [{ id: 'tactics', kind: 'image', uri: 'KINAOU/Assets/tactics.png', managed: true, metadata: { sourceKind: 'authored-football-tactics-v1', board: createFootballTactics('fr') } }] })
  const next = placeTacticsOnNewTrack(project, 'tactics', 'Tableau tactique')
  expect(project.tracks).toEqual([]); expect(next.assets).toEqual(project.assets)
  expect(next.tracks[0]).toMatchObject({ type: 'image', name: 'Tableau tactique', clips: [{ assetId: 'tactics', durationMs: 5000, startMs: 0 }] })
  expect(() => placeTacticsOnNewTrack(project, 'missing', 'Track')).toThrow()
  expect(() => placeTacticsOnNewTrack({ ...project, assets: [{ ...project.assets[0], offline: true }] }, 'tactics', 'Track')).toThrow()
})
it.each(uiLanguages)('renders editor/undo/explicit save without model calls in %s', language => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(FootballTacticsPanel, { project: createProject('Test'), history: new PersistentVersionHistory(store()), workerUrl: 'http://127.0.0.1:43117', workerToken: 'PRIVATE', workerConnected: true, workerCapabilities: ['asset-upload'], managedRoots: ['/fixture/KINAOU'], onProjectChange: vi.fn() }) }))
    expect(html).toContain(translateUi(language, 'tactics.heading')); expect(html).toContain(translateUi(language, 'tactics.save')); expect(html).not.toContain('PRIVATE'); expect(fetch).not.toHaveBeenCalled()
    for (const key of Object.keys(uiFootballTacticsMessages) as (keyof typeof uiFootballTacticsMessages)[]) expect(translateUi(language, key)).not.toBe(key)
  } finally { fetch.mockRestore() }
})
it.each(['success','imageFailure','pngFailure'] as const)('rasterizer handles %s with no remote resources and revokes its temporary SVG URL', async outcome => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:owned-tactics-fixture'), revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const draw = vi.fn(), canvas = { width: 0, height: 0, getContext: () => ({ drawImage: draw }), toBlob: (done: (blob: Blob | null) => void) => done(outcome === 'pngFailure' ? null : new Blob(['protocol-test'], { type: 'image/png' })) }
  class FakeImage { onload?: () => void; onerror?: () => void; set src(value: string) { expect(value).toBe('blob:owned-tactics-fixture'); queueMicrotask(() => outcome === 'imageFailure' ? this.onerror?.() : this.onload?.()) } }
  vi.stubGlobal('Image', FakeImage); vi.stubGlobal('document', { createElement: () => canvas })
  try {
    const pending = rasterizeFootballTactics(createFootballTactics('fr'))
    if (outcome === 'success') { const file = await pending; expect(file.type).toBe('image/png'); expect(file.name).toMatch(/^football-tactics-.*\.png$/); expect(canvas.width).toBe(1920); expect(canvas.height).toBe(1080); expect(draw).toHaveBeenCalledTimes(1) }
    else await expect(pending).rejects.toThrow()
    expect(await (create.mock.calls[0][0] as Blob).text()).toContain(tacticsLabels.fr.notice)
    expect(revoke).toHaveBeenCalledWith('blob:owned-tactics-fixture')
  } finally { vi.unstubAllGlobals(); create.mockRestore(); revoke.mockRestore() }
})
