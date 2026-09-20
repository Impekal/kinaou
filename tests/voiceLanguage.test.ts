import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { voiceLanguageLabel } from '../src/core/voiceLanguage'
import { PiperVoiceSelect } from '../src/components/PiperVoiceSelect'
import { WorkerClient } from '../src/core/workerClient'

const path = 'KINAOU/Models/renamed.onnx'
const client = (payload: unknown) => new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'test', fetchImpl: async () => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }) })

describe('language-aware local voices', () => {
  it('compares declared base languages for German, English and French', () => {
    for (const language of ['de', 'en', 'fr'] as const) {
      expect(voiceLanguageLabel({ path, locale: `${language}-XX` }, language)).toContain('matches project')
    }
    expect(voiceLanguageLabel({ path, locale: 'en-US' }, 'de')).toBe('en-US · different language')
    expect(voiceLanguageLabel({ path, locale: null }, 'de')).toBe('Language unknown')
  })

  it('joins optional metadata only to discovered paths and tolerates legacy workers', async () => {
    const payload = { ok: true, type: 'tts-voices', voices: [path] }
    expect(await client(payload).listTtsVoiceDetails()).toEqual([{ path, locale: null }])
    expect(await client({ ...payload, details: [{ path, locale: 'fr-FR' }] }).listTtsVoiceDetails()).toEqual([{ path, locale: 'fr-FR' }])
    expect(await client({ ...payload, details: [{ path: 'other', locale: 'fr-FR' }] }).listTtsVoiceDetails()).toEqual([{ path, locale: null }])
    expect(await client({ ...payload, details: [{ path, locale: '<script>' }] }).listTtsVoiceDetails()).toEqual([{ path, locale: null }])
    expect(await client({ ...payload, details: [{ path, locale: 'fr-FR' }] }).listTtsVoices()).toEqual([path])
  })

  it('rejects malformed discovery and paths outside the managed voice directory', async () => {
    for (const voices of [null, [42], ['KINAOU/Models/../outside.onnx'], ['KINAOU/Assets/voice.onnx'], ['KINAOU/Models/sub/voice.onnx']]) {
      await expect(client({ ok: true, type: 'tts-voices', voices }).listTtsVoiceDetails()).rejects.toThrow()
    }
  })

  it('renders honest language labels and leaves selection explicit', () => {
    const html = renderToStaticMarkup(createElement(PiperVoiceSelect, {
      voices: [{ path, locale: 'fr-FR' }, { path: 'KINAOU/Models/unknown.onnx', locale: null }],
      value: '', language: 'de', onChange: () => {}
    }))
    expect(html).toContain('Deutsch')
    expect(html).toContain('fr-FR · different language')
    expect(html).toContain('Language unknown')
    expect(html).toContain('<option value="" selected="">Choose a voice</option>')
    expect(html).toContain('Unknown does not mean multilingual')
  })
})
