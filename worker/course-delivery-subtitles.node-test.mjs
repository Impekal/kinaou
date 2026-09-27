import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectDeliverySubtitles } from './course-delivery-subtitles.mjs'
const valid = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.500\nA &lt;b&gt;🌍&lt;/b&gt; &amp;amp;\nSecond line\n\n2\n00:00:00.700 --> 00:00:01.000\nFin\n'
test('accepts bounded numbered plain-text profile, literal entities and distinct intervals', () => {
  assert.deepEqual(inspectDeliverySubtitles(valid, 1000), { cueCount: 2 })
})
for (const [kind, text] of [
  ['header', valid.replace('WEBVTT', 'SRT')], ['empty', 'WEBVTT\n\n'], ['crlf', valid.replaceAll('\n', '\r\n')],
  ['number', valid.replace('\n1\n', '\n2\n')], ['overlap', valid.replace('00:00:00.700', '00:00:00.400')],
  ['range', valid.replace('00:00:01.000', '00:00:02.000')], ['zero', valid.replace('00:00:00.500', '00:00:00.000')],
  ['raw-markup', valid.replace('Fin', '<b>Fin</b>')], ['unknown-entity', valid.replace('Fin', '&fake;')],
  ['settings', valid.replace('00:00:00.500\n', '00:00:00.500 align:start\n')],
  ['blank-line', valid.replace('Second line', ' ')], ['control', valid.replace('Fin', '\0')],
  ['invalid-timestamp', valid.replace('00:00:00.700', '00:60:00.700')], ['missing-final-newline', valid.trimEnd()],
  ['oversize', 'x'.repeat(512 * 1024 + 1)]
]) test(`rejects ${kind} before delivery`, () => assert.throws(() => inspectDeliverySubtitles(text, 1000)))
