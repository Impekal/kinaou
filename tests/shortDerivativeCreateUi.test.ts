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
  ShortDerivativeCreateAction
} from '../src/components/ShortIntelligencePanel'

import {
  UiLanguageProvider
} from '../src/components/UiLanguageProvider'

import {
  uiLanguages
} from '../src/core/uiLanguage'

import {
  translateUi
} from '../src/core/uiMessages'


it.each(
  uiLanguages
)(
  'renders the explicit derivative creation action in %s',
  language => {
    const disabled =
      renderToStaticMarkup(
        createElement(
          UiLanguageProvider,
          {
            initialLanguage:
              language,

            children:
              createElement(
                ShortDerivativeCreateAction,
                {
                  ready:
                    false,

                  creating:
                    false,

                  onCreate:
                    vi.fn()
                }
              )
          }
        )
      )

    expect(
      disabled
    ).toContain(
      translateUi(
        language,
        'shortIntelligence.createHelp'
      )
        .replaceAll(
          '&',
          '&amp;'
        )
    )

    expect(
      disabled
    ).toContain(
      translateUi(
        language,
        'shortIntelligence.create'
      )
    )

    expect(
      disabled
    ).toContain(
      'disabled=""'
    )

    const enabled =
      renderToStaticMarkup(
        createElement(
          UiLanguageProvider,
          {
            initialLanguage:
              language,

            children:
              createElement(
                ShortDerivativeCreateAction,
                {
                  ready:
                    true,

                  creating:
                    false,

                  onCreate:
                    vi.fn()
                }
              )
          }
        )
      )

    expect(
      enabled
    ).not.toContain(
      'disabled=""'
    )
  }
)


it(
  'shows a non-clickable creating state while a child project is being persisted',
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
                ShortDerivativeCreateAction,
                {
                  ready:
                    true,

                  creating:
                    true,

                  onCreate:
                    vi.fn()
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
        'shortIntelligence.creating'
      )
    )

    expect(
      html
    ).toContain(
      'disabled=""'
    )
  }
)
