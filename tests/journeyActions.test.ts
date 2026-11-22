import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProjectJourneyBar } from '../src/components/ProjectJourneyBar'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { isJourneyActionStage, runJourneyAction } from '../src/core/journeyActions'
import { assetSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { projectJourney } from '../src/core/projectJourney'

function image(id: string) {
  return assetSchema.parse({ id, kind: 'image', uri: `KINAOU/Assets/${id}.png`, managed: true, metadata: { width: 1280, height: 720 } })
}

/** Two planned scenes with visuals and spoken text, nothing on the timeline yet. */
function planned(): KinaouProject {
  return {
    ...createProject('Run'),
    script: 'One. Two.',
    assets: [image('first'), image('second')],
    tracks: [
      trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main Video', clips: [] }),
      trackSchema.parse({ id: 'captions-1', type: 'caption', name: 'Captions', clips: [] })
    ],
    storyboard: [
      { id: 's1', title: 'Opening', description: 'One.', narration: 'This is the first scene.', durationMs: 4000, assetId: 'first' },
      { id: 's2', title: 'Closing', description: 'Two.', narration: 'This is the second scene.', durationMs: 4000, assetId: 'second' }
    ]
  }
}

function recorder() {
  const snapshots: string[] = []
  const saved: KinaouProject[] = []
  return { snapshots, saved, history: { snapshot: (_project: KinaouProject, label: string) => { snapshots.push(label); return undefined as never } }, persist: (project: KinaouProject) => { saved.push(project) } }
}

describe('model-free steps can be done from the next-step bar', () => {
  it('offers exactly the four steps that involve no model, worker or file', () => {
    expect(['plan', 'visuals', 'assemble', 'narration', 'fit', 'captions', 'align', 'export'].filter(stage => isJourneyActionStage(stage as never))).toEqual(['assemble', 'fit', 'captions', 'align'])
  })

  it('assembles with a version written first, and the journey moves on', () => {
    const project = planned()
    expect(projectJourney(project).next?.stage).toBe('assemble')
    const log = recorder()
    const outcome = runJourneyAction(project, 'assemble', log.history, log.persist)
    expect(outcome).toMatchObject({ stage: 'assemble', changed: 2, left: 0 })
    expect(log.snapshots).toEqual(['Before assembling scenes on the timeline'])
    expect(log.saved).toEqual([outcome.project])
    expect(projectJourney(outcome.project).steps.find(step => step.stage === 'assemble')?.state).toBe('done')
  })

  it('writes captions for the placed scenes', () => {
    const log = recorder()
    const assembled = runJourneyAction(planned(), 'assemble', log.history, log.persist).project
    const outcome = runJourneyAction(assembled, 'captions', log.history, log.persist)
    expect(outcome.changed).toBe(2)
    expect(log.snapshots.at(-1)).toBe('Before writing captions from the script')
    expect(projectJourney(outcome.project).steps.find(step => step.stage === 'captions')?.state).toBe('done')
  })

  it('saves nothing and writes no version when there is nothing to change', () => {
    const log = recorder()
    const assembled = runJourneyAction(planned(), 'assemble', log.history, log.persist).project
    const before = { snapshots: log.snapshots.length, saved: log.saved.length }
    const again = runJourneyAction(assembled, 'assemble', log.history, log.persist)
    expect(again).toMatchObject({ changed: 0, project: assembled })
    const aligned = runJourneyAction(assembled, 'align', log.history, log.persist)
    expect(aligned.changed).toBe(0)
    expect({ snapshots: log.snapshots.length, saved: log.saved.length }).toEqual(before)
  })

  it('refuses a locked track without saving', () => {
    const project = planned()
    const locked = { ...project, tracks: project.tracks.map(track => track.id === 'video-1' ? { ...track, locked: true } : track) }
    const log = recorder()
    expect(() => runJourneyAction(locked, 'assemble', log.history, log.persist)).toThrow(/locked/)
    expect(log.snapshots).toEqual([])
    expect(log.saved).toEqual([])
  })

  it('shows the button only when the bar was given a way to save', () => {
    const project = planned()
    const html = (props: object) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'de', children: createElement(ProjectJourneyBar, { project, section: 'Director', onGo: () => {}, ...props }) }))
    const log = recorder()
    const acting = html({ history: log.history, onProjectChange: log.persist })
    expect(acting).toContain('Jetzt erledigen')
    expect(acting).toContain('braucht kein KI-Modell')
    expect(acting).toContain('Zum Studio')
    expect(html({})).not.toContain('Jetzt erledigen')
    // A step that needs a model stays a navigation step.
    const unplanned = { ...createProject('Empty') }
    expect(renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'de', children: createElement(ProjectJourneyBar, { project: unplanned, section: 'Studio', onGo: () => {}, history: log.history, onProjectChange: log.persist }) }))).not.toContain('Jetzt erledigen')
  })
})
