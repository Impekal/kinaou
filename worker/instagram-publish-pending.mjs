import crypto from 'node:crypto'

import {
  instagramPublisherDescriptor,
  validateInstagramPublishRequest
} from './instagram-publisher.mjs'


const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i


const SHA256 =
  /^[a-f0-9]{64}$/


const SIGNATURE =
  /^[a-f0-9]{64}$/


const MAX_TICKET_AGE_MS =
  30 * 60 * 1000


function text(
  value,
  label,
  maximum
) {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
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
  const normalized =
    text(
      value,
      label,
      100
    )

  if (
    !UUID.test(
      normalized
    )
  ) {
    throw new Error(
      `${label} must be a UUID`
    )
  }

  return normalized
}


function workerSecret(
  value
) {
  const secret =
    text(
      value,
      'Instagram pending worker secret',
      20_000
    )

  if (
    /[\r\n]/.test(
      secret
    )
  ) {
    throw new Error(
      'Instagram pending worker secret is invalid'
    )
  }

  return secret
}


function canonicalPayload(
  value
) {
  return JSON.stringify([
    value.schemaVersion,
    value.kind,
    value.requestId,
    value.attemptId,
    value.platform,
    value.placement,
    value.media.path,
    value.media.sizeBytes,
    value.media.sha256,
    value.containerId,
    value.issuedAt
  ])
}


function sign(
  value,
  secret
) {
  return crypto
    .createHmac(
      'sha256',
      workerSecret(
        secret
      )
    )
    .update(
      canonicalPayload(
        value
      ),
      'utf8'
    )
    .digest(
      'hex'
    )
}


function safeEqualHex(
  left,
  right
) {
  if (
    typeof left !== 'string'
    || typeof right !== 'string'
    || !SIGNATURE.test(
      left
    )
    || !SIGNATURE.test(
      right
    )
  ) {
    return false
  }

  return crypto
    .timingSafeEqual(
      Buffer.from(
        left,
        'hex'
      ),

      Buffer.from(
        right,
        'hex'
      )
    )
}


function validatePendingShape(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(
      value
    )
  ) {
    throw new Error(
      'Instagram pending publish ticket is required'
    )
  }


  if (
    value.schemaVersion !== 1
    || value.kind
      !== 'instagram-publish-pending'
    || value.platform
      !== 'instagram'
    || value.placement
      !== 'instagram-reel'
  ) {
    throw new Error(
      'Instagram pending publish ticket is invalid'
    )
  }


  const media =
    value.media

  if (
    !media
    || typeof media !== 'object'
    || Array.isArray(
      media
    )
    || typeof media.path !== 'string'
    || !media.path.startsWith(
      'KINAOU/Renders/'
    )
    || !media.path.endsWith(
      '.mp4'
    )
    || !Number.isSafeInteger(
      media.sizeBytes
    )
    || media.sizeBytes <= 0
    || typeof media.sha256 !== 'string'
    || !SHA256.test(
      media.sha256
    )
  ) {
    throw new Error(
      'Instagram pending source evidence is invalid'
    )
  }


  const issuedAt =
    text(
      value.issuedAt,
      'Instagram pending issue time',
      100
    )

  const issuedDate =
    new Date(
      issuedAt
    )

  if (
    !Number.isFinite(
      issuedDate.getTime()
    )
    || issuedDate.toISOString()
      !== issuedAt
  ) {
    throw new Error(
      'Instagram pending issue time is invalid'
    )
  }


  return {
    schemaVersion:
      1,

    kind:
      'instagram-publish-pending',

    requestId:
      uuid(
        value.requestId,
        'Instagram request id'
      ),

    attemptId:
      uuid(
        value.attemptId,
        'Instagram attempt id'
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

    containerId:
      text(
        value.containerId,
        'Instagram container id',
        500
      ),

    issuedAt,

    signature:
      text(
        value.signature,
        'Instagram pending signature',
        64
      )
  }
}


