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
  ShortReframeReviewChanges
} from '../src/components/ShortFinishingPanel'

import {
  UiLanguageProvider
} from '../src/components/UiLanguageProvider'

import type {
  ShortReframeReview
} from '../src/core/shortReframing'

import {
  uiLanguages
} from '../src/core/uiLanguage'

import {
  translateUi
} from '../src/core/uiMessages'


const review:
  ShortReframeReview = {
    projectKey:
      'project-key',

    targetFormat:
      'vertical',

    proposal: {
      schemaVersion:
        1,

      title:
        'Review',

      objective:
        'Review',

      operations: [
        {
          id:
            'left',

          trackId:
            'video',

          clipId:
            'clip',

          sceneId:
            'scene',

          focusX:
            0.2,

          focusY:
            0.6,

          reason:
            'Subject is explicitly described on the left.'
        }
      ],

      provenance: {
        kind:
          'local-model',

        adapterId:
          'ollama',

        modelId:
          'qwen:7b'
      }
    },

    changes: [
      {
        operationId:
          'left',

        trackId:
          'video',

        clipId:
          'clip',

        sceneId:
          'scene',

        reason:
          'Subject is explicitly described on the left.',

        current: {
          focusX:
            0.5,

          focusY:
            0.5
        },

        proposed: {
          focusX:
            0.2,

          focusY:
            0.6
        }
      }
    ]
  }


it.each(
  uiLanguages
)(
  'renders explicit Short reframing before/after review in %s',
  language => {
    const onToggle =
      vi.fn()

    const html =
      renderToStaticMarkup(
        createElement(
          UiLanguageProvider,
          {
            initialLanguage:
              language,

            children:
              createElement(
                ShortReframeReviewChanges,
                {
                  review,

                  selected:
                    [],

                  busy:
                    false,

                  onToggle
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
        'shortFinish.before'
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'shortFinish.after'
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'shortFinish.focus',
        {
          x:
            50,

          y:
            50
        }
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'shortFinish.focus',
        {
          x:
            20,

          y:
            60
        }
      )
    )

    expect(
      html
    ).toContain(
      'Subject is explicitly described on the left.'
    )

    expect(
      html
    ).toContain(
      'type="checkbox"'
    )

    expect(
      onToggle
    ).not.toHaveBeenCalled()
  }
)


it(
  'marks only explicitly selected reframing changes as checked',
  () => {
    const html =
      renderToStaticMarkup(
        createElement(
          UiLanguageProvider,
          {
            initialLanguage:
              'en',

            children:
              createElement(
                ShortReframeReviewChanges,
                {
                  review,

                  selected: [
                    'left'
                  ],

                  busy:
                    false,

                  onToggle:
                    vi.fn()
                }
              )
          }
        )
      )

    expect(
      html
    ).toContain(
      'checked=""'
    )
  }
)
