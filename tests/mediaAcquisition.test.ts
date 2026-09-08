import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { describeAcquisitionItem, parseMediaAcquisitionPlan } from '../src/core/mediaAcquisition'
import { parseProject, type KinaouProject } from '../src/core/project'

function projectWithScenes(): KinaouProject {
  const base = createProjectFromInput({ title: 'Claude tutorial', kind: 'idea', content: '' })
  return parseProject({ ...base, storyboard: [{ id: 'scene-1', title: 'Open claude.ai', description: '', durationMs: 5000 }, { id: 'scene-2', title: 'Desktop app', description: '', durationMs: 5000 }] })
}

describe('media acquisition plan', () => {
  const provenance = { kind: 'local-model', adapterId: 'ollama', modelId: 'qwen3:8b' }

  it('parses a mixed plan referencing only real scenes', () => {
    const plan = parseMediaAcquisitionPlan({
      schemaVersion: 1,
      items: [
        { kind: 'web-capture', sceneId: 'scene-1', url: 'https://claude.ai', rationale: 'Show the real site' },
        { kind: 'app-capture', sceneId: 'scene-2', appName: 'Claude', rationale: 'Show the real desktop app' },
        { kind: 'generate-image', sceneId: 'scene-2', positivePrompt: 'abstract illustration of an AI assistant', rationale: 'Intro visual' }
      ],
      provenance
    }, projectWithScenes())
    expect(plan.items).toHaveLength(3)
    expect(describeAcquisitionItem(plan.items[0])).toContain('https://claude.ai')
    expect(describeAcquisitionItem(plan.items[1])).toContain('Claude')
  })

  it('rejects unknown scenes, unsafe URLs and unsafe app names', () => {
    const project = projectWithScenes()
    expect(() => parseMediaAcquisitionPlan({ schemaVersion: 1, items: [{ kind: 'web-capture', sceneId: 'ghost', url: 'https://claude.ai', rationale: 'x' }], provenance }, project)).toThrow(/unknown storyboard scene/)
    expect(() => parseMediaAcquisitionPlan({ schemaVersion: 1, items: [{ kind: 'web-capture', sceneId: 'scene-1', url: 'file:///etc/passwd', rationale: 'x' }], provenance }, project)).toThrow(/http or https/)
    expect(() => parseMediaAcquisitionPlan({ schemaVersion: 1, items: [{ kind: 'web-capture', sceneId: 'scene-1', url: 'https://user:pw@x.org', rationale: 'x' }], provenance }, project)).toThrow(/credentials/)
    expect(() => parseMediaAcquisitionPlan({ schemaVersion: 1, items: [{ kind: 'app-capture', sceneId: 'scene-1', appName: 'bad"app', rationale: 'x' }], provenance }, project)).toThrow(/App name/)
    expect(() => parseMediaAcquisitionPlan({ schemaVersion: 1, items: [], provenance }, project)).toThrow()
  })
})
