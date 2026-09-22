import {
  contentLanguageLabels,
  type ContentLanguage
} from '../core/contentProfile'
import type { SpeechVoiceDescriptor } from '../core/speech'
import { translateUi } from '../core/uiMessages'
import type { UiLanguage } from '../core/uiLanguage'

interface Props {
  voices: SpeechVoiceDescriptor[]
  value: string
  language: ContentLanguage
  uiLanguage?: UiLanguage
  disabled?: boolean
  onChange: (value: string) => void
}

export function SpeechVoiceSelect({
  voices,
  value,
  language,
  uiLanguage = 'en',
  disabled,
  onChange
}: Props) {
  const t = (
    key: Parameters<typeof translateUi>[1],
    values?: Parameters<typeof translateUi>[2]
  ) => translateUi(uiLanguage, key, values)

  return <label>
    {t('narration.voice', {
      language: contentLanguageLabels[language]
    })}

    <select
      aria-label={t('narration.voiceLabel')}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {t(voices.length ? 'narration.choose' : 'narration.detectFirst')}
      </option>

      {voices.map((voice) => {
        const languageLabel = voice.locale
          ? t(
              voice.locale.split('-')[0] === language
                ? 'narration.matches'
                : 'narration.differs',
              { locale: voice.locale }
            )
          : t('narration.unknown')

        return <option key={voice.id} value={voice.id}>
          {voice.label} · {voice.adapterId} · {languageLabel}
        </option>
      })}
    </select>

    <small>{t('narration.voiceHelp')}</small>
  </label>
}
