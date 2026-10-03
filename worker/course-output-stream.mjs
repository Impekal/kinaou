import { randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { openCourseOutputMedia } from './course-output-media.mjs'

export const courseStreamLimits = Object.freeze({ bytes: 8 * 1024 ** 3, lifetimeMs: 2 * 60 * 60 * 1000, unusedMs: 30000, tickets: 8, readers: 4 })
export function validCourseStreamOrigin(origin) {
  try { const url = new URL(origin); return url.origin === origin && ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname) } catch { return false }
}
export function courseStreamRange(value, size) {
  if (value === undefined) return { start: 0, end: size - 1, partial: false }
  const match = typeof value === 'string' && /^bytes=(\d{0,15})-(\d{0,15})$/.exec(value)
  if (!match || (!match[1] && !match[2])) throw Error('Unsupported byte range')
  const first = Number(match[1]), last = Number(match[2])
  if (![first, last].every(Number.isSafeInteger)) throw Error('Invalid byte range')
  const start = match[1] ? first : Math.max(0, size - last), end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1
  if (start >= size || end < start || (!match[1] && last === 0)) throw Error('Unsatisfiable byte range')
  return { start, end, partial: true }
}
const fingerprint = info => JSON.stringify([info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs])

/** Memory-only, single-file capabilities. The general worker token is never a media URL. */
export function createCourseOutputStreamRuntime({ root, now = Date.now }) {
  const tickets = new Map(); let creating = 0
  function drop(id) { const entry = tickets.get(id); if (!entry) return; tickets.delete(id); for (const response of entry.responses) response.destroy() }
  function sweep() { for (const [id, entry] of tickets) if (entry.expiresAt <= now() || (!entry.activated && entry.unusedUntil <= now())) drop(id) }
  const timer = setInterval(sweep, 1000); timer.unref()
  return {
    async create(receipt, origin) {
      if (!validCourseStreamOrigin(origin)) throw Error('Lesson streaming requires a local app origin')
      sweep(); if (tickets.size + creating >= courseStreamLimits.tickets) throw Error('Close existing lesson players before opening another')
      creating++
      try {
        const media = await openCourseOutputMedia(root, receipt, courseStreamLimits.bytes)
        try {
          const id = randomBytes(32).toString('hex'), expiresAt = now() + courseStreamLimits.lifetimeMs
          tickets.set(id, { receipt: structuredClone(receipt), origin, expiresAt, unusedUntil: now() + courseStreamLimits.unusedMs, activated: false, fingerprint: fingerprint(await media.handle.stat()), responses: new Set() })
          return { id, expiresAt, sizeBytes: media.sizeBytes }
        } finally { await media.handle.close() }
      } finally { creating-- }
    },
    revoke(id, origin) {
      if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || !validCourseStreamOrigin(origin)) throw Error('Invalid lesson playback release')
      const entry = tickets.get(id)
      if (entry && entry.origin !== origin) throw Error('Lesson playback origin differs')
      drop(id)
    },
    async serve(request, response) {
      sweep()
      const match = /^\/course\/output-stream\/([a-f0-9]{64})$/.exec(request.url ?? '')
      const entry = match && tickets.get(match[1])
      const end = status => { response.statusCode = status; response.end() }
      response.setHeader('cache-control', 'no-store'); response.setHeader('x-content-type-options', 'nosniff')
      if (!['GET', 'HEAD'].includes(request.method) || !entry || request.headers.origin !== entry.origin) return end(401)
      if (entry.responses.size >= courseStreamLimits.readers) return end(429)
      entry.responses.add(response)
      let media
      try {
        media = await openCourseOutputMedia(root, entry.receipt, courseStreamLimits.bytes)
        if (fingerprint(await media.handle.stat()) !== entry.fingerprint) { entry.responses.delete(response); drop(match[1]); return end(409) }
        if (!tickets.has(match[1]) || entry.expiresAt <= now() || response.destroyed) return end(401)
        let range
        try { range = courseStreamRange(request.headers.range, media.sizeBytes) }
        catch { response.setHeader('content-range', `bytes */${media.sizeBytes}`); return end(416) }
        entry.activated = true
        response.statusCode = range.partial ? 206 : 200
        response.setHeader('content-type', 'video/mp4'); response.setHeader('accept-ranges', 'bytes')
        response.setHeader('content-length', String(range.end - range.start + 1))
        if (range.partial) response.setHeader('content-range', `bytes ${range.start}-${range.end}/${media.sizeBytes}`)
        if (request.method === 'HEAD') return response.end()
        await pipeline(media.handle.createReadStream({ start: range.start, end: range.end, autoClose: false, highWaterMark: 64 * 1024 }), response)
      } catch {
        if (response.headersSent) response.destroy()
        else end(409)
      } finally { entry.responses.delete(response); await media?.handle.close() }
    },
    close() { clearInterval(timer); for (const id of tickets.keys()) drop(id) }
  }
}
