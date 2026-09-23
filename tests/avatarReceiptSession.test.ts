import {
  expect,
  it,
  vi
} from 'vitest'

import {
  exportAvatarReceiptEvidence
} from '../src/core/avatarReceiptSession'

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
    adapterId:
      'fixture-adapter',
    engineId:
      'fixture-engine',
    engineVersion:
      '1.0.0',
    modelId:
      'fixture-model',
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

function fixture() {
  const base =
    parseProject({
      ...createProject(
        'Avatar receipt session'
      ),
      assets: [
        {
          id: 'reference',
          kind: 'image',
          uri:
            'KINAOU/Assets/reference.png',
          managed: true,
          metadata: {
            name: 'Reference'
          }
        },
        {
          id: 'output',
          kind: 'image',
          uri:
            'KINAOU/Assets/GeneratedImages/output.png',
          managed: true,
          metadata: {
            generated: true,
            name:
              'Generated avatar'
          }
        }
      ]
    })

  const avatar =
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

  return registerAvatarGeneratedTake(
    avatar.project,
    {
      avatarId:
        avatar.avatar.id,
      versionId:
        avatar.version.id,
      outputAssetId:
        'output',
      jobId:
        'avatar-job-1',
      seed: 42,
      prompt:
        'Marc in a museum',
      engine
    }
  )
}

it(
  'exports the exact stored creation receipt and persists worker evidence',
  async () => {
    const generated =
      fixture()

    const client = {
      exportAvatarCreationReceipt:
        vi.fn(
          async (
            document: unknown
          ) => {
            const typed =
              document as {
                receipt: {
                  id: string
                }
                output: {
                  id: string
                  uri: string
                }
                sources: Array<{
                  id: string
                  uri: string
                }>
              }

            expect(
              typed.receipt.id
            ).toBe(
              generated.receipt.id
            )

            expect(
              typed.output
            ).toMatchObject({
              id: 'output',
              uri:
                'KINAOU/Assets/GeneratedImages/output.png'
            })

            expect(
              typed.sources
            ).toEqual([
              expect.objectContaining({
                id: 'reference',
                uri:
                  'KINAOU/Assets/reference.png'
              })
            ])

            return {
              schemaVersion:
                1 as const,
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
                  'KINAOU/Assets/GeneratedImages/output.png',
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
            }
          }
        )
    }

    const result =
      await exportAvatarReceiptEvidence(
        generated.project,
        generated.receipt.id,
        client
      )

    expect(
      client
        .exportAvatarCreationReceipt
    ).toHaveBeenCalledTimes(1)

    expect(
      result.project
        .avatarCreationReceipts[0]
        .outputSha256
    ).toBe(
      'b'.repeat(64)
    )

    expect(
      result.project
        .avatarCreationReceipts[0]
        .sourceHashes
    ).toEqual({
      reference:
        'a'.repeat(64)
    })

    expect(
      result.project
        .avatarCreationReceipts[0]
        .metadata
    ).toMatchObject({
      receiptExportPath:
        `KINAOU/Receipts/Avatars/${generated.receipt.id}.json`,
      receiptFileSha256:
        'c'.repeat(64)
    })
  }
)

it(
  'rejects evidence returned for a different receipt identity',
  async () => {
    const generated =
      fixture()

    await expect(
      exportAvatarReceiptEvidence(
        generated.project,
        generated.receipt.id,
        {
          async exportAvatarCreationReceipt() {
            return {
              schemaVersion: 1,
              receiptId:
                'different-receipt',
              path:
                'KINAOU/Receipts/Avatars/different-receipt.json',
              createdAt:
                '2026-09-23T20:30:00.000Z',
              sizeBytes: 1,
              documentSha256:
                'c'.repeat(64),
              output: {
                id: 'output',
                path:
                  'KINAOU/Assets/GeneratedImages/output.png',
                sizeBytes: 1,
                sha256:
                  'b'.repeat(64)
              },
              sources: [{
                id: 'reference',
                path:
                  'KINAOU/Assets/reference.png',
                sizeBytes: 1,
                sha256:
                  'a'.repeat(64)
              }]
            }
          }
        }
      )
    ).rejects.toThrow(
      'different receipt'
    )
  }
)
