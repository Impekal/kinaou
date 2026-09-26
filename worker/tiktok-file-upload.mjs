import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'

// Official Direct Post / Media Transfer docs checked 2026-09-27.
// Isolated protocol only: no worker route, timer, automatic retry or polling.
export const TIKTOK_VIDEO_INIT_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const MiB = 1024 * 1024
const MAX_VIDEO_BYTES = 4_000_000_000 // Conservative decimal 4 GB ceiling.
const privacy = z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'])
const reviewSchema = z.object({
  schemaVersion: z.literal(1),
  creatorInfo: z.object({
    creatorUsername: z.string().trim().min(1).max(200),
    creatorNickname: z.string().trim().min(1).max(200),
    creatorAvatarUrl: z.string().url().max(2000).optional(),
    privacyLevelOptions: z.array(privacy).min(1).max(4).refine(values => new Set(values).size === values.length),
    commentDisabled: z.boolean(), duetDisabled: z.boolean(), stitchDisabled: z.boolean(),
    maxVideoPostDurationSec: z.number().int().positive().max(600)
  }).strict(),
  creatorInfoCheckedAt: z.string().datetime(),
  videoDurationMs: z.number().int().positive(),
  settings: z.object({
    title: z.string().trim().max(2200), privacyLevel: privacy,
    allowComment: z.boolean(), allowDuet: z.boolean(), allowStitch: z.boolean(),
    commercialContent: z.object({ enabled: z.boolean(), yourBrand: z.boolean(), brandedContent: z.boolean() }).strict(),
    isAigc: z.boolean(), musicUsageConsent: z.literal(true), brandedContentPolicyConsent: z.boolean()
  }).strict()
}).strict()

export function validateTikTokUploadReview(value, now = Date.now()) {
  const result = reviewSchema.safeParse(value)
  // Never echo rejected input (it could contain a token or upload URL).
  if (!result.success) throw Error('TikTok upload review is invalid')
  const review = result.data, creator = review.creatorInfo, settings = review.settings
  const age = now - Date.parse(review.creatorInfoCheckedAt)
  // Local safety policy, not a claimed TikTok API expiry.
  if (!Number.isFinite(now) || age < 0 || age > 10 * 60_000) throw Error('TikTok creator review must be refreshed')
  if (!creator.privacyLevelOptions.includes(settings.privacyLevel)
    || (creator.commentDisabled && settings.allowComment)
    || (creator.duetDisabled && settings.allowDuet)
    || (creator.stitchDisabled && settings.allowStitch)
    || review.videoDurationMs > creator.maxVideoPostDurationSec * 1000) throw Error('TikTok settings do not match creator review')
  const commercial = settings.commercialContent
  if (commercial.enabled !== (commercial.yourBrand || commercial.brandedContent)
    || (commercial.brandedContent && (!settings.brandedContentPolicyConsent || settings.privacyLevel === 'SELF_ONLY'))) throw Error('TikTok commercial disclosure is invalid')
  return review
}

export function planTikTokChunks(videoSize, requestedChunkSize = 8 * MiB) {
  if (!Number.isSafeInteger(videoSize) || videoSize <= 0 || videoSize > MAX_VIDEO_BYTES) throw Error('TikTok video size is invalid')
  if (!Number.isSafeInteger(requestedChunkSize) || requestedChunkSize < 5 * MiB || requestedChunkSize > 64 * MiB) throw Error('TikTok chunk size is invalid')
  let chunkSize = Math.min(videoSize, requestedChunkSize)
  // Never send a >64 MiB file in a single trailing chunk.
  if (videoSize > 64 * MiB && Math.floor(videoSize / chunkSize) < 2) chunkSize = Math.floor(videoSize / 2)
  const count = Math.floor(videoSize / chunkSize)
  if (count < 1 || count > 1000) throw Error('TikTok chunk count is invalid')
  const chunks = Array.from({ length: count }, (_, index) => {
    const start = index * chunkSize, end = index === count - 1 ? videoSize - 1 : start + chunkSize - 1
    return { start, end, size: end - start + 1, contentRange: `bytes ${start}-${end}/${videoSize}` }
  })
  if (chunks.at(-1).size > 128 * MiB) throw Error('TikTok trailing chunk is too large')
  return { sourceInfo: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: chunkSize, total_chunk_count: count }, chunks }
}

export function trustedTikTokUploadUrl(value) {
  let url
  try { url = new URL(value) } catch { throw Error('TikTok upload URL is untrusted') }
  const hosts = ['open-upload.tiktokapis.com', 'upload.us.tiktokapis.com']
  if (typeof value !== 'string' || value.length > 256 || value !== url.href
    || url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.hash
    || !['/video/', '/upload/'].includes(url.pathname)
    || [...url.searchParams.keys()].length !== 2
    || !url.searchParams.get('upload_id') || !url.searchParams.get('upload_token')
    || [...url.searchParams.keys()].some(key => !['upload_id', 'upload_token'].includes(key))) throw Error('TikTok upload URL is untrusted')
  return value
}

export function buildTikTokFileUploadInit({ placement, review: value, videoSize, chunkSize, now }) {
  if (placement !== 'tiktok-video') throw Error('TikTok FILE_UPLOAD accepts only tiktok-video')
  const review = validateTikTokUploadReview(value, now), settings = review.settings
  return {
    post_info: {
      title: settings.title, privacy_level: settings.privacyLevel,
      disable_comment: !settings.allowComment, disable_duet: !settings.allowDuet, disable_stitch: !settings.allowStitch,
      brand_content_toggle: settings.commercialContent.brandedContent,
      brand_organic_toggle: settings.commercialContent.yourBrand, is_aigc: settings.isAigc
    },
    source_info: planTikTokChunks(videoSize, chunkSize).sourceInfo
  }
}

