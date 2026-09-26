import {
  captionStyleSchema,
  touchProject,
  type CaptionStyle,
  type KinaouProject,
  type TimelineClip
} from './project'


export const defaultCaptionStyle:
  CaptionStyle =
    captionStyleSchema.parse({})


export function captionStyleForClip(
  clip:
    TimelineClip
): CaptionStyle {
  return clip.captionStyle
    ? captionStyleSchema.parse(
        clip.captionStyle
      )
    : {
        ...defaultCaptionStyle
      }
}


export function setCaptionClipStyle(
  project:
    KinaouProject,

  trackId:
    string,

  clipId:
    string,

  input:
    CaptionStyle,

  now =
    new Date()
): KinaouProject {
  const style =
    captionStyleSchema.parse(
      input
    )

  const track =
    project.tracks.find(
      item =>
        item.id
        === trackId
    )

  if (!track) {
    throw new Error(
      `Caption track not found: ${trackId}`
    )
  }

  if (
    track.type
    !== 'caption'
  ) {
    throw new Error(
      'Caption style can be applied only to a caption track'
    )
  }

  if (track.locked) {
    throw new Error(
      'Caption track is locked'
    )
  }

  const clip =
    track.clips.find(
      item =>
        item.id
        === clipId
    )

  if (!clip) {
    throw new Error(
      `Caption clip not found: ${clipId}`
    )
  }

  const asset =
    project.assets.find(
      item =>
        item.id
        === clip.assetId
    )

  if (
    !asset
    || asset.kind
      !== 'caption'
  ) {
    throw new Error(
      'Caption clip does not reference a caption asset'
    )
  }

  const current =
    captionStyleForClip(
      clip
    )

  if (
    current.preset
      === style.preset
    && current.position
      === style.position
    && current.size
      === style.size
  ) {
    return project
  }

  const tracks =
    project.tracks.map(
      item =>
        item.id
          !== trackId
          ? item
          : {
              ...item,

              clips:
                item.clips.map(
                  candidate =>
                    candidate.id
                      !== clipId
                      ? candidate
                      : {
                          ...candidate,

                          captionStyle: {
                            ...style
                          }
                        }
                )
            }
    )

  return touchProject(
    {
      ...project,
      tracks
    },
    now
  )
}


export function clearCaptionClipStyle(
  project:
    KinaouProject,

  trackId:
    string,

  clipId:
    string,

  now =
    new Date()
): KinaouProject {
  const track =
    project.tracks.find(
      item =>
        item.id
        === trackId
    )

  if (!track) {
    throw new Error(
      `Caption track not found: ${trackId}`
    )
  }

  if (
    track.type
    !== 'caption'
  ) {
    throw new Error(
      'Caption style can be cleared only on a caption track'
    )
  }

  if (track.locked) {
    throw new Error(
      'Caption track is locked'
    )
  }

  const clip =
    track.clips.find(
      item =>
        item.id
        === clipId
    )

  if (!clip) {
    throw new Error(
      `Caption clip not found: ${clipId}`
    )
  }

  if (
    !clip.captionStyle
  ) {
    return project
  }

  const tracks =
    project.tracks.map(
      item =>
        item.id
          !== trackId
          ? item
          : {
              ...item,

              clips:
                item.clips.map(
                  candidate => {
                    if (
                      candidate.id
                      !== clipId
                    ) {
                      return candidate
                    }

                    const {
                      captionStyle:
                        _removed,
                      ...rest
                    } =
                      candidate

                    return rest
                  }
                )
            }
    )

  return touchProject(
    {
      ...project,
      tracks
    },
    now
  )
}
