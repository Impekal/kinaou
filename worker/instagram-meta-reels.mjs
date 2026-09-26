function requiredText(
  value,
  label,
  maximum = 5000
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


function graphOrigin(
  value
) {
  const raw =
    requiredText(
      value,
      'Instagram Graph origin',
      500
    )

  const url =
    new URL(
      raw
    )

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error(
      'Instagram Graph origin must be a bare HTTPS origin'
    )
  }

  return url.origin
}


function apiVersion(
  value
) {
  const version =
    requiredText(
      value,
      'Meta API version',
      30
    )

  if (
    !/^v[0-9]+\.[0-9]+$/
      .test(
        version
      )
  ) {
    throw new Error(
      'Meta API version must use vN.N format'
    )
  }

  return version
}


function objectId(
  value,
  label
) {
  const id =
    requiredText(
      value,
      label,
      500
    )

  if (
    !/^[A-Za-z0-9_-]+$/
      .test(
        id
      )
  ) {
    throw new Error(
      `${label} contains unsupported characters`
    )
  }

  return id
}


function publicDeliveryUrl(
  value
) {
  const raw =
    requiredText(
      value,
      'Instagram video URL',
      5000
    )

  const url =
    new URL(
      raw
    )

  const host =
    url.hostname
      .toLowerCase()

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || [
      'localhost',
      '127.0.0.1',
      '::1'
    ].includes(
      host
    )
  ) {
    throw new Error(
      'Instagram video URL must be publicly reachable HTTPS'
    )
  }

  return url.toString()
}


function bearer(
  value
) {
  const token =
    requiredText(
      value,
      'Instagram access token',
      20_000
    )

  if (
    /[\r\n]/.test(
      token
    )
  ) {
    throw new Error(
      'Instagram access token cannot contain line breaks'
    )
  }

  return token
}


async function responseJson(
  response,
  label
) {
  const raw =
    await response.text()

  let parsed

  try {
    parsed =
      JSON.parse(
        raw
      )
  } catch {
    throw new Error(
      `${label} returned invalid JSON`
    )
  }


  if (
    !response.ok
  ) {
    const message =
      typeof parsed?.error
        ?.message === 'string'
        ? parsed.error.message
        : `HTTP ${response.status}`

    throw new Error(
      `${label} failed: ${message}`
    )
  }


  return parsed
}


function endpoint(
  origin,
  version,
  id,
  edge = ''
) {
  const url =
    new URL(
      `${
        graphOrigin(
          origin
        )
      }/${
        apiVersion(
          version
        )
      }/${
        objectId(
          id,
          'Instagram object id'
        )
      }${
        edge
      }`
    )

  return url
}


export function createInstagramReelsProtocol({
  fetchImpl =
    fetch,

  origin,

  version
}) {
  const normalizedOrigin =
    graphOrigin(
      origin
    )

  const normalizedVersion =
    apiVersion(
      version
    )


  async function createContainer({
    accountId,
    accessToken,
    videoUrl,
    caption,
    shareToFeed =
      false,
    signal
  }) {
    const url =
      endpoint(
        normalizedOrigin,
        normalizedVersion,
        accountId,
        '/media'
      )


    const body =
      new URLSearchParams()

    body.set(
      'media_type',
      'REELS'
    )

    body.set(
      'video_url',
      publicDeliveryUrl(
        videoUrl
      )
    )

    body.set(
      'caption',
      typeof caption === 'string'
        ? caption
            .trim()
            .slice(
              0,
              2200
            )
        : ''
    )

    body.set(
      'share_to_feed',
      shareToFeed
        ? 'true'
        : 'false'
    )


    const response =
      await fetchImpl(
        url,
        {
          method:
            'POST',

          headers: {
            authorization:
              `Bearer ${
                bearer(
                  accessToken
                )
              }`,

            'content-type':
              'application/x-www-form-urlencoded'
          },

          body:
            body.toString(),

          signal
        }
      )


    const payload =
      await responseJson(
        response,
        'Instagram Reel container creation'
      )


    return {
      containerId:
        objectId(
          payload?.id,
          'Instagram container id'
        )
    }
  }


  async function containerStatus({
    containerId,
    accessToken,
    signal
  }) {
    const url =
      endpoint(
        normalizedOrigin,
        normalizedVersion,
        containerId
      )

    url.searchParams.set(
      'fields',
      'status_code,status'
    )


    const response =
      await fetchImpl(
        url,
        {
          method:
            'GET',

          headers: {
            authorization:
              `Bearer ${
                bearer(
                  accessToken
                )
              }`
          },

          signal
        }
      )


    const payload =
      await responseJson(
        response,
        'Instagram Reel container status'
      )


    const code =
      requiredText(
        payload?.status_code,
        'Instagram container status code',
        100
      )


    return {
      containerId:
        objectId(
          payload?.id
          ?? containerId,
          'Instagram container id'
        ),

      statusCode:
        code,

      status:
        typeof payload?.status
          === 'string'
          ? payload.status
              .slice(
                0,
                1000
              )
          : ''
    }
  }


  async function publishContainer({
    accountId,
    containerId,
    accessToken,
    signal
  }) {
    const url =
      endpoint(
        normalizedOrigin,
        normalizedVersion,
        accountId,
        '/media_publish'
      )


    const body =
      new URLSearchParams({
        creation_id:
          objectId(
            containerId,
            'Instagram container id'
          )
      })


    const response =
      await fetchImpl(
        url,
        {
          method:
            'POST',

          headers: {
            authorization:
              `Bearer ${
                bearer(
                  accessToken
                )
              }`,

            'content-type':
              'application/x-www-form-urlencoded'
          },

          body:
            body.toString(),

          signal
        }
      )


    const payload =
      await responseJson(
        response,
        'Instagram Reel publication'
      )


    return {
      remoteId:
        objectId(
          payload?.id,
          'Instagram media id'
        )
    }
  }


  return {
    createContainer,
    containerStatus,
    publishContainer
  }
}
