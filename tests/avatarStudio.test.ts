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
  AvatarStudioPanel
} from '../src/components/AvatarStudioPanel'

import {
  UiLanguageProvider
} from '../src/components/UiLanguageProvider'

import {
  bindAvatarVoice,
  createAvatarIdentity,
  createAvatarInstance,
  deriveAvatarVersion,
  setActiveAvatarVersion
} from '../src/core/avatarStudio'

import {
  createProject,
  parseProject
} from '../src/core/project'

import {
  uiLanguages
} from '../src/core/uiLanguage'

import {
  translateUi
} from '../src/core/uiMessages'

import {
  PersistentVersionHistory
} from '../src/core/versioning'

function fixture() {
  return parseProject({
    ...createProject(
      'Avatar Studio'
    ),
    storyboard: [{
      id: 'scene-1',
      title: 'Museum',
      description: '',
      durationMs: 5000
    }],
    assets: [
      {
        id: 'photo',
        kind: 'image',
        uri:
          'KINAOU/Assets/photo.png',
        managed: true,
        metadata: {
          name: 'Portrait'
        }
      },
      {
        id: 'photo-2',
        kind: 'image',
        uri:
          'KINAOU/Assets/photo-2.png',
        managed: true,
        metadata: {
          name: 'Second portrait'
        }
      },
      {
        id: 'video',
        kind: 'video',
        uri:
          'KINAOU/Assets/reference.mp4',
        managed: true,
        metadata: {
          name: 'Reference video'
        }
      },
      {
        id: 'voice',
        kind: 'audio',
        uri:
          'KINAOU/Assets/voice.wav',
        managed: true,
        metadata: {
          name: 'Own voice',
          durationMs: 2000
        }
      }
    ]
  })
}

function history() {
  const data =
    new Map<string, string>()

  return new PersistentVersionHistory({
    getItem:
      key =>
        data.get(key)
        ?? null,
    setItem:
      (key, value) => {
        data.set(key, value)
      },
    removeItem:
      key => {
        data.delete(key)
      }
  })
}

it(
  'keeps old schema-1 projects compatible with empty avatar collections',
  () => {
    const legacy = {
      ...createProject('Legacy')
    } as Record<string, unknown>

    delete legacy.avatars
    delete legacy.avatarInstances

    const parsed =
      parseProject(legacy)

    expect(parsed.avatars)
      .toEqual([])

    expect(
      parsed.avatarInstances
    ).toEqual([])
  }
)

it(
  'creates persistent identities from preset prompt image video and multiple references',
  () => {
    let project =
      fixture()

    const preset =
      createAvatarIdentity(
        project,
        {
          name: 'Preset',
          sourceKind: 'preset',
          presetId:
            'studio-presenter'
        }
      )

    project =
      preset.project

    const prompt =
      createAvatarIdentity(
        project,
        {
          name: 'Prompt',
          sourceKind: 'prompt',
          prompt:
            'Historian in a museum'
        }
      )

    project =
      prompt.project

    const image =
      createAvatarIdentity(
        project,
        {
          name: 'Image',
          sourceKind: 'image',
          assetIds: ['photo'],
          referenceAuthorized: true,
          referenceRightsBasis: 'own'
        }
      )

    project =
      image.project

    const video =
      createAvatarIdentity(
        project,
        {
          name: 'Video',
          sourceKind: 'video',
          assetIds: ['video'],
          referenceAuthorized: true,
          referenceRightsBasis: 'own'
        }
      )

    project =
      video.project

    const multi =
      createAvatarIdentity(
        project,
        {
          name: 'Multi',
          sourceKind:
            'multi-reference',
          assetIds: [
            'photo',
            'photo-2',
            'video'
          ],
          referenceAuthorized: true,
          referenceRightsBasis: 'own'
        }
      )

    expect(
      multi.project.avatars
    ).toHaveLength(5)

    expect(
      multi.avatar.versions[0]
        .source.assetIds
    ).toEqual([
      'photo',
      'photo-2',
      'video'
    ])

    expect(
      parseProject(
        JSON.parse(
          JSON.stringify(
            multi.project
          )
        )
      )
    ).toEqual(
      multi.project
    )
  }
)

it(
  'requires and stores explicit rights provenance for imported identity references',
  () => {
    const project =
      fixture()

    expect(
      () =>
        createAvatarIdentity(
          project,
          {
            name: 'No permission',
            sourceKind: 'image',
            assetIds: ['photo']
          }
        )
    ).toThrow(
      'Confirm that you own or are authorized'
    )

    const own =
      createAvatarIdentity(
        project,
        {
          name: 'Own source',
          sourceKind: 'image',
          assetIds: ['photo'],
          referenceAuthorized: true,
          referenceRightsBasis: 'own'
        },
        new Date(
          '2026-09-23T18:00:00.000Z'
        )
      )

    expect(
      own.version.source.rights
    ).toEqual({
      basis: 'own',
      commercialUseIntended: true,
      confirmedAt:
        '2026-09-23T18:00:00.000Z'
    })

    const permitted =
      createAvatarIdentity(
        own.project,
        {
          name: 'Authorized source',
          sourceKind: 'video',
          assetIds: ['video'],
          referenceAuthorized: true,
          referenceRightsBasis:
            'authorized'
        }
      )

    expect(
      permitted.version.source
        .rights.basis
    ).toBe('authorized')

    expect(
      permitted.version.source
        .rights.confirmedAt
    ).toBeTruthy()

    const generated =
      createAvatarIdentity(
        permitted.project,
        {
          name: 'Generated',
          sourceKind: 'prompt',
          prompt:
            'Original generated presenter'
        }
      )

    expect(
      generated.version.source
        .rights
    ).toEqual({
      basis: 'generated',
      commercialUseIntended: true
    })
  }
)

