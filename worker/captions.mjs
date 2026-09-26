import path from 'node:path'


const captionPresets =
  new Set([
    'clean',
    'strong',
    'boxed'
  ])

const captionPositions =
  new Set([
    'top',
    'center',
    'bottom'
  ])

const captionSizes =
  new Set([
    'small',
    'medium',
    'large'
  ])


export const defaultCaptionStyle = {
  preset:
    'clean',

  position:
    'bottom',

  size:
    'medium'
}


export function normalizeCaptionStyle(
  value
) {
  if (
    value === undefined
    || value === null
  ) {
    return {
      ...defaultCaptionStyle
    }
  }

  if (
    typeof value !== 'object'
    || Array.isArray(
      value
    )
  ) {
    throw new Error(
      'Invalid caption style'
    )
  }

  const preset =
    value.preset
    ?? 'clean'

  const position =
    value.position
    ?? 'bottom'

  const size =
    value.size
    ?? 'medium'

  if (
    !captionPresets.has(
      preset
    )
  ) {
    throw new Error(
      'Invalid caption style preset'
    )
  }

  if (
    !captionPositions.has(
      position
    )
  ) {
    throw new Error(
      'Invalid caption style position'
    )
  }

  if (
    !captionSizes.has(
      size
    )
  ) {
    throw new Error(
      'Invalid caption style size'
    )
  }

  return {
    preset,
    position,
    size
  }
}


export function captionTempPaths(
  managedRoot,
  jobId
) {
  if (
    !/^[a-zA-Z0-9-]+$/
      .test(
        jobId
      )
  ) {
    throw new Error(
      'Invalid render job id'
    )
  }

  const directory =
    path.join(
      managedRoot,
      'Temp',
      'Captions'
    )

  return {
    directory,

    file:
      path.join(
        directory,
        `${jobId}.ass`
      )
  }
}


function captionStyleName(
  style
) {
  return [
    'Caption',
    style.preset,
    style.position,
    style.size
  ].join(
    '_'
  )
}


function captionFontSize(
  height,
  size
) {
  const ratio =
    size === 'small'
      ? 0.04
      : size === 'large'
        ? 0.065
        : 0.05

  return Math.max(
    24,
    Math.round(
      height
      * ratio
    )
  )
}


function captionAlignment(
  position
) {
  if (
    position === 'top'
  ) {
    return 8
  }

  if (
    position === 'center'
  ) {
    return 5
  }

  return 2
}


function captionMarginV(
  height,
  position
) {
  if (
    position === 'center'
  ) {
    return 0
  }

  return Math.max(
    24,
    Math.round(
      height
      * 0.05
    )
  )
}


function assStyleLine(
  style,
  width,
  height
) {
  const name =
    captionStyleName(
      style
    )

  const legacyDefault =
    style.preset === 'clean'
    && style.position === 'bottom'
    && style.size === 'medium'

  const fontSize =
    legacyDefault
      ? 54
      : captionFontSize(
          height,
          style.size
        )

  const alignment =
    captionAlignment(
      style.position
    )

  const marginHorizontal =
    legacyDefault
      ? 70
      : Math.max(
          24,
          Math.round(
            width
            * 0.035
          )
        )

  const marginVertical =
    legacyDefault
      ? 55
      : captionMarginV(
          height,
          style.position
        )

  const preset =
    style.preset

  const bold =
    -1

  const borderStyle =
    preset === 'boxed'
      ? 3
      : 1

  const outline =
    preset === 'strong'
      ? 5
      : preset === 'boxed'
        ? 1
        : 3

  const shadow =
    preset === 'strong'
      ? 2
      : preset === 'boxed'
        ? 0
        : 1

  const backColour =
    preset === 'boxed'
      ? '&H60000000'
      : '&H80000000'

  return [
    `Style: ${name}`,
    'Arial',
    fontSize,
    '&H00FFFFFF',
    '&H000000FF',
    '&H00101010',
    backColour,
    bold,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    borderStyle,
    outline,
    shadow,
    alignment,
    marginHorizontal,
    marginHorizontal,
    marginVertical,
    1
  ].join(
    ','
  )
}


export function buildAssDocument(
  captionClips,
  width,
  height
) {
  if (
    !Number.isFinite(width)
    || width <= 0
    || !Number.isFinite(height)
    || height <= 0
  ) {
    throw new Error(
      'Invalid caption canvas size'
    )
  }

  const clips =
    captionClips
      .slice()
      .sort(
        (
          a,
          b
        ) =>
          a.startMs
          - b.startMs
          || String(
            a.clipId
          ).localeCompare(
            String(
              b.clipId
            )
          )
      )

  const styles =
    new Map()

  for (
    const clip
    of clips
  ) {
    const style =
      normalizeCaptionStyle(
        clip.captionStyle
      )

    styles.set(
      captionStyleName(
        style
      ),
      style
    )
  }

  if (
    !styles.size
  ) {
    styles.set(
      captionStyleName(
        defaultCaptionStyle
      ),
      {
        ...defaultCaptionStyle
      }
    )
  }

  const styleLines =
    [...styles.values()]
      .sort(
        (
          a,
          b
        ) =>
          captionStyleName(
            a
          ).localeCompare(
            captionStyleName(
              b
            )
          )
      )
      .map(
        style =>
          assStyleLine(
            style,
            width,
            height
          )
      )

  const events =
    clips.map(
      clip => {
        const style =
          normalizeCaptionStyle(
            clip.captionStyle
          )

        return (
          `Dialogue: 0,${assTime(
            clip.startMs
          )},${assTime(
            clip.startMs
            + clip.durationMs
          )},${captionStyleName(
            style
          )},,0,0,0,,${escapeAssText(
            clip.asset
              .metadata
              .text
          )}`
        )
      }
    )

  return (
    `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLines.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`
  )
}


export function escapeAssText(
  value
) {
  if (
    typeof value !== 'string'
    || !value.trim()
  ) {
    throw new Error(
      'Caption text is required'
    )
  }

  return value
    .replaceAll(
      '\\',
      '＼'
    )
    .replaceAll(
      '{',
      '｛'
    )
    .replaceAll(
      '}',
      '｝'
    )
    .replace(
      /\r?\n/g,
      '\\N'
    )
}


export function escapeSubtitleFilterPath(
  value
) {
  return value
    .replaceAll(
      '\\',
      '\\\\'
    )
    .replaceAll(
      ':',
      '\\:'
    )
    .replaceAll(
      "'",
      "'\\''"
    )
    .replaceAll(
      ',',
      '\\,'
    )
    .replaceAll(
      '[',
      '\\['
    )
    .replaceAll(
      ']',
      '\\]'
    )
}


function assTime(
  ms
) {
  const centiseconds =
    Math.max(
      0,
      Math.round(
        ms / 10
      )
    )

  const hours =
    Math.floor(
      centiseconds
      / 360000
    )

  const minutes =
    Math.floor(
      (
        centiseconds
        % 360000
      )
      / 6000
    )

  const seconds =
    Math.floor(
      (
        centiseconds
        % 6000
      )
      / 100
    )

  const fraction =
    centiseconds
    % 100

  return (
    `${hours}:${String(
      minutes
    ).padStart(
      2,
      '0'
    )}:${String(
      seconds
    ).padStart(
      2,
      '0'
    )}.${String(
      fraction
    ).padStart(
      2,
      '0'
    )}`
  )
}
