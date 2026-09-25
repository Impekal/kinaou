import {
  z
} from 'zod'

import {
  parseProject,
  type KinaouProject,
  type TimelineClip,
  type TimelineTrack
} from './project'

import {
  preview1080pPreset
} from './render'

import {
  createShortCutRenderPlan,
  type ShortCutPlan
} from './shortCutPlan'

import {
  projectShortDerivativeLineage,
  shortDerivativeLineageSchema
} from './shortDerivative'


const visualTrackTypes =
  new Set<
    TimelineTrack['type']
  >([
    'video',
    'broll',
    'image',
    'avatar',
    'overlay'
  ])


const materializedAssetSchema =
  z.object({
    assetId:
      z.string()
        .min(1),

    sourceAssetId:
      z.string()
        .min(1)
  })
  .strict()


const materializedTrackSchema =
  z.object({
    trackId:
      z.string()
        .min(1),

    sourceTrackId:
      z.string()
        .min(1),

    type:
      z.enum([
        'video',
        'broll',
        'image',
        'avatar',
        'voice',
        'dialog',
        'music',
        'sfx',
        'caption',
        'overlay'
      ])
  })
  .strict()


const materializedClipSchema =
  z.object({
    clipId:
      z.string()
        .min(1),

    sourceClipId:
      z.string()
        .min(1),

    sourceTrackId:
      z.string()
        .min(1),

    trackId:
      z.string()
        .min(1),

    assetId:
      z.string()
        .min(1),

    segmentPosition:
      z.number()
        .int()
        .positive()
  })
  .strict()


export const shortDerivativeMaterializationSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    sourceProjectId:
      z.string()
        .min(1),

    derivativeProjectId:
      z.string()
        .min(1),

    materializedAt:
      z.string()
        .datetime(),

    assets:
      z.array(
        materializedAssetSchema
      )
      .max(500),

    tracks:
      z.array(
        materializedTrackSchema
      )
      .min(1)
      .max(100),

    clips:
      z.array(
        materializedClipSchema
      )
      .min(1)
      .max(5000)
  })
  .strict()
  .superRefine(
    (
      value,
      context
    ) => {
      if (
        new Set(
          value.tracks.map(
            item =>
              item.trackId
          )
        ).size
        !== value.tracks.length
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'tracks'
          ],

          message:
            'Materialized Short track IDs must be unique.'
        })
      }

      if (
        new Set(
          value.clips.map(
            item =>
              item.clipId
          )
        ).size
        !== value.clips.length
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'clips'
          ],

          message:
            'Materialized Short clip IDs must be unique.'
        })
      }

      if (
        new Set(
          value.assets.map(
            item =>
              item.assetId
          )
        ).size
        !== value.assets.length
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'assets'
          ],

          message:
            'Materialized Short asset IDs must be unique.'
        })
      }
    }
  )


export type ShortDerivativeMaterialization =
  z.infer<
    typeof shortDerivativeMaterializationSchema
  >


export function projectShortDerivativeMaterialization(
  project:
    KinaouProject
): ShortDerivativeMaterialization | null {
  const parsed =
    shortDerivativeMaterializationSchema
      .safeParse(
        project.metadata
          .shortDerivativeMaterialization
      )

  return parsed.success
    ? parsed.data
    : null
}


function childSceneId(
  position:
    number
): string {
  return (
    `short-segment-${String(
      position
    ).padStart(
      3,
      '0'
    )}`
  )
}


function sourceClipIdentity(
  virtualClipId:
    string
): {
  sourceClipId: string
  segmentPosition: number
} {
  const match =
    virtualClipId.match(
      /^(.*)::short:(\d+)$/
    )

  if (!match) {
    throw new Error(
      'Compact Short render clip is missing its virtual segment identity'
    )
  }

  const sourceClipId =
    match[1]

  const segmentPosition =
    Number(
      match[2]
    )

  if (
    !sourceClipId
    || !Number.isInteger(
      segmentPosition
    )
    || segmentPosition < 1
  ) {
    throw new Error(
      'Compact Short render clip has an invalid virtual segment identity'
    )
  }

  return {
    sourceClipId,
    segmentPosition
  }
}


