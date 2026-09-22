import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { SpeechDeliveryControls } from '../src/components/SpeechDeliveryControls'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject, parseProject } from '../src/core/project'
import type { SpeechVoiceDescriptor } from '../src/core/speech'
import { defaultSpeechDeliveryDraft } from '../src/core/speechDelivery'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'

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
  id: 'future:voice',
  adapterId: 'future',
  label: 'Expressive voice',
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

function project() {
  return parseProject({
    ...createProject('Speech UI'),
    assets: [
      {
        id: 'own',
        kind: 'audio',
        uri: 'KINAOU/Assets/own.wav',
        managed: true,
        offline: false,
        metadata: {
          name: 'My original recording'
        }
      },
      {
        id: 'offline',
        kind: 'audio',
        uri: 'KINAOU/Assets/offline.wav',
        managed: true,
        offline: true,
        metadata: {
          name: 'Offline recording'
        }
      },
      {
        id: 'image',
        kind: 'image',
        uri: 'KINAOU/Assets/image.png',
        managed: true,
        offline: false
      }
    ]
  })
}

function render(
  language: typeof uiLanguages[number],
  voice: SpeechVoiceDescriptor
) {
  return renderToStaticMarkup(
    createElement(
      UiLanguageProvider,
      {
        initialLanguage: language,
        children: createElement(
          SpeechDeliveryControls,
          {
            project: project(),
            voice,
            draft: defaultSpeechDeliveryDraft('de'),
            onChange: vi.fn()
          }
        )
      }
    )
  )
}

it.each(uiLanguages)(
  'shows no unsupported delivery controls for Piper in %s',
  language => {
    const html = render(language, piper)

    expect(html).toContain(
      translateUi(
        language,
        'narration.delivery.baseline',
        { adapter: 'piper' }
      )
    )

    expect(html).not.toContain(
      translateUi(
        language,
        'narration.delivery.style'
      )
    )

    expect(html).not.toContain(
      translateUi(
        language,
        'narration.delivery.pace'
      )
    )

    expect(html).not.toContain(
      translateUi(
        language,
        'narration.delivery.reference'
      )
    )
  }
)

it.each(uiLanguages)(
  'shows only reported expressive and own-voice controls in %s',
  language => {
    const html = render(language, expressive)

    for (const key of [
      'narration.delivery.language',
      'narration.delivery.style',
      'narration.delivery.pace',
      'narration.delivery.reference',
      'narration.delivery.referenceHelp'
    ] as const) {
      expect(html).toContain(
        translateUi(language, key)
      )
    }

    expect(html).toContain('My original recording')
    expect(html).not.toContain('Offline recording')
  }
)

it(
  'preserves original recording names and resets permission when the selected reference changes',
  () => {
    const html = renderToStaticMarkup(
      createElement(
        UiLanguageProvider,
        {
          initialLanguage: 'en',
          children: createElement(
            SpeechDeliveryControls,
            {
              project: project(),
              voice: expressive,
              draft: {
                ...defaultSpeechDeliveryDraft('fr'),
                referenceAssetId: 'own',
                referenceAuthorized: true
              },
              onChange: vi.fn()
            }
          )
        }
      )
    )

    expect(html).toContain('My original recording')
    expect(html).toContain('checked=""')
  }
)
