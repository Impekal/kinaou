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
  CaptionEditor,
  CaptionStyleDraft
} from '../src/components/CaptionEditor'

import {
  UiLanguageProvider
} from '../src/components/UiLanguageProvider'

import {
  addCaption
} from '../src/core/captions'

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
  PersistentVersionHistory
} from '../src/core/versioning'


function history() {
  const values =
    new Map<
      string,
      string
    >()

  return new PersistentVersionHistory({
    getItem:
      key =>
        values.get(
          key
        )
        ?? null,

    setItem:
      (
        key,
        value
      ) => {
        values.set(
          key,
          value
        )
      },

    removeItem:
      key => {
        values.delete(
          key
        )
      }
  })
}


function project() {
  return addCaption(
    createProjectFromInput({
      title:
        'Styled captions',

      kind:
        'idea',

      content:
        ''
    }),
    {
      text:
        'Caption',

      startMs:
        0,

      durationMs:
        2000
    }
  )
}


it.each(
  uiLanguages
)(
  'renders caption style controls in %s without mutating the project',
  language => {
    const saved =
      project()

    const before =
      JSON.stringify(
        saved
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
                CaptionEditor,
                {
                  project:
                    saved,

                  history:
                    history(),

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
        'caption.styleHeading',
        'caption.stylePreset',
        'caption.stylePosition',
        'caption.styleSize',
        'caption.styleApply',
        'caption.styleReset'
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
      html
    ).toContain(
      'value="clean"'
    )

    expect(
      html
    ).toContain(
      'value="bottom"'
    )

    expect(
      html
    ).toContain(
      'value="medium"'
    )

    expect(
      JSON.stringify(
        saved
      )
    ).toBe(
      before
    )

    expect(
      persist
    ).not.toHaveBeenCalled()
  }
)


it(
  'shows an explicitly saved style as the current reviewed values',
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
                CaptionStyleDraft,
                {
                  saved: {
                    preset:
                      'boxed',

                    position:
                      'top',

                    size:
                      'large'
                  },

                  explicit:
                    true,

                  locked:
                    false,

                  save:
                    vi.fn(),

                  reset:
                    vi.fn()
                }
              )
          }
        )
      )

    expect(
      html
    ).toContain(
      '<option value="boxed" selected="">'
    )

    expect(
      html
    ).toContain(
      '<option value="top" selected="">'
    )

    expect(
      html
    ).toContain(
      '<option value="large" selected="">'
    )
  }
)


it(
  'disables style application and reset on a locked caption',
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
                CaptionStyleDraft,
                {
                  saved: {
                    preset:
                      'strong',

                    position:
                      'center',

                    size:
                      'small'
                  },

                  explicit:
                    true,

                  locked:
                    true,

                  save:
                    vi.fn(),

                  reset:
                    vi.fn()
                }
              )
          }
        )
      )

    expect(
      html.match(
        /disabled=""/g
      )?.length
    ).toBeGreaterThanOrEqual(
      5
    )
  }
)
