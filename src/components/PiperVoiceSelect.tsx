import { contentLanguageLabels, type ContentLanguage } from '../core/contentProfile'
import type { VoiceDetails } from '../core/voiceLanguage'
import { translateUi } from '../core/uiMessages'
import type { UiLanguage } from '../core/uiLanguage'

interface Props { voices: VoiceDetails[]; value: string; language: ContentLanguage; uiLanguage?: UiLanguage; disabled?: boolean; onChange: (value: string) => void }

export function PiperVoiceSelect({ voices, value, language, uiLanguage = 'en', disabled, onChange }: Props) {
  const t = (key: Parameters<typeof translateUi>[1], values?: Parameters<typeof translateUi>[2]) => translateUi(uiLanguage, key, values)
  return <label>{t('narration.voice', { language: contentLanguageLabels[language] })}
    <select aria-label={t('narration.voiceLabel')} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t(voices.length ? 'narration.choose' : 'narration.detectFirst')}</option>
      {voices.map((voice) => <option key={voice.path} value={voice.path}>{voice.path.split('/').pop()} · {voice.locale ? t(voice.locale.split('-')[0] === language ? 'narration.matches' : 'narration.differs', { locale: voice.locale }) : t('narration.unknown')}</option>)}
    </select>
    <small>{t('narration.voiceHelp')}</small>
  </label>
}
