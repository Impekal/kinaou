import {
  expect,
  it
} from 'vitest'

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

const engine:
  AvatarEngineDescriptor = {
    adapterId: 'fixture',
    engineId: 'fixture',
    engineVersion: '1',
    modelId: 'fixture',
    capabilities: [
      'identity-preservation',
      'scene-image'
    ],
    rights: {
      licenseName: 'Fixture',
      licenseSnapshotAt:
        '2026-09-23T18:00:00.000Z',
      privateUse: 'allowed',
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

function fixture() {
  return parseProject({
    ...createProject(
      'Receipt evidence'
    ),
    assets: [
      {
        id: 'reference',
        kind: 'image',
        uri:
          'KINAOU/Assets/reference.png',
        managed: true,
        metadata: {}
      },
      {
        id: 'output',
        kind: 'image',
        uri:
          'KINAOU/Assets/GeneratedImages/output.png',
        managed: true,
        metadata: {
          generated: true
        }
      }
    ]
  })
}

it(
  'persists real worker evidence in the creation receipt',
  () => {
    const avatar =
      createAvatarIdentity(
        fixture(),
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
        avatar.project,
        {
          avatarId:
            avatar.avatar.id,
          versionId:
            avatar.version.id,
          outputAssetId:
            'output',
          jobId: 'job-1',
          engine
        }
      )

    const next =
      applyAvatarReceiptEvidence(
        generated.project,
        generated.receipt.id,
        {
          schemaVersion: 1,
          receiptId:
            generated.receipt.id,
          path:
            `KINAOU/Receipts/Avatars/${generated.receipt.id}.json`,
          createdAt:
            '2026-09-23T20:00:00.000Z',
          sizeBytes: 400,
          documentSha256:
            'c'.repeat(64),
          output: {
            id: 'output',
            path:
              'KINAOU/Assets/GeneratedImages/output.png',
            sizeBytes: 200,
            sha256:
              'b'.repeat(64)
          },
          sources: [{
            id: 'reference',
            path:
              'KINAOU/Assets/reference.png',
            sizeBytes: 100,
            sha256:
              'a'.repeat(64)
          }]
        }
      )

    const receipt =
      next.avatarCreationReceipts[0]

    expect(
      receipt.sourceHashes
    ).toEqual({
      reference:
        'a'.repeat(64)
    })

    expect(
      receipt.outputSha256
    ).toBe(
      'b'.repeat(64)
    )

    expect(
      receipt.metadata
    ).toMatchObject({
      evidenceCapturedAt:
        '2026-09-23T20:00:00.000Z',
      receiptExportPath:
        `KINAOU/Receipts/Avatars/${receipt.id}.json`,
      receiptFileSha256:
        'c'.repeat(64),
      outputSizeBytes: 200
    })
  }
)

it(
  'rejects mismatching worker evidence',
  () => {
    const avatar =
      createAvatarIdentity(
        fixture(),
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
        avatar.project,
        {
          avatarId:
            avatar.avatar.id,
          versionId:
            avatar.version.id,
          outputAssetId:
            'output',
          jobId: 'job',
          engine
        }
      )

    expect(
      () =>
        applyAvatarReceiptEvidence(
          generated.project,
          generated.receipt.id,
          {
            schemaVersion: 1,
            receiptId:
              generated.receipt.id,
            path:
              `KINAOU/Receipts/Avatars/${generated.receipt.id}.json`,
            createdAt:
              '2026-09-23T20:00:00.000Z',
            sizeBytes: 400,
            documentSha256:
              'c'.repeat(64),
            output: {
              id: 'reference',
              path:
                'KINAOU/Assets/GeneratedImages/output.png',
              sizeBytes: 200,
              sha256:
                'b'.repeat(64)
            },
            sources: [{
              id: 'reference',
              path:
                'KINAOU/Assets/reference.png',
              sizeBytes: 100,
              sha256:
                'a'.repeat(64)
            }]
          }
        )
    ).toThrow(
      'output evidence'
    )
  }
)
