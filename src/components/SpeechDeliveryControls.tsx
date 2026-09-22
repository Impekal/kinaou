import {
  contentLanguageLabels,
  type ContentLanguage
} from '../core/contentProfile'
import type { KinaouProject } from '../core/project'
import {
  speechVoiceSupports,
  type SpeechVoiceDescriptor
} from '../core/speech'
import type { SpeechDeliveryDraft } from '../core/speechDelivery'
import { useUiLanguage } from './UiLanguageProvider'

interface Props {
  project: KinaouProject
  voice?: SpeechVoiceDescriptor
  draft: SpeechDeliveryDraft
  disabled?: boolean
  onChange: (draft: SpeechDeliveryDraft) => void
}

const languages: ContentLanguage[] = [
  'de',
  'en',
  'fr'
]

export function SpeechDeliveryControls({
  project,
  voice,
  draft,
  disabled,
  onChange
}: Props) {
  const { t } = useUiLanguage()

  if (!voice) return null

  const language = speechVoiceSupports(
    voice,
    'language-control'
  )

  const style = speechVoiceSupports(
    voice,
    'style-instruction'
  )

  const pace = speechVoiceSupports(
    voice,
    'pace-control'
  )

  const reference = speechVoiceSupports(
    voice,
    'voice-clone'
  ) && speechVoiceSupports(
    voice,
    'reference-audio'
  )

  const advanced = language || style || pace || reference

  const recordings = project.assets.filter(
    asset =>
      asset.kind === 'audio'
      && asset.managed
      && !asset.offline
      && asset.uri.startsWith('KINAOU/Assets/')
  )

  return <div className="speechDeliveryControls">
    <div className="eyebrow">
      {t('narration.delivery.heading')}
    </div>

    <p>
      {t(
        advanced
          ? 'narration.delivery.available'
          : 'narration.delivery.baseline',
        {
          adapter: voice.adapterId
        }
      )}
    </p>

    {language && <label>
      {t('narration.delivery.language')}

      <select
        value={draft.language}
        disabled={disabled}
        onChange={(event) => onChange({
          ...draft,
          language: event.target.value as ContentLanguage
        })}
      >
        {languages.map(item => <option
          key={item}
          value={item}
        >
          {contentLanguageLabels[item]}
        </option>)}
      </select>

      <small>
        {t('narration.delivery.languageHelp')}
      </small>
    </label>}

    {style && <label>
      {t('narration.delivery.style')}

      <textarea
        maxLength={500}
        value={draft.styleInstruction}
        disabled={disabled}
        placeholder={t(
          'narration.delivery.stylePlaceholder'
        )}
        onChange={(event) => onChange({
          ...draft,
          styleInstruction: event.target.value
        })}
      />

      <small>
        {t('narration.delivery.styleHelp')}
      </small>
    </label>}

    {pace && <label>
      {t('narration.delivery.pace')}

      <input
        type="number"
        min="0.5"
        max="2"
        step="0.05"
        value={draft.pace}
        disabled={disabled}
        onChange={(event) => onChange({
          ...draft,
          pace: event.target.value
        })}
      />

      <small>
        {t('narration.delivery.paceHelp')}
      </small>
    </label>}

    {reference && <div className="stack">
      <label>
        {t('narration.delivery.reference')}

        <select
          value={draft.referenceAssetId}
          disabled={disabled}
          onChange={(event) => onChange({
            ...draft,
            referenceAssetId: event.target.value,
            referenceAuthorized: false
          })}
        >
          <option value="">
            {t('narration.delivery.referenceNone')}
          </option>

          {recordings.map(asset => <option
            key={asset.id}
            value={asset.id}
          >
            {String(
              asset.metadata.name
              ?? asset.id
            )}
          </option>)}
        </select>
      </label>

      {!recordings.length && <div className="note">
        {t('narration.delivery.referenceEmpty')}
      </div>}

      {draft.referenceAssetId && <label>
        <input
          type="checkbox"
          checked={draft.referenceAuthorized}
          disabled={disabled}
          onChange={(event) => onChange({
            ...draft,
            referenceAuthorized: event.target.checked
          })}
        />

        {t('narration.delivery.referencePermission')}
      </label>}

      <small>
        {t('narration.delivery.referenceHelp')}
      </small>
    </div>}
  </div>
}
