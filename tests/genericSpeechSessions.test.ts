import { expect, it, vi } from 'vitest'

import { AudioStudioSession } from '../src/core/audioStudioSession'
import { createProject, parseProject } from '../src/core/project'
import { SceneNarrationSession } from '../src/core/sceneNarrationSession'
import type { SpeechJobRecord } from '../src/core/speechJobs'
import type { SpeechVoiceDescriptor } from '../src/core/speech'

const voice: SpeechVoiceDescriptor = {
  id: 'future-local:voice-1',
  adapterId: 'future-local',
  label: 'Authorized voice',
  locale: 'fr-FR',
  capabilities: [
    'synthesis',
    'declared-locale',
    'voice-clone',
    'reference-audio'
  ]
}

function job(state: SpeechJobRecord['state'] = 'succeeded'): SpeechJobRecord {
  return {
    id: 'speech-job',
    adapterId: voice.adapterId,
    voiceId: voice.id,
    state,
    progress: state === 'succeeded' ? 1 : 0.5,
    createdAt: '2026-09-22T00:00:00Z',
    updatedAt: '2026-09-22T00:00:01Z',
    ...(state === 'succeeded' ? {
      audioPath: 'KINAOU/Assets/GeneratedVoice/speech-job.wav',
      durationMs: 2000,
      sizeBytes: 4000
    } : {})
  }
}

it('Audio Studio uses generic speech jobs and persists generic provenance', async () => {
  let project = createProject('Generic speech')
  const states: string[] = []

  const client = {
    startSpeech: vi.fn(async () => job()),
    speechStatus: vi.fn(async () => job()),
    cancelSpeech: vi.fn(async () => job('cancelled'))
  }

  const session = new AudioStudioSession(
    project,
    'connection',
    'Bonjour le monde.',
    voice,
    {
      client,
      environment: () => ({
        project,
        connection: 'connection'
      }),
      snapshot: vi.fn(),
      persist: (next) => {
        project = next
      },
      publish: (feedback) => {
        states.push(feedback.phase)
      }
    }
  )

  await session.run()

  expect(client.startSpeech).toHaveBeenCalledWith({
    adapterId: 'future-local',
    voiceId: 'future-local:voice-1',
    text: 'Bonjour le monde.'
  })

  expect(project.assets[0].metadata).toMatchObject({
    adapterId: 'future-local',
    voiceId: 'future-local:voice-1',
    speechJobId: 'speech-job',
    sourceText: 'Bonjour le monde.'
  })

  expect(project.assets[0].metadata).not.toHaveProperty('voicePath')
  expect(project.assets[0].metadata).not.toHaveProperty('ttsJobId')
  expect(states.at(-1)).toBe('succeeded')
})

it('scene narration uses the generic speech API and places its result', async () => {
  let project = parseProject({
    ...createProject('Scenes'),
    assets: [{
      id: 'image',
      kind: 'image',
      uri: 'KINAOU/Assets/image.png',
      managed: true
    }],
    storyboard: [{
      id: 'scene',
      title: 'Scene',
      description: 'Visual',
      narration: 'Texte parlé.',
      durationMs: 1000,
      assetId: 'image'
    }],
    tracks: [
      {
        id: 'visual',
        type: 'video',
        name: 'Visual',
        clips: [{
          id: 'clip',
          assetId: 'image',
          sceneId: 'scene',
          startMs: 0,
          durationMs: 1000
        }]
      },
      {
        id: 'voice',
        type: 'voice',
        name: 'Voice',
        clips: []
      }
    ]
  })

  const client = {
    startSpeech: vi.fn(async () => job()),
    speechStatus: vi.fn(async () => job())
  }

  const session = new SceneNarrationSession(
    project,
    'visual',
    'voice',
    voice,
    {
      client,
      current: (expected) => expected === project,
      snapshot: vi.fn(),
      persist: (next) => {
        project = next
      },
      publish: vi.fn()
    }
  )

  await session.run()

  expect(client.startSpeech).toHaveBeenCalledWith({
    adapterId: 'future-local',
    voiceId: 'future-local:voice-1',
    text: 'Texte parlé.'
  })

  const asset = project.assets.find(
    (entry) => entry.kind === 'audio'
  )!

  expect(asset.metadata).toMatchObject({
    adapterId: 'future-local',
    voiceId: 'future-local:voice-1',
    speechJobId: 'speech-job',
    sceneId: 'scene'
  })

  expect(project.tracks[1].clips).toHaveLength(1)
})

it('new Piper speech assets retain legacy metadata aliases', async () => {
  let project = createProject('Piper compatibility')

  const piper: SpeechVoiceDescriptor = {
    id: 'KINAOU/Models/de.onnx',
    adapterId: 'piper',
    label: 'de',
    locale: 'de-DE',
    capabilities: ['synthesis', 'declared-locale']
  }

  const piperJob: SpeechJobRecord = {
    ...job(),
    adapterId: 'piper',
    voiceId: piper.id
  }

  const session = new AudioStudioSession(
    project,
    'connection',
    'Hallo.',
    piper,
    {
      client: {
        startSpeech: vi.fn(async () => piperJob),
        speechStatus: vi.fn(async () => piperJob),
        cancelSpeech: vi.fn(async () => ({
          ...piperJob,
          state: 'cancelled' as const
        }))
      },
      environment: () => ({
        project,
        connection: 'connection'
      }),
      snapshot: vi.fn(),
      persist: (next) => {
        project = next
      },
      publish: vi.fn()
    }
  )

  await session.run()

  expect(project.assets[0].metadata).toMatchObject({
    adapterId: 'piper',
    voiceId: piper.id,
    speechJobId: 'speech-job',
    voicePath: piper.id,
    ttsJobId: 'speech-job'
  })
})
