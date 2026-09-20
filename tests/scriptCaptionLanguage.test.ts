import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScriptCaptionsPanel } from '../src/components/ScriptCaptionsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProjectFromInput } from '../src/core/create'
import { captionsFromStoryboard } from '../src/core/scriptCaptions'
import * as alignment from '../src/core/captionAlignment'
import { commitCaptionChange } from '../src/core/captionEditing'
import { clipSchema, type KinaouProject } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages, type UiLanguage } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

afterEach(() => vi.restoreAllMocks())
function fixture() {
  const project = createProjectFromInput({ title: 'Scene captions', kind: 'idea', content: '' })
  project.assets.push({ id: 'image', kind: 'image', uri: 'KINAOU/Assets/fixture.png', managed: true, offline: false, metadata: {} })
  project.storyboard = [{ id: 'scene', title: 'Titre conservé', description: 'Visual direction only', narration: 'Bonjour. Guten Tag.', durationMs: 4000, assetId: 'image' }]
  const track = project.tracks.find((item) => item.type === 'video')!
  track.clips.push(clipSchema.parse({ id: 'visual', assetId: 'image', sceneId: 'scene', startMs: 1000, durationMs: 4000 }))
  return { project, trackId: track.id }
}
function history() {
  const values = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) } })
}
function render(project: KinaouProject, language: UiLanguage) {
  return renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ScriptCaptionsPanel, { project, history: history(), onProjectChange: vi.fn() }) }))
}

it.each(uiLanguages)('renders script-caption controls and real timing drift in %s, preserving speech and titles', (language) => {
  const { project, trackId } = fixture()
  const captioned = captionsFromStoryboard(project, trackId).project
  captioned.tracks.find((track) => track.id === trackId)!.clips[0].durationMs = 8000
  const before = JSON.stringify(captioned), html = render(captioned, language)
  expect(html).toContain(translateUi(language, 'scriptCaption.heading'))
  expect(html).toContain(translateUi(language, 'scriptCaption.align', { count: 1 }))
  expect(html).toContain(translateUi(language, 'scriptCaption.drift', { count: 1 }))
  expect(html).toContain('Titre conservé')
  expect(JSON.stringify(captioned)).toBe(before)
  expect(captioned.assets.at(-1)?.metadata.text).toBe('Bonjour. Guten Tag.')
})

it.each(uiLanguages)('shows unalignable scenes instead of hiding them in %s', (language) => {
  const { project, trackId } = fixture()
  const captioned = captionsFromStoryboard(project, trackId).project
  captioned.tracks.find((track) => track.id === trackId)!.clips[0].durationMs = 100
  const html = render(captioned, language)
  expect(html).toContain(translateUi(language, 'scriptCaption.unaligned'))
  expect(html).toContain(translateUi(language, 'scriptCaption.reason.tooShort', { count: 1, durationMs: 100 }))
  expect(html).not.toContain(translateUi(language, 'scriptCaption.align', { count: 1 }))
})

it.each(uiLanguages)('explains empty projects and blocks locked alignment in %s', (language) => {
  const { project, trackId } = fixture()
  expect(render({ ...project, storyboard: [] }, language)).toContain(translateUi(language, 'scriptCaption.noScenes'))
  const captioned = captionsFromStoryboard(project, trackId).project
  captioned.tracks.find((track) => track.id === trackId)!.clips[0].durationMs = 8000
  captioned.tracks.find((track) => track.type === 'caption')!.locked = true
  const html = render(captioned, language)
  expect(html).toContain(translateUi(language, 'caption.locked'))
  expect(html).toContain(`disabled="">${translateUi(language, 'scriptCaption.align', { count: 1 })}`)
})

it('reports planning errors with escaped details rather than implying captions match', () => {
  vi.spyOn(alignment, 'planCaptionAlignment').mockImplementation(() => { throw new Error('<script>bad plan</script>') })
  const html = render(fixture().project, 'de')
  expect(html).toContain(translateUi('de', 'scriptCaption.readFailed'))
  expect(html).toContain('&lt;script&gt;bad plan&lt;/script&gt;')
  expect(html).not.toContain('<script>')
})

it('provides stable translatable skip codes while preserving existing diagnostic reasons', () => {
  const { project, trackId } = fixture()
  project.storyboard.push(
    { id: 'absent', title: 'No media', description: 'Hello', durationMs: 4000 },
    { id: 'unplaced', title: 'Not placed', description: 'Hello', durationMs: 4000, assetId: 'other' },
    { id: 'silent', title: 'Silence', description: 'Visual only', narration: '', durationMs: 4000, assetId: 'image' },
    { id: 'legacy', title: 'Empty legacy', description: '', durationMs: 4000, assetId: 'image' }
  )
  // Legacy clips without a scene stamp remain valid fallback references.
  delete project.tracks.find((track) => track.id === trackId)!.clips[0].sceneId
  const result = captionsFromStoryboard(project, trackId)
  expect(result.skipped.map((entry) => entry.code)).toEqual(['noVisual', 'notPlaced', 'silent', 'noText'])
  for (const entry of result.skipped) for (const language of uiLanguages) expect(translateUi(language, `scriptCaption.reason.${entry.code}`, entry.values)).not.toContain('{track}')
  expect(captionsFromStoryboard(result.project, trackId).skipped[0].code).toBe('existing')
  const missing = { ...result.project, tracks: result.project.tracks.map((track) => track.id === trackId ? { ...track, clips: [] } : track) }
  expect(alignment.planCaptionAlignment(missing, trackId).skipped[0]).toMatchObject({ code: 'alignMissing', values: { track: 'Main Video' } })
})

it('saves actual aligned timing reversibly without rewriting spoken text', () => {
  const { project, trackId } = fixture(), versions = history(), persist = vi.fn()
  const captioned = captionsFromStoryboard(project, trackId).project
  captioned.tracks.find((track) => track.id === trackId)!.clips[0].durationMs = 8000
  const outcome = alignment.alignCaptionsToScenes(captioned, trackId)
  commitCaptionChange(captioned, () => outcome.project, versions, persist, 'Before alignment')
  expect(outcome.realigned).toHaveLength(1)
  expect(outcome.project.tracks.find((track) => track.type === 'caption')!.clips[0]).toMatchObject({ startMs: 1000, durationMs: 8000 })
  expect(outcome.project.assets).toEqual(captioned.assets)
  expect(versions.list(project.id)[0].project).toEqual(captioned)
  expect(persist).toHaveBeenCalledWith(outcome.project)
})
