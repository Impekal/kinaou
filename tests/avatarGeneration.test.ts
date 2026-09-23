import {
  expect,
  it
} from 'vitest'

import {
  avatarCreationReceiptDocument,
  registerAvatarGeneratedTake
} from '../src/core/avatarGeneration'

import {
  createAvatarIdentity,
  createAvatarInstance,
  deriveAvatarVersion
} from '../src/core/avatarStudio'

import {
  createProject,
  parseProject,
  type AvatarEngineDescriptor
} from '../src/core/project'

function engine(
  commercialOutput:
    | 'allowed'
    | 'restricted'
    | 'unknown' = 'allowed'
): AvatarEngineDescriptor {
  return {
    adapterId:
      'fixture-adapter',
    engineId:
      'fixture-identity',
    engineVersion:
      '1.0.0',
    modelId:
      'fixture-model',
    modelVersion:
      '2026-09',
    capabilities: [
      'identity-generation',
      'identity-preservation',
      'targeted-edit',
      'image-reference',
      'video-reference',
      'multi-reference',
      'scene-image',
      'scene-video'
    ],
    rights: {
      licenseName:
        'Apache-2.0 fixture',
      licenseUrl:
        'https://www.apache.org/licenses/LICENSE-2.0',
      licenseSnapshotAt:
        '2026-09-23T18:00:00.000Z',
      privateUse: 'allowed',
      commercialOutput,
      commercialSoftwareUse:
        'allowed',
      modelRedistribution:
        'allowed',
      attributionRequired:
        true,
      notes:
        'Fixture only'
    }
  }
}

function fixture() {
  return parseProject({
    ...createProject('Avatar receipt'),
    assets: [
      {
        id: 'reference',
        kind: 'image',
        uri:
          'KINAOU/Assets/reference.png',
        managed: true,
        metadata: {
          name:
            'Own reference'
        }
      },
      {
        id: 'generated-1',
        kind: 'image',
        uri:
          'KINAOU/Assets/GeneratedImages/a.png',
        managed: true,
        metadata: {
          generated: true,
          imageJobId: 'job-1'
        }
      },
      {
        id: 'generated-2',
        kind: 'image',
        uri:
          'KINAOU/Assets/GeneratedImages/b.png',
        managed: true,
        metadata: {
          generated: true,
          imageJobId: 'job-2'
        }
      },
      {
        id: 'generated-video',
        kind: 'video',
        uri:
          'KINAOU/Assets/GeneratedVideo/v.mp4',
        managed: true,
        metadata: {
          generated: true,
          videoJobId:
            'job-video'
        }
      }
    ]
  })
}

it(
  'registers a generated take with engine rights and a durable creation receipt',
  () => {
    const created =
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

    const sourceHash =
      'a'.repeat(64)

    const outputHash =
      'b'.repeat(64)

    const saved =
      registerAvatarGeneratedTake(
        created.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            created.version.id,
          outputAssetId:
            'generated-1',
          jobId: 'job-1',
          seed: 42,
          prompt:
            'Same person in a museum',
          engine: engine(),
          sourceHashes: {
            reference:
              sourceHash
          },
          outputSha256:
            outputHash
        },
        new Date(
          '2026-09-23T19:00:00.000Z'
        )
      )

    expect(
      saved.project
        .avatarCreationReceipts
    ).toHaveLength(1)

    expect(
      saved.receipt
    ).toMatchObject({
      avatarId:
        created.avatar.id,
      versionId:
        created.version.id,
      outputAssetId:
        'generated-1',
      outputKind:
        'image',
      jobId: 'job-1',
      seed: 42,
      sourceAssetIds: [
        'reference'
      ],
      sourceHashes: {
        reference:
          sourceHash
      },
      outputSha256:
        outputHash
    })

    expect(
      saved.project.avatars[0]
        .versions[0]
    ).toMatchObject({
      outputAssetId:
        'generated-1',
      previewAssetId:
        'generated-1'
    })

    expect(
      saved.project.avatars[0]
        .versions[0]
        .metadata
        .creationReceiptId
    ).toBe(
      saved.receipt.id
    )

    const document =
      avatarCreationReceiptDocument(
        saved.project,
        saved.receipt.id
      )

    expect(document)
      .toMatchObject({
        schemaVersion: 1,
        type:
          'kinaou-avatar-creation-receipt',
        avatar: {
          name: 'Marc'
        },
        output: {
          id: 'generated-1',
          sha256:
            outputHash
        }
      })

    expect(
      document.sources
    ).toEqual([{
      id: 'reference',
      kind: 'image',
      uri:
        'KINAOU/Assets/reference.png',
      sha256:
        sourceHash
    }])
  }
)