async function readChunk(file, chunk) {
  const buffer = Buffer.alloc(chunk.size)
  let offset = 0
  while (offset < buffer.length) {
    const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, chunk.start + offset)
    if (!bytesRead) throw Error('TikTok source file changed or is incomplete')
    offset += bytesRead
  }
  return buffer
}
const hash = value => createHash('sha256').update(value).digest('hex')
const abort = signal => { if (signal?.aborted) throw Error('TikTok transfer cancelled; inspect status before another attempt') }

export class TikTokFileUploadError extends Error {
  constructor(stage, acceptanceUnknown, publishId) {
    super(`TikTok ${stage} failed; no automatic retry. Inspect the account before another publishing attempt.`)
    this.name = 'TikTokFileUploadError'
    this.stage = stage
    this.acceptanceUnknown = acceptanceUnknown
    // Worker-internal status reference, never an upload capability/credential.
    if (publishId) this.publishId = publishId
  }
}

export function createTikTokFileUploadProtocol({ fetchImpl = fetch, now = Date.now } = {}) {
  let running = false
  return {
    async upload({ placement, review: reviewValue, source: sourceValue, resolveCredential, signal }) {
      if (running) throw Error('TikTok file transfer is already running')
      running = true
      let file, stage = 'validation', publishId, networkStarted = false
      try {
        const source = structuredClone(sourceValue), review = structuredClone(reviewValue)
        const init = buildTikTokFileUploadInit({ placement, review, videoSize: source?.sizeBytes, now: now() })
        if (typeof resolveCredential !== 'function' || typeof source.managedRoot !== 'string' || !path.isAbsolute(source.managedRoot)
          || typeof source.path !== 'string' || !source.path.startsWith('KINAOU/Renders/') || !source.path.endsWith('.mp4')
          || /[\\\x00-\x1f]/.test(source.path) || source.path.split('/').some(segment => !segment || segment === '.' || segment === '..')
          || !/^[a-f0-9]{64}$/.test(source.sha256)) throw Error('Invalid managed MP4 evidence')
        abort(signal)
        stage = 'source verification'
        const root = await realpath(source.managedRoot)
        const absolute = path.join(root, source.path.slice('KINAOU/'.length))
        if (await realpath(absolute) !== absolute) throw Error('Symlinked source is not allowed')
        file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
        const checkSize = async () => { const stat = await file.stat(); if (!stat.isFile() || stat.size !== source.sizeBytes) throw Error('Source size mismatch') }
        await checkSize()
        const plan = planTikTokChunks(source.sizeBytes), digest = createHash('sha256'), chunkHashes = []
        for (const chunk of plan.chunks) {
          abort(signal)
          const bytes = await readChunk(file, chunk)
          digest.update(bytes); chunkHashes.push(hash(bytes))
        }
        if (digest.digest('hex') !== source.sha256) throw Error('Source digest mismatch')
        await checkSize(); abort(signal)
        validateTikTokUploadReview(review, now())
        // The future V3 execution boundary must additionally bind package/review/account.
        // This protocol already hashes the actual open file before resolving any credential.
        stage = 'credential resolution'
        const credential = await resolveCredential()
        const token = credential?.accessToken
        if (credential?.platform !== 'tiktok' || typeof token !== 'string' || !token || token !== token.trim() || token.length > 20_000 || /[\x00-\x20\x7f]/.test(token)) throw Error('Invalid TikTok credential')
        abort(signal)
        // Credential refresh may take time: recheck the same open file before init.
        stage = 'source verification'
        await checkSize()
        for (const [index, chunk] of plan.chunks.entries()) {
          abort(signal)
          if (hash(await readChunk(file, chunk)) !== chunkHashes[index]) throw Error('Source changed during credential resolution')
        }
        validateTikTokUploadReview(review, now())
        stage = 'initialization'; networkStarted = true
        const response = await fetchImpl(TIKTOK_VIDEO_INIT_ENDPOINT, { method: 'POST', redirect: 'error', signal,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify(init) })
        const payload = await response.json()
        if (response.status !== 200 || payload?.error?.code !== 'ok') throw Error('Initialization not confirmed')
        if (typeof payload?.data?.publish_id !== 'string' || !/^[A-Za-z0-9_.~:-]{1,64}$/.test(payload.data.publish_id)) throw Error('Invalid publish id')
        publishId = payload.data.publish_id
        const uploadUrl = trustedTikTokUploadUrl(payload.data.upload_url), issuedAt = now()
        stage = 'file transfer'
        for (const [index, chunk] of plan.chunks.entries()) {
          abort(signal)
          if (now() - issuedAt >= 60 * 60_000 || now() < issuedAt) throw Error('Upload URL expired')
          await checkSize()
          const bytes = await readChunk(file, chunk)
          if (hash(bytes) !== chunkHashes[index]) throw Error('Source changed after verification')
          abort(signal)
          const uploaded = await fetchImpl(uploadUrl, { method: 'PUT', redirect: 'error', signal,
            headers: { 'content-type': 'video/mp4', 'content-length': String(chunk.size), 'content-range': chunk.contentRange }, body: bytes })
          const expectedStatus = index === plan.chunks.length - 1 ? 201 : 206
          await uploaded.body?.cancel()
          if (uploaded.status !== expectedStatus) throw Error('Chunk acceptance not confirmed')
        }
        // 201 means posting has started, NOT a successful published receipt.
        return { state: 'processing', publishId }
      } catch {
        // Do not expose provider text, fetch errors, local paths, URLs, tokens or causes.
        throw new TikTokFileUploadError(stage, networkStarted, publishId)
      } finally {
        try { await file?.close() } catch { /* Do not leak a filesystem error after transfer. */ }
        running = false
      }
    }
  }
}
