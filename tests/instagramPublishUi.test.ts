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
  PublishPanel
} from '../src/components/PublishPanel'

import {
  UiLanguageProvider
} from '../src/components/UiLanguageProvider'

import {
  createProject
} from '../src/core/project'

import {
  uiLanguages
} from '../src/core/uiLanguage'

import {
  translateUi
} from '../src/core/uiMessages'


it.each(
  uiLanguages
)(
  'renders explicit Instagram Reel publishing in %s without mutating the project',
  language => {
    const project =
      createProject(
        'Instagram UI Demo',
        new Date(
          '2026-09-26T22:00:00.000Z'
        )
      )

    const before =
      JSON.stringify(
        project
      )

    const persist =
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
                PublishPanel,
                {
                  project,

                  workerUrl:
                    'http://127.0.0.1:43117',

                  workerToken:
                    'worker-token',

                  workerConnected:
                    true,

                  workerCapabilities: [
                    'publish-package-library',
                    'publish-package-integrity',
                    'publish-credentials',
                    'instagram-oauth',
                    'instagram-publish'
                  ],

                  onProjectChange:
                    persist
                }
              )
          }
        )
      )


    for (
      const key
      of [
        'publish.instagram.eyebrow',
        'publish.instagram.heading',
        'publish.instagram.delivery.heading',
        'publish.instagram.connection.check',
        'publish.instagram.oauth.start',
        'publish.instagram.packages.load',
        'publish.instagram.publish'
      ] as const
    ) {
      expect(
        html
      ).toContain(
        translateUi(
          language,
          key
        )
      )
    }


    expect(
      JSON.stringify(
        project
      )
    ).toBe(
      before
    )


    expect(
      persist
    ).not.toHaveBeenCalled()
  }
)


it.each(
  uiLanguages
)(
  'contains translated manual callback and pending-resume states in %s',
  language => {
    expect(
      translateUi(
        language,
        'publish.instagram.oauth.callback'
      )
    ).not.toBe(
      'publish.instagram.oauth.callback'
    )


    expect(
      translateUi(
        language,
        'publish.instagram.pending.check'
      )
    ).not.toBe(
      'publish.instagram.pending.check'
    )


    expect(
      translateUi(
        language,
        'publish.instagram.confirm'
      )
    ).not.toBe(
      'publish.instagram.confirm'
    )
  }
)
