import {
  createReadStream
} from 'node:fs'


export const YOUTUBE_RESUMABLE_ENDPOINT =
  'https://www.googleapis.com/upload/youtube/v3/videos'


function requiredText(
  value,
  label,
  maximum
) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length === 0
    || value.length > maximum
  ) {
    throw new Error(
      `${label} is invalid`
    )
  }

  return value
}


function optionalText(
  value,
  label,
  maximum
) {
  if (
    typeof value !== 'string'
  ) {
    throw new Error(
      `${label} must be a string`
    )
  }

  if (
    value !== value.trim()
    || value.length > maximum
  ) {
    throw new Error(
      `${label} is invalid`
    )
  }

  return value
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
      'YouTube tags are invalid'
    )
  }

  return value.map(
    tag =>
      requiredText(
        tag,
        'YouTube tag',
        80
      )
  )
}


function trustedSessionUrl(
  value
) {
  const raw =
    requiredText(
      value,
      'YouTube resumable session URL',
      5000
    )

  const url =
    new URL(
      raw
    )

  if (
    url.protocol !== 'https:'
    || url.hostname !== 'www.googleapis.com'
    || url.pathname
      !== '/upload/youtube/v3/videos'
    || url.username
    || url.password
  ) {
    throw new Error(
      'YouTube returned an untrusted resumable session URL'
    )
  }

  return url.toString()
}


async function errorMessage(
  response,
  prefix
) {
  const raw =
    await response.text()

  let detail =
    raw.trim()

  try {
    const payload =
      JSON.parse(
        raw
      )

    detail =
      payload?.error
        ?.message
      || payload?.error_description
      || payload?.error
      || detail
  } catch {
    // Plain-text Google error responses remain useful.
  }

  return `${prefix}: ${
    detail
    || `HTTP ${response.status}`
  }`
}


export class YouTubeResumableUploadInterruptedError
  extends Error {
  constructor(
    message,
    sessionUrl,
    status
  ) {
    super(
      message
    )

    this.name =
      'YouTubeResumableUploadInterruptedError'

    /*
     * The session URI stays worker-local.
     * Do not serialize this error into project or publish receipts.
     */
    Object.defineProperty(
      this,
      'sessionUrl',
      {
        value:
          sessionUrl,

        enumerable:
          false
      }
    )

    this.status =
      status
  }
}


export function buildYouTubeUploadMetadata(
  request
) {
  return {
    snippet: {
      title:
        requiredText(
          request.metadata
            .title,
          'YouTube title',
          100
        ),

      description:
        optionalText(
          request.metadata
            .description,
          'YouTube description',
          5000
        ),

      ...(request.metadata
        .tags.length
        ? {
            tags:
              tags(
                request.metadata
                  .tags
              )
          }
        : {})
    },

    /*
     * Until KINAOU adds a separate explicit visibility review,
     * network publishing is deliberately private-only.
     */
    status: {
      privacyStatus:
        'private'
    }
  }
}


export function createYouTubeResumableTransport({
  fetchImpl =
    fetch,

  resolveAbsolutePath,
  openSource =
    absolutePath =>
      createReadStream(
        absolutePath
      )
}) {
  if (
    typeof resolveAbsolutePath
      !== 'function'
    || typeof openSource
      !== 'function'
  ) {
    throw new Error(
      'YouTube transport requires managed-path dependencies'
    )
  }

  return async function youtubeResumableTransport({
    request,
    accessToken,
    signal
  }) {
    const token =
      requiredText(
        accessToken,
        'YouTube access token',
        20_000
      )

    const sourcePath =
      requiredText(
        request.media.path,
        'YouTube source path',
        700
      )

    const sizeBytes =
      request.media
        .sizeBytes

    if (
      !Number.isSafeInteger(
        sizeBytes
      )
      || sizeBytes <= 0
    ) {
      throw new Error(
        'YouTube source size is invalid'
      )
    }

    const absolutePath =
      await resolveAbsolutePath(
        sourcePath
      )

    const metadata =
      buildYouTubeUploadMetadata(
        request
      )

    const initiationUrl =
      new URL(
        YOUTUBE_RESUMABLE_ENDPOINT
      )

    initiationUrl
      .searchParams
      .set(
        'uploadType',
        'resumable'
      )

    initiationUrl
      .searchParams
      .set(
        'part',
        'snippet,status'
      )

    /*
     * KINAOU must not notify subscribers unless the user explicitly
     * gains and approves such a control in a later phase.
     */
    initiationUrl
      .searchParams
      .set(
        'notifySubscribers',
        'false'
      )

    const initiation =
      await fetchImpl(
        initiationUrl,
        {
          method:
            'POST',

          headers: {
            authorization:
              `Bearer ${token}`,

            'content-type':
              'application/json; charset=UTF-8',

            'x-upload-content-length':
              String(
                sizeBytes
              ),

            'x-upload-content-type':
              'video/mp4'
          },

          body:
            JSON.stringify(
              metadata
            ),

          signal
        }
      )

    if (
      !initiation.ok
    ) {
      throw new Error(
        await errorMessage(
          initiation,
          'YouTube resumable session creation failed'
        )
      )
    }

    const location =
      initiation.headers
        .get(
          'location'
        )

    if (!location) {
      throw new Error(
        'YouTube resumable session response is missing Location'
      )
    }

    const sessionUrl =
      trustedSessionUrl(
        location
      )

    const body =
      await openSource(
        absolutePath
      )

    const upload =
      await fetchImpl(
        sessionUrl,
        {
          method:
            'PUT',

          headers: {
            authorization:
              `Bearer ${token}`,

            'content-length':
              String(
                sizeBytes
              ),

            'content-type':
              'video/mp4'
          },

          body,

          /*
           * Required by Node fetch when the body is a stream.
           * Test transports may ignore this field.
           */
          duplex:
            'half',

          signal
        }
      )

    if (
      upload.status === 308
      || [
        500,
        502,
        503,
        504
      ].includes(
        upload.status
      )
    ) {
      throw new YouTubeResumableUploadInterruptedError(
        'YouTube resumable upload can be resumed explicitly',
        sessionUrl,
        upload.status
      )
    }

    if (
      upload.status !== 201
    ) {
      throw new Error(
        await errorMessage(
          upload,
          'YouTube video upload failed'
        )
      )
    }

    const payload =
      await upload.json()
        .catch(
          () =>
            null
        )

    const remoteId =
      requiredText(
        payload?.id,
        'YouTube uploaded video id',
        500
      )

    return {
      remoteId,

      remoteUrl:
        `https://www.youtube.com/watch?v=${encodeURIComponent(
          remoteId
        )}`
    }
  }
}
