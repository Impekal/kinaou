import { sceneSpeech } from '../core/sceneSpeech'
import { useUiLanguage } from './UiLanguageProvider'

export function SceneSpeechReview({ scene }: { scene: { description: string; narration?: string } }) {
  const { t } = useUiLanguage()
  const speech = sceneSpeech(scene)
  return <div>
    <small>{t(speech.source === 'storyboard-narration' ? 'speech.explicit' : 'speech.legacy')}</small>
    <p>{speech.text || t(speech.source === 'storyboard-narration' ? 'speech.silent' : 'speech.empty')}</p>
  </div>
}
