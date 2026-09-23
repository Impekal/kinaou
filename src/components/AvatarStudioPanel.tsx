import {
  useState
} from 'react'

import {
  avatarPresets,
  avatarReferenceAssetAvailable,
  avatarVoiceAssetAvailable,
  bindAvatarVoice,
  commitAvatarChange,
  createAvatarIdentity,
  createAvatarInstance,
  deriveAvatarVersion,
  setActiveAvatarVersion,
  type AvatarSourceKind
} from '../core/avatarStudio'

import type {
  KinaouProject
} from '../core/project'

import type {
  PersistentVersionHistory
} from '../core/versioning'

import {
  useUiLanguage
} from './UiLanguageProvider'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  onProjectChange:
    (project: KinaouProject) => void
}

export function AvatarStudioPanel({
  project,
  history,
  onProjectChange
}: Props) {
  const { t } =
    useUiLanguage()

  const [name, setName] =
    useState('')

  const [
    sourceKind,
    setSourceKind
  ] = useState<AvatarSourceKind>(
    'preset'
  )

  const [
    presetId,
    setPresetId
  ] = useState<string>(
    avatarPresets[0].id
  )

  const [prompt, setPrompt] =
    useState('')

  const [
    referenceRightsBasis,
    setReferenceRightsBasis
  ] = useState<
    'own' | 'authorized'
  >('own')

  const [
    referenceAuthorized,
    setReferenceAuthorized
  ] = useState(false)

  const [
    selectedAssetIds,
    setSelectedAssetIds
  ] = useState<string[]>([])

  const [
    selectedAvatarId,
    setSelectedAvatarId
  ] = useState(
    project.avatars[0]?.id ?? ''
  )

  const [
    versionLabel,
    setVersionLabel
  ] = useState('')

  const [
    editInstruction,
    setEditInstruction
  ] = useState('')

  const [
    voiceAssetId,
    setVoiceAssetId
  ] = useState('')

  const [
    sceneId,
    setSceneId
  ] = useState('')

  const [
    scenePrompt,
    setScenePrompt
  ] = useState('')

  const [
    environmentPrompt,
    setEnvironmentPrompt
  ] = useState('')

  const [
    motionPrompt,
    setMotionPrompt
  ] = useState('')

  const [
    expressionPrompt,
    setExpressionPrompt
  ] = useState('')

  const [error, setError] =
    useState('')

  const [saved, setSaved] =
    useState(false)

  const selectedAvatar =
    project.avatars.find(
      avatar =>
        avatar.id ===
        selectedAvatarId
    )

  const imageAssets =
    project.assets.filter(
      asset =>
        asset.kind === 'image'
        && avatarReferenceAssetAvailable(
          asset
        )
    )

  const videoAssets =
    project.assets.filter(
      asset =>
        asset.kind === 'video'
        && avatarReferenceAssetAvailable(
          asset
        )
    )

  const referenceAssets =
    project.assets.filter(
      avatarReferenceAssetAvailable
    )

  const voiceAssets =
    project.assets.filter(
      avatarVoiceAssetAvailable
    )

  function assetName(
    id: string
  ) {
    const asset =
      project.assets.find(
        entry =>
          entry.id === id
      )

    return String(
      asset?.metadata.name
      ?? asset?.uri
      ?? id
    )
  }

  function markSaved() {
    setError('')
    setSaved(true)
  }

  function fail(
    cause: unknown
  ) {
    setSaved(false)
    setError(
      cause instanceof Error
        ? cause.message
        : String(cause)
    )
  }

  function create() {
    setError('')
    setSaved(false)

    try {
      const result =
        commitAvatarChange(
          project,
          () =>
            createAvatarIdentity(
              project,
              {
                name,
                sourceKind,
                presetId,
                prompt,
                assetIds:
                  selectedAssetIds,
                referenceAuthorized,
                referenceRightsBasis
              }
            ),
          history,
          onProjectChange,
          'Before creating avatar identity'
        )

      setSelectedAvatarId(
        result.avatar.id
      )

      setName('')
      setPrompt('')
      setSelectedAssetIds([])
      setReferenceAuthorized(false)
      setReferenceRightsBasis('own')
      markSaved()
    } catch (cause) {
      fail(cause)
    }
  }

  function chooseSingle(
    id: string
  ) {
    setSelectedAssetIds(
      id ? [id] : []
    )
  }

  function toggleReference(
    id: string,
    checked: boolean
  ) {
    setSelectedAssetIds(
      current =>
        checked
          ? Array.from(
              new Set([
                ...current,
                id
              ])
            )
          : current.filter(
              entry =>
                entry !== id
            )
    )
  }

  function createVersion() {
    if (!selectedAvatar) {
      return
    }

    setError('')
    setSaved(false)

    try {
      commitAvatarChange(
        project,
        () =>
          deriveAvatarVersion(
            project,
            selectedAvatar.id,
            {
              label:
                versionLabel,
              instruction:
                editInstruction
            }
          ),
        history,
        onProjectChange,
        'Before creating avatar version'
      )

      setVersionLabel('')
      setEditInstruction('')
      markSaved()
    } catch (cause) {
      fail(cause)
    }
  }

  function activateVersion(
    versionId: string
  ) {
    if (!selectedAvatar) {
      return
    }

    try {
      commitAvatarChange(
        project,
        () =>
          setActiveAvatarVersion(
            project,
            selectedAvatar.id,
            versionId
          ),
        history,
        onProjectChange,
        'Before changing active avatar version'
      )

      markSaved()
    } catch (cause) {
      fail(cause)
    }
  }

  function saveVoice() {
    if (!selectedAvatar) {
      return
    }

    try {
      commitAvatarChange(
        project,
        () =>
          bindAvatarVoice(
            project,
            selectedAvatar.id,
            voiceAssetId
              || undefined
          ),
        history,
        onProjectChange,
        'Before changing avatar voice'
      )

      markSaved()
    } catch (cause) {
      fail(cause)
    }
  }

  function createInstance() {
    if (!selectedAvatar) {
      return
    }

    try {
      commitAvatarChange(
        project,
        () =>
          createAvatarInstance(
            project,
            {
              avatarId:
                selectedAvatar.id,
              sceneId:
                sceneId
                || undefined,
              prompt:
                scenePrompt,
              environmentPrompt,
              motionPrompt,
              expressionPrompt
            }
          ),
        history,
        onProjectChange,
        'Before creating avatar scene instance'
      )

      setScenePrompt('')
      setEnvironmentPrompt('')
      setMotionPrompt('')
      setExpressionPrompt('')
      markSaved()
    } catch (cause) {
      fail(cause)
    }
  }

  const singleChoices =
    sourceKind === 'image'
      ? imageAssets
      : videoAssets

  return (
    <section className="stack">
      <div className="sectionLead">
        <div>
          <div className="eyebrow">
            {t('avatar.eyebrow')}
          </div>
          <h2>
            {t('avatar.heading')}
          </h2>
          <p>
            {t('avatar.help')}
          </p>
        </div>
      </div>

      <div className="card note">
        {t('avatar.boundary')}
      </div>

      <div className="card stack">
        <h3>
          {t('avatar.createHeading')}
        </h3>

        <label>
          {t('avatar.name')}
          <input
            maxLength={80}
            value={name}
            placeholder={
              t('avatar.nameHint')
            }
            onChange={
              event =>
                setName(
                  event.target.value
                )
            }
          />
        </label>

        <label>
          {t('avatar.source')}
          <select
            value={sourceKind}
            onChange={event => {
              setSourceKind(
                event.target.value as AvatarSourceKind
              )
              setSelectedAssetIds([])
              setReferenceAuthorized(false)
            }}
          >
            {([
              'preset',
              'prompt',
              'image',
              'video',
              'multi-reference'
            ] as const).map(
              kind => (
                <option
                  key={kind}
                  value={kind}
                >
                  {t(
                    `avatar.source.${kind}`
                  )}
                </option>
              )
            )}
          </select>
        </label>

        {sourceKind === 'preset' && (
          <label>
            {t('avatar.preset')}
            <select
              value={presetId}
              onChange={
                event =>
                  setPresetId(
                    event.target.value
                  )
              }
            >
              {avatarPresets.map(
                preset => (
                  <option
                    key={preset.id}
                    value={preset.id}
                  >
                    {preset.label}
                  </option>
                )
              )}
            </select>
          </label>
        )}

        {(sourceKind === 'prompt'
          || sourceKind === 'preset'
          || sourceKind === 'image'
          || sourceKind === 'video'
          || sourceKind ===
            'multi-reference') && (
          <label>
            {t('avatar.prompt')}
            <textarea
              value={prompt}
              placeholder={
                t(
                  'avatar.promptHint'
                )
              }
              onChange={
                event =>
                  setPrompt(
                    event.target.value
                  )
              }
            />
          </label>
        )}

        {(sourceKind === 'image'
          || sourceKind === 'video') && (
          <>
            {!singleChoices.length && (
              <div className="warning">
                {t(
                  'avatar.referenceMissing'
                )}
              </div>
            )}

            <label>
              {t('avatar.reference')}
              <select
                value={
                  selectedAssetIds[0]
                  ?? ''
                }
                onChange={
                  event =>
                    chooseSingle(
                      event.target.value
                    )
                }
              >
                <option value="">
                  —
                </option>
                {singleChoices.map(
                  asset => (
                    <option
                      key={asset.id}
                      value={asset.id}
                    >
                      {assetName(
                        asset.id
                      )}
                    </option>
                  )
                )}
              </select>
            </label>
          </>
        )}

        {sourceKind ===
          'multi-reference' && (
          <fieldset className="stack">
            <legend>
              {t(
                'avatar.references'
              )}
            </legend>

            {!referenceAssets.length && (
              <div className="warning">
                {t(
                  'avatar.referenceMissing'
                )}
              </div>
            )}

            {referenceAssets.map(
              asset => (
                <label
                  key={asset.id}
                >
                  <input
                    type="checkbox"
                    checked={
                      selectedAssetIds
                        .includes(
                          asset.id
                        )
                    }
                    onChange={
                      event =>
                        toggleReference(
                          asset.id,
                          event.target
                            .checked
                        )
                    }
                  />
                  {assetName(
                    asset.id
                  )}
                </label>
              )
            )}
          </fieldset>
        )}

        {[
          'image',
          'video',
          'multi-reference'
        ].includes(sourceKind) && (
          <fieldset className="stack">
            <legend>
              {t(
                'avatar.rightsHeading'
              )}
            </legend>

            <label>
              {t(
                'avatar.rightsBasis'
              )}
              <select
                value={
                  referenceRightsBasis
                }
                onChange={
                  event =>
                    setReferenceRightsBasis(
                      event.target.value === 'authorized'
                        ? 'authorized'
                        : 'own'
                    )
                }
              >
                <option value="own">
                  {t(
                    'avatar.rightsOwn'
                  )}
                </option>
                <option value="authorized">
                  {t(
                    'avatar.rightsAuthorized'
                  )}
                </option>
              </select>
            </label>

            <label>
              <input
                type="checkbox"
                checked={
                  referenceAuthorized
                }
                onChange={
                  event =>
                    setReferenceAuthorized(
                      event.target.checked
                    )
                }
              />
              {t(
                'avatar.rightsConfirm'
              )}
            </label>
          </fieldset>
        )}

        <button
          className="primary"
          onClick={create}
        >
          {t('avatar.create')}
        </button>
      </div>

      <div className="card stack">
        <h3>
          {t('avatar.library')}
        </h3>

        {!project.avatars.length ? (
          <div className="emptyState">
            {t('avatar.empty')}
          </div>
        ) : (
          <div className="projectGrid">
            {project.avatars.map(
              avatar => {
                const active =
                  avatar.versions.find(
                    version =>
                      version.id ===
                      avatar.activeVersionId
                  )

                return (
                  <button
                    key={avatar.id}
                    className={
                      avatar.id ===
                      selectedAvatarId
                        ? 'projectCard card active'
                        : 'projectCard card'
                    }
                    onClick={() => {
                      setSelectedAvatarId(
                        avatar.id
                      )
                      setVoiceAssetId(
                        avatar.voiceAssetId
                        ?? ''
                      )
                    }}
                  >
                    <div className="eyebrow">
                      {avatar.id ===
                      selectedAvatarId
                        ? t(
                            'avatar.selected'
                          )
                        : t(
                            'avatar.select'
                          )}
                    </div>
                    <h3>
                      {avatar.name}
                    </h3>
                    <p>
                      {t(
                        'avatar.activeVersion',
                        {
                          version:
                            active?.label
                            ?? '—'
                        }
                      )}
                    </p>
                    <small>
                      {
                        active?.source
                          .kind
                      }
                    </small>
                  </button>
                )
              }
            )}
          </div>
        )}
      </div>

      {selectedAvatar && (
        <div className="card stack">
          <div>
            <div className="eyebrow">
              {t('avatar.editor')}
            </div>
            <h3>
              {selectedAvatar.name}
            </h3>
            <p>
              {t(
                'avatar.editHelp'
              )}
            </p>
          </div>

          <div className="stack">
            <strong>
              {t('avatar.versions')}
            </strong>

            {selectedAvatar.versions.map(
              version => (
                <div
                  className="assetRow"
                  key={version.id}
                >
                  <div>
                    <strong>
                      {version.label}
                    </strong>
                    <small>
                      {
                        version.source
                          .kind
                      }
                      {version.source.assetIds.length
                        ? ` · ${version.source.assetIds
                            .map(assetName)
                            .join(' · ')}`
                        : ''}
                      {version
                        .editInstruction
                        ? ` · ${version.editInstruction}`
                        : ''}
                    </small>
                    <small>
                      {t(
                        'avatar.rightsStored',
                        {
                          basis:
                            version.source
                              .rights.basis
                        }
                      )}
                    </small>
                  </div>

                  {version.id ===
                  selectedAvatar
                    .activeVersionId ? (
                    <span className="badge">
                      {t(
                        'avatar.selected'
                      )}
                    </span>
                  ) : (
                    <button
                      className="secondaryButton"
                      onClick={() =>
                        activateVersion(
                          version.id
                        )
                      }
                    >
                      {t(
                        'avatar.useVersion'
                      )}
                    </button>
                  )}
                </div>
              )
            )}
          </div>

          <label>
            {t(
              'avatar.versionLabel'
            )}
            <input
              value={versionLabel}
              placeholder={
                t(
                  'avatar.versionLabelHint'
                )
              }
              onChange={
                event =>
                  setVersionLabel(
                    event.target.value
                  )
              }
            />
          </label>

          <label>
            {t(
              'avatar.instruction'
            )}
            <textarea
              value={
                editInstruction
              }
              placeholder={
                t(
                  'avatar.instructionHint'
                )
              }
              onChange={
                event =>
                  setEditInstruction(
                    event.target.value
                  )
              }
            />
          </label>

          <button
            className="secondaryButton"
            onClick={createVersion}
          >
            {t(
              'avatar.newVersion'
            )}
          </button>

          <label>
            {t('avatar.voice')}
            <select
              value={voiceAssetId}
              onChange={
                event =>
                  setVoiceAssetId(
                    event.target.value
                  )
              }
            >
              <option value="">
                {t(
                  'avatar.noVoice'
                )}
              </option>

              {voiceAssets.map(
                asset => (
                  <option
                    key={asset.id}
                    value={asset.id}
                  >
                    {assetName(
                      asset.id
                    )}
                  </option>
                )
              )}
            </select>
          </label>

          {!voiceAssets.length && (
            <small>
              {t(
                'avatar.voiceMissing'
              )}
            </small>
          )}

          <button
            className="secondaryButton"
            onClick={saveVoice}
          >
            {t(
              'avatar.bindVoice'
            )}
          </button>
        </div>
      )}

      {selectedAvatar && (
        <div className="card stack">
          <h3>
            {t(
              'avatar.sceneHeading'
            )}
          </h3>

          <label>
            {t('avatar.scene')}
            <select
              value={sceneId}
              onChange={
                event =>
                  setSceneId(
                    event.target.value
                  )
              }
            >
              <option value="">
                {t(
                  'avatar.noScene'
                )}
              </option>

              {project.storyboard.map(
                scene => (
                  <option
                    key={scene.id}
                    value={scene.id}
                  >
                    {scene.title}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            {t(
              'avatar.scenePrompt'
            )}
            <textarea
              value={scenePrompt}
              onChange={
                event =>
                  setScenePrompt(
                    event.target.value
                  )
              }
            />
          </label>

          <label>
            {t(
              'avatar.environment'
            )}
            <textarea
              value={
                environmentPrompt
              }
              onChange={
                event =>
                  setEnvironmentPrompt(
                    event.target.value
                  )
              }
            />
          </label>

          <label>
            {t('avatar.motion')}
            <textarea
              value={motionPrompt}
              onChange={
                event =>
                  setMotionPrompt(
                    event.target.value
                  )
              }
            />
          </label>

          <label>
            {t(
              'avatar.expression'
            )}
            <textarea
              value={
                expressionPrompt
              }
              onChange={
                event =>
                  setExpressionPrompt(
                    event.target.value
                  )
              }
            />
          </label>

          <button
            className="primary"
            onClick={createInstance}
          >
            {t(
              'avatar.createInstance'
            )}
          </button>
        </div>
      )}

      {!!project.avatarInstances.length && (
        <div className="card stack">
          <h3>
            {t('avatar.instances')}
          </h3>

          {project.avatarInstances.map(
            instance => {
              const avatar =
                project.avatars.find(
                  entry =>
                    entry.id ===
                    instance.avatarId
                )

              const version =
                avatar?.versions.find(
                  entry =>
                    entry.id ===
                    instance.versionId
                )

              return (
                <div
                  className="assetRow"
                  key={instance.id}
                >
                  <div>
                    <strong>
                      {t(
                        'avatar.instanceSummary',
                        {
                          avatar:
                            avatar?.name
                            ?? instance
                              .avatarId,
                          version:
                            version?.label
                            ?? instance
                              .versionId
                        }
                      )}
                    </strong>

                    <small>
                      {instance.sceneId
                        ? project.storyboard
                            .find(
                              scene =>
                                scene.id ===
                                instance.sceneId
                            )?.title
                          ?? instance.sceneId
                        : t(
                            'avatar.noScene'
                          )}
                    </small>
                  </div>
                </div>
              )
            }
          )}
        </div>
      )}

      {saved && (
        <div
          className="successBox"
          role="status"
        >
          {t('avatar.saved')}
        </div>
      )}

      {error && (
        <div
          className="errorBox"
          role="alert"
        >
          {t('avatar.failed')}
          <details>
            <summary>
              Details
            </summary>
            {error}
          </details>
        </div>
      )}
    </section>
  )
}
