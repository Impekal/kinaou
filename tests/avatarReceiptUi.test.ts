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
  applyAvatarReceiptEvidence
} from '../src/core/avatarReceipt'

import {
  registerAvatarGeneratedTake
} from '../src/core/avatarGeneration'

import {
  createAvatarIdentity
} from '../src/core/avatarStudio'

import {
  createProject,
  parseProject,
  type AvatarEngineDescriptor
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
        data.set(
          key,
          value
        )
      },
    removeItem:
      key => {
        data.delete(key)
      }
  })
}

const engine:
  AvatarEngineDescriptor = {
    adapterId:
      'fixture-adapter',
    engineId:
      'identity-engine',
    engineVersion:
      '1.0.0',
    modelId:
      'identity-model',
    modelVersion:
      '2026-09',
    capabilities: [
      'identity-preservation',
      'scene-image'
    ],
    rights: {
      licenseName:
        'Fixture License',
      licenseSnapshotAt:
        '2026-09-23T18:00:00.000Z',
      privateUse:
        'allowed',
      commercialOutput:
        'allowed',
      commercialSoftwareUse:
        'unknown',
      modelRedistribution:
        'unknown',
      attributionRequired:
        false,
      notes: ''
    }
  }

function securedProject() {
  const base =
    parseProject({
      ...createProject(
        'Secured Avatar'
      ),
      assets: [
        {
          id: 'reference',
          kind: 'image',
          uri:
            'KINAOU/Assets/reference.png',
          managed: true,
          metadata: {
            name:
              'Identity reference'
          }
        },
        {
          id: 'output',
          kind: 'image',
          uri:
            'KINAOU/Assets/GeneratedImages/marc.png',
          managed: true,
          metadata: {
            generated: true,
            name:
              'Marc · Museum'
          }
        }
      ]
    })

  const created =
    createAvatarIdentity(
      base,
      {
        name: 'Marc',
        sourceKind: 'image',
        assetIds: [
          'reference'
        ],
        referenceAuthorized:
          true,
        referenceRightsBasis:
          'own'
      }
    )

  const generated =
    registerAvatarGeneratedTake(
      created.project,
      {
        avatarId:
          created.avatar.id,
        versionId:
          created.version.id,
        outputAssetId:
          'output',
        jobId:
          'avatar-job-42',
        seed: 42,
        prompt:
          'Marc presenting in a museum',
        engine
      },
      new Date(
        '2026-09-23T20:00:00.000Z'
      )
    )

  return applyAvatarReceiptEvidence(
    generated.project,
    generated.receipt.id,
    {
      schemaVersion: 1,
      receiptId:
        generated.receipt.id,
      path:
        `KINAOU/Receipts/Avatars/${generated.receipt.id}.json`,
      createdAt:
        '2026-09-23T20:30:00.000Z',
      sizeBytes: 900,
      documentSha256:
        'c'.repeat(64),
      output: {
        id: 'output',
        path:
          'KINAOU/Assets/GeneratedImages/marc.png',
        sizeBytes: 500,
        sha256:
          'b'.repeat(64)
      },
      sources: [{
        id: 'reference',
        path:
          'KINAOU/Assets/reference.png',
        sizeBytes: 400,
        sha256:
          'a'.repeat(64)
      }]
    },
    new Date(
      '2026-09-23T20:31:00.000Z'
    )
  )
}

it.each(
  uiLanguages
)(
  'renders secured Creation Receipt evidence truthfully in %s',
  language => {
    const project =
      securedProject()

    const receipt =
      project
        .avatarCreationReceipts[0]

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
                  project,
                  history:
                    history(),
                  workerUrl:
                    'http://127.0.0.1:43117',
                  workerToken:
                    'test-token',
                  workerConnected:
                    true,
                  workerCapabilities: [
                    'avatar-creation-receipt'
                  ],
                  onProjectChange:
                    vi.fn()
                }
              )
          }
        )
      )

    expect(html)
      .toContain(
        translateUi(
          language,
          'avatar.receiptsTitle'
        )
      )

    expect(html)
      .toContain(
        translateUi(
          language,
          'avatar.receiptReady'
        )
      )

    expect(html)
      .toContain(
        translateUi(
          language,
          'avatar.receiptCommercial',
          {
            status:
              translateUi(
                language,
                'avatar.rightStatus.allowed'
              )
          }
        )
      )

    expect(html)
      .toContain(
        translateUi(
          language,
          'avatar.receiptVerify'
        ).replaceAll(
          '&',
          '&amp;'
        )
      )

    expect(html)
      .toContain(
        receipt.outputSha256
        ?? ''
      )

    expect(html)
      .toContain(
        String(
          receipt.metadata
            .receiptFileSha256
        )
      )

    expect(html)
      .toContain(
        String(
          receipt.metadata
            .receiptExportPath
        )
      )

    expect(html)
      .toContain(
        'identity-engine'
      )

    expect(html)
      .toContain(
        'identity-model'
      )

    expect(html)
      .toContain(
        'Marc · Museum'
      )
  }
)
