import { contentLanguageLabels, type ContentLanguage } from '../core/contentProfile'
import { voiceLanguageLabel, type VoiceDetails } from '../core/voiceLanguage'

interface Props { voices: VoiceDetails[]; value: string; language: ContentLanguage; disabled?: boolean; onChange: (value: string) => void }

export function PiperVoiceSelect({ voices, value, language, disabled, onChange }: Props) {
  return <label>Voice · project language: {contentLanguageLabels[language]}
    <select aria-label="Piper voice" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{voices.length ? 'Choose a voice' : 'Detect voices first'}</option>
      {voices.map((voice) => <option key={voice.path} value={voice.path}>{voice.path.split('/').pop()} · {voiceLanguageLabel(voice, language)}</option>)}
    </select>
    <small>Language comes from the installed voice configuration, not its filename. Unknown does not mean multilingual. Listen to the result before export.</small>
  </label>
}
