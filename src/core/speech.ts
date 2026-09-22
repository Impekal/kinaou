import { z } from 'zod'

export const speechCapabilitySchema = z.enum([
  'synthesis',
  'declared-locale',
  'language-control',
  'style-instruction',
  'pace-control',
  'voice-clone',
  'reference-audio'
])

export type SpeechCapability = z.infer<typeof speechCapabilitySchema>

export const speechVoiceDescriptorSchema = z.object({
  id: z.string().min(1).max(512),
  adapterId: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().min(1).max(160),
  locale: z.string()
    .regex(/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/)
    .nullable(),
  capabilities: z.array(speechCapabilitySchema).max(16)
})

export type SpeechVoiceDescriptor = z.infer<typeof speechVoiceDescriptorSchema>

export function parseSpeechVoiceCatalog(value: unknown): SpeechVoiceDescriptor[] {
  if (!Array.isArray(value)) throw new Error('Invalid speech voice catalog')

  const parsed = value.map((entry) => speechVoiceDescriptorSchema.parse(entry))
  const ids = new Set<string>()

  for (const voice of parsed) {
    if (ids.has(voice.id)) throw new Error(`Duplicate speech voice: ${voice.id}`)
    ids.add(voice.id)

    if (new Set(voice.capabilities).size !== voice.capabilities.length) {
      throw new Error(`Duplicate speech capability on voice: ${voice.id}`)
    }

    if (!voice.capabilities.includes('synthesis')) {
      throw new Error(`Speech voice cannot synthesize: ${voice.id}`)
    }

    if (voice.capabilities.includes('declared-locale') && !voice.locale) {
      throw new Error(`Speech voice claims a locale without declaring one: ${voice.id}`)
    }
  }

  return parsed
}

export function speechVoiceSupports(
  voice: SpeechVoiceDescriptor,
  capability: SpeechCapability
): boolean {
  return voice.capabilities.includes(capability)
}
