export interface LoudnessNormalizationSettings {
  enabled: boolean
  targetLufs: number
  truePeakDb: number
  loudnessRange: number
}

export const defaultLoudnessNormalization: LoudnessNormalizationSettings = { enabled: false, targetLufs: -14, truePeakDb: -1.5, loudnessRange: 11 }

export function validateLoudnessNormalization(value: LoudnessNormalizationSettings): LoudnessNormalizationSettings {
  if (typeof value.enabled !== 'boolean') throw new Error('Loudness normalization enabled must be boolean')
  if (!Number.isFinite(value.targetLufs) || value.targetLufs < -70 || value.targetLufs > -5) throw new Error('Loudness target must be between -70 and -5 LUFS')
  if (!Number.isFinite(value.truePeakDb) || value.truePeakDb < -9 || value.truePeakDb > 0) throw new Error('True-peak target must be between -9 and 0 dBTP')
  if (!Number.isFinite(value.loudnessRange) || value.loudnessRange < 1 || value.loudnessRange > 50) throw new Error('Loudness range must be between 1 and 50 LU')
  return value
}
