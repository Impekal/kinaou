import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { buildTikTokFileUploadInit, planTikTokChunks, trustedTikTokUploadUrl, validateTikTokUploadReview, createTikTokFileUploadProtocol, TIKTOK_VIDEO_INIT_ENDPOINT, TikTokFileUploadError } from './tiktok-file-upload.mjs'

const time = Date.parse('2026-09-27T12:00:00.000Z'), MiB = 1024 * 1024
const uploadUrl = 'https://open-upload.tiktokapis.com/video/?upload_id=123&upload_token=upload-secret'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
function review() {
  return { schemaVersion: 1, creatorInfoCheckedAt: new Date(time).toISOString(), videoDurationMs: 1000,
    creatorInfo: { creatorUsername: 'original.user', creatorNickname: 'Original creator', privacyLevelOptions: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], commentDisabled: false, duetDisabled: false, stitchDisabled: true, maxVideoPostDurationSec: 180 },
    settings: { title: 'Reviewed original #caption', privacyLevel: 'SELF_ONLY', allowComment: false, allowDuet: false, allowStitch: false, commercialContent: { enabled: false, yourBrand: false, brandedContent: false }, isAigc: true, musicUsageConsent: true, brandedContentPolicyConsent: false }
  }
}
async function fixture(t, size = 19, realVideo = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-tiktok-protocol-')), managedRoot = path.join(root, 'KINAOU'), absolute = path.join(managedRoot, 'Renders', 'original.mp4')
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.dirname(absolute), { recursive: true })
  if (realVideo) execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:r=24:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', absolute])
  else await writeFile(absolute, Buffer.alloc(size, 31)) // Protocol bytes, not claimed playable media.
  const bytes = await readFile(absolute), calls = [], order = []
  const input = { placement: 'tiktok-video', review: review(), source: { managedRoot, path: 'KINAOU/Renders/original.mp4', sizeBytes: bytes.length, sha256: digest(bytes) }, resolveCredential: async () => { order.push('credential'); return { platform: 'tiktok', accessToken: 'access-secret' } } }
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options }); order.push(options.method)
    if (options.method === 'POST') return Response.json({ error: { code: 'ok' }, data: { publish_id: 'v_pub_file~v2-1.123', upload_url: uploadUrl } })
    return new Response(null, { status: options.headers['content-range'].endsWith(`-${bytes.length - 1}/${bytes.length}`) ? 201 : 206 })
  }
  return { root, absolute, bytes, input, calls, order, fetchImpl, protocol: createTikTokFileUploadProtocol({ fetchImpl, now: () => time }) }
}
test('models documented 50,000,123-byte example using floor count and merged trailing bytes', () => {
  const plan = planTikTokChunks(50_000_123, 10_000_000)
  assert.deepEqual(plan.sourceInfo, { source: 'FILE_UPLOAD', video_size: 50_000_123, chunk_size: 10_000_000, total_chunk_count: 5 })
  assert.deepEqual(plan.chunks.at(-1), { start: 40_000_000, end: 50_000_122, size: 10_000_123, contentRange: 'bytes 40000000-50000122/50000123' })
})
test('models a small whole file, exact multiples, 64 MiB edge and maximum file without gaps', () => {
  for (const size of [1, 4 * MiB, 5 * MiB, 16 * MiB, 64 * MiB, 64 * MiB + 1, 4_000_000_000]) {
    const plan = planTikTokChunks(size, 64 * MiB)
    assert.equal(plan.chunks.reduce((total, chunk) => total + chunk.size, 0), size)
    assert.equal(plan.chunks[0].start, 0); assert.equal(plan.chunks.at(-1).end, size - 1)
    if (size > 64 * MiB) assert.ok(plan.chunks.length >= 2)
    for (let i = 1; i < plan.chunks.length; i++) assert.equal(plan.chunks[i].start, plan.chunks[i - 1].end + 1)
  }
})
test('rejects invalid file/chunk bounds', () => {
  for (const size of [0, -1, 1.2, NaN, Infinity, 4_000_000_001]) assert.throws(() => planTikTokChunks(size))
  for (const size of [0, 5 * MiB - 1, 64 * MiB + 1, NaN]) assert.throws(() => planTikTokChunks(100, size))
})
test('maps only explicitly reviewed settings to FILE_UPLOAD metadata', () => {
  const value = review(), actual = buildTikTokFileUploadInit({ placement: 'tiktok-video', review: value, videoSize: 123, now: time })
  assert.deepEqual(actual.post_info, { title: value.settings.title, privacy_level: 'SELF_ONLY', disable_comment: true, disable_duet: true, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: false, is_aigc: true })
  assert.deepEqual(actual.source_info, { source: 'FILE_UPLOAD', video_size: 123, chunk_size: 123, total_chunk_count: 1 })
  assert.equal(JSON.stringify(actual).includes('creator'), false)
  assert.throws(() => buildTikTokFileUploadInit({ placement: 'tiktok-photo', review: value, videoSize: 123, now: time }))
})
test('fails closed on missing consent/privacy, incompatible creator choices, disclosure and review freshness', () => {
  const changes = [
    r => { delete r.settings.privacyLevel }, r => { delete r.settings.allowComment },
    r => { r.settings.musicUsageConsent = false }, r => { r.settings.allowStitch = true },
    r => { r.videoDurationMs = 181_000 }, r => { r.settings.privacyLevel = 'FOLLOWER_OF_CREATOR' },
    r => { r.settings.commercialContent.yourBrand = true }, r => { r.settings.commercialContent.enabled = true },
    r => { r.settings.commercialContent = { enabled: true, yourBrand: false, brandedContent: true } },
    r => { r.settings.privacyLevel = 'PUBLIC_TO_EVERYONE'; r.settings.commercialContent = { enabled: true, yourBrand: false, brandedContent: true } },
    r => { r.creatorInfoCheckedAt = new Date(time - 600_001).toISOString() },
    r => { r.creatorInfoCheckedAt = new Date(time + 1).toISOString() },
    r => { r.uploadUrl = uploadUrl }, r => { r.settings.accessToken = 'access-secret' }
  ]
  for (const change of changes) { const value = review(); change(value); assert.throws(() => validateTikTokUploadReview(value, time)) }
  const permitted = review(); permitted.settings.privacyLevel = 'PUBLIC_TO_EVERYONE'; permitted.settings.commercialContent = { enabled: true, yourBrand: false, brandedContent: true }; permitted.settings.brandedContentPolicyConsent = true
  assert.doesNotThrow(() => validateTikTokUploadReview(permitted, time))
})
test('allowlists official upload hosts and endpoints without arbitrary redirects or query additions', () => {
  assert.equal(trustedTikTokUploadUrl(uploadUrl), uploadUrl)
  assert.ok(trustedTikTokUploadUrl(uploadUrl.replace('open-upload', 'upload.us').replace('/video/', '/upload/')))
  for (const url of [uploadUrl.replace('https:', 'http:'), uploadUrl.replace('.com/', '.com.evil.test/'), uploadUrl.replace('open-upload.tiktokapis.com', '127.0.0.1'), uploadUrl.replace('https://', 'https://user:pass@'), uploadUrl + '#fragment', uploadUrl + '&extra=value', uploadUrl + '&upload_token=second', uploadUrl.replace('upload-secret', ''), uploadUrl.replace('/video/', '/elsewhere/'), uploadUrl.replace('.com/', '.com:444/'), uploadUrl.replace('/video/', '/a/../video/'), 'not a url']) assert.throws(() => trustedTikTokUploadUrl(url))
})
test('transfers a real synthetic MP4 with exact bytes; token only on init, no publish receipt or status request', async t => {
  const f = await fixture(t, 19, true), result = await f.protocol.upload(f.input)
  assert.deepEqual(result, { state: 'processing', publishId: 'v_pub_file~v2-1.123' })
  assert.deepEqual(f.order, ['credential', 'POST', 'PUT']); assert.equal(f.calls[0].url, TIKTOK_VIDEO_INIT_ENDPOINT)
  assert.equal(f.calls[0].headers.authorization, 'Bearer access-secret'); assert.equal(f.calls[1].headers.authorization, undefined)
  assert.equal(f.calls[1].headers['content-length'], String(f.bytes.length)); assert.equal(f.calls[1].headers['content-range'], `bytes 0-${f.bytes.length - 1}/${f.bytes.length}`)
  assert.deepEqual(f.calls[1].body, f.bytes); assert.deepEqual(await readFile(f.absolute), f.bytes)
  for (const call of f.calls) assert.equal(call.redirect, 'error')
  assert.doesNotMatch(JSON.stringify(result), /secret|upload_url|https|published/)
})
test('sends sequential chunks and exactly the declared final range', async t => {
  const f = await fixture(t, 24 * MiB + 3)
  await f.protocol.upload(f.input)
  const puts = f.calls.slice(1)
  assert.equal(puts.length, 3); assert.deepEqual(puts.map(call => call.body.length), [8 * MiB, 8 * MiB, 8 * MiB + 3])
  assert.deepEqual(Buffer.concat(puts.map(call => call.body)), f.bytes)
})
for (const defect of ['hash', 'size', 'path', 'symlink', 'review']) test(`rejects ${defect} before credentials or network`, async t => {
  const f = await fixture(t)
  if (defect === 'hash') f.input.source.sha256 = 'a'.repeat(64)
  if (defect === 'size') f.input.source.sizeBytes++
  if (defect === 'path') f.input.source.path = 'KINAOU/Renders/../original.mp4'
  if (defect === 'symlink') { const linked = path.join(path.dirname(f.absolute), 'link.mp4'); await symlink(f.absolute, linked); f.input.source.path = 'KINAOU/Renders/link.mp4' }
  if (defect === 'review') delete f.input.review.settings.privacyLevel
  await assert.rejects(f.protocol.upload(f.input), TikTokFileUploadError)
  assert.deepEqual(f.order, [])
})
test('detects source replacement after hashing before uploading changed bytes', async t => {
  const f = await fixture(t)
  f.input.resolveCredential = async () => { await writeFile(f.absolute, Buffer.alloc(f.bytes.length, 99)); return { platform: 'tiktok', accessToken: 'secret' } }
  await assert.rejects(f.protocol.upload(f.input), error => error.stage === 'source verification')
  assert.deepEqual(f.calls, [])
})
for (const failure of ['fetch', 'provider', 'json', 'foreign-url', 'put', 'wrong-status']) test(`sanitizes ${failure} and never retries initialization/chunks`, async t => {
  const f = await fixture(t), calls = []
  const protocol = createTikTokFileUploadProtocol({ now: () => time, fetchImpl: async (url, options) => {
    calls.push(options.method)
    if (failure === 'fetch') throw Error(`access-secret ${uploadUrl}`)
    if (failure === 'provider') return Response.json({ error: { code: 'access-secret', message: uploadUrl } })
    if (failure === 'json') return new Response('access-secret invalid JSON')
    if (failure === 'foreign-url') return Response.json({ error: { code: 'ok' }, data: { publish_id: 'id', upload_url: 'https://evil.test/?secret=access-secret' } })
    if (options.method === 'PUT') { if (failure === 'put') throw Error(uploadUrl); return new Response(null, { status: 206 }) }
    return f.fetchImpl(url, options)
  } })
  await assert.rejects(protocol.upload(f.input), error => {
    assert.ok(error instanceof TikTokFileUploadError); assert.equal(error.acceptanceUnknown, true)
    assert.doesNotMatch(String(error) + JSON.stringify(error), /access-secret|upload-secret|https:\/\//)
    return true
  })
  assert.deepEqual(calls, ['POST', ...(['put', 'wrong-status'].includes(failure) ? ['PUT'] : [])])
})
test('aborts before credentials and rejects parallel attempts on one protocol instance', async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort()
  await assert.rejects(f.protocol.upload({ ...f.input, signal: controller.signal })); assert.deepEqual(f.order, [])
  let release, entered
  const entry = new Promise(resolve => { entered = resolve }), pending = new Promise(resolve => { release = resolve })
  f.input.resolveCredential = async () => { entered(); await pending; return { platform: 'tiktok', accessToken: 'access-secret' } }
  const running = f.protocol.upload(f.input); await entry
  await assert.rejects(f.protocol.upload(f.input), /already running/)
  release(); await running; assert.equal(f.calls.length, 2)
})
test('copies reviewed settings before asynchronous work and rejects expiry after credential resolution', async t => {
  const f = await fixture(t), expected = f.input.review.settings.title
  f.input.resolveCredential = async () => { f.input.review.settings.title = 'changed draft'; return { platform: 'tiktok', accessToken: 'access-secret' } }
  await f.protocol.upload(f.input); assert.equal(JSON.parse(f.calls[0].body).post_info.title, expected)
  let current = time
  const protocol = createTikTokFileUploadProtocol({ now: () => current, fetchImpl: f.fetchImpl })
  f.input.resolveCredential = async () => { current += 600_001; return { platform: 'tiktok', accessToken: 'access-secret' } }
  await assert.rejects(protocol.upload(f.input)); assert.equal(f.calls.length, 2)
})
