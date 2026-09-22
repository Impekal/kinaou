import {
  contentLanguageSchema,
  type ContentLanguage
} from './contentProfile'
import type { KinaouProject } from './project'
import {
  speechVoiceSupports,
  type SpeechVoiceDescriptor
} from './speech'
import type {
  SpeechReferenceAudio,
  SpeechSynthesisRequest
} from './speechJobs'
import { assertSafeManagedPath } from './storage'

export interface SpeechDeliveryOptions {
  language?: ContentLanguage
  styleInstruction?: string
  pace?: number
  referenceAudio?: SpeechReferenceAudio
}

function requireCapability(
  voice: SpeechVoiceDescriptor,
  capability:
    | 'language-control'
    | 'style-instruction'
    | 'pace-control'
    | 'reference-audio'
    | 'voice-clone'
) {
  if (!speechVoiceSupports(voice, capability)) {
    throw new Error(
      `Speech voice ${voice.id} does not support ${capability}`
    )
  }
}

export function authorizedSpeechReference(
  project: KinaouProject,
  assetId: string,
  authorized: boolean
): SpeechReferenceAudio {
  if (authorized !== true) {
    throw new Error(
      'Explicit authorization is required for reference voice audio'
    )
  }

  const asset = project.assets.find(
    (entry) => entry.id === assetId
  )

  if (
    !asset
    || asset.kind !== 'audio'
    || !asset.managed
    || asset.offline
  ) {
    throw new Error(
      'Reference voice must be an available managed audio asset'
    )
  }

  const path = assertSafeManagedPath(asset.uri)

  if (!path.startsWith('KINAOU/Assets/')) {
    throw new Error(
      'Reference voice must stay inside managed KINAOU assets'
    )
  }

  return {
    assetId: asset.id,
    path,
    authorized: true
  }
}

export function buildSpeechSynthesisRequest(
  text: string,
  voice: SpeechVoiceDescriptor,
  options: SpeechDeliveryOptions = {}
): SpeechSynthesisRequest {
  const normalizedText = text.trim()

  if (!normalizedText) {
    throw new Error('Speech text is required')
  }

  if (!speechVoiceSupports(voice, 'synthesis')) {
    throw new Error(
      `Speech voice ${voice.id} cannot synthesize speech`
    )
  }

  const request: SpeechSynthesisRequest = {
    adapterId: voice.adapterId,
    voiceId: voice.id,
    text: normalizedText
  }

  if (options.language !== undefined) {
    requireCapability(voice, 'language-control')
    request.language = contentLanguageSchema.parse(options.language)
  }

  if (options.styleInstruction !== undefined) {
    requireCapability(voice, 'style-instruction')

    const styleInstruction = options.styleInstruction.trim()

    if (
      !styleInstruction
      || styleInstruction.length > 500
    ) {
      throw new Error(
        'Speech style instruction must contain 1–500 characters'
      )
    }

    request.styleInstruction = styleInstruction
  }

  if (options.pace !== undefined) {
    requireCapability(voice, 'pace-control')

    if (
      !Number.isFinite(options.pace)
      || options.pace < 0.5
      || options.pace > 2
    ) {
      throw new Error(
        'Speech pace must be between 0.5 and 2'
      )
    }

    request.pace = options.pace
  }

  if (options.referenceAudio !== undefined) {
    requireCapability(voice, 'reference-audio')
    requireCapability(voice, 'voice-clone')

    const reference = options.referenceAudio

    if (
      reference.authorized !== true
      || !reference.assetId
      || !reference.path
      || assertSafeManagedPath(reference.path) !== reference.path
      || !reference.path.startsWith('KINAOU/Assets/')
    ) {
      throw new Error(
        'Invalid authorized reference voice'
      )
    }

    request.referenceAudio = {
      assetId: reference.assetId,
      path: reference.path,
      authorized: true
    }
  }

  return request
}

export interface SpeechDeliveryDraft {
  language: ContentLanguage
  styleInstruction: string
  pace: string
  referenceAssetId: string
  referenceAuthorized: boolean
}

export function defaultSpeechDeliveryDraft(
  language: ContentLanguage
): SpeechDeliveryDraft {
  return {
    language,
    styleInstruction: '',
    pace: '1',
    referenceAssetId: '',
    referenceAuthorized: false
  }
}

export function speechDeliveryOptionsFromDraft(
  project: KinaouProject,
  voice: SpeechVoiceDescriptor,
  draft: SpeechDeliveryDraft
): SpeechDeliveryOptions {
  const options: SpeechDeliveryOptions = {}

  if (speechVoiceSupports(voice, 'language-control')) {
    options.language = contentLanguageSchema.parse(draft.language)
  }

  if (
    speechVoiceSupports(voice, 'style-instruction')
    && draft.styleInstruction.trim()
  ) {
    options.styleInstruction = draft.styleInstruction.trim()
  }

  if (speechVoiceSupports(voice, 'pace-control')) {
    const pace = Number(draft.pace)

    if (!Number.isFinite(pace)) {
      throw new Error('Speech pace must be a number')
    }

    options.pace = pace
  }

  if (
    speechVoiceSupports(voice, 'voice-clone')
    && speechVoiceSupports(voice, 'reference-audio')
    && draft.referenceAssetId
  ) {
    options.referenceAudio = authorizedSpeechReference(
      project,
      draft.referenceAssetId,
      draft.referenceAuthorized
    )
  }

  return options
}
