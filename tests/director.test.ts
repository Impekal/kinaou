import { describe, expect, it } from 'vitest'
import { applyDirectorPlan, parseDirectorPlan } from '../src/core/director'
import { createProject } from '../src/core/project'

const plan = {
  schemaVersion: 1,
  title: 'Port story',
  objective: 'Explain the city clearly.',
  script: 'A complete narration.',
  scenes: [{ id: 'scene-1', title: 'Arrival', description: 'Open on the harbour.', durationMs: 5000, narration: 'Welcome.', visualBrief: 'Wide shot', requiredMedia: ['video'] }],
  provenance: { kind: 'manual' }
} as const

describe('DirectorPlan', () => {
  it('validates a versioned structured plan and applies it to project truth', () => {
    const project = createProject('Documentary', new Date('2026-01-01T00:00:00.000Z'))
    const next = applyDirectorPlan(project, plan, new Date('2026-01-02T00:00:00.000Z'))
    expect(next.script).toBe('A complete narration.')
    expect(next.storyboard).toEqual([{ id: 'scene-1', title: 'Arrival', description: 'Open on the harbour.', durationMs: 5000 }])
    expect(next.metadata.directorPlan).toEqual(plan)
    expect(next.metadata.directorPlanAppliedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('rejects duplicate scenes and unverifiable local-model provenance', () => {
    expect(() => parseDirectorPlan({ ...plan, scenes: [plan.scenes[0], plan.scenes[0]] })).toThrow(/unique/i)
    expect(() => parseDirectorPlan({ ...plan, provenance: { kind: 'local-model' } })).toThrow(/adapterId/i)
  })

  it('does not mutate the source project', () => {
    const project = createProject('Documentary')
    applyDirectorPlan(project, plan)
    expect(project.script).toBe('')
    expect(project.storyboard).toEqual([])
  })
})
