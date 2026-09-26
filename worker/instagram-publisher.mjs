const SHA256 =
  /^[a-f0-9]{64}$/


const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i


export const instagramPublishingScopes = [
  'instagram_business_basic',
  'instagram_business_content_publish'
]


export const instagramPublisherDescriptor = {
  adapterId:
    'instagram-platform-api',

  adapterVersion:
    '0.1.0',

  platform:
    'instagram',

  placements: [
    'instagram-reel'
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
      `${label} is invalid`
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


function assertNoSecretMaterial(
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

  /*
   * Instagram's server-fetch delivery URL can itself be a signed URL.
   * It therefore stays worker-local and must never enter the durable
   * request or receipt.
   */
  if (
    /video.?url|delivery.?url|media.?url|signed.?url/i
      .test(
        serialized
      )
  ) {
    throw new Error(
      `${label} cannot contain Instagram delivery URLs`
    )
  }
}


export function validateInstagramPublishRequest(
  value
) {
  const request =
    object(
      value,
      'Instagram publish request'
    )

  assertNoSecretMaterial(
    request,
    'Instagram publish request'
  )

  if (
    request.schemaVersion !== 1
  ) {
    throw new Error(
      'Instagram publish request schemaVersion must be 1'
    )
  }

  if (
    request.platform !== 'instagram'
  ) {
    throw new Error(
      'Instagram publisher accepts only Instagram requests'
    )
  }

  if (
    request.placement !== 'instagram-reel'
  ) {
    throw new Error(
      'Phase 5.6 Instagram publisher accepts only Instagram Reels'
    )
  }

  const approval =
    object(
      request.approval,
      'Instagram publish approval'
    )

  if (
    approval.kind !== 'explicit-human'
  ) {
    throw new Error(
      'Instagram publishing requires explicit human approval'
    )
  }

  const media =
    object(
      request.media,
      'Instagram publish media'
    )

  if (
    typeof media.sha256 !== 'string'
    || !SHA256.test(
      media.sha256
    )
  ) {
    throw new Error(
      'Instagram source SHA-256 is invalid'
    )
  }

  if (
    !Number.isSafeInteger(
      media.sizeBytes
    )
    || media.sizeBytes <= 0
  ) {
    throw new Error(
      'Instagram source size is invalid'
    )
  }

  if (
    typeof media.path !== 'string'
    || !media.path.startsWith(
      'KINAOU/Renders/'
    )
    || !media.path.endsWith(
      '.mp4'
    )
  ) {
    throw new Error(
      'Instagram publishing requires a managed render MP4'
    )
  }

  const metadata =
    object(
      request.metadata,
      'Instagram publish metadata'
    )

  if (
    !Array.isArray(
      metadata.tags
    )
    || metadata.tags.length > 30
  ) {
    throw new Error(
      'Instagram publish tags are invalid'
    )
  }

  return {
    schemaVersion:
      1,

    projectId:
      text(
        request.projectId,
        'Instagram project id',
        1,
        200
      ),

    packagePath:
      text(
        request.packagePath,
        'Instagram package path',
        1,
        700
      ),

    platform:
      'instagram',

    placement:
      'instagram-reel',

    media: {
      path:
        media.path,

      sizeBytes:
        media.sizeBytes,

      sha256:
        media.sha256
    },

    metadata: {
      title:
        text(
          metadata.title,
          'Instagram title',
          1,
          200
        ),

      description:
        typeof metadata.description === 'string'
          ? metadata.description
              .trim()
              .slice(
                0,
                5000
              )
          : '',

      tags:
        metadata.tags.map(
          tag =>
            text(
              tag,
              'Instagram tag',
              1,
              80
            )
        )
    },

    verifiedAt:
      text(
        request.verifiedAt,
        'Instagram verification time',
        1,
        100
      ),

    requestId:
      uuid(
        request.requestId,
        'Instagram request id'
      ),

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        text(
          approval.confirmedAt,
          'Instagram confirmation time',
          1,
          100
        )
    }
  }
}


function validateDeliveryUrl(
  value
) {
  const raw =
    text(
      value,
      'Instagram delivery URL',
      1,
      5000
    )

  const url =
    new URL(
      raw
    )

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || [
      'localhost',
      '127.0.0.1',
      '::1'
    ].includes(
      url.hostname
        .toLowerCase()
    )
  ) {
    throw new Error(
      'Instagram delivery URL must be a public HTTPS URL'
    )
  }

  return url.toString()
}


function validateCredential(
  value
) {
  const credential =
    object(
      value,
      'Instagram credential'
    )

  if (
    credential.platform !== 'instagram'
  ) {
    throw new Error(
      'Instagram credential belongs to another platform'
    )
  }

  return {
    accessToken:
      text(
        credential.accessToken,
        'Instagram access token',
        1,
        20_000
      ),

    accountId:
      text(
        credential.accountId,
        'Instagram professional account id',
        1,
        300
      )
  }
}


/*
 * Instagram currently uses server-side retrieval of a video URL for the
 * Reels container flow.
 *
 * The URL resolver is deliberately injected and worker-only. KINAOU does
 * not create a public relay automatically and does not persist signed URLs.
 */
export function createInstagramPublisher({
  resolveCredential,
  resolveDeliveryUrl,
  transport,
  now =
    () =>
      new Date(),
  randomUUID =
    () =>
      crypto.randomUUID()
}) {
  if (
    typeof resolveCredential !== 'function'
    || typeof resolveDeliveryUrl !== 'function'
    || typeof transport !== 'function'
  ) {
    throw new Error(
      'Instagram publisher dependencies are incomplete'
    )
  }

  return {
    descriptor:
      instagramPublisherDescriptor,

    async publish(
      requestValue,
      signal,
      attemptId
    ) {
      const request =
        validateInstagramPublishRequest(
          requestValue
        )

      const id =
        uuid(
          attemptId,
          'Instagram attempt id'
        )

      if (
        signal?.aborted
      ) {
        throw new DOMException(
          'Instagram publishing cancelled',
          'AbortError'
        )
      }

      const credential =
        validateCredential(
          await resolveCredential(
            'instagram'
          )
        )

      const deliveryUrl =
        validateDeliveryUrl(
          await resolveDeliveryUrl({
            path:
              request.media.path,

            sizeBytes:
              request.media.sizeBytes,

            sha256:
              request.media.sha256
          })
        )

      const result =
        object(
          await transport({
            request,
            accessToken:
              credential.accessToken,
            accountId:
              credential.accountId,
            deliveryUrl,
            signal
          }),
          'Instagram transport result'
        )

      const remoteId =
        text(
          result.remoteId,
          'Instagram media id',
          1,
          500
        )

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
          'instagram',

        placement:
          'instagram-reel',

        adapter: {
          id:
            instagramPublisherDescriptor
              .adapterId,

          version:
            instagramPublisherDescriptor
              .adapterVersion
        },

        sourceSha256:
          request.media
            .sha256,

        remote: {
          id:
            remoteId
        },

        publishedAt:
          now()
            .toISOString()
      }

      assertNoSecretMaterial(
        receipt,
        'Instagram publish receipt'
      )

      return receipt
    }
  }
}


export function createUnconfiguredInstagramPublisher(
  resolveCredential,
  resolveDeliveryUrl
) {
  return createInstagramPublisher({
    resolveCredential,
    resolveDeliveryUrl,

    transport:
      async () => {
        throw new Error(
          'Instagram live transport is not configured'
        )
      }
  })
}