it(
  'creates non-destructive editable avatar versions and can return to an older version',
  () => {
    const created =
      createAvatarIdentity(
        fixture(),
        {
          name: 'Marc',
          sourceKind: 'image',
          assetIds: ['photo'],
          referenceAuthorized: true,
          referenceRightsBasis: 'own'
        }
      )

    const originalId =
      created.version.id

    const changed =
      deriveAvatarVersion(
        created.project,
        created.avatar.id,
        {
          label: 'Business',
          instruction:
            'Dark suit and friendlier expression'
        }
      )

    expect(
      changed.avatar.versions
    ).toHaveLength(2)

    expect(
      changed.avatar.activeVersionId
    ).toBe(
      changed.version.id
    )

    expect(
      changed.avatar.versions[0]
        .id
    ).toBe(originalId)

    const restored =
      setActiveAvatarVersion(
        changed.project,
        changed.avatar.id,
        originalId
      )

    expect(
      restored.avatar
        .activeVersionId
    ).toBe(originalId)

    expect(
      restored.avatar.versions
    ).toHaveLength(2)
  }
)

it(
  'binds an authorized project voice and carries it into scene instances',
  () => {
    const created =
      createAvatarIdentity(
        fixture(),
        {
          name: 'Marc',
          sourceKind: 'prompt',
          prompt:
            'Documentary presenter'
        }
      )

    const bound =
      bindAvatarVoice(
        created.project,
        created.avatar.id,
        'voice'
      )

    expect(
      bound.avatar.voiceAssetId
    ).toBe('voice')

    const placed =
      createAvatarInstance(
        bound.project,
        {
          avatarId:
            bound.avatar.id,
          sceneId: 'scene-1',
          prompt:
            'Explain the exhibit',
          environmentPrompt:
            'Museum gallery',
          motionPrompt:
            'Walk slowly',
          expressionPrompt:
            'Thoughtful'
        }
      )

    expect(
      placed.instance
    ).toMatchObject({
      avatarId:
        bound.avatar.id,
      versionId:
        bound.avatar
          .activeVersionId,
      sceneId: 'scene-1',
      voiceAssetId: 'voice',
      prompt:
        'Explain the exhibit',
      environmentPrompt:
        'Museum gallery',
      motionPrompt:
        'Walk slowly',
      expressionPrompt:
        'Thoughtful'
    })
  }
)

it(
  'rejects unavailable or contradictory identity sources',
  () => {
    const project =
      fixture()

    expect(
      () =>
        createAvatarIdentity(
          project,
          {
            name: 'Bad',
            sourceKind: 'image',
            assetIds: ['video'],
            referenceAuthorized: true,
            referenceRightsBasis: 'own'
          }
        )
    ).toThrow(
      'must be an image'
    )

    expect(
      () =>
        createAvatarIdentity(
          project,
          {
            name: 'Bad',
            sourceKind:
              'multi-reference',
            assetIds: ['photo']
          }
        )
    ).toThrow(
      '2–12'
    )

    expect(
      () =>
        createAvatarIdentity(
          project,
          {
            name: 'Bad',
            sourceKind: 'prompt',
            prompt: ' '
          }
        )
    ).toThrow(
      'Describe'
    )
  }
)

it.each(uiLanguages)(
  'renders Avatar Studio creation library editing and scene foundations in %s',
  language => {
    const base =
      fixture()

    const created =
      createAvatarIdentity(
        base,
        {
          name: 'Marc',
          sourceKind: 'image',
          assetIds: ['photo'],
          referenceAuthorized: true,
          referenceRightsBasis: 'own'
        }
      )

    const html =
      renderToStaticMarkup(
        createElement(
          UiLanguageProvider,
          {
            initialLanguage:
              language,
            children:
              createElement(
                AvatarStudioPanel,
                {
                  project:
                    created.project,
                  history:
                    history(),
                  workerUrl:
                    'http://127.0.0.1:43117',
                  workerToken:
                    'test-token',
                  workerConnected:
                    true,
                  workerCapabilities: [
                    'avatar-creation-receipt',
                    'avatar-identity-edit'
                  ],
                  onProjectChange:
                    vi.fn()
                }
              )
          }
        )
      )

    for (
      const key of [
        'avatar.heading',
        'avatar.createHeading',
        'avatar.library',
        'avatar.editor',
        'avatar.versions',
        'avatar.sceneHeading',
        'avatar.createInstance',
        'avatar.boundary',
        'avatar.rightsStored',
        'avatar.receiptsHeading',
        'avatar.receiptsTitle',
        'avatar.receiptsHelp',
        'avatar.receiptsEmpty',
        'avatar.generateHeading',
        'avatar.generateHelp',
        'avatar.generate',
        'avatar.referencePackHeading',
        'avatar.referencePackHelp'
      ] as const
    ) {
      expect(html)
        .toContain(
          translateUi(
            language,
            key,
            key === 'avatar.rightsStored'
              ? { basis: 'own' }
              : {}
          )
        )
    }

    expect(html)
      .toContain('Marc')

    expect(html)
      .toContain('Portrait')

    expect(html)
      .toContain('Own voice')
  }
)
