import {
  createElement
} from 'react'

import {
  renderToStaticMarkup
} from 'react-dom/server'

import {
  expect,
  it,
  vi
} from 'vitest'

import {
  ShortAudioReviewSummary
} from '../src/components/ShortAudioFinishingPanel'

import {
  UiLanguageProvider
} from '../src/components/UiLanguageProvider'

import {
  uiLanguages
} from '../src/core/uiLanguage'

import {
  translateUi
} from '../src/core/uiMessages'

import type {
  ShortAudioFinishingReview
} from '../src/core/shortAudioFinishing'


const review:
  ShortAudioFinishingReview = {
    projectKey:
      'key',

    current: {
      audioDucking: {
        enabled:
          true,

        reductionDb:
          12,

        attackMs:
          150,

        releaseMs:
          400
      },

      loudnessNormalization: {
        enabled:
          false,

        targetLufs:
          -14,

        truePeakDb:
          -1.5,

        loudnessRange:
          11
      }
    },

    proposed: {
      audioDucking: {
        enabled:
          true,

        reductionDb:
          8,

        attackMs:
          100,

        releaseMs:
          300
      },

      loudnessNormalization: {
        enabled:
          true,

        targetLufs:
          -16,

        truePeakDb:
          -2,

        loudnessRange:
          9
      }
    },

    warnings: [
      {
        code:
          'ducking-without-music',

        message:
          'No active music.'
      }
    ]
  }


it.each(
  uiLanguages
)(
  'renders explicit Short audio before/after review in %s',
  language => {
    const html =
      renderToStaticMarkup(
        createElement(
          UiLanguageProvider,
          {
            initialLanguage:
              language,

            children:
              createElement(
                ShortAudioReviewSummary,
                {
                  review
                }
              )
          }
        )
      )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'shortAudio.current'
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'shortAudio.proposed'
      )
    )

    expect(
      html
    ).toContain(
      '-16 LUFS'
    )

    expect(
      html
    ).toContain(
      'No active music.'
    )

    expect(
      vi.fn()
    ).not.toHaveBeenCalled()
  }
)
