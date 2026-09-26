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
  recordSuccessfulExport
} from '../src/core/exportHistory'

import {
  createProject
} from '../src/core/project'

import {
  saveProjectPublishDefaults
} from '../src/core/publishPackage'

import {
  uiLanguages
} from '../src/core/uiLanguage'

import {
  translateUi
} from '../src/core/uiMessages'


function verticalProject() {
  return recordSuccessfulExport(
    createProject(
      'Placement Demo',
      new Date(
        '2026-09-26T12:00:00.000Z'
      )
    ),
    {
      jobId:
        'vertical-job',

      label:
        'Reviewed Short',

      outputRelativePath:
        'KINAOU/Renders/placement_vertical.mp4',

      format:
        'vertical',

      range: {
        inMs:
          0,

        outMs:
          60_000
      },

      sceneIds:
        [
          'scene-1'
        ],

      durationMs:
        60_000,

      sizeBytes:
        1000,

      completedAt:
        '2026-09-26T12:01:00.000Z'
    },
    new Date(
      '2026-09-26T12:01:00.000Z'
    )
  )
}


it.each(
  uiLanguages
)(
  'shows explicit publish placement review in %s without mutating the project',
  language => {
    const project =
      verticalProject()

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
                    '',

                  workerToken:
                    '',

                  workerConnected:
                    false,

                  workerCapabilities:
                    [],

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
        'publish.placement'
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.placement.youtube-video'
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.placement.youtube-short'
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.placement.review.eyebrow'
      )
    )

    expect(
      html
    ).toContain(
      translateUi(
        language,
        'publish.placement.review.ready'
      )
    )

    expect(
      html
    ).toContain(
      `>${translateUi(
        language,
        'publish.placement.youtube-short'
      )}</option>`
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


it(
  'renders placement readiness separately from worker preflight',
  () => {
    const project =
      verticalProject()

    const html =
      renderToStaticMarkup(
        createElement(
          UiLanguageProvider,
          {
            initialLanguage:
              'en',

            children:
              createElement(
                PublishPanel,
                {
                  project,
                  workerUrl:
                    '',

                  workerToken:
                    '',

                  workerConnected:
                    false,

                  workerCapabilities:
                    [],

                  onProjectChange:
                    vi.fn()
                }
              )
          }
        )
      )

    expect(
      html
    ).toContain(
      'YouTube Short'
    )

    expect(
      html
    ).toContain(
      'Preferred KINAOU format: Vertical'
    )

    expect(
      html
    ).not.toContain(
      'MP4 matches its export receipt'
    )
  }
)


it(
  'restores an explicit saved placement instead of inferring it again from a vertical export',
  () => {
    const project =
      saveProjectPublishDefaults(
        verticalProject(),
        {
          platform:
            'youtube',

          placement:
            'youtube-video',

          title:
            'Placement Demo',

          description:
            '',

          tags:
            ''
        },
        new Date(
          '2026-09-26T12:02:00.000Z'
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
              'en',

            children:
              createElement(
                PublishPanel,
                {
                  project,
                  workerUrl:
                    '',

                  workerToken:
                    '',

                  workerConnected:
                    false,

                  workerCapabilities:
                    [],

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
      '<option value="youtube-video" selected="">YouTube Video</option>'
    )

    expect(
      html
    ).toContain(
      'Saved for this project · YouTube Video'
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
