const SHA256 =
  /^[a-f0-9]{64}$/


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


function renderPath(
  value
) {
  const path =
    text(
      value,
      'Instagram delivery source path',
      700
    )

  if (
    !path.startsWith(
      'KINAOU/Renders/'
    )
    || !path.endsWith(
      '.mp4'
    )
    || path.includes(
      '\\'
    )
    || path.split(
      '/'
    ).includes(
      '..'
    )
  ) {
    throw new Error(
      'Instagram delivery requires a canonical managed render MP4'
    )
  }

  return path
}


function deliveryUrl(
  value
) {
  const raw =
    text(
      value,
      'Instagram delivery URL',
      5000
    )

  const url =
    new URL(
      raw
    )

  const hostname =
    url.hostname
      .toLowerCase()

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
  ) {
    throw new Error(
      'Instagram delivery URL must be publicly reachable HTTPS'
    )
  }

  return url.toString()
}


export function normalizeInstagramDeliveryEvidence(
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
      'Instagram delivery evidence is required'
    )
  }

  const path =
    renderPath(
      value.path
    )

  if (
    !Number.isSafeInteger(
      value.sizeBytes
    )
    || value.sizeBytes <= 0
  ) {
    throw new Error(
      'Instagram delivery source size is invalid'
    )
  }

  if (
    typeof value.sha256 !== 'string'
    || !SHA256.test(
      value.sha256
    )
  ) {
    throw new Error(
      'Instagram delivery source SHA-256 is invalid'
    )
  }

  return {
    path,

    sizeBytes:
      value.sizeBytes,

    sha256:
      value.sha256
  }
}


/*
 * Initial explicit staging provider.
 *
 * KINAOU does not upload anything publicly here. The user/operator stages
 * the reviewed MP4 outside KINAOU and configures the worker with the exact
 * source evidence plus the corresponding HTTPS URL.
 *
 * The URL never enters a project, publish package, browser request or
 * publish receipt.
 */
export function resolveEnvironmentInstagramDeliveryUrl(
  evidenceValue,
  env = process.env
) {
  const evidence =
    normalizeInstagramDeliveryEvidence(
      evidenceValue
    )

  const configuredUrl =
    env.KINAOU_INSTAGRAM_DELIVERY_URL
      ?.trim()

  const configuredPath =
    env.KINAOU_INSTAGRAM_DELIVERY_PATH
      ?.trim()

  const configuredSha =
    env.KINAOU_INSTAGRAM_DELIVERY_SHA256
      ?.trim()

  const configuredSize =
    env.KINAOU_INSTAGRAM_DELIVERY_SIZE_BYTES
      ?.trim()


  if (
    !configuredUrl
    || !configuredPath
    || !configuredSha
    || !configuredSize
  ) {
    throw new Error(
      'Instagram external delivery staging is not configured'
    )
  }


  if (
    configuredPath
      !== evidence.path
  ) {
    throw new Error(
      'Instagram staged delivery path does not match the reviewed source'
    )
  }


  if (
    configuredSha
      !== evidence.sha256
  ) {
    throw new Error(
      'Instagram staged delivery SHA-256 does not match the reviewed source'
    )
  }


  const parsedSize =
    Number(
      configuredSize
    )


  if (
    !Number.isSafeInteger(
      parsedSize
    )
    || parsedSize <= 0
    || parsedSize
      !== evidence.sizeBytes
  ) {
    throw new Error(
      'Instagram staged delivery size does not match the reviewed source'
    )
  }


  return deliveryUrl(
    configuredUrl
  )
}