function lineageMatchesCut(
  lineage:
    NonNullable<
      ReturnType<
        typeof projectShortDerivativeLineage
      >
    >,

  cut:
    ShortCutPlan
): boolean {
  return (
    lineage.sourceProjectId
      === cut.projectId
    && lineage.sourceProjectUpdatedAt
      === cut.sourceProjectUpdatedAt
    && lineage.sourceTimelineDurationMs
      === cut.sourceTimelineDurationMs
    && lineage.durationMs
      === cut.durationMs
    && lineage.maximumDurationMs
      === cut.maximumDurationMs
    && lineage.cutTitle
      === cut.title
    && lineage.objective
      === cut.objective
    && JSON.stringify(
      lineage.selectedCandidateIds
    ) === JSON.stringify(
      cut.selectedCandidateIds
    )
    && JSON.stringify(
      lineage.segments.map(
        segment => ({
          position:
            segment.position,

          candidateId:
            segment.candidateId,

          sourceInMs:
            segment.sourceInMs,

          sourceOutMs:
            segment.sourceOutMs,

          destinationInMs:
            segment.destinationInMs,

          destinationOutMs:
            segment.destinationOutMs
        })
      )
    ) === JSON.stringify(
      cut.segments.map(
        segment => ({
          position:
            segment.position,

          candidateId:
            segment.candidateId,

          sourceInMs:
            segment.sourceInMs,

          sourceOutMs:
            segment.sourceOutMs,

          destinationInMs:
            segment.destinationInMs,

          destinationOutMs:
            segment.destinationOutMs
        })
      )
    )
  )
}


