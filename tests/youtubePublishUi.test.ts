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
  translateUi
} from '../src/core/uiMessages'

import {
  uiLanguages
} from '../src/core/uiLanguage'


it.each(
  uiLanguages
)(
  'renders explicit private YouTube publishing controls in %s without mutating the project',
  language => {
    const project =
      createProject(
        'YouTube UI Demo',
        new Date(
          '2026-09-26T20:00:00.000Z'
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
                    'youtube-oauth',
                    'youtube-publish'
                  ],

                  onProjectChange:
                    persist
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
        'publish.youtube.eyebrow'
      )
    )


    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.youtube.heading'
      )
    )


    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.youtube.private.heading'
      )
    )


    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.youtube.connection.check'
      )
    )


    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.youtube.oauth.start'
      )
    )


    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.youtube.packages.load'
      )
    )


    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.youtube.upload'
      )
    )


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
