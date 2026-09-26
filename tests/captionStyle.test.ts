import {
  describe,
  expect,
  it
} from 'vitest'

import {
  addCaption
} from '../src/core/captions'

import {
  captionStyleForClip,
  clearCaptionClipStyle,
  defaultCaptionStyle,
  setCaptionClipStyle
} from '../src/core/captionStyle'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  createRenderPlan,
  preview1080pPreset
} from '../src/core/render'


function fixture() {
  return addCaption(
    createProjectFromInput({
      title:
        'Caption style',

      kind:
        'idea',

      content:
        ''
    }),
    {
      text:
        'Styled caption',

      startMs:
        1000,

      durationMs:
        3000
    }
  )
}


describe(
  'caption style',
  () => {
    it(
      'uses the deterministic backward-compatible default',
      () => {
        const project =
          fixture()

        const track =
          project.tracks.find(
            item =>
              item.type
              === 'caption'
          )!

        expect(
          captionStyleForClip(
            track.clips[0]
          )
        ).toEqual(
          defaultCaptionStyle
        )

        expect(
          defaultCaptionStyle
        ).toEqual({
          preset:
            'clean',

          position:
            'bottom',

          size:
            'medium'
        })

        expect(
          track.clips[0]
            .captionStyle
        ).toBeUndefined()
      }
    )

    it(
      'stores explicit style only on the selected caption clip',
      () => {
        const project =
          fixture()

        const track =
          project.tracks.find(
            item =>
              item.type
              === 'caption'
          )!

        const before =
          structuredClone(
            project
          )

        const next =
          setCaptionClipStyle(
            project,
            track.id,
            track.clips[0].id,
            {
              preset:
                'boxed',

              position:
                'top',

              size:
                'large'
            },
            new Date(
              '2026-09-26T00:00:00.000Z'
            )
          )

        expect(
          next.tracks
            .find(
              item =>
                item.id
                === track.id
            )!
            .clips[0]
            .captionStyle
        ).toEqual({
          preset:
            'boxed',

          position:
            'top',

          size:
            'large'
        })

        expect(
          project
        ).toEqual(
          before
        )
      }
    )

    it(
      'carries explicit caption style into the real render contract',
      () => {
        const project =
          fixture()

        const track =
          project.tracks.find(
            item =>
              item.type
              === 'caption'
          )!

        const styled =
          setCaptionClipStyle(
            project,
            track.id,
            track.clips[0].id,
            {
              preset:
                'strong',

              position:
                'center',

              size:
                'small'
            }
          )

        const plan =
          createRenderPlan(
            styled,
            preview1080pPreset,
            'KINAOU/Cache/Previews/caption-style.mp4'
          )

        const caption =
          plan.clips.find(
            item =>
              item.trackType
              === 'caption'
          )!

        expect(
          caption.captionStyle
        ).toEqual({
          preset:
            'strong',

          position:
            'center',

          size:
            'small'
        })
      }
    )

    it(
      'clears explicit style back to legacy default behavior',
      () => {
        const project =
          fixture()

        const track =
          project.tracks.find(
            item =>
              item.type
              === 'caption'
          )!

        const styled =
          setCaptionClipStyle(
            project,
            track.id,
            track.clips[0].id,
            {
              preset:
                'boxed',

              position:
                'top',

              size:
                'large'
            }
          )

        const cleared =
          clearCaptionClipStyle(
            styled,
            track.id,
            track.clips[0].id
          )

        const clip =
          cleared.tracks
            .find(
              item =>
                item.id
                === track.id
            )!
            .clips[0]

        expect(
          clip.captionStyle
        ).toBeUndefined()

        expect(
          captionStyleForClip(
            clip
          )
        ).toEqual(
          defaultCaptionStyle
        )
      }
    )

    it(
      'rejects locked and non-caption targets',
      () => {
        const project =
          fixture()

        const captionTrack =
          project.tracks.find(
            item =>
              item.type
              === 'caption'
          )!

        const locked =
          structuredClone(
            project
          )

        locked.tracks
          .find(
            item =>
              item.id
              === captionTrack.id
          )!
          .locked =
            true

        expect(
          () =>
            setCaptionClipStyle(
              locked,
              captionTrack.id,
              captionTrack.clips[0].id,
              {
                preset:
                  'clean',

                position:
                  'top',

                size:
                  'medium'
              }
            )
        ).toThrow(
          /locked/i
        )

        const videoTrack =
          project.tracks.find(
            item =>
              item.type
              === 'video'
          )!

        expect(
          () =>
            setCaptionClipStyle(
              project,
              videoTrack.id,
              'missing',
              {
                preset:
                  'clean',

                position:
                  'top',

                size:
                  'medium'
              }
            )
        ).toThrow(
          /caption track/i
        )
      }
    )
  }
)