export function materializeShortDerivative(
  source:
    KinaouProject,

  draft:
    KinaouProject,

  cut:
    ShortCutPlan,

  now =
    new Date(),

  idFactory:
    () => string =
      () =>
        crypto.randomUUID()
): KinaouProject {
  const lineage =
    projectShortDerivativeLineage(
      draft
    )

  if (!lineage) {
    throw new Error(
      'Project is not a valid Short derivative draft'
    )
  }

  if (
    lineage.materializedAt
    || projectShortDerivativeMaterialization(
      draft
    )
    || draft.tracks.length
    || draft.assets.length
  ) {
    throw new Error(
      'Short derivative is already materialized'
    )
  }

  if (
    source.id
      !== lineage.sourceProjectId
    || source.id
      !== cut.projectId
  ) {
    throw new Error(
      'Short derivative source project does not match the reviewed cut'
    )
  }

  if (
    source.updatedAt
      !== lineage.sourceProjectUpdatedAt
    || source.updatedAt
      !== cut.sourceProjectUpdatedAt
  ) {
    throw new Error(
      'Source project changed after Short review'
    )
  }

  if (
    !lineageMatchesCut(
      lineage,
      cut
    )
  ) {
    throw new Error(
      'Short derivative lineage no longer matches the reviewed cut'
    )
  }

  if (
    draft.storyboard.length
      !== cut.segments.length
    || draft.storyboard.some(
      (
        scene,
        index
      ) =>
        scene.id
          !== childSceneId(
            index + 1
          )
        || scene.durationMs
          !== cut.segments[
            index
          ].sourceDurationMs
    )
  ) {
    throw new Error(
      'Short derivative storyboard no longer matches the reviewed cut'
    )
  }

  /*
   * Reuse the exact virtual composition that the user reviewed in 5.1.
   * This guarantees materialization follows the same trim/speed/fade rules.
   */
  const compact =
    createShortCutRenderPlan(
      source,
      cut,
      preview1080pPreset,
      'KINAOU/Cache/Previews/short-materialization-contract.mp4'
    )

  const reservedIds =
    new Set<string>([
      source.id,
      draft.id,

      ...source.assets.map(
        asset =>
          asset.id
      ),

      ...source.tracks.map(
        track =>
          track.id
      ),

      ...source.tracks.flatMap(
        track =>
          track.clips.map(
            clip =>
              clip.id
          )
      )
    ])

  function nextId(
    label:
      string
  ): string {
    const value =
      idFactory()
        .trim()

    if (!value) {
      throw new Error(
        `Generated ${label} id is empty`
      )
    }

    if (
      reservedIds.has(
        value
      )
    ) {
      throw new Error(
        `Generated ${label} id collides with an existing project identity`
      )
    }

    reservedIds.add(
      value
    )

    return value
  }

  /*
   * Keep the source track structure so the child remains a normal editable
   * KINAOU project even when one core track currently has no selected media.
   * The child starts unlocked and unmuted; only reviewed clips are copied.
   */
  const trackMap =
    new Map<
      string,
      string
    >()

  const tracks:
    TimelineTrack[] =
      source.tracks.map(
        track => {
          const id =
            nextId(
              'track'
            )

          trackMap.set(
            track.id,
            id
          )

          return {
            id,

            type:
              track.type,

            name:
              track.name,

            muted:
              false,

            locked:
              false,

            clips:
              []
          }
        }
      )

  const childTracks =
    new Map(
      tracks.map(
        track => [
          track.id,
          track
        ]
      )
    )

  const usedAssetIds =
    new Set<string>()

  const clipRecords:
    ShortDerivativeMaterialization[
      'clips'
    ] = []

  const segmentVisualAssets =
    new Map<
      number,
      string
    >()

  for (
    const renderClip
    of compact.clips
  ) {
    const {
      sourceClipId,
      segmentPosition
    } =
      sourceClipIdentity(
        renderClip.clipId
      )

    const segment =
      cut.segments.find(
        item =>
          item.position
          === segmentPosition
      )

    if (!segment) {
      throw new Error(
        'Compact Short clip references an unknown editorial segment'
      )
    }

    const sourceTrack =
      source.tracks.find(
        track =>
          track.id
          === renderClip.trackId
      )

    if (!sourceTrack) {
      throw new Error(
        `Source track not found during Short materialization: ${renderClip.trackId}`
      )
    }

    const sourceClip =
      sourceTrack.clips.find(
        clip =>
          clip.id
          === sourceClipId
      )

    if (!sourceClip) {
      throw new Error(
        `Source clip not found during Short materialization: ${sourceClipId}`
      )
    }

    if (
      sourceClip.assetId
      !== renderClip.asset.id
    ) {
      throw new Error(
        'Compact Short render clip asset no longer matches its source clip'
      )
    }

    const childTrackId =
      trackMap.get(
        sourceTrack.id
      )

    const childTrack =
      childTrackId
        ? childTracks.get(
            childTrackId
          )
        : undefined

    if (!childTrack) {
      throw new Error(
        'Short materialization track mapping is incomplete'
      )
    }

    const clipId =
      nextId(
        'clip'
      )

    const childClip:
      TimelineClip = {
        id:
          clipId,

        assetId:
          sourceClip.assetId,

        startMs:
          renderClip.startMs,

        durationMs:
          renderClip.durationMs,

        sourceOffsetMs:
          renderClip.sourceOffsetMs,

        gain:
          renderClip.gain,

        speed:
          renderClip.speed,

        sceneId:
          childSceneId(
            segmentPosition
          ),

        transform:
          structuredClone(
            renderClip.transform
          ),

        ...(renderClip
          .transformKeyframes
          ? {
              transformKeyframes:
                structuredClone(
                  renderClip
                    .transformKeyframes
                )
            }
          : {}),

        ...(renderClip
          .transitionIn
          ? {
              transitionIn:
                structuredClone(
                  renderClip
                    .transitionIn
                )
            }
          : {}),

        fades:
          structuredClone(
            renderClip.fades
          ),

        ...(renderClip.motion
          ? {
              motion:
                renderClip.motion
            }
          : {})
      }

    childTrack.clips.push(
      childClip
    )

    usedAssetIds.add(
      sourceClip.assetId
    )

    if (
      visualTrackTypes.has(
        sourceTrack.type
      )
      && !segmentVisualAssets.has(
        segmentPosition
      )
    ) {
      segmentVisualAssets.set(
        segmentPosition,
        sourceClip.assetId
      )
    }

    clipRecords.push({
      clipId,

      sourceClipId,

      sourceTrackId:
        sourceTrack.id,

      trackId:
        childTrack.id,

      assetId:
        sourceClip.assetId,

      segmentPosition
    })
  }

  const assets =
    source.assets
      .filter(
        asset =>
          usedAssetIds.has(
            asset.id
          )
      )
      .map(
        asset =>
          structuredClone(
            asset
          )
      )

  if (
    assets.length
    !== usedAssetIds.size
  ) {
    throw new Error(
      'Short materialization could not resolve every referenced source asset'
    )
  }

  for (
    const track
    of tracks
  ) {
    track.clips.sort(
      (
        a,
        b
      ) =>
        a.startMs
        - b.startMs
        || a.id.localeCompare(
          b.id
        )
    )
  }

  const timestamp =
    now.toISOString()

  const updatedLineage =
    shortDerivativeLineageSchema
      .parse({
        ...lineage,

        materializedAt:
          timestamp
      })

  const materialization =
    shortDerivativeMaterializationSchema
      .parse({
        schemaVersion:
          1,

        sourceProjectId:
          source.id,

        derivativeProjectId:
          draft.id,

        materializedAt:
          timestamp,

        assets:
          assets.map(
            asset => ({
              assetId:
                asset.id,

              sourceAssetId:
                asset.id
            })
          ),

        tracks:
          source.tracks.map(
            sourceTrack => ({
              trackId:
                trackMap.get(
                  sourceTrack.id
                )!,

              sourceTrackId:
                sourceTrack.id,

              type:
                sourceTrack.type
            })
          ),

        clips:
          clipRecords
      })

  const storyboard =
    draft.storyboard.map(
      (
        scene,
        index
      ) => {
        const assetId =
          segmentVisualAssets.get(
            index + 1
          )

        return {
          ...scene,

          ...(assetId
            ? {
                assetId
              }
            : {})
        }
      }
    )

  return parseProject({
    ...draft,

    updatedAt:
      timestamp,

    storyboard,

    assets,

    tracks,

    metadata: {
      ...draft.metadata,

      shortDerivative:
        updatedLineage,

      shortDerivativeMaterialization:
        materialization
    }
  })
}
