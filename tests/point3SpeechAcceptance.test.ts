import {
  expect,
  it
} from 'vitest'

import {
  parseSpeechVoiceCatalog
} from '../src/core/speech'

import {
  registerGeneratedVoice
} from '../src/core/generatedVoice'

import {
  createProject
} from '../src/core/project'

import {
  speechContinuityFromJob,
  speechRetakeContextForAsset
} from '../src/core/speechRetakes'

import type {
  SpeechJobRecord
} from '../src/core/speechJobs'

function job(
  id: string,
  seed: number
): SpeechJobRecord {
  return {
    id,
    adapterId: 'chatterbox',
    voiceId:
      'chatterbox:multilingual-0.1.7',
    state: 'succeeded',
    progress: 1,
    createdAt: 'a',
    updatedAt: 'b',
    language: 'de',
    modelId:
      'chatterbox-tts-0.1.7:multilingual',
    referenceAssetId:
      'authorized-own-voice',
    seed,
    tempoFactor: 1.25,
    audioPath:
      `KINAOU/Assets/GeneratedVoice/${id}.wav`,
    durationMs: 1000,
    sizeBytes: 100
  }
}

it(
  'keeps the final Point 3 Chatterbox capability contract honest',
  () => {
    const [voice] =
      parseSpeechVoiceCatalog([
        {
          id:
            'chatterbox:multilingual-0.1.7',
          adapterId:
            'chatterbox',
          label:
            'Chatterbox Multilingual',
          locale: null,
          capabilities: [
            'synthesis',
            'language-control',
            'voice-clone',
            'reference-audio'
          ]
        }
      ])

    expect(
      voice.capabilities
    ).toEqual([
      'synthesis',
      'language-control',
      'voice-clone',
      'reference-audio'
    ])

    expect(
      voice.capabilities
    ).not.toContain(
      'style-instruction'
    )

    expect(
      voice.capabilities
    ).not.toContain(
      'pace-control'
    )
  }
)

it(
  'retakes may change seed while retaining the same voice continuity',
  () => {
    const first =
      job('take-1', 111)

    const second =
      job('take-2', 222)

    expect(
      speechContinuityFromJob(
        second
      )
    ).toBe(
      speechContinuityFromJob(
        first
      )
    )

    let project =
      registerGeneratedVoice(
        createProject('Point 3'),
        first,
        'Guten Morgen'
      )

    const source =
      project.assets[0]

    project =
      registerGeneratedVoice(
        project,
        second,
        'Guten Morgen',
        speechRetakeContextForAsset(
          source,
          project.assets
        )
      )

    expect(project.assets)
      .toHaveLength(2)

    expect(
      project.assets.map(
        asset =>
          asset.metadata
            .speechRetakeIndex
      )
    ).toEqual([
      1,
      2
    ])
  }
)
