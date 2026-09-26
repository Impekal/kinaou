import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAssDocument, captionTempPaths, escapeAssText, escapeSubtitleFilterPath } from './captions.mjs'

test('writes deterministic Unicode and multiline ASS events', () => {
  const document = buildAssDocument([{ clipId: 'c1', startMs: 1250, durationMs: 2750, asset: { metadata: { text: 'Grüße, 世界\n{safe} \\ path' } } }], 1920, 1080)
  assert.match(document, /PlayResX: 1920/)
  assert.match(document, /Dialogue: 0,0:00:01\.25,0:00:04\.00/)
  assert.match(document, /Grüße, 世界\\N｛safe｝ ＼ path/)
})

test('keeps temp files scoped to the managed caption directory', () => {
  assert.deepEqual(captionTempPaths('/Volumes/Media/KINAOU', 'job-123'), { directory: '/Volumes/Media/KINAOU/Temp/Captions', file: '/Volumes/Media/KINAOU/Temp/Captions/job-123.ass' })
  assert.throws(() => captionTempPaths('/Volumes/Media/KINAOU', '../escape'))
  assert.equal(escapeAssText('one\ntwo'), 'one\\Ntwo')
  assert.equal(escapeSubtitleFilterPath("/Volumes/My:Disk/a,b's.ass"), "/Volumes/My\\:Disk/a\\,b'\\''s.ass")
})

test(
  'preserves the exact legacy default ASS caption style',
  () => {
    const document =
      buildAssDocument(
        [
          {
            clipId:
              'legacy',

            startMs:
              0,

            durationMs:
              1000,

            asset: {
              metadata: {
                text:
                  'Legacy'
              }
            }
          }
        ],
        1920,
        1080
      )

    assert.match(
      document,
      /Style: Caption_clean_bottom_medium,Arial,54,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,70,70,55,1/
    )

    assert.match(
      document,
      /Dialogue: 0,0:00:00\.00,0:00:01\.00,Caption_clean_bottom_medium/
    )
  }
)


test(
  'writes deterministic Short caption finishing styles',
  () => {
    const document =
      buildAssDocument(
        [
          {
            clipId:
              'boxed',

            startMs:
              1000,

            durationMs:
              1000,

            captionStyle: {
              preset:
                'boxed',

              position:
                'top',

              size:
                'large'
            },

            asset: {
              metadata: {
                text:
                  'Boxed'
              }
            }
          },

          {
            clipId:
              'strong',

            startMs:
              2000,

            durationMs:
              1000,

            captionStyle: {
              preset:
                'strong',

              position:
                'center',

              size:
                'small'
            },

            asset: {
              metadata: {
                text:
                  'Strong'
              }
            }
          }
        ],
        1080,
        1920
      )

    assert.match(
      document,
      /Style: Caption_boxed_top_large,Arial,125,/
    )

    assert.match(
      document,
      /Style: Caption_strong_center_small,Arial,77,/
    )

    assert.match(
      document,
      /Caption_boxed_top_large.*?,3,1,0,8,/
    )

    assert.match(
      document,
      /Caption_strong_center_small.*?,1,5,2,5,/
    )

    assert.match(
      document,
      /Dialogue: 0,0:00:01\.00,0:00:02\.00,Caption_boxed_top_large/
    )

    assert.match(
      document,
      /Dialogue: 0,0:00:02\.00,0:00:03\.00,Caption_strong_center_small/
    )
  }
)


test(
  'rejects unknown caption finishing values',
  () => {
    assert.throws(
      () =>
        buildAssDocument(
          [
            {
              clipId:
                'bad',

              startMs:
                0,

              durationMs:
                1000,

              captionStyle: {
                preset:
                  'neon',

                position:
                  'bottom',

                size:
                  'medium'
              },

              asset: {
                metadata: {
                  text:
                    'Bad'
                }
              }
            }
          ],
          1920,
          1080
        ),
      /preset/
    )
  }
)
