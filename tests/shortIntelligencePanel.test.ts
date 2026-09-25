import {
  createElement
} from 'react'

import {
  renderToStaticMarkup
} from 'react-dom/server'

import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  ShortIntelligencePanel
} from '../src/components/ShortIntelligencePanel'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  uiLanguages
} from '../src/core/uiLanguage'

import {
  translateUi
} from '../src/core/uiMessages'

import {
  UiLanguageProvider
} from '../src/components/UiLanguageProvider'


function fixture() {
  const project =
    createProjectFromInput({
      title:
        'Short UI',

      kind:
        'video',

      content:
        ''
    })

  project.assets.push({
    id:
      'image',

    kind:
      'image',

    uri:
      'KINAOU/Assets/image.png',

    managed:
      true,

    offline:
      false,

    metadata: {
      name:
        'Scene image'
    }
  })

  project.storyboard = [
    {
      id:
        'scene',

      title:
        'Opening',

      description:
        'Opening scene',

      durationMs:
        5000,

      assetId:
        'image'
    }
  ]

  project.tracks
    .find(
      track =>
        track.type
        === 'video'
    )!
    .clips.push({
      id:
        'clip',

      assetId:
        'image',

      startMs:
        0,

      durationMs:
        5000,

      sourceOffsetMs:
        0,

      gain:
        1,

      speed:
        1,

      sceneId:
        'scene'
    })

  return project
}


describe(
  'Short Intelligence product surface',
  () => {
    it.each(
      uiLanguages
    )(
      'renders review-only Short intelligence controls in %s',
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
                    ShortIntelligencePanel,
                    {
                      project:
                        fixture(),

                      maximumDurationMs:
                        60_000,

                      workerUrl:
                        'http://127.0.0.1:43117',

                      workerToken:
                        '',

                      workerConnected:
                        false,

                      workerCapabilities:
                        [],

                      disabled:
                        false
                    }
                  )
              }
            )
          )

        for (
          const key
          of [
            'shortIntelligence.heading',
            'shortIntelligence.help',
            'shortIntelligence.detect',
            'shortIntelligence.generate',
            'shortIntelligence.policy'
          ] as const
        ) {
          expect(
            html
          ).toContain(
            translateUi(
              language,
              key
            )
              .replaceAll(
                '&',
                '&amp;'
              )
          )
        }

        expect(
          html
        ).toContain(
          'disabled=""'
        )
      }
    )

    it(
      'reports real evidence readiness without claiming model availability',
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
                    ShortIntelligencePanel,
                    {
                      project:
                        fixture(),

                      maximumDurationMs:
                        60_000,

                      workerUrl:
                        'http://127.0.0.1:43117',

                      workerToken:
                        '',

                      workerConnected:
                        false,

                      workerCapabilities:
                        [],

                      disabled:
                        false
                    }
                  )
              }
            )
          )

        expect(
          html
        ).toContain(
          translateUi(
            'en',
            'shortIntelligence.ready'
          )
        )

        expect(
          html
        ).toContain(
          '1 anchored scenes'
        )

        expect(
          html
        ).toContain(
          '0 transcript segments'
        )

        /*
         * Preview availability is intentionally not shown before there is
         * a reviewed proposal + explicit highlight selection. At this stage
         * the truthful product state is simply that model actions are disabled.
         */
        expect(
          html
        ).not.toContain(
          translateUi(
            'en',
            'shortIntelligence.previewUnavailable'
          )
        )

        expect(
          html
        ).toContain(
          translateUi(
            'en',
            'shortIntelligence.chooseModel'
          )
        )

        expect(
          html
        ).toContain(
          'disabled=""'
        )

        expect(
          vi.isMockFunction(
            fetch
          )
        ).toBe(false)
      }
    )
  }
)
