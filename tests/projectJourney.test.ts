import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProjectJourneyBar } from '../src/components/ProjectJourneyBar'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { assetSchema, clipSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { journeyStages, projectJourney } from '../src/core/projectJourney'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const image = (id: string) => assetSchema.parse({ id, kind: 'image', uri: `KINAOU/Assets/${id}.png`, managed: true, metadata: { width: 1280, height: 720 } })
const voice = (id: string, sceneId: string) => assetSchema.parse({ id, kind: 'audio', uri: `KINAOU/Assets/GeneratedVoice/${id}.wav`, managed: true, metadata: { sceneId, durationMs: 3000 } })
const captionAsset = (id: string, sceneId: string) => assetSchema.parse({ id, kind: 'caption', uri: `kinaou://caption/${id}`, managed: true, metadata: { sceneId, text: 'Text.' } })

const states = (project: KinaouProject) => Object.fromEntries(projectJourney(project).steps.map(step => [step.stage, step.state]))

function empty(): KinaouProject {
  return { ...createProject('Reise', new Date('2026-11-22T10:00:00.000Z')), tracks: [
    trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main Video', clips: [] }),
    trackSchema.parse({ id: 'voice-1', type: 'voice', name: 'Voice', clips: [] }),
    trackSchema.parse({ id: 'caption-1', type: 'caption', name: 'Captions', clips: [] })
  ] }
}
const planned = (): KinaouProject => ({ ...empty(), script: 'Eins. Zwei.', storyboard: [
  { id: 's1', title: 'Eins', description: 'Bild eins.', narration: 'Eins.', durationMs: 4000 },
  { id: 's2', title: 'Zwei', description: 'Bild zwei.', narration: 'Zwei.', durationMs: 4000 }
] })
const withVisuals = (): KinaouProject => ({ ...planned(), assets: [image('a1'), image('a2')], storyboard: planned().storyboard.map((scene, index) => ({ ...scene, assetId: `a${index + 1}` })) })
function assembled(): KinaouProject {
  const base = withVisuals()
  return { ...base, tracks: base.tracks.map(track => track.id !== 'video-1' ? track : { ...track, clips: [
    clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 0, durationMs: 4000, sceneId: 's1' }),
    clipSchema.parse({ id: 'c2', assetId: 'a2', startMs: 4000, durationMs: 4000, sceneId: 's2' })
  ] }) }
}
function narrated(lengthMs = 3000): KinaouProject {
  const base = assembled()
  return { ...base, assets: [...base.assets, voice('n1', 's1'), voice('n2', 's2')], tracks: base.tracks.map(track => track.id !== 'voice-1' ? track : { ...track, clips: [
    clipSchema.parse({ id: 'v1', assetId: 'n1', startMs: 0, durationMs: lengthMs }),
    clipSchema.parse({ id: 'v2', assetId: 'n2', startMs: 4000, durationMs: 3000 })
  ] }) }
}
function captioned(captionEndMs = 4000): KinaouProject {
  const base = narrated()
  return { ...base, assets: [...base.assets, captionAsset('t1', 's1'), captionAsset('t2', 's2')], tracks: base.tracks.map(track => track.id !== 'caption-1' ? track : { ...track, clips: [
    clipSchema.parse({ id: 'k1', assetId: 't1', startMs: 0, durationMs: captionEndMs }),
    clipSchema.parse({ id: 'k2', assetId: 't2', startMs: 4000, durationMs: 4000 })
  ] }) }
}

