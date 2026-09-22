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
