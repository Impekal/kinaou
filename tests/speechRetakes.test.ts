import {
  expect,
  it
} from 'vitest'

import {
  speechContinuityFromJob,
  speechRetakeContextForAsset,
  speechRetakeContextForNewGroup
} from '../src/core/speechRetakes'
import {
  createProject
} from '../src/core/project'
import {
  registerGeneratedVoice
} from '../src/core/generatedVoice'
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
    referenceAssetId: 'own',
    seed,
    tempoFactor: 1.25,
    audioPath:
      `KINAOU/Assets/GeneratedVoice/${id}.wav`,
    durationMs: 1000,
    sizeBytes: 42
  }
}

it(
  'keeps retakes as distinct assets in one continuity lineage',
  () => {
    const originalJob =
      job('job-1', 1)

    let project =
      registerGeneratedVoice(
        createProject('Test'),
        originalJob,
        'Guten Morgen'
      )

    const first =
      project.assets[0]

    const groupId =
      first.metadata
        .speechRetakeGroupId

    expect(typeof groupId)
      .toBe('string')

    expect(String(groupId).length)
      .toBeGreaterThan(0)

    expect(
      first.metadata
    ).toMatchObject({
      speechRetakeIndex: 1,
      speechContinuityKey:
        speechContinuityFromJob(
          originalJob
        )
    })

    const firstId =
      first.id

    const firstUri =
      first.uri

    const context =
      speechRetakeContextForAsset(
        first
      )

    expect(context)
      .toMatchObject({
        groupId,
        index: 2,
        replacesAssetId:
          firstId
      })

    project =
      registerGeneratedVoice(
        project,
        job('job-2', 2),
        'Guten Morgen',
        context
      )

    expect(project.assets)
      .toHaveLength(2)

    expect(
      project.assets[0]
    ).toMatchObject({
      id: firstId,
      uri: firstUri
    })

    expect(
      project.assets[1].metadata
    ).toMatchObject({
      speechRetakeGroupId:
        groupId,
      speechRetakeIndex: 2,
      speechRetakeOfAssetId:
        firstId,
      speechContinuityKey:
        speechContinuityFromJob(
          originalJob
        )
    })

    expect(
      project.assets[1].uri
    ).toBe(
      'KINAOU/Assets/GeneratedVoice/job-2.wav'
    )
  }
)

it(
  'rejects a retake if voice continuity changed',
  () => {
    const firstJob =
      job('job-1', 1)

    const context =
      speechRetakeContextForNewGroup(
        firstJob
      )

    const changed = {
      ...job('job-2', 2),
      referenceAssetId:
        'different-reference'
    }

    expect(
      () =>
        registerGeneratedVoice(
          createProject('Test'),
          changed,
          'Same text',
          context
        )
    ).toThrow(
      'continuity changed'
    )
  }
)

it(
  'treats seed changes as retakes without breaking voice continuity',
  () => {
    const first =
      job('first', 111)

    const second =
      job('second', 222)

    expect(
      speechContinuityFromJob(
        second
      )
    ).toBe(
      speechContinuityFromJob(
        first
      )
    )
  }
)

it(
  'assigns the next group index even when retaking an older take',
  () => {
    const firstJob =
      job('first', 1)

    let project =
      registerGeneratedVoice(
        createProject('Branch'),
        firstJob,
        'Text'
      )

    const first =
      project.assets[0]

    project =
      registerGeneratedVoice(
        project,
        job('second', 2),
        'Text',
        speechRetakeContextForAsset(
          first,
          project.assets
        )
      )

    project =
      registerGeneratedVoice(
        project,
        job('third', 3),
        'Text',
        speechRetakeContextForAsset(
          project.assets[1],
          project.assets
        )
      )

    const fromFirst =
      speechRetakeContextForAsset(
        first,
        project.assets
      )

    expect(
      fromFirst.index
    ).toBe(4)
  }
)

it(
  'rejects changed voice language reference or text before a retake is submitted',
  async () => {
    const firstJob =
      job('first', 1)

    const project =
      registerGeneratedVoice(
        createProject('Preflight'),
        firstJob,
        'Original words'
      )

    const asset =
      project.assets[0]

    const voice = {
      id:
        'chatterbox:multilingual-0.1.7',
      adapterId:
        'chatterbox',
      label:
        'Chatterbox',
      locale: null,
      capabilities: [
        'synthesis',
        'language-control',
        'voice-clone',
        'reference-audio'
      ] as (
        | 'synthesis'
        | 'language-control'
        | 'voice-clone'
        | 'reference-audio'
      )[]
    }

    const {
      assertSpeechRetakeRequest
    } = await import(
      '../src/core/speechRetakes'
    )

    expect(
      () =>
        assertSpeechRetakeRequest(
          asset,
          'Original words',
          voice,
          {
            language: 'de',
            referenceAudio: {
              assetId: 'own',
              path:
                'KINAOU/Assets/own.wav',
              authorized: true
            }
          }
        )
    ).not.toThrow()

    expect(
      () =>
        assertSpeechRetakeRequest(
          asset,
          'Changed words',
          voice,
          {
            language: 'de',
            referenceAudio: {
              assetId: 'own',
              path:
                'KINAOU/Assets/own.wav',
              authorized: true
            }
          }
        )
    ).toThrow(
      'text must match'
    )

    expect(
      () =>
        assertSpeechRetakeRequest(
          asset,
          'Original words',
          {
            ...voice,
            id: 'other-voice'
          },
          {
            language: 'de',
            referenceAudio: {
              assetId: 'own',
              path:
                'KINAOU/Assets/own.wav',
              authorized: true
            }
          }
        )
    ).toThrow(
      'same adapter and voice'
    )

    expect(
      () =>
        assertSpeechRetakeRequest(
          asset,
          'Original words',
          voice,
          {
            language: 'en',
            referenceAudio: {
              assetId: 'own',
              path:
                'KINAOU/Assets/own.wav',
              authorized: true
            }
          }
        )
    ).toThrow(
      'language must match'
    )

    expect(
      () =>
        assertSpeechRetakeRequest(
          asset,
          'Original words',
          voice,
          {
            language: 'de',
            referenceAudio: {
              assetId:
                'different',
              path:
                'KINAOU/Assets/different.wav',
              authorized: true
            }
          }
        )
    ).toThrow(
      'reference voice must match'
    )
  }
)
