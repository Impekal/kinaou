import {
  expect,
  it
} from 'vitest'

import {
  completeAvatarEdit,
  prepareAvatarEdit
} from '../src/core/avatarEditSession'

import {
  createAcceptedAvatarReferencePack,
  activeAcceptedAvatarReferencePack,
  avatarReferencePackCandidateAssets,
  FLUX2_KLEIN_REFERENCE_PACK_PROFILE
} from '../src/core/avatarReferencePack'

import {
  createAvatarIdentity
} from '../src/core/avatarStudio'

import {
  createProject,
  parseProject
} from '../src/core/project'

function fixture() {
  return parseProject({
    ...createProject(
      'Reference Pack'
    ),
    assets: [{
      id:
        'master',
      kind:
        'image',
      uri:
        'KINAOU/Assets/master.png',
      managed:
        true,
      offline:
        false,
      metadata: {
        name:
          'Identity Master'
      }
    }]
  })
}

function job(
  prompt: string,
  seed: number,
  id: string,
  references: string[]
) {
  return {
    id,
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
        references
    },
    outputPath:
      `KINAOU/Assets/GeneratedAvatars/${id}.png`,
    sizeBytes:
      350_000
  }
}

function generatedLineage() {
  const created =
    createAvatarIdentity(
      fixture(),
      {
        name:
          'Marc',
        sourceKind:
          'image',
        assetIds: [
          'master'
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
      11
    )

  const first =
    completeAvatarEdit(
      created.project,
      firstPrepared,
      job(
        firstPrepared
          .parameters.prompt,
        11,
        'three-quarter',
        firstPrepared
          .parameters
          .referencePaths
      )
    )

  const secondPrepared =
    prepareAvatarEdit(
      first.project,
      {
        avatarId:
          created.avatar.id,
        versionId:
          created.version.id
      },
      12
    )

  const second =
    completeAvatarEdit(
      first.project,
      secondPrepared,
      job(
        secondPrepared
          .parameters.prompt,
        12,
        'medium-shot',
        secondPrepared
          .parameters
          .referencePaths
      )
    )

  return {
    created,
    first,
    second
  }
}

it(
  'keeps legacy projects compatible with no Reference Packs',
  () => {
    const parsed =
      fixture()

    expect(
      parsed.avatars
    ).toEqual([])
  }
)

it(
  'creates an explicitly human-accepted three-image pack only from the Avatar lineage',
  () => {
    const lineage =
      generatedLineage()

    const candidates =
      avatarReferencePackCandidateAssets(
        lineage.second.project,
        lineage.created.avatar.id
      )

    expect(
      new Set(
        candidates.map(
          asset =>
            asset.id
        )
      )
    ).toEqual(
      new Set([
        'master',
        lineage.first.asset.id,
        lineage.second.asset.id
      ])
    )

    expect(
      () =>
        createAcceptedAvatarReferencePack(
          lineage.second.project,
          {
            avatarId:
              lineage.created.avatar.id,
            assetIds: [
              'master',
              lineage.first.asset.id,
              lineage.second.asset.id
            ],
            acceptanceConfirmed:
              false
          }
        )
    ).toThrow(
      'Human identity acceptance'
    )

    const accepted =
      createAcceptedAvatarReferencePack(
        lineage.second.project,
        {
          avatarId:
            lineage.created.avatar.id,
          assetIds: [
            'master',
            lineage.first.asset.id,
            lineage.second.asset.id
          ],
          acceptanceConfirmed:
            true
        },
        new Date(
          '2026-09-25T02:00:00.000Z'
        )
      )

    expect(
      accepted.pack.profileId
    ).toBe(
      FLUX2_KLEIN_REFERENCE_PACK_PROFILE
    )

    expect(
      accepted.avatar
        .activeReferencePackId
    ).toBe(
      accepted.pack.id
    )

    expect(
      activeAcceptedAvatarReferencePack(
        accepted.project,
        accepted.avatar.id
      )
    ).toEqual(
      accepted.pack
    )
  }
)

it(
  'uses an active Pack 3 automatically and records its exact sources in the Creation Receipt',
  () => {
    const lineage =
      generatedLineage()

    const accepted =
      createAcceptedAvatarReferencePack(
        lineage.second.project,
        {
          avatarId:
            lineage.created.avatar.id,
          assetIds: [
            'master',
            lineage.first.asset.id,
            lineage.second.asset.id
          ],
          acceptanceConfirmed:
            true
        }
      )

    const prepared =
      prepareAvatarEdit(
        accepted.project,
        {
          avatarId:
            accepted.avatar.id,
          versionId:
            accepted.avatar
              .activeVersionId
        },
        430502
      )

    expect(
      prepared
        .referenceAssetIds
    ).toEqual(
      accepted.pack
        .assetIds
    )

    expect(
      prepared.parameters
        .referencePaths
    ).toHaveLength(3)

    expect(
      prepared.referencePackId
    ).toBe(
      accepted.pack.id
    )

    expect(
      prepared.parameters.prompt
    ).toContain(
      'multiple approved views'
    )

    const completed =
      completeAvatarEdit(
        accepted.project,
        prepared,
        job(
          prepared.parameters
            .prompt,
          430502,
          'pack3-output',
          prepared.parameters
            .referencePaths
        )
      )

    expect(
      completed.receipt
        .sourceAssetIds
    ).toEqual(
      accepted.pack
        .assetIds
    )

    expect(
      completed.receipt
        .engine.capabilities
    ).toContain(
      'multi-reference'
    )

    expect(
      completed.receipt
        .metadata
        .referencePackId
    ).toBe(
      accepted.pack.id
    )

    expect(
      completed.receipt
        .metadata
        .referencePackProfileId
    ).toBe(
      FLUX2_KLEIN_REFERENCE_PACK_PROFILE
    )
  }
)

it(
  'refuses packs with the wrong size or unrelated images',
  () => {
    const lineage =
      generatedLineage()

    const unrelated =
      parseProject({
        ...lineage.second.project,
        assets: [
          ...lineage.second
            .project.assets,
          {
            id:
              'unrelated',
            kind:
              'image',
            uri:
              'KINAOU/Assets/unrelated.png',
            managed:
              true,
            offline:
              false,
            metadata: {}
          }
        ]
      })

    expect(
      () =>
        createAcceptedAvatarReferencePack(
          unrelated,
          {
            avatarId:
              lineage.created.avatar.id,
            assetIds: [
              'master',
              lineage.first.asset.id
            ],
            acceptanceConfirmed:
              true
          }
        )
    ).toThrow(
      'exactly three'
    )

    expect(
      () =>
        createAcceptedAvatarReferencePack(
          unrelated,
          {
            avatarId:
              lineage.created.avatar.id,
            assetIds: [
              'master',
              lineage.first.asset.id,
              'unrelated'
            ],
            acceptanceConfirmed:
              true
          }
        )
    ).toThrow(
      'identity lineage'
    )
  }
)

it(
  'defaults Reference Packs for an older persisted Avatar identity',
  () => {
    const created =
      createAvatarIdentity(
        fixture(),
        {
          name:
            'Legacy Marc',
          sourceKind:
            'image',
          assetIds: [
            'master'
          ],
          referenceAuthorized:
            true,
          referenceRightsBasis:
            'own'
        }
      )

    const raw =
      structuredClone(
        created.project
      ) as unknown as {
        avatars: Array<
          Record<string, unknown>
        >
      }

    delete raw.avatars[0]
      .referencePacks

    delete raw.avatars[0]
      .activeReferencePackId

    const parsed =
      parseProject(
        raw
      )

    expect(
      parsed.avatars[0]
        .referencePacks
    ).toEqual([])

    expect(
      parsed.avatars[0]
        .activeReferencePackId
    ).toBeUndefined()
  }
)
