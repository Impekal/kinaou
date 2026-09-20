import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyDirectorPlan } from '../src/core/director'
import { assetSchema, clipSchema, createProject, parseProject, trackSchema } from '../src/core/project'
import { sceneSpeech } from '../src/core/sceneSpeech'
import { planSceneVoiceovers, placeSceneNarration } from '../src/core/sceneVoiceover'
import { captionsFromStoryboard } from '../src/core/scriptCaptions'
import { createTimelinePreviewPlan } from '../src/core/render'
import { SceneSpeechReview } from '../src/components/SceneSpeechReview'
import { WorkerClient } from '../src/core/workerClient'
import type { TtsJobRecord } from '../src/core/ttsJobs'

function fixture(narration?: string) {
  const project = applyDirectorPlan(createProject('Speech test'), {
    schemaVersion: 1, title: 'Lesson', objective: 'Explain', script: 'Full script', provenance: { kind: 'manual' },
    scenes: [{ id: 's1', title: 'Opening', description: 'Pan across the classroom.', durationMs: 4000, ...(narration !== undefined ? { narration } : {}) }]
  })
  project.assets = [assetSchema.parse({ id: 'image', kind: 'image', managed: true, uri: 'KINAOU/Assets/scene.png' })]
  project.storyboard[0].assetId = 'image'
  project.tracks = [
    trackSchema.parse({ id: 'visual', name: 'Visual', type: 'video', clips: [clipSchema.parse({ id: 'clip', assetId: 'image', sceneId: 's1', startMs: 0, durationMs: 4000 })] }),
    trackSchema.parse({ id: 'voice', name: 'Voice', type: 'voice' }),
    trackSchema.parse({ id: 'captions', name: 'Captions', type: 'caption' })
  ]
  return parseProject(JSON.parse(JSON.stringify(project)))
}

describe('one spoken-text source across Director, voice and captions', () => {
  it.each(['Willkommen zur Lektion.', 'Welcome to the lesson.', 'Bienvenue dans cette leçon.'])('preserves and routes explicit narration: %s', async (narration) => {
    const project = fixture(narration)
    const [scene] = planSceneVoiceovers(project, 'visual').pending
    expect(project.storyboard[0].narration).toBe(narration)
    expect(scene.text).toBe(narration)
    expect(scene.textSource).toBe('storyboard-narration')
    let sent: unknown
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'test', fetchImpl: async (_url, init) => {
      sent = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ ok: false, error: { message: 'Test stops before synthesis' } }), { status: 400 })
    } })
    await expect(client.startTts(scene.text, 'KINAOU/Models/voice.onnx')).rejects.toThrow()
    expect(sent).toEqual({ text: narration, voicePath: 'KINAOU/Models/voice.onnx' })
    const job = { id: 'fixture', state: 'succeeded', progress: 1, audioPath: 'KINAOU/Assets/GeneratedVoice/fixture.wav', durationMs: 4000, sizeBytes: 42, voicePath: 'KINAOU/Models/voice.onnx' } as TtsJobRecord
    const narrated = placeSceneNarration(project, scene, job, 'voice').project
    expect(narrated.assets.at(-1)?.metadata).toMatchObject({ sourceText: narration, source: 'storyboard-narration' })
    const captioned = captionsFromStoryboard(narrated, 'visual').project
    expect(captioned.assets.at(-1)?.metadata).toMatchObject({ text: narration, source: 'storyboard-narration' })
    const render = createTimelinePreviewPlan(captioned)
    expect(render.clips.find((clip) => clip.trackType === 'caption')?.asset.metadata.text).toBe(narration)
    expect(project.assets).toHaveLength(1)
  })

  it('keeps explicit empty narration silent even when visual directions exist', () => {
    const project = fixture('   ')
    expect(project.storyboard[0].narration).toBe('')
    expect(planSceneVoiceovers(project, 'visual').pending).toEqual([])
    expect(planSceneVoiceovers(project, 'visual').skipped[0].reason).toContain('intentionally silent')
    const captions = captionsFromStoryboard(project, 'visual')
    expect(captions.captioned).toEqual([])
    expect(captions.skipped[0].reason).toContain('intentionally silent')
    expect(captions.project).toBe(project)
  })

  it('preserves the legacy description fallback only when narration is absent', () => {
    const project = fixture()
    expect(project.storyboard[0]).not.toHaveProperty('narration')
    expect(planSceneVoiceovers(project, 'visual').pending[0].text).toBe('Pan across the classroom.')
    expect(captionsFromStoryboard(project, 'visual').project.assets.at(-1)?.metadata.source).toBe('storyboard-description')
    expect(sceneSpeech({ description: 'old', narration: ' A\n  new sentence. ' }).text).toBe('A new sentence.')
  })

  it('makes spoken text, legacy fallback and silence explicit in the review UI', () => {
    const render = (narration?: string) => renderToStaticMarkup(createElement(SceneSpeechReview, { scene: { description: 'Visual direction', ...(narration !== undefined ? { narration } : {}) } }))
    expect(render('Hello')).toContain('Hello')
    expect(render('Hello')).not.toContain('Visual direction')
    expect(render('')).toContain('Silent scene')
    expect(render()).toContain('falls back to the description')
  })

  it('rejects malformed or oversized spoken-text fields on persisted projects', () => {
    for (const narration of [null, 42, 'x'.repeat(8001)]) {
      const project = fixture()
      expect(() => parseProject({ ...project, storyboard: [{ ...project.storyboard[0], narration }] })).toThrow()
    }
  })
})
