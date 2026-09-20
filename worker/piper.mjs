import path from 'node:path'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

// Read through a no-follow handle and cap actual bytes, including files that grow.
export async function piperVoiceDetails(voices, resolveManaged) {
  const details = []
  for (const voicePath of voices.slice(0, 200)) {
    let locale = null
    let handle
    try {
      handle = await open(resolveManaged(`${voicePath}.json`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      const info = await handle.stat()
      if (info.isFile() && info.size <= 65536) {
        const buffer = Buffer.alloc(65537)
        let size = 0
        while (size < buffer.length) {
          const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null)
          if (!bytesRead) break
          size += bytesRead
        }
        if (size <= 65536) {
          const code = JSON.parse(buffer.subarray(0, size).toString('utf8'))?.language?.code
          if (typeof code === 'string' && /^[a-z]{2,3}(?:[_-][A-Za-z]{2,4})?$/.test(code)) locale = code.replace('_', '-')
        }
      }
    } catch { /* Missing, malformed or unsafe configuration has unknown language. */ }
    finally { await handle?.close() }
    details.push({ path: voicePath, locale })
  }
  return details
}

export function piperVoiceRelativePaths(entries) {
  if (!Array.isArray(entries)) return []
  const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name))
  return [...files].filter((name) => /^[\w.-]+\.onnx$/.test(name) && files.has(`${name}.json`)).sort().map((name) => `KINAOU/Models/${name}`)
}

export function ttsPaths(jobId) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid TTS job ID')
  return { text: `KINAOU/Temp/TTS/${jobId}.txt`, audio: `KINAOU/Assets/GeneratedVoice/${jobId}.wav` }
}

export function validateTtsText(value) {
  if (typeof value !== 'string') throw new Error('TTS text is required')
  const text = value.trim()
  if (!text || text.length > 100_000) throw new Error('TTS text must contain 1–100000 characters')
  return text
}

export function buildPiperCommand({ piperCli, modelPath, textPath, audioPath }) {
  if (typeof piperCli !== 'string' || !path.isAbsolute(piperCli)) throw new Error('Piper CLI must be configured with an absolute path')
  if (![modelPath, textPath, audioPath].every((value) => typeof value === 'string' && path.isAbsolute(value))) throw new Error('TTS file paths must be absolute')
  return { executable: piperCli, args: ['-m', modelPath, '-f', audioPath, '--input-file', textPath] }
}
