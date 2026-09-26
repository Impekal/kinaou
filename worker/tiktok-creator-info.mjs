export const TIKTOK_CREATOR_INFO_ENDPOINT =
  'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'


const privacyLevels =
  new Set([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY'
  ])


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


function optionalHttpsUrl(
  value,
  label
) {
  if (
    value === undefined
    || value === null
    || value === ''
  ) {
    return undefined
  }


  const raw =
    requiredText(
      value,
      label,
      2000
    )


  let url

  try {
    url =
      new URL(
        raw
      )
  } catch {
    throw new Error(
      `${label} is invalid`
    )
  }


  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
  ) {
    throw new Error(
      `${label} must use HTTPS`
    )
  }


  return url.toString()
}


function boolean(
  value,
  label
) {
  if (
    typeof value !== 'boolean'
  ) {
    throw new Error(
      `${label} is invalid`
    )
  }

  return value
}


function normalizePrivacyLevels(
  value
) {
  if (
    !Array.isArray(
      value
    )
    || value.length < 1
    || value.length > 4
  ) {
    throw new Error(
      'TikTok creator privacy options are invalid'
    )
  }


  const normalized =
    value.map(
      option =>
        requiredText(
          option,
          'TikTok privacy option',
          100
        )
    )


  if (
    normalized.some(
      option =>
        !privacyLevels.has(
          option
        )
    )
  ) {
    throw new Error(
      'TikTok creator returned an unknown privacy option'
    )
  }


  if (
    new Set(
      normalized
    ).size !== normalized.length
  ) {
    throw new Error(
      'TikTok creator privacy options must be unique'
    )
  }


  return normalized
}


export function normalizeTikTokCreatorInfo(
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
      'TikTok creator info is invalid'
    )
  }


  const duration =
    value.max_video_post_duration_sec


  if (
    !Number.isInteger(
      duration
    )
    || duration <= 0
    || duration > 600
  ) {
    throw new Error(
      'TikTok creator maximum video duration is invalid'
    )
  }


  const avatar =
    optionalHttpsUrl(
      value.creator_avatar_url,
      'TikTok creator avatar URL'
    )


  return {
    creatorUsername:
      requiredText(
        value.creator_username,
        'TikTok creator username',
        200
      ),

    creatorNickname:
      requiredText(
        value.creator_nickname,
        'TikTok creator nickname',
        200
      ),

    ...(avatar
      ? {
          creatorAvatarUrl:
            avatar
        }
      : {}),

    privacyLevelOptions:
      normalizePrivacyLevels(
        value.privacy_level_options
      ),

    commentDisabled:
      boolean(
        value.comment_disabled,
        'TikTok comment setting'
      ),

    duetDisabled:
      boolean(
        value.duet_disabled,
        'TikTok Duet setting'
      ),

    stitchDisabled:
      boolean(
        value.stitch_disabled,
        'TikTok Stitch setting'
      ),

    maxVideoPostDurationSec:
      duration
  }
}


function publicApiError(
  payload,
  status
) {
  const code =
    typeof payload
      ?.error
      ?.code === 'string'
      ? payload.error.code
      : ''


  const message =
    typeof payload
      ?.error
      ?.message === 'string'
      ? payload.error.message
      : ''


  if (
    code
    && code !== 'ok'
  ) {
    return new Error(
      `TikTok creator info failed: ${
        code.slice(
          0,
          200
        )
      }${
        message
          ? ` - ${
              message.slice(
                0,
                300
              )
            }`
          : ''
      }`
    )
  }


  if (
    status < 200
    || status >= 300
  ) {
    return new Error(
      `TikTok creator info failed: HTTP ${status}`
    )
  }


  return null
}


export function createTikTokCreatorInfoProtocol({
  fetchImpl =
    fetch,

  endpoint =
    TIKTOK_CREATOR_INFO_ENDPOINT
} = {}) {
  let url

  try {
    url =
      new URL(
        endpoint
      )
  } catch {
    throw new Error(
      'TikTok creator info endpoint is invalid'
    )
  }


  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error(
      'TikTok creator info endpoint must be credential-free HTTPS'
    )
  }


  return {
    async query({
      accessToken,
      signal
    }) {
      const token =
        requiredText(
          accessToken,
          'TikTok access token',
          20_000
        )


      if (
        /[\r\n]/.test(
          token
        )
      ) {
        throw new Error(
          'TikTok access token is invalid'
        )
      }


      /*
       * Exactly one API request per explicit invocation.
       * No retry, cache refresh loop or background polling.
       */
      const response =
        await fetchImpl(
          url.toString(),
          {
            method:
              'POST',

            headers: {
              authorization:
                `Bearer ${token}`,

              'content-type':
                'application/json; charset=UTF-8',

              'cache-control':
                'no-cache'
            },

            signal
          }
        )


      let payload

      try {
        payload =
          JSON.parse(
            await response.text()
          )
      } catch {
        throw new Error(
          'TikTok creator info returned invalid JSON'
        )
      }


      const apiError =
        publicApiError(
          payload,
          response.status
        )


      if (
        apiError
      ) {
        throw apiError
      }


      if (
        payload?.error?.code !== 'ok'
      ) {
        throw new Error(
          'TikTok creator info response did not confirm success'
        )
      }


      return normalizeTikTokCreatorInfo(
        payload.data
      )
    }
  }
}
