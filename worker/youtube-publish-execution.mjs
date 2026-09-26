import {
  validateYouTubePublishRequest
} from './youtube-publisher.mjs'


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


function sameStrings(
  left,
  right
) {
  return (
    Array.isArray(
      left
    )
    && Array.isArray(
      right
    )
    && left.length
      === right.length
    && left.every(
      (
        value,
        index
      ) =>
        value === right[
          index
        ]
    )
  )
}


function packageDocument(
  value
) {
  const record =
    object(
      value,
      'YouTube publish package record'
    )

  const document =
    record.document
      ?? record

  return object(
    document,
    'YouTube publish package'
  )
}


export function assertYouTubeRequestMatchesPackage(
  requestValue,
  packageValue
) {
  const request =
    validateYouTubePublishRequest(
      requestValue
    )

  const document =
    packageDocument(
      packageValue
    )


  if (
    document.schemaVersion
      !== 3
  ) {
    throw new Error(
      'YouTube publishing requires a V3 publish package'
    )
  }


  if (
    document.kind
      !== 'kinaou-publish-package'
    || document.projectId
      !== request.projectId
    || document.platform
      !== 'youtube'
    || document.placement
      !== request.placement
  ) {
    throw new Error(
      'YouTube request does not match the selected publish package'
    )
  }


  if (
    document.delivery
      ?.ready !== true
  ) {
    throw new Error(
      'YouTube publish package is not delivery-ready'
    )
  }


  if (
    document.media
      ?.outputRelativePath
      !== request.media.path
    || document.media
      ?.sizeBytes
      !== request.media.sizeBytes
    || document.integrity
      ?.sha256
      !== request.media.sha256
  ) {
    throw new Error(
      'YouTube source evidence does not match the publish package'
    )
  }


  if (
    document.title
      !== request.metadata.title
    || document.description
      !== request.metadata.description
    || !sameStrings(
      document.tags,
      request.metadata.tags
    )
  ) {
    throw new Error(
      'YouTube metadata does not match the reviewed publish package'
    )
  }


  return request
}


/*
 * Security boundary:
 *
 * 1. Re-read the durable V3 package.
 * 2. Bind every user-visible publish field back to it.
 * 3. Re-hash the actual MP4 immediately before handing control to the
 *    publisher. Only after that may credential refresh or Google network
 *    traffic begin.
 *
 * There is deliberately no automatic retry here.
 */
export async function executeExplicitYouTubePublish({
  requestValue,
  attemptId,
  readPackage,
  rehashSource,
  publisher,
  signal
}) {
  if (
    typeof readPackage
      !== 'function'
    || typeof rehashSource
      !== 'function'
    || !publisher
    || typeof publisher.publish
      !== 'function'
  ) {
    throw new Error(
      'YouTube publish execution dependencies are incomplete'
    )
  }


  if (
    signal?.aborted
  ) {
    throw new DOMException(
      'YouTube publish cancelled',
      'AbortError'
    )
  }


  const firstPass =
    validateYouTubePublishRequest(
      requestValue
    )


  const storedPackage =
    await readPackage(
      firstPass.packagePath
    )


  const request =
    assertYouTubeRequestMatchesPackage(
      firstPass,
      storedPackage
    )


  const currentSha256 =
    await rehashSource(
      request.media.path,
      request.media.sizeBytes
    )


  if (
    currentSha256
    !== request.media.sha256
  ) {
    throw new Error(
      'YouTube source changed after publish review'
    )
  }


  if (
    signal?.aborted
  ) {
    throw new DOMException(
      'YouTube publish cancelled',
      'AbortError'
    )
  }


  return publisher.publish(
    request,
    signal,
    attemptId
  )
}
