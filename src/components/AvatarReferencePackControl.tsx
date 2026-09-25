import {
  useState
} from 'react'

import {
  commitAvatarChange
} from '../core/avatarStudio'

import {
  FLUX2_KLEIN_REFERENCE_PACK_SIZE,
  avatarReferencePackCandidateAssets,
  createAcceptedAvatarReferencePack,
  setActiveAvatarReferencePack
} from '../core/avatarReferencePack'

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
  avatarId: string
  history: PersistentVersionHistory
  onProjectChange:
    (project: KinaouProject) => void
}

export function AvatarReferencePackControl({
  project,
  avatarId,
  history,
  onProjectChange
}: Props) {
  const {
    t
  } = useUiLanguage()

  const [
    selectedIds,
    setSelectedIds
  ] =
    useState<string[]>([])

  const [
    confirmed,
    setConfirmed
  ] =
    useState(false)

  const [
    saved,
    setSaved
  ] =
    useState(false)

  const [
    error,
    setError
  ] =
    useState('')

  const avatar =
    project.avatars.find(
      entry =>
        entry.id === avatarId
    )

  if (!avatar) {
    return null
  }

  const candidates =
    avatarReferencePackCandidateAssets(
      project,
      avatarId
    )

  const active =
    avatar.referencePacks.find(
      pack =>
        pack.id ===
        avatar.activeReferencePackId
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

  function toggle(
    id: string,
    checked: boolean
  ) {
    setSaved(false)
    setError('')

    setSelectedIds(
      current => {
        if (!checked) {
          return current.filter(
            value =>
              value !== id
          )
        }

        if (
          current.includes(id)
          || current.length
            >= FLUX2_KLEIN_REFERENCE_PACK_SIZE
        ) {
          return current
        }

        return [
          ...current,
          id
        ]
      }
    )
  }

  function createPack() {
    setSaved(false)
    setError('')

    try {
      const result =
        commitAvatarChange(
          project,
          () =>
            createAcceptedAvatarReferencePack(
              project,
              {
                avatarId,
                assetIds:
                  selectedIds,
                acceptanceConfirmed:
                  confirmed
              }
            ),
          history,
          onProjectChange,
          'Before creating accepted Avatar Reference Pack'
        )

      setSelectedIds([])
      setConfirmed(false)
      setSaved(true)

      return result
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  function activate(
    packId: string
  ) {
    setSaved(false)
    setError('')

    try {
      commitAvatarChange(
        project,
        () =>
          setActiveAvatarReferencePack(
            project,
            avatarId,
            packId
          ),
        history,
        onProjectChange,
        'Before changing Avatar Reference Pack'
      )

      setSaved(true)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  return (
    <div className="card note stack">
      <div>
        <strong>
          {t(
            'avatar.referencePackHeading'
          )}
        </strong>

        <p>
          {t(
            'avatar.referencePackHelp'
          )}
        </p>
      </div>

      {active && (
        <div className="successBox">
          {t(
            'avatar.referencePackActive',
            {
              name:
                active.label
            }
          )}
        </div>
      )}

      {!candidates.length && (
        <small>
          {t(
            'avatar.referencePackEmpty'
          )}
        </small>
      )}

      {!!candidates.length && (
        <fieldset className="stack">
          <legend>
            {t(
              'avatar.referencePackChoose'
            )}
          </legend>

          {candidates.map(
            asset => (
              <label
                key={
                  asset.id
                }
              >
                <input
                  type="checkbox"
                  checked={
                    selectedIds
                      .includes(
                        asset.id
                      )
                  }
                  disabled={
                    !selectedIds
                      .includes(
                        asset.id
                      )
                    && selectedIds
                      .length
                      >= FLUX2_KLEIN_REFERENCE_PACK_SIZE
                  }
                  onChange={
                    event =>
                      toggle(
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

      <small>
        {t(
          'avatar.referencePackCount',
          {
            count:
              selectedIds.length
          }
        )}
      </small>

      <label>
        <input
          type="checkbox"
          checked={
            confirmed
          }
          onChange={
            event =>
              setConfirmed(
                event.target
                  .checked
              )
          }
        />

        {t(
          'avatar.referencePackConfirm'
        )}
      </label>

      <button
        className="secondaryButton"
        disabled={
          selectedIds.length
            !== FLUX2_KLEIN_REFERENCE_PACK_SIZE
          || !confirmed
        }
        onClick={
          createPack
        }
      >
        {t(
          'avatar.referencePackCreate'
        )}
      </button>

      {!!avatar.referencePacks
        .length && (
        <div className="stack">
          <strong>
            {t(
              'avatar.referencePackSaved'
            )}
          </strong>

          {avatar.referencePacks.map(
            pack => (
              <div
                className="assetRow"
                key={
                  pack.id
                }
              >
                <div>
                  <strong>
                    {pack.label}
                  </strong>

                  <small>
                    {pack.assetIds
                      .map(
                        assetName
                      )
                      .join(
                        ' · '
                      )}
                  </small>
                </div>

                {pack.id ===
                avatar
                  .activeReferencePackId
                  ? (
                    <span className="badge">
                      {t(
                        'avatar.referencePackInUse'
                      )}
                    </span>
                  )
                  : (
                    <button
                      className="secondaryButton"
                      onClick={
                        () =>
                          activate(
                            pack.id
                          )
                      }
                    >
                      {t(
                        'avatar.referencePackUse'
                      )}
                    </button>
                  )}
              </div>
            )
          )}
        </div>
      )}

      {saved && (
        <div
          className="successBox"
          role="status"
        >
          {t(
            'avatar.referencePackSavedStatus'
          )}
        </div>
      )}

      {error && (
        <div
          className="errorBox"
          role="alert"
        >
          {t(
            'avatar.referencePackFailed'
          )}

          <details>
            <summary>
              {t(
                'common.details'
              )}
            </summary>

            {error}
          </details>
        </div>
      )}
    </div>
  )
}
