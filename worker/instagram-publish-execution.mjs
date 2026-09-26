import {
  validateInstagramPublishRequest
} from './instagram-publisher.mjs'


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
      'Instagram publish package record'
    )

  const document =
    record.document
      ?? record

  return object(
    document,
    'Instagram publish package'
  )
}


export function assertInstagramRequestMatchesPackage(
  requestValue,
  packageValue
) {
  const request =
    validateInstagramPublishRequest(
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
      'Instagram publishing requires a V3 publish package'
    )
  }


  if (
    document.kind
      !== 'kinaou-publish-package'
    || document.projectId
      !== request.projectId
    || document.platform
      !== 'instagram'
    || document.placement
      !== 'instagram-reel'
  ) {
    throw new Error(
      'Instagram request does not match the selected publish package'
    )
  }


  if (
    document.delivery
      ?.ready !== true
  ) {
    throw new Error(
      'Instagram publish package is not delivery-ready'
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
      'Instagram source evidence does not match the publish package'
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
      'Instagram metadata does not match the reviewed publish package'
    )
  }


  return request
}


/*
 * Security ordering:
 *
 * 1. Read durable V3 package.
 * 2. Bind request back to the reviewed package.
 * 3. Hash the actual MP4 again.
 * 4. Only then may credentials, staging URL or Meta network traffic occur.
 *
 * No retry or polling happens in this boundary.
 */
export async function executeExplicitInstagramPublish({
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
      'Instagram publish execution dependencies are incomplete'
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


  const firstPass =
    validateInstagramPublishRequest(
      requestValue
    )


  const storedPackage =
    await readPackage(
      firstPass.packagePath
    )


  const request =
    assertInstagramRequestMatchesPackage(
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
      'Instagram source changed after publish review'
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


  return publisher.publish(
    request,
    signal,
    attemptId
  )
}
