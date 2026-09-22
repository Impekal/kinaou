import { describe, expect, it } from 'vitest'

import {
  parseSpeechVoiceCatalog,
  speechVoiceSupports
} from '../src/core/speech'
import { WorkerClient } from '../src/core/workerClient'

describe('adapter-neutral local speech catalog', () => {
  const piper = {
    id: 'KINAOU/Models/de_DE-thorsten.onnx',
    adapterId: 'piper',
    label: 'de_DE-thorsten',
    locale: 'de-DE',
    capabilities: ['synthesis', 'declared-locale']
  } as const

  it('keeps Piper truthful as a synthesis baseline', () => {
    const [voice] = parseSpeechVoiceCatalog([piper])

    expect(voice.adapterId).toBe('piper')
    expect(voice.locale).toBe('de-DE')
    expect(speechVoiceSupports(voice, 'synthesis')).toBe(true)
    expect(speechVoiceSupports(voice, 'style-instruction')).toBe(false)
    expect(speechVoiceSupports(voice, 'voice-clone')).toBe(false)
    expect(speechVoiceSupports(voice, 'reference-audio')).toBe(false)
  })

  it('allows future local adapters to declare real additional capabilities', () => {
    const [voice] = parseSpeechVoiceCatalog([{
      id: 'future-local:voice-1',
      adapterId: 'future-local',
      label: 'Authorized voice 1',
      locale: 'fr-FR',
      capabilities: [
        'synthesis',
        'declared-locale',
        'language-control',
        'style-instruction',
        'voice-clone',
        'reference-audio'
      ]
    }])

    expect(speechVoiceSupports(voice, 'voice-clone')).toBe(true)
    expect(speechVoiceSupports(voice, 'style-instruction')).toBe(true)
  })

  it('rejects duplicate identities and false capability claims', () => {
    expect(() => parseSpeechVoiceCatalog([piper, piper]))
      .toThrow(/Duplicate speech voice/)

    expect(() => parseSpeechVoiceCatalog([{
      ...piper,
      capabilities: ['synthesis', 'synthesis']
    }])).toThrow(/Duplicate speech capability/)

    expect(() => parseSpeechVoiceCatalog([{
      ...piper,
      locale: null,
      capabilities: ['synthesis', 'declared-locale']
    }])).toThrow(/claims a locale/)

    expect(() => parseSpeechVoiceCatalog([{
      ...piper,
      capabilities: ['declared-locale']
    }])).toThrow(/cannot synthesize/)
  })

  it('loads the generic catalog through WorkerClient', async () => {
    let seenUrl = ''

    const client = new WorkerClient({
      baseUrl: 'http://127.0.0.1:43117',
      token: 'secret',
      fetchImpl: async (input, init) => {
        seenUrl = String(input)

        expect(
          new Headers(init?.headers).get('authorization')
        ).toBe('Bearer secret')

        return new Response(JSON.stringify({
          ok: true,
          type: 'speech-voices',
          voices: [piper]
        }), {
          headers: {
            'content-type': 'application/json'
          }
        })
      }
    })

    expect(await client.listSpeechVoices()).toEqual([piper])
    expect(seenUrl).toContain('/speech/voices')
  })
})
