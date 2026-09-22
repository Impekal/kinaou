import assert from 'node:assert/strict'
import test from 'node:test'

import { piperSpeechVoiceDescriptors } from './speech.mjs'

test('maps Piper voices to truthful generic speech capabilities', () => {
  assert.deepEqual(
    piperSpeechVoiceDescriptors([
      {
        path: 'KINAOU/Models/de.onnx',
        locale: 'de-DE'
      },
      {
        path: 'KINAOU/Models/unknown.onnx',
        locale: null
      }
    ]),
    [
      {
        id: 'KINAOU/Models/de.onnx',
        adapterId: 'piper',
        label: 'de',
        locale: 'de-DE',
        capabilities: [
          'synthesis',
          'declared-locale'
        ]
      },
      {
        id: 'KINAOU/Models/unknown.onnx',
        adapterId: 'piper',
        label: 'unknown',
        locale: null,
        capabilities: [
          'synthesis'
        ]
      }
    ]
  )
})

test('rejects malformed Piper catalog entries', () => {
  assert.throws(
    () => piperSpeechVoiceDescriptors([
      {
        path: '../outside.onnx',
        locale: null
      }
    ]),
    /path/
  )
})

test('maps generic Piper requests and jobs without adding capabilities', async () => {
  const {
    piperRequestFromSpeech,
    speechJobFromPiper
  } = await import('./speech.mjs')

  assert.deepEqual(
    piperRequestFromSpeech({
      adapterId: 'piper',
      voiceId: 'KINAOU/Models/de.onnx',
      text: 'Hallo'
    }),
    {
      voicePath: 'KINAOU/Models/de.onnx',
      text: 'Hallo'
    }
  )

  assert.throws(
    () => piperRequestFromSpeech({
      adapterId: 'future',
      voiceId: 'future:voice',
      text: 'Hallo'
    }),
    /adapter/
  )

  assert.deepEqual(
    speechJobFromPiper({
      id: 'job',
      voicePath: 'KINAOU/Models/de.onnx',
      state: 'succeeded',
      progress: 1,
      createdAt: 'a',
      updatedAt: 'b',
      audioPath: 'KINAOU/Assets/GeneratedVoice/job.wav',
      durationMs: 1000,
      sizeBytes: 42
    }),
    {
      id: 'job',
      adapterId: 'piper',
      voiceId: 'KINAOU/Models/de.onnx',
      state: 'succeeded',
      progress: 1,
      createdAt: 'a',
      updatedAt: 'b',
      audioPath: 'KINAOU/Assets/GeneratedVoice/job.wav',
      durationMs: 1000,
      sizeBytes: 42
    }
  )
})
