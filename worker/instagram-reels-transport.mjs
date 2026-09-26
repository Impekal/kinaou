export class InstagramContainerNotReadyError
  extends Error {
  constructor(
    containerId,
    statusCode
  ) {
    super(
      `Instagram Reel container is not ready (${statusCode})`
    )

    this.name =
      'InstagramContainerNotReadyError'


    /*
     * Safe orchestration identifiers. Keep them non-enumerable so generic
     * error serialization does not persist remote workflow state.
     */
    Object.defineProperty(
      this,
      'containerId',
      {
        value:
          containerId,

        enumerable:
          false,

        configurable:
          false,

        writable:
          false
      }
    )


    Object.defineProperty(
      this,
      'statusCode',
      {
        value:
          statusCode,

        enumerable:
          false,

        configurable:
          false,

        writable:
          false
      }
    )
  }
}


function requiredText(
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


function reelCaption(
  request
) {
  const title =
    requiredText(
      request.metadata
        .title,
      'Instagram title',
      200
    )

  const description =
    typeof request.metadata
      .description === 'string'
      ? request.metadata
          .description
          .trim()
      : ''


  const tags =
    request.metadata
      .tags
      .map(
        tag => {
          const normalized =
            requiredText(
              tag,
              'Instagram tag',
              80
            )
              .replace(
                /^#+/,
                ''
              )
              .replace(
                /\s+/g,
                ''
              )

          return normalized
            ? `#${normalized}`
            : ''
        }
      )
      .filter(
        Boolean
      )
      .join(
        ' '
      )


  const caption =
    [
      title,
      description,
      tags
    ]
      .filter(
        Boolean
      )
      .join(
        '\n\n'
      )


  if (
    caption.length > 2200
  ) {
    throw new Error(
      'Instagram Reel caption exceeds 2200 characters'
    )
  }


  return caption
}


export function createInstagramReelsTransport({
  protocol
}) {
  if (
    !protocol
    || typeof protocol
      .createContainer !== 'function'
    || typeof protocol
      .containerStatus !== 'function'
    || typeof protocol
      .publishContainer !== 'function'
  ) {
    throw new Error(
      'Instagram Reels transport requires the Meta protocol'
    )
  }


  return async function transport({
    request,
    accessToken,
    accountId,
    deliveryUrl,
    signal
  }) {
    if (
      signal?.aborted
    ) {
      throw new DOMException(
        'Instagram publishing cancelled',
        'AbortError'
      )
    }


    const created =
      await protocol
        .createContainer({
          accountId,

          accessToken,

          videoUrl:
            deliveryUrl,

          caption:
            reelCaption(
              request
            ),

          /*
           * Phase 5.6 deliberately avoids also pushing the Reel into the
           * main feed until that choice exists as a separate user review.
           */
          shareToFeed:
            false,

          signal
        })


    if (
      signal?.aborted
    ) {
      throw new DOMException(
        'Instagram publishing cancelled',
        'AbortError'
      )
    }


    /*
     * Exactly one explicit readiness check.
     * No polling loop and no retry.
     */
    const status =
      await protocol
        .containerStatus({
          containerId:
            created.containerId,

          accessToken,

          signal
        })


    if (
      status.statusCode
        !== 'FINISHED'
    ) {
      throw new InstagramContainerNotReadyError(
        created.containerId,
        status.statusCode
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


    return protocol
      .publishContainer({
        accountId,

        containerId:
          created.containerId,

        accessToken,

        signal
      })
  }
}
