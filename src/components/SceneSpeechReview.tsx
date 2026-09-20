import { sceneSpeech } from '../core/sceneSpeech'

export function SceneSpeechReview({ scene }: { scene: { description: string; narration?: string } }) {
  const speech = sceneSpeech(scene)
  return <div>
    <small>{speech.source === 'storyboard-narration' ? 'Spoken text · used for narration and script captions' : 'Legacy spoken text · falls back to the description'}</small>
    <p>{speech.text || (speech.source === 'storyboard-narration' ? 'Silent scene — no generated narration or script captions.' : 'No text to speak.')}</p>
  </div>
}
