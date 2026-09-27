import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { validatePublishExportReceipt } from './publish-package.mjs'

export const MAX_COURSE_PLAYBACK_BYTES = 256 * 1024 * 1024

/** Read the original export, never a generated proxy. Caller owns/always closes handle. */
export async function openCourseOutputMedia(root, value, maxBytes = MAX_COURSE_PLAYBACK_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 8 * 1024 ** 3) throw Error('Invalid course file read limit')
  const receipt = validatePublishExportReceipt(value)
  if (!value.courseLesson || !['courseId', 'moduleId', 'lessonId'].every(key => typeof value.courseLesson[key] === 'string' && value.courseLesson[key].trim())) throw Error('A course lesson receipt is required')
  const relative = receipt.outputRelativePath
  if (/[\x00-\x1f\x7f]/.test(relative)) throw Error('Invalid lesson media path')
  const canonicalRoot = await realpath(root)
  if (path.basename(canonicalRoot) !== 'KINAOU') throw Error('Invalid managed course root')
  const parts = relative.slice('KINAOU/'.length).split('/')
  let current = canonicalRoot
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    const info = await lstat(current)
    if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw Error('Lesson media must use regular files and directories, not links')
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat(), present = await lstat(current)
    if (!info.isFile() || !present.isFile() || info.dev !== present.dev || info.ino !== present.ino || await realpath(current) !== current) throw Error('Lesson media path changed during opening')
    if (!Number.isSafeInteger(info.size) || info.size <= 0 || info.size > maxBytes) throw Error(`Course file must be a nonempty MP4 of at most ${maxBytes / 1024 ** 2} MiB`)
    if (receipt.sizeBytes !== undefined && receipt.sizeBytes !== info.size) throw Error('Lesson media size differs from the retained receipt; inspect the file first')
    const header = Buffer.alloc(12), { bytesRead } = await handle.read(header, 0, 12, 0)
    if (bytesRead < 12 || header.toString('ascii', 4, 8) !== 'ftyp') throw Error('Lesson playback requires an MP4 file-type header')
    return { handle, sizeBytes: info.size }
  } catch (error) { await handle.close(); throw error }
}
