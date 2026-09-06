import path from 'node:path'

export function whisperModelRelativePaths(entries) {
  if (!Array.isArray(entries)) return []
  return entries.filter((entry) => entry.isFile() && /^ggml-[\w.-]+\.bin$/.test(entry.name)).map((entry) => `KINAOU/Models/${entry.name}`).sort()
}

export function sttPaths(jobId) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid STT job ID')
  return {
    wav: `KINAOU/Temp/STT/${jobId}.wav`,
    outputBase: `KINAOU/Projects/Transcripts/${jobId}`,
    transcript: `KINAOU/Projects/Transcripts/${jobId}.json`
  }
}

export function buildSttCommands({ ffmpeg = 'ffmpeg', whisperCli, modelPath, sourcePath, wavPath, outputBase, language = 'auto' }) {
  if (typeof whisperCli !== 'string' || !path.isAbsolute(whisperCli)) throw new Error('whisper-cli must be configured with an absolute path')
  if (![modelPath, sourcePath, wavPath, outputBase].every((value) => typeof value === 'string' && path.isAbsolute(value))) throw new Error('STT file paths must be absolute')
  if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new Error('Invalid transcription language')
  return [
    { executable: ffmpeg, args: ['-y', '-i', sourcePath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath] },
    { executable: whisperCli, args: ['-m', modelPath, '-f', wavPath, '-l', language, '-ojf', '-of', outputBase, '-np'] }
  ]
}

function timestampMs(value) {
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value)
  if (!match) throw new Error('Invalid whisper.cpp timestamp')
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4])
}

export function normalizeWhisperTranscript(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.transcription)) throw new Error('Invalid whisper.cpp transcript')
  const language = typeof value.result?.language === 'string' ? value.result.language : 'unknown'
  const segments = value.transcription.map((segment, index) => {
    const text = typeof segment?.text === 'string' ? segment.text.trim() : ''
    const startMs = timestampMs(segment?.timestamps?.from)
    const endMs = timestampMs(segment?.timestamps?.to)
    if (!text || endMs <= startMs) throw new Error(`Invalid whisper.cpp segment ${index}`)
    return { startMs, endMs, text }
  })
  return { schemaVersion: 1, adapterId: 'whisper.cpp', language, text: segments.map((segment) => segment.text).join(' '), segments }
}