export function createInstagramPendingTicket({
  requestValue,
  attemptId,
  containerId,
  secret,
  now =
    () =>
      new Date()
}) {
  const request =
    validateInstagramPublishRequest(
      requestValue
    )


  const unsigned = {
    schemaVersion:
      1,

    kind:
      'instagram-publish-pending',

    requestId:
      request.requestId,

    attemptId:
      uuid(
        attemptId,
        'Instagram attempt id'
      ),

    platform:
      'instagram',

    placement:
      'instagram-reel',

    media: {
      path:
        request.media.path,

      sizeBytes:
        request.media.sizeBytes,

      sha256:
        request.media.sha256
    },

    containerId:
      text(
        containerId,
        'Instagram container id',
        500
      ),

    issuedAt:
      now()
        .toISOString()
  }


  return {
    ...unsigned,

    signature:
      sign(
        unsigned,
        secret
      )
  }
}


export function verifyInstagramPendingTicket(
  value,
  secret,
  {
    now =
      () =>
        new Date()
  } = {}
) {
  const pending =
    validatePendingShape(
      value
    )


  const expected =
    sign(
      pending,
      secret
    )


  if (
    !safeEqualHex(
      pending.signature,
      expected
    )
  ) {
    throw new Error(
      'Instagram pending publish ticket signature is invalid'
    )
  }


  const age =
    now()
      .getTime()
    - new Date(
      pending.issuedAt
    ).getTime()


  if (
    age < -60_000
    || age > MAX_TICKET_AGE_MS
  ) {
    throw new Error(
      'Instagram pending publish ticket has expired'
    )
  }


  return pending
}


function credential(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(
      value
    )
    || value.platform !== 'instagram'
    || typeof value.accessToken !== 'string'
    || !value.accessToken
    || typeof value.accountId !== 'string'
    || !value.accountId
  ) {
    throw new Error(
      'Instagram publishing credential is invalid'
    )
  }

  return value
}


export async function resumeExplicitInstagramPublish({
  pendingValue,
  secret,
  rehashSource,
  resolveCredential,
  protocol,
  signal,

  now =
    () =>
      new Date(),

  randomUUID =
    () =>
      crypto.randomUUID()
}) {
  if (
    typeof rehashSource !== 'function'
    || typeof resolveCredential !== 'function'
    || !protocol
    || typeof protocol.containerStatus !== 'function'
    || typeof protocol.publishContainer !== 'function'
  ) {
    throw new Error(
      'Instagram pending publish dependencies are incomplete'
    )
  }


  const pending =
    verifyInstagramPendingTicket(
      pendingValue,
      secret,
      {
        now
      }
    )


  if (
    signal?.aborted
  ) {
    throw new DOMException(
      'Instagram publishing cancelled',
      'AbortError'
    )
  }


  /*
   * Re-hash again on every deliberate resume before credentials or Meta.
   */
  const actualSha256 =
    await rehashSource(
      pending.media.path,
      pending.media.sizeBytes
    )


  if (
    actualSha256
      !== pending.media.sha256
  ) {
    throw new Error(
      'Instagram source changed while publication was pending'
    )
  }


  if (
    signal?.aborted
  ) {
    throw new DOMException(
      'Instagram publishing cancelled',
      'AbortError'
    )
  }


  const resolved =
    credential(
      await resolveCredential()
    )


  const status =
    await protocol
      .containerStatus({
        containerId:
          pending.containerId,

        accessToken:
          resolved.accessToken,

        signal
      })


  if (
    status.statusCode
      === 'IN_PROGRESS'
  ) {
    return {
      state:
        'pending',

      pending
    }
  }


  if (
    status.statusCode
      !== 'FINISHED'
  ) {
    throw new Error(
      `Instagram Reel container cannot be published (${status.statusCode})`
    )
  }


  if (
    signal?.aborted
  ) {
    throw new DOMException(
      'Instagram publishing cancelled',
      'AbortError'
    )
  }


  const result =
    await protocol
      .publishContainer({
        accountId:
          resolved.accountId,

        containerId:
          pending.containerId,

        accessToken:
          resolved.accessToken,

        signal
      })


  const remoteId =
    text(
      result?.remoteId,
      'Instagram media id',
      500
    )


  return {
    state:
      'published',

    receipt: {
      schemaVersion:
        1,

      receiptId:
        randomUUID(),

      requestId:
        pending.requestId,

      attemptId:
        pending.attemptId,

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
        pending.media
          .sha256,

      remote: {
        id:
          remoteId
      },

      publishedAt:
        now()
          .toISOString()
    }
  }
}
