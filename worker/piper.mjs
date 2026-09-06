import path from 'node:path'

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