describe('where a project stands', () => {
  it('starts with the plan and holds everything else back', () => {
    const journey = projectJourney(empty())
    expect(journey.steps.map(step => step.stage)).toEqual([...journeyStages])
    expect(states(empty())).toEqual({ plan: 'open', visuals: 'waiting', assemble: 'waiting', narration: 'waiting', fit: 'waiting', captions: 'waiting', align: 'waiting', export: 'waiting' })
    expect(journey.next).toMatchObject({ stage: 'plan', target: 'Director' })
  })

  it('moves to visuals once there is a storyboard, and counts the scenes', () => {
    const journey = projectJourney(planned())
    expect(journey.next).toMatchObject({ stage: 'visuals', done: 0, total: 2, target: 'Director' })
    const half: KinaouProject = { ...planned(), assets: [image('a1')], storyboard: planned().storyboard.map((scene, index) => index ? scene : { ...scene, assetId: 'a1' }) }
    expect(projectJourney(half).steps[1]).toMatchObject({ state: 'open', done: 1, total: 2 })
  })

  it('offers assembly as soon as one scene has a visual, while visuals stay open', () => {
    const half: KinaouProject = { ...planned(), assets: [image('a1')], storyboard: planned().storyboard.map((scene, index) => index ? scene : { ...scene, assetId: 'a1' }) }
    expect(states(half)).toMatchObject({ visuals: 'open', assemble: 'open' })
    expect(projectJourney(half).next?.stage).toBe('visuals')
  })

  it('walks through assembly, narration and captions in order', () => {
    expect(projectJourney(withVisuals()).next).toMatchObject({ stage: 'assemble', done: 0, total: 2, target: 'Studio' })
    expect(projectJourney(assembled()).next).toMatchObject({ stage: 'narration', done: 0, total: 2 })
    expect(projectJourney(narrated()).next).toMatchObject({ stage: 'captions', done: 0, total: 2 })
    expect(projectJourney(captioned()).next).toMatchObject({ stage: 'export' })
  })

  it('puts fitting first when a voice outruns its picture', () => {
    const journey = projectJourney(narrated(5200))
    expect(journey.steps.find(step => step.stage === 'fit')).toMatchObject({ state: 'open', done: 1, total: 2 })
    expect(journey.next?.stage).toBe('fit')
    expect(states(narrated())).toMatchObject({ fit: 'done' })
  })

  it('asks for realignment when captions no longer span their scene', () => {
    const journey = projectJourney(captioned(2500))
    expect(journey.steps.find(step => step.stage === 'align')).toMatchObject({ state: 'open', done: 1, total: 2 })
    expect(journey.next?.stage).toBe('align')
  })

  it('does not ask a silent scene for narration or captions', () => {
    const base = assembled()
    const silent: KinaouProject = { ...base, storyboard: base.storyboard.map(scene => scene.id === 's2' ? { ...scene, narration: '' } : scene) }
    expect(projectJourney(silent).steps.find(step => step.stage === 'narration')).toMatchObject({ total: 1 })
  })

  it('has nothing open once an export exists', () => {
    const exported = recordSuccessfulExport(captioned(), { jobId: 'job-1', label: 'Export', outputRelativePath: 'KINAOU/Renders/reise.mp4', format: 'landscape', range: { inMs: 0, outMs: 8000 }, durationMs: 8000, sceneIds: [], completedAt: '2026-11-22T12:00:00.000Z' })
    const journey = projectJourney(exported)
    expect(journey.steps.every(step => step.state === 'done')).toBe(true)
    expect(journey.next).toBeNull()
  })

  it('changes nothing', () => {
    const project = captioned(), before = JSON.stringify(project)
    projectJourney(project)
    expect(JSON.stringify(project)).toBe(before)
  })
})

describe('next-step bar', () => {
  const render = (project: KinaouProject, section: string, language: 'de' | 'en' | 'fr' = 'en') => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ProjectJourneyBar, { project, section, onGo: () => {} }) }))

  it('names the next step, why, and where — in every language', () => {
    for (const language of uiLanguages) {
      const html = render(withVisuals(), 'Director', language)
      expect(html).toContain(translateUi(language, 'journey.next'))
      expect(html).toContain(translateUi(language, 'journey.stage.assemble'))
      expect(html).toContain(translateUi(language, 'journey.progress', { done: 0, total: 2 }))
      expect(html).toContain(translateUi(language, 'journey.go.Studio'))
      expect(html).toContain(translateUi(language, 'journey.boundary').slice(0, 30))
    }
  })

  it('says "you are already here" instead of offering a button that leads nowhere', () => {
    const html = render(withVisuals(), 'Studio')
    expect(html).toContain('You are already in the right area')
    expect(html).not.toContain('Go to Studio')
  })

  it('marks later steps as later, never as done', () => {
    const html = render(planned(), 'Studio')
    expect(html.match(/LATER/g)).toHaveLength(6)
    expect(html.match(/DONE/g)).toHaveLength(1)
  })

  it('tells the author to watch the video when nothing countable is open', () => {
    const exported = recordSuccessfulExport(captioned(), { jobId: 'job-1', label: 'Export', outputRelativePath: 'KINAOU/Renders/reise.mp4', format: 'landscape', range: { inMs: 0, outMs: 8000 }, durationMs: 8000, sceneIds: [], completedAt: '2026-11-22T12:00:00.000Z' })
    expect(render(exported, 'Studio')).toContain('this is not a quality check')
  })
})

describe('a brand-new project', () => {
  it('does not count the placeholder scene made from the description as a plan', async () => {
    const { createProjectFromInput } = await import('../src/core/create')
    const fresh = createProjectFromInput({ title: 'Neu', kind: 'idea', content: 'Erkläre die Mondphasen.' })
    expect(fresh.storyboard).toHaveLength(1)
    expect(projectJourney(fresh).next).toMatchObject({ stage: 'plan', target: 'Director' })
    // Once the author changes that scene, or a Director plan is applied, it is a plan.
    expect(projectJourney({ ...fresh, storyboard: [{ ...fresh.storyboard[0], description: 'Der Mond am Himmel.' }] }).next?.stage).toBe('visuals')
    expect(projectJourney({ ...fresh, metadata: { ...fresh.metadata, directorPlan: {} } }).next?.stage).toBe('visuals')
  })

  it('names the panel where the step is done in the words on screen', () => {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'de', children: createElement(ProjectJourneyBar, { project: withVisuals(), section: 'Director', onGo: () => {} }) }))
    expect(html).toContain(`Im Studio unter „${translateUi('de', 'assembly.heading')}“`)
  })
})
