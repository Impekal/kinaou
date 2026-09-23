import path from 'node:path'

export const CHATTERBOX_ADAPTER_ID = 'chatterbox'
export const CHATTERBOX_VOICE_ID = 'chatterbox:multilingual-0.1.7'
export const CHATTERBOX_MODEL_ID = 'chatterbox-tts-0.1.7:multilingual'

const languages = new Set([
  'de',
  'en',
  'fr'
])

export function chatterboxSpeechVoiceDescriptor({
  referenceAudio = false
} = {}) {
  return {
    id: CHATTERBOX_VOICE_ID,
    adapterId: CHATTERBOX_ADAPTER_ID,
    label: 'Chatterbox Multilingual',
    locale: null,
    capabilities: [
      'synthesis',
      'language-control',
      ...(referenceAudio
        ? ['voice-clone', 'reference-audio']
        : [])
    ]
  }
}

export function chatterboxRequestFromSpeech(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Speech synthesis request required')
  }

  if (input.adapterId !== CHATTERBOX_ADAPTER_ID) {
    throw new Error('Requested Chatterbox adapter is not available')
  }

  if (input.voiceId !== CHATTERBOX_VOICE_ID) {
    throw new Error('Invalid Chatterbox speech voice')
  }

  if (
    typeof input.text !== 'string'
    || !input.text.trim()
  ) {
    throw new Error('Chatterbox speech text is required')
  }

  if (
    typeof input.language !== 'string'
    || !languages.has(input.language)
  ) {
    throw new Error(
      'Chatterbox language must be de, en or fr'
    )
  }

  if (input.styleInstruction !== undefined) {
    throw new Error(
      'Chatterbox does not support styleInstruction'
    )
  }

  if (input.pace !== undefined) {
    throw new Error(
      'Chatterbox does not support pace'
    )
  }

  let referenceAudio

  if (input.referenceAudio !== undefined) {
    const reference = input.referenceAudio

    if (
      !reference
      || typeof reference !== 'object'
      || reference.authorized !== true
      || typeof reference.assetId !== 'string'
      || !reference.assetId
      || typeof reference.path !== 'string'
      || !reference.path.startsWith('KINAOU/Assets/')
    ) {
      throw new Error(
        'Invalid authorized Chatterbox reference audio'
      )
    }

    referenceAudio = {
      assetId: reference.assetId,
      path: reference.path,
      authorized: true
    }
  }

  return {
    adapterId: CHATTERBOX_ADAPTER_ID,
    voiceId: CHATTERBOX_VOICE_ID,
    text: input.text,
    language: input.language,
    ...(referenceAudio
      ? { referenceAudio }
      : {})
  }
}

export function chatterboxPostprocessRate(language) {
  switch (language) {
    case 'de':
      return 1.25
    case 'en':
    case 'fr':
      return 1.20
    default:
      throw new Error(
        'Unsupported Chatterbox language'
      )
  }
}

export function chatterboxPaths(id) {
  if (
    typeof id !== 'string'
    || !/^[A-Za-z0-9-]{1,80}$/.test(id)
  ) {
    throw new Error('Invalid Chatterbox job id')
  }

  return {
    request: `KINAOU/Temp/Speech/${id}.json`,
    reference: `KINAOU/Temp/Speech/${id}-reference.wav`,
    postprocess: `KINAOU/Temp/Speech/${id}-postprocess.wav`,
    audio: `KINAOU/Assets/GeneratedVoice/${id}.wav`
  }
}

function requireAbsolute(value, label) {
  if (
    typeof value !== 'string'
    || !path.isAbsolute(value)
  ) {
    throw new Error(`${label} must be an absolute path`)
  }

  return value
}

export function buildChatterboxBridgeCommand({
  pythonPath,
  bridgePath,
  requestPath,
  audioPath,
  device = 'mps'
}) {
  return {
    executable: requireAbsolute(
      pythonPath,
      'Chatterbox Python'
    ),
    args: [
      requireAbsolute(
        bridgePath,
        'Chatterbox bridge'
      ),
      '--request',
      requireAbsolute(
        requestPath,
        'Chatterbox request'
      ),
      '--output',
      requireAbsolute(
        audioPath,
        'Chatterbox output'
      ),
      '--device',
      device
    ]
  }
}

export function buildChatterboxReferenceCommand({
  sourcePath,
  outputPath
}) {
  return {
    executable: 'ffmpeg',
    args: [
      '-y',
      '-v',
      'error',
      '-i',
      requireAbsolute(
        sourcePath,
        'Reference source'
      ),
      '-af',
      'silenceremove=start_periods=1:start_duration=0.15:start_threshold=-45dB,atrim=duration=15',
      '-ar',
      '24000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      requireAbsolute(
        outputPath,
        'Reference output'
      )
    ]
  }
}

export function buildChatterboxPostprocessCommand({
  sourcePath,
  outputPath,
  rate
}) {
  requireAbsolute(
    sourcePath,
    'Chatterbox source audio'
  )

  requireAbsolute(
    outputPath,
    'Chatterbox postprocess output'
  )

  if (
    !Number.isFinite(rate)
    || rate < 0.5
    || rate > 2
  ) {
    throw new Error(
      'Invalid Chatterbox postprocess rate'
    )
  }

  return {
    executable: 'ffmpeg',
    args: [
      '-y',
      '-v',
      'error',
      '-i',
      sourcePath,
      '-filter:a',
      `atempo=${rate}`,
      '-c:a',
      'pcm_f32le',
      outputPath
    ]
  }
}

export function speechJobFromChatterbox(job) {
  if (!job || typeof job !== 'object') {
    throw new Error('Invalid Chatterbox job')
  }

  return {
    id: job.id,
    adapterId: CHATTERBOX_ADAPTER_ID,
    voiceId: CHATTERBOX_VOICE_ID,
    state: job.state,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    language: job.language,
    modelId: job.modelId,
    seed: job.seed,
    tempoFactor: job.tempoFactor,
    ...(job.referenceAudio
      ? {
          referenceAssetId:
            job.referenceAudio.assetId
        }
      : {}),
    ...(job.audioPath
      ? {
          audioPath: job.audioPath,
          durationMs: job.durationMs,
          sizeBytes: job.sizeBytes
        }
      : {}),
    ...(job.error
      ? { error: job.error }
      : {})
  }
}
