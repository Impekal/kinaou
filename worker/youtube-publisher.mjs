const SHA256 =
  /^[a-f0-9]{64}$/


const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i


export const youtubePublisherDescriptor = {
  adapterId:
    'youtube-data-api-v3',

  adapterVersion:
    '0.1.0',

  platform:
    'youtube',

  placements: [
    'youtube-video',
    'youtube-short'
  ],

  network:
    'remote-api',

  credentials:
    'external-only'
}


function object(
  value,
  label
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(
      value
    )
  ) {
    throw new Error(
      `${label} must be an object`
    )
  }

  return value
}


function text(
  value,
  label,
  minimum,
  maximum
) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length < minimum
    || value.length > maximum
  ) {
    throw new Error(
      `${label} must contain ${minimum}–${maximum} trimmed characters`
    )
  }

  return value
}


function uuid(
  value,
  label
) {
  if (
    typeof value !== 'string'
    || !UUID.test(
      value
    )
  ) {
    throw new Error(
      `${label} must be a UUID`
    )
  }

  return value
}


function sha256(
  value
) {
  if (
    typeof value !== 'string'
    || !SHA256.test(
      value
    )
  ) {
    throw new Error(
      'YouTube publish source SHA-256 is invalid'
    )
  }

  return value
}


function managedRenderPath(
  value
) {
  const path =
    text(
      value,
      'YouTube source path',
      1,
      500
    )

  if (
    path.includes(
      '\\'
    )
    || !path.startsWith(
      'KINAOU/Renders/'
    )
    || !path.endsWith(
      '.mp4'
    )
    || path.includes(
      '/../'
    )
    || path.includes(
      '/./'
    )
  ) {
    throw new Error(
      'YouTube publisher accepts only canonical KINAOU render MP4 paths'
    )
  }

  return path
}


function tags(
  value
) {
  if (
    !Array.isArray(
      value
    )
    || value.length > 30
  ) {
    throw new Error(
      'YouTube publish tags must be an array of at most 30 values'
    )
  }

  const normalized =
    value.map(
      tag =>
        text(
          tag,
          'YouTube publish tag',
          1,
          80
        )
    )

  if (
    new Set(
      normalized.map(
        tag =>
          tag.toLocaleLowerCase()
      )
    ).size
    !== normalized.length
  ) {
    throw new Error(
      'YouTube publish tags must be unique'
    )
  }

  return normalized
}


function assertNoCredentialFields(
  value,
  label
) {
  const serialized =
    JSON.stringify(
      value
    )

  if (
    /access.?token|refresh.?token|client.?secret|password|credential/i
      .test(
        serialized
      )
  ) {
    throw new Error(
      `${label} cannot contain credential material`
    )
  }
}


export function validateYouTubePublishRequest(
  value
) {
  const request =
    object(
      value,
      'YouTube publish request'
    )

  assertNoCredentialFields(
    request,
    'YouTube publish request'
  )

  if (
    request.schemaVersion !== 1
  ) {
    throw new Error(
      'YouTube publish request schemaVersion must be 1'
    )
  }

  if (
    request.platform
    !== 'youtube'
  ) {
    throw new Error(
      'YouTube publisher accepts only YouTube requests'
    )
  }

  if (
    ![
      'youtube-video',
      'youtube-short'
    ].includes(
      request.placement
    )
  ) {
    throw new Error(
      'YouTube publisher accepts only YouTube placements'
    )
  }

  const approval =
    object(
      request.approval,
      'YouTube publish approval'
    )

  if (
    approval.kind
    !== 'explicit-human'
  ) {
    throw new Error(
      'YouTube publishing requires explicit human approval'
    )
  }

  const confirmedAt =
    text(
      approval.confirmedAt,
      'YouTube publish confirmation time',
      1,
      100
    )

  const confirmedDate =
    new Date(
      confirmedAt
    )

  if (
    !Number.isFinite(
      confirmedDate.getTime()
    )
    || confirmedDate.toISOString()
      !== confirmedAt
  ) {
    throw new Error(
      'YouTube publish confirmation time must be canonical ISO'
    )
  }

  const media =
    object(
      request.media,
      'YouTube publish media'
    )

  if (
    !Number.isInteger(
      media.sizeBytes
    )
    || media.sizeBytes <= 0
  ) {
    throw new Error(
      'YouTube publish source size must be positive'
    )
  }

  const metadata =
    object(
      request.metadata,
      'YouTube publish metadata'
    )

  return {
    schemaVersion:
      1,

    projectId:
      text(
        request.projectId,
        'YouTube project id',
        1,
        200
      ),

    packagePath:
      text(
        request.packagePath,
        'YouTube package path',
        1,
        700
      ),

    platform:
      'youtube',

    placement:
      request.placement,

    media: {
      path:
        managedRenderPath(
          media.path
        ),

      sizeBytes:
        media.sizeBytes,

      sha256:
        sha256(
          media.sha256
        )
    },

    metadata: {
      title:
        text(
          metadata.title,
          'YouTube title',
          1,
          100
        ),

      description:
        text(
          metadata.description,
          'YouTube description',
          0,
          5000
        ),

      tags:
        tags(
          metadata.tags
        )
    },

    verifiedAt:
      text(
        request.verifiedAt,
        'YouTube verification time',
        1,
        100
      ),

    requestId:
      uuid(
        request.requestId,
        'YouTube request id'
      ),

    approval: {
      kind:
        'explicit-human',

      confirmedAt
    }
  }
}


