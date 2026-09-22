import { expect, it, vi } from 'vitest'

import { AudioStudioSession } from '../src/core/audioStudioSession'
import { createProject, parseProject } from '../src/core/project'
import type { SpeechVoiceDescriptor } from '../src/core/speech'
import {
  authorizedSpeechReference,
  buildSpeechSynthesisRequest
} from '../src/core/speechDelivery'
import type { SpeechJobRecord } from '../src/core/speechJobs'

const piper: SpeechVoiceDescriptor = {
  id: 'KINAOU/Models/de.onnx',
  adapterId: 'piper',
  label: 'de',
  locale: 'de-DE',
  capabilities: [
    'synthesis',
    'declared-locale'
  ]
}

const expressive: SpeechVoiceDescriptor = {
  id: 'future-local:voice',
  adapterId: 'future-local',
  label: 'Authorized expressive voice',
  locale: 'fr-FR',
  capabilities: [
    'synthesis',
    'declared-locale',
    'language-control',
    'style-instruction',
    'pace-control',
    'voice-clone',
    'reference-audio'
  ]
}

it('keeps baseline Piper requests free of unsupported delivery controls', () => {
  expect(
    buildSpeechSynthesisRequest(
      ' Hallo ',
      piper
    )
  ).toEqual({
    adapterId: 'piper',
    voiceId: piper.id,
    text: 'Hallo'
  })

  for (const options of [
    { language: 'de' as const },
    { styleInstruction: 'Warm' },
    { pace: 0.9 },
    {
      referenceAudio: {
        assetId: 'own',
        path: 'KINAOU/Assets/own.wav',
        authorized: true as const
      }
    }
  ]) {
    expect(() =>
      buildSpeechSynthesisRequest(
        'Hallo',
        piper,
        options
      )
    ).toThrow(/does not support/)
  }
})

it('builds only capabilities explicitly declared by an expressive adapter', () => {
  const request = buildSpeechSynthesisRequest(
    ' Bonjour ',
    expressive,
    {
      language: 'fr',
      styleInstruction: ' Warm, calm and reassuring. ',
      pace: 0.92,
      referenceAudio: {
        assetId: 'own',
        path: 'KINAOU/Assets/own.wav',
        authorized: true
      }
    }
  )

  expect(request).toEqual({
    adapterId: 'future-local',
    voiceId: 'future-local:voice',
    text: 'Bonjour',
    language: 'fr',
    styleInstruction: 'Warm, calm and reassuring.',
    pace: 0.92,
    referenceAudio: {
      assetId: 'own',
      path: 'KINAOU/Assets/own.wav',
      authorized: true
    }
  })
})

it('requires explicit authorization and an available managed audio reference', () => {
  const project = parseProject({
    ...createProject('Reference'),
    assets: [
      {
        id: 'own',
        kind: 'audio',
        uri: 'KINAOU/Assets/own.wav',
        managed: true,
        offline: false,
        metadata: {
          name: 'My own recording'
        }
      },
      {
        id: 'offline',
        kind: 'audio',
        uri: 'KINAOU/Assets/offline.wav',
        managed: true,
        offline: true
      }
    ]
  })

  expect(
    authorizedSpeechReference(
      project,
      'own',
      true
    )
  ).toEqual({
    assetId: 'own',
    path: 'KINAOU/Assets/own.wav',
    authorized: true
  })

  expect(() =>
    authorizedSpeechReference(
      project,
      'own',
      false
    )
  ).toThrow(/authorization/)

  expect(() =>
    authorizedSpeechReference(
      project,
      'offline',
      true
    )
  ).toThrow(/available managed audio/)
})

it('passes immutable supported delivery settings through Audio Studio', async () => {
  let project = createProject('Delivery')

  const completed: SpeechJobRecord = {
    id: 'job',
    adapterId: expressive.adapterId,
    voiceId: expressive.id,
    state: 'succeeded',
    progress: 1,
    createdAt: 'a',
    updatedAt: 'b',
    audioPath: 'KINAOU/Assets/GeneratedVoice/job.wav',
    durationMs: 1000,
    sizeBytes: 100
  }

  const startSpeech = vi.fn(
    async () => completed
  )

  const session = new AudioStudioSession(
    project,
    'connection',
    'Bonjour.',
    expressive,
    {
      client: {
        startSpeech,
        speechStatus: vi.fn(
          async () => completed
        ),
        cancelSpeech: vi.fn(
          async () => ({
            ...completed,
            state: 'cancelled' as const
          })
        )
      },
      environment: () => ({
        project,
        connection: 'connection'
      }),
      snapshot: vi.fn(),
      persist: (next) => {
        project = next
      },
      publish: vi.fn(),
      speechOptions: {
        language: 'fr',
        styleInstruction: 'Warm',
        pace: 0.9,
        referenceAudio: {
          assetId: 'own',
          path: 'KINAOU/Assets/own.wav',
          authorized: true
        }
      }
    }
  )

  await session.run()

  expect(startSpeech).toHaveBeenCalledWith({
    adapterId: 'future-local',
    voiceId: expressive.id,
    text: 'Bonjour.',
    language: 'fr',
    styleInstruction: 'Warm',
    pace: 0.9,
    referenceAudio: {
      assetId: 'own',
      path: 'KINAOU/Assets/own.wav',
      authorized: true
    }
  })

  expect(project.assets[0].metadata).toMatchObject({
    adapterId: 'future-local',
    voiceId: expressive.id,
    speechJobId: 'job'
  })
})
