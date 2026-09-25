import {
  expect,
  it,
  vi
} from 'vitest'

import {
  avatarEditEligibility,
  completeAvatarEdit,
  prepareAvatarEdit
} from '../src/core/avatarEditSession'

import {
  exportAvatarReceiptEvidence
} from '../src/core/avatarReceiptSession'

import {
  createAvatarIdentity,
  createAvatarInstance,
  deriveAvatarVersion
} from '../src/core/avatarStudio'

import {
  createProject,
  parseProject
} from '../src/core/project'

function fixture() {
  return parseProject({
    ...createProject(
      'Avatar FLUX session'
    ),
    assets: [{
      id: 'reference',
      kind: 'image',
      uri:
        'KINAOU/Assets/reference.png',
      managed: true,
      offline: false,
      metadata: {
        name: 'Identity master'
      }
    }]
  })
}

function succeededJob(
  prompt: string,
  seed: number,
  outputId: string,
  reference:
    string | string[] =
      'KINAOU/Assets/reference.png'
) {
  return {
    id:
      outputId,
    state:
      'succeeded' as const,
    progress:
      1,
    createdAt:
      '2026-09-25T01:00:00.000Z',
    updatedAt:
      '2026-09-25T01:00:30.000Z',
    provenance: {
      kind:
        'local-model' as const,
      adapterId:
        'mflux-flux2-klein-edit' as const,
      engineId:
        'mflux-flux2-klein-4b-edit' as const,
      engineVersion:
        'mflux-0.20.0' as const,
      modelId:
        'Runpod/FLUX.2-klein-4B-mflux-4bit' as const,
      modelVersion:
        '73dcaa322be48ea49374b32b4b23aab1a3e59b87' as const,
      prompt,
      seed,
      steps:
        4 as const,
      width:
        512 as const,
      height:
        512 as const,
      referencePaths:
        Array.isArray(
          reference
        )
          ? reference
          : [
              reference
            ]
    },
    outputPath:
      `KINAOU/Assets/GeneratedAvatars/${outputId}.png`,
    sizeBytes:
      400_000
  }
}

it(
  'prepares an accepted single-image Avatar edit and registers its take and receipt',
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

    const prepared =
      prepareAvatarEdit(
        created.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            created.version.id
        },
        430401
      )

    expect(
      prepared.parameters
        .referencePaths
    ).toEqual([
      'KINAOU/Assets/reference.png'
    ])

    expect(
      prepared.parameters.prompt
    ).toContain(
      'identity master'
    )

    const result =
      completeAvatarEdit(
        created.project,
        prepared,
        succeededJob(
          prepared.parameters.prompt,
          430401,
          'job-430401'
        ),
        new Date(
          '2026-09-25T01:01:00.000Z'
        )
      )

    expect(
      result.asset.uri
    ).toBe(
      'KINAOU/Assets/GeneratedAvatars/job-430401.png'
    )

    expect(
      result.receipt.engine
        .capabilities
    ).toEqual([
      'identity-preservation',
      'targeted-edit',
      'image-reference',
      'multi-reference',
      'scene-image'
    ])

    expect(
      result.receipt.engine
        .rights
        .commercialOutput
    ).toBe(
      'allowed'
    )

    expect(
      result.project.avatars[0]
        .versions[0]
        .outputAssetId
    ).toBe(
      result.asset.id
    )
  }
)

it(
  'uses the accepted parent take as the reference for a derived version',
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

    const firstPrepared =
      prepareAvatarEdit(
        created.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            created.version.id
        },
        1
      )

    const first =
      completeAvatarEdit(
        created.project,
        firstPrepared,
        succeededJob(
          firstPrepared.parameters.prompt,
          1,
          'original-take'
        )
      )

    const derived =
      deriveAvatarVersion(
        first.project,
        created.avatar.id,
        {
          label:
            'Business',
          instruction:
            'Change only the clothing to a beige blazer.'
        }
      )

    const prepared =
      prepareAvatarEdit(
        derived.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            derived.version.id
        },
        2
      )

    expect(
      prepared.parameters
        .referencePaths
    ).toEqual([
      first.asset.uri
    ])

    expect(
      prepared.parameters.prompt
    ).toContain(
      'beige blazer'
    )
  }
)

it(
  'rejects unsupported motion and expression directions instead of silently ignoring them',
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

    const instance =
      createAvatarInstance(
        created.project,
        {
          avatarId:
            created.avatar.id,
          motionPrompt:
            'Walk toward the camera'
        }
      )

    expect(
      avatarEditEligibility(
        instance.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            created.version.id,
          instanceId:
            instance.instance.id
        }
      )
    ).toEqual({
      ready: false,
      reason:
        'unsupported-directions'
    })

    expect(
      () =>
        prepareAvatarEdit(
          instance.project,
          {
            avatarId:
              created.avatar.id,
            versionId:
              created.version.id,
            instanceId:
              instance.instance.id
          },
          3
        )
    ).toThrow(
      'does not yet support motion'
    )
  }
)

it(
  'can cryptographically secure a completed worker take without regenerating it',
  async () => {
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

    const prepared =
      prepareAvatarEdit(
        created.project,
        {
          avatarId:
            created.avatar.id,
          versionId:
            created.version.id
        },
        4
      )

    const completed =
      completeAvatarEdit(
        created.project,
        prepared,
        succeededJob(
          prepared.parameters.prompt,
          4,
          'secured-take'
        ),
        new Date(
          '2026-09-25T01:02:00.000Z'
        )
      )

    const exporter = {
      exportAvatarCreationReceipt:
        vi.fn(async () => ({
          schemaVersion:
            1 as const,
          receiptId:
            completed.receipt.id,
          path:
            `KINAOU/Receipts/Avatars/${completed.receipt.id}.json`,
          createdAt:
            '2026-09-25T01:03:00.000Z',
          sizeBytes:
            900,
          documentSha256:
            'c'.repeat(64),
          output: {
            id:
              completed.asset.id,
            path:
              completed.asset.uri,
            sizeBytes:
              400_000,
            sha256:
              'b'.repeat(64)
          },
          sources: [{
            id: 'reference',
            path:
              'KINAOU/Assets/reference.png',
            sizeBytes:
              300_000,
            sha256:
              'a'.repeat(64)
          }]
        }))
    }

    const secured =
      await exportAvatarReceiptEvidence(
        completed.project,
        completed.receipt.id,
        exporter
      )

    expect(
      exporter
        .exportAvatarCreationReceipt
    ).toHaveBeenCalledTimes(1)

    expect(
      secured.project
        .avatarCreationReceipts[0]
        .outputSha256
    ).toBe(
      'b'.repeat(64)
    )

    expect(
      secured.project
        .avatarCreationReceipts[0]
        .metadata
        .receiptFileSha256
    ).toBe(
      'c'.repeat(64)
    )
  }
)
