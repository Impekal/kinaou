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
