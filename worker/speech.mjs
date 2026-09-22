function labelFromPath(value) {
  const name = String(value).split('/').pop() || String(value)
  return name.endsWith('.onnx') ? name.slice(0, -5) : name
}

export function piperSpeechVoiceDescriptors(details) {
  if (!Array.isArray(details)) throw new Error('Invalid Piper voice details')

  return details.map((entry) => {
    if (
      !entry
      || typeof entry.path !== 'string'
      || !entry.path.startsWith('KINAOU/Models/')
      || !entry.path.endsWith('.onnx')
    ) {
      throw new Error('Invalid Piper speech voice path')
    }

    const locale = typeof entry.locale === 'string' ? entry.locale : null

    return {
      id: entry.path,
      adapterId: 'piper',
      label: labelFromPath(entry.path),
      locale,
      capabilities: [
        'synthesis',
        ...(locale ? ['declared-locale'] : [])
      ]
    }
  })
}

export function piperRequestFromSpeech(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Speech synthesis request required')
  }

  if (input.adapterId !== 'piper') {
    throw new Error('Requested speech adapter is not available')
  }

  if (
    typeof input.voiceId !== 'string'
    || !input.voiceId.startsWith('KINAOU/Models/')
    || !input.voiceId.endsWith('.onnx')
  ) {
    throw new Error('Invalid Piper speech voice')
  }

  for (const field of [
    'language',
    'styleInstruction',
    'pace',
    'referenceAudio'
  ]) {
    if (input[field] !== undefined) {
      throw new Error(
        `Piper does not support ${field}`
      )
    }
  }

  return {
    text: input.text,
    voicePath: input.voiceId
  }
}

export function speechJobFromPiper(job) {
  if (!job || typeof job !== 'object') {
    throw new Error('Invalid Piper job')
  }

  return {
    id: job.id,
    adapterId: 'piper',
    voiceId: job.voicePath,
    state: job.state,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.audioPath ? {
      audioPath: job.audioPath,
      durationMs: job.durationMs,
      sizeBytes: job.sizeBytes
    } : {}),
    ...(job.error ? { error: job.error } : {})
  }
}