function validateCredential(
  value
) {
  const credential =
    object(
      value,
      'YouTube credential'
    )

  if (
    credential.platform
    !== 'youtube'
  ) {
    throw new Error(
      'YouTube credential belongs to another platform'
    )
  }

  const accessToken =
    text(
      credential.accessToken,
      'YouTube access token',
      1,
      20_000
    )

  return {
    accessToken,

    ...(typeof credential.refreshToken === 'string'
      && credential.refreshToken.trim()
      ? {
          refreshToken:
            text(
              credential.refreshToken.trim(),
              'YouTube refresh token',
              1,
              20_000
            )
        }
      : {}),

    ...(typeof credential.accountLabel === 'string'
      && credential.accountLabel.trim()
      ? {
          accountLabel:
            text(
              credential.accountLabel.trim(),
              'YouTube account label',
              1,
              200
            )
        }
      : {})
  }
}


function validateTransportResult(
  value
) {
  const result =
    object(
      value,
      'YouTube transport result'
    )

  const remoteId =
    text(
      result.remoteId,
      'YouTube remote video id',
      1,
      500
    )

  let remoteUrl

  if (
    result.remoteUrl
    !== undefined
  ) {
    remoteUrl =
      text(
        result.remoteUrl,
        'YouTube remote video URL',
        1,
        2000
      )

    const url =
      new URL(
        remoteUrl
      )

    if (
      url.protocol
      !== 'https:'
    ) {
      throw new Error(
        'YouTube remote video URL must use HTTPS'
      )
    }
  }

  return {
    remoteId,

    ...(remoteUrl
      ? {
          remoteUrl
        }
      : {})
  }
}


/*
 * Adapter execution boundary.
 *
 * resolveCredential and transport are dependencies supplied by the worker.
 * The durable request never contains credentials.
 * The transport receives credentials separately and must never return them.
 *
 * There is deliberately no retry loop here.
 */
export function createYouTubePublisher({
  resolveCredential,
  transport,
  now =
    () =>
      new Date(),
  randomUUID =
    () =>
      crypto.randomUUID()
}) {
  if (
    typeof resolveCredential
    !== 'function'
    || typeof transport
      !== 'function'
  ) {
    throw new Error(
      'YouTube publisher requires credential and transport dependencies'
    )
  }

  return {
    descriptor:
      youtubePublisherDescriptor,

    async publish(
      requestValue,
      signal,
      attemptId
    ) {
      const request =
        validateYouTubePublishRequest(
          requestValue
        )

      const id =
        uuid(
          attemptId,
          'YouTube attempt id'
        )

      if (
        signal?.aborted
      ) {
        throw new DOMException(
          'YouTube publish cancelled',
          'AbortError'
        )
      }

      const credential =
        validateCredential(
          await resolveCredential(
            'youtube'
          )
        )

      const result =
        validateTransportResult(
          await transport({
            request,
            accessToken:
              credential.accessToken,
            signal
          })
        )

      if (
        signal?.aborted
      ) {
        throw new DOMException(
          'YouTube publish cancelled',
          'AbortError'
        )
      }

      const publishedAt =
        now()
          .toISOString()

      const receipt = {
        schemaVersion:
          1,

        receiptId:
          randomUUID(),

        requestId:
          request.requestId,

        attemptId:
          id,

        platform:
          'youtube',

        placement:
          request.placement,

        adapter: {
          id:
            youtubePublisherDescriptor
              .adapterId,

          version:
            youtubePublisherDescriptor
              .adapterVersion
        },

        sourceSha256:
          request.media
            .sha256,

        remote: {
          id:
            result.remoteId,

          ...(result.remoteUrl
            ? {
                url:
                  result.remoteUrl
              }
            : {})
        },

        publishedAt
      }

      assertNoCredentialFields(
        receipt,
        'YouTube publish receipt'
      )

      return receipt
    }
  }
}


export function createUnconfiguredYouTubePublisher(
  resolveCredential
) {
  return createYouTubePublisher({
    resolveCredential,

    transport:
      async () => {
        throw new Error(
          'YouTube live transport is not configured'
        )
      }
  })
}
