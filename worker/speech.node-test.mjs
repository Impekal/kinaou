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