it(
  'refuses an engine without verified commercial-output permission for a commercially intended avatar',
  () => {
    const created =
      createAvatarIdentity(
        fixture(),
        {
          name: 'Marc',
          sourceKind: 'prompt',
          prompt:
            'Original presenter'
        }
      )

    expect(
      () =>
        registerAvatarGeneratedTake(
          created.project,
          {
            avatarId:
              created.avatar.id,
            versionId:
              created.version.id,
            outputAssetId:
              'generated-1',
            jobId: 'job',
            engine:
              engine('unknown')
          }
        )
    ).toThrow(
      'commercial-output permission'
    )

    expect(
      () =>
        registerAvatarGeneratedTake(
          created.project,
          {
            avatarId:
              created.avatar.id,
            versionId:
              created.version.id,
            outputAssetId:
              'generated-1',
            jobId: 'job',
            engine:
              engine(
                'restricted'
              )
          }
        )
    ).toThrow(
      'commercial-output permission'
    )
  }
)

it(
  'requires identity preservation and targeted editing for derived versions',
  () => {
    const created =
      createAvatarIdentity(
        fixture(),
        {
          name: 'Marc',
          sourceKind: 'prompt',
          prompt:
            'Original presenter'
        }
      )

    const first =
      registerAvatarGeneratedTake(
        created.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            created.version.id,
          outputAssetId:
            'generated-1',
          jobId: 'job-1',
          engine: engine()
        }
      )

    const derived =
      deriveAvatarVersion(
        first.project,
        created.avatar.id,
        {
          label: 'Business',
          instruction:
            'Keep identity, change to a dark suit'
        }
      )

    const weak = engine()
    weak.capabilities =
      weak.capabilities.filter(
        capability =>
          capability
            !== 'targeted-edit'
      )

    expect(
      () =>
        registerAvatarGeneratedTake(
          derived.project,
          {
            avatarId:
              created.avatar.id,
            versionId:
              derived.version.id,
            outputAssetId:
              'generated-2',
            jobId: 'job-2',
            engine: weak
          }
        )
    ).toThrow(
      'targeted-edit'
    )

    const saved =
      registerAvatarGeneratedTake(
        derived.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            derived.version.id,
          outputAssetId:
            'generated-2',
          jobId: 'job-2',
          engine: engine()
        }
      )

    expect(
      saved.receipt
        .sourceAssetIds
    ).toContain(
      'generated-1'
    )

    expect(
      saved.project
        .avatarCreationReceipts
    ).toHaveLength(2)
  }
)

it(
  'binds an exact scene-instance output without changing other instances',
  () => {
    const created =
      createAvatarIdentity(
        fixture(),
        {
          name: 'Marc',
          sourceKind: 'prompt',
          prompt:
            'Original presenter'
        }
      )

    const scene =
      createAvatarInstance(
        created.project,
        {
          avatarId:
            created.avatar.id,
          prompt:
            'Present the intro'
        }
      )

    const saved =
      registerAvatarGeneratedTake(
        scene.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            created.version.id,
          instanceId:
            scene.instance.id,
          outputAssetId:
            'generated-video',
          jobId:
            'job-video',
          engine: engine()
        }
      )

    expect(
      saved.project
        .avatarInstances[0]
        .outputAssetId
    ).toBe(
      'generated-video'
    )

    expect(
      saved.receipt.instanceId
    ).toBe(
      scene.instance.id
    )
  }
)

it(
  'rejects ordinary media, mismatched scene lineage and unrelated hashes',
  () => {
    const base =
      fixture()

    const created =
      createAvatarIdentity(
        base,
        {
          name: 'Marc',
          sourceKind: 'prompt',
          prompt:
            'Original presenter'
        }
      )

    const other =
      createAvatarIdentity(
        created.project,
        {
          name: 'Other',
          sourceKind: 'prompt',
          prompt:
            'Another person'
        }
      )

    const instance =
      createAvatarInstance(
        other.project,
        {
          avatarId:
            other.avatar.id
        }
      )

    expect(
      () =>
        registerAvatarGeneratedTake(
          instance.project,
          {
            avatarId:
              created.avatar.id,
            versionId:
              created.version.id,
            instanceId:
              instance.instance.id,
            outputAssetId:
              'generated-1',
            jobId: 'job',
            engine: engine()
          }
        )
    ).toThrow(
      'does not match'
    )

    const ordinary = {
      ...created.project,
      assets:
        created.project.assets
          .map(
            asset =>
              asset.id ===
              'generated-1'
                ? {
                    ...asset,
                    metadata: {}
                  }
                : asset
          )
    }

    expect(
      () =>
        registerAvatarGeneratedTake(
          ordinary,
          {
            avatarId:
              created.avatar.id,
            versionId:
              created.version.id,
            outputAssetId:
              'generated-1',
            jobId: 'job',
            engine: engine()
          }
        )
    ).toThrow(
      'Generated managed'
    )

    expect(
      () =>
        registerAvatarGeneratedTake(
          created.project,
          {
            avatarId:
              created.avatar.id,
            versionId:
              created.version.id,
            outputAssetId:
              'generated-1',
            jobId: 'job',
            engine: engine(),
            sourceHashes: {
              unrelated:
                'a'.repeat(64)
            }
          }
        )
    ).toThrow(
      'does not belong'
    )
  }
)
