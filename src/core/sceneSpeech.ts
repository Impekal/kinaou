export type SceneSpeechSource = 'storyboard-narration' | 'storyboard-description'

/** One spoken-text decision shared by voice generation and script-based captions. */
export function sceneSpeech(scene: { description: string; narration?: string }): { text: string; source: SceneSpeechSource } {
  const explicit = scene.narration !== undefined
  return {
    text: (explicit ? scene.narration! : scene.description).replace(/\s+/g, ' ').trim(),
    source: explicit ? 'storyboard-narration' : 'storyboard-description'
  }
}
