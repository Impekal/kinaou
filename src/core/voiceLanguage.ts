import type { ContentLanguage } from './contentProfile'

export interface VoiceDetails { path: string; locale: string | null }

export function voiceLanguageLabel(voice: VoiceDetails, language: ContentLanguage): string {
  if (!voice.locale) return 'Language unknown'
  return voice.locale.split('-')[0] === language ? `${voice.locale} · matches project` : `${voice.locale} · different language`
}
