import {
  useState
} from 'react'

import type {
  KinaouProject
} from '../core/project'

import {
  commitShortAudioFinishingReview,
  projectShortAudioFinishing,
  projectUsesShortAudioFinishing,
  reviewShortAudioFinishing,
  shortAudioFinishingProjectKey,
  type ShortAudioFinishingProfile,
  type ShortAudioFinishingReview
} from '../core/shortAudioFinishing'

import type {
  PersistentVersionHistory
} from '../core/versioning'

import {
  useUiLanguage
} from './UiLanguageProvider'


interface Props {
  project:
    KinaouProject

  history:
    PersistentVersionHistory

  onProjectChange:
    (
      project:
        KinaouProject
    ) => void
}


function cloneProfile(
  value:
    ShortAudioFinishingProfile
): ShortAudioFinishingProfile {
  return {
    audioDucking: {
      ...value.audioDucking
    },

    loudnessNormalization: {
      ...value.loudnessNormalization
    }
  }
}


export function ShortAudioReviewSummary({
  review
}: {
  review:
    ShortAudioFinishingReview
}) {
  const {
    t
  } =
    useUiLanguage()

  function summary(
    profile:
      ShortAudioFinishingProfile
  ) {
    return t(
      'shortAudio.summary',
      {
        ducking:
          t(
            profile.audioDucking
              .enabled
              ? 'shortAudio.on'
              : 'shortAudio.off'
          ),

        reduction:
          profile
            .audioDucking
            .reductionDb,

        loudness:
          profile
            .loudnessNormalization
            .enabled
            ? `${profile.loudnessNormalization.targetLufs} LUFS`
            : t(
                'shortAudio.off'
              )
      }
    )
  }

  return (
    <div className="stack">
      <div className="note">
        <strong>
          {t(
            'shortAudio.current'
          )}
        </strong>

        <span>
          {summary(
            review.current
          )}
        </span>
      </div>

      <div className="note">
        <strong>
          {t(
            'shortAudio.proposed'
          )}
        </strong>

        <span>
          {summary(
            review.proposed
          )}
        </span>
      </div>

      {review.warnings.map(
        warning => (
          <div
            key={
              warning.code
            }
            className="warning"
          >
            {t(
              'shortAudio.warning',
              {
                message:
                  warning.message
              }
            )}
          </div>
        )
      )}
    </div>
  )
}


export function ShortAudioFinishingPanel({
  project,
  history,
  onProjectChange
}: Props) {
  const {
    t
  } =
    useUiLanguage()

  if (
    !projectUsesShortAudioFinishing(
      project
    )
  ) {
    return null
  }

  const saved =
    projectShortAudioFinishing(
      project
    )

  const savedKey =
    JSON.stringify(
      saved
    )

  const [
    draft,
    setDraft
  ] =
    useState<{
      base:
        string

      value:
        ShortAudioFinishingProfile
    }>({
      base:
        savedKey,

      value:
        cloneProfile(
          saved
        )
    })

  const [
    review,
    setReview
  ] =
    useState<
      ShortAudioFinishingReview
      | null
    >(
      null
    )

  const [
    message,
    setMessage
  ] =
    useState<
      | 'reviewed'
      | 'applied'
      | null
    >(
      null
    )

  const [
    error,
    setError
  ] =
    useState(
      ''
    )

  const draftKey =
    JSON.stringify(
      draft.value
    )

  const dirty =
    draftKey
    !== draft.base

  const conflict =
    dirty
    && draft.base
      !== savedKey

  const value =
    dirty
      ? draft.value
      : saved

  const stale =
    Boolean(
      review
      && review.projectKey
        !== shortAudioFinishingProjectKey(
          project
        )
    )


  function update(
    change:
      (
        current:
          ShortAudioFinishingProfile
      ) =>
        ShortAudioFinishingProfile
  ) {
    setDraft({
      base:
        dirty
          ? draft.base
          : savedKey,

      value:
        change(
          cloneProfile(
            value
          )
        )
    })

    setReview(null)
    setMessage(null)
    setError('')
  }


  function discard() {
    setDraft({
      base:
        savedKey,

      value:
        cloneProfile(
          saved
        )
    })

    setReview(null)
    setMessage(null)
    setError('')
  }


  function performReview() {
    if (
      !dirty
      || conflict
    ) {
      return
    }

    setError('')
    setMessage(null)

    try {
      const next =
        reviewShortAudioFinishing(
          project,
          value
        )

      setReview(
        next
      )

      setMessage(
        'reviewed'
      )
    } catch (cause) {
      setReview(null)

      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }


  function apply() {
    if (
      !review
      || stale
    ) {
      return
    }

    setError('')
    setMessage(null)

    try {
      const next =
        commitShortAudioFinishingReview(
          project,
          review,
          history,
          onProjectChange
        )

      const applied =
        projectShortAudioFinishing(
          next
        )

      setDraft({
        base:
          JSON.stringify(
            applied
          ),

        value:
          cloneProfile(
            applied
          )
      })

      setReview(null)

      setMessage(
        'applied'
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }


  return (
    <div className="card aiEditorPanel">
      <div>
        <div className="eyebrow">
          {t(
            'shortAudio.eyebrow'
          )}
        </div>

        <h3>
          {t(
            'shortAudio.heading'
          )}
        </h3>

        <p>
          {t(
            'shortAudio.help'
          )}
        </p>
      </div>

      <label className="checkRow">
        <input
          type="checkbox"
          checked={
            value.audioDucking
              .enabled
          }
          onChange={
            event =>
              update(
                current => ({
                  ...current,

                  audioDucking: {
                    ...current
                      .audioDucking,

                    enabled:
                      event.target
                        .checked
                  }
                })
              )
          }
        />

        {t(
          'shortAudio.duck'
        )}
      </label>

      <div className="fieldGrid">
        <label>
          {t(
            'shortAudio.reduction'
          )}

          <input
            type="number"
            min="0"
            max="40"
            step="1"
            value={
              Number.isFinite(
                value.audioDucking
                  .reductionDb
              )
                ? value.audioDucking
                  .reductionDb
                : ''
            }
            onChange={
              event =>
                update(
                  current => ({
                    ...current,

                    audioDucking: {
                      ...current
                        .audioDucking,

                      reductionDb:
                        Number(
                          event.target
                            .value
                        )
                    }
                  })
                )
            }
          />
        </label>

        <label>
          {t(
            'shortAudio.attack'
          )}

          <input
            type="number"
            min="0"
            max="5000"
            step="10"
            value={
              Number.isFinite(
                value.audioDucking
                  .attackMs
              )
                ? value.audioDucking
                  .attackMs
                : ''
            }
            onChange={
              event =>
                update(
                  current => ({
                    ...current,

                    audioDucking: {
                      ...current
                        .audioDucking,

                      attackMs:
                        Number(
                          event.target
                            .value
                        )
                    }
                  })
                )
            }
          />
        </label>

        <label>
          {t(
            'shortAudio.release'
          )}

          <input
            type="number"
            min="0"
            max="5000"
            step="10"
            value={
              Number.isFinite(
                value.audioDucking
                  .releaseMs
              )
                ? value.audioDucking
                  .releaseMs
                : ''
            }
            onChange={
              event =>
                update(
                  current => ({
                    ...current,

                    audioDucking: {
                      ...current
                        .audioDucking,

                      releaseMs:
                        Number(
                          event.target
                            .value
                        )
                    }
                  })
                )
            }
          />
        </label>
      </div>

      <label className="checkRow">
        <input
          type="checkbox"
          checked={
            value
              .loudnessNormalization
              .enabled
          }
          onChange={
            event =>
              update(
                current => ({
                  ...current,

                  loudnessNormalization: {
                    ...current
                      .loudnessNormalization,

                    enabled:
                      event.target
                        .checked
                  }
                })
              )
          }
        />

        {t(
          'shortAudio.normalize'
        )}
      </label>

      <div className="fieldGrid">
        <label>
          {t(
            'shortAudio.lufs'
          )}

          <input
            type="number"
            min="-70"
            max="-5"
            step="0.5"
            value={
              Number.isFinite(
                value
                  .loudnessNormalization
                  .targetLufs
              )
                ? value
                  .loudnessNormalization
                  .targetLufs
                : ''
            }
            onChange={
              event =>
                update(
                  current => ({
                    ...current,

                    loudnessNormalization: {
                      ...current
                        .loudnessNormalization,

                      targetLufs:
                        Number(
                          event.target
                            .value
                        )
                    }
                  })
                )
            }
          />
        </label>

        <label>
          {t(
            'shortAudio.peak'
          )}

          <input
            type="number"
            min="-9"
            max="0"
            step="0.1"
            value={
              Number.isFinite(
                value
                  .loudnessNormalization
                  .truePeakDb
              )
                ? value
                  .loudnessNormalization
                  .truePeakDb
                : ''
            }
            onChange={
              event =>
                update(
                  current => ({
                    ...current,

                    loudnessNormalization: {
                      ...current
                        .loudnessNormalization,

                      truePeakDb:
                        Number(
                          event.target
                            .value
                        )
                    }
                  })
                )
            }
          />
        </label>

        <label>
          {t(
            'shortAudio.range'
          )}

          <input
            type="number"
            min="1"
            max="50"
            step="1"
            value={
              Number.isFinite(
                value
                  .loudnessNormalization
                  .loudnessRange
              )
                ? value
                  .loudnessNormalization
                  .loudnessRange
                : ''
            }
            onChange={
              event =>
                update(
                  current => ({
                    ...current,

                    loudnessNormalization: {
                      ...current
                        .loudnessNormalization,

                      loudnessRange:
                        Number(
                          event.target
                            .value
                        )
                    }
                  })
                )
            }
          />
        </label>
      </div>

      {dirty && (
        <small>
          {t(
            'shortAudio.draft'
          )}
        </small>
      )}

      {conflict && (
        <div
          className="warning"
          role="status"
        >
          {t(
            'shortAudio.conflict'
          )}
        </div>
      )}

      <div className="directorActions">
        <button
          className="secondaryButton"
          disabled={
            !dirty
            || conflict
          }
          onClick={
            performReview
          }
        >
          {t(
            'shortAudio.review'
          )}
        </button>

        <button
          className="secondaryButton"
          disabled={
            !dirty
          }
          onClick={
            discard
          }
        >
          {t(
            'shortAudio.discard'
          )}
        </button>

        <button
          className="primary"
          disabled={
            !review
            || stale
          }
          onClick={
            apply
          }
        >
          {t(
            'shortAudio.apply'
          )}
        </button>
      </div>

      {stale && (
        <div
          className="warning"
          role="status"
        >
          {t(
            'shortAudio.stale'
          )}
        </div>
      )}

      {message && !stale && (
        <div
          className="note"
          role="status"
        >
          {t(
            `shortAudio.${message}`
          )}
        </div>
      )}

      {review && !stale && (
        <ShortAudioReviewSummary
          review={
            review
          }
        />
      )}

      {error && (
        <div
          className="errorBox"
          role="alert"
        >
          {t(
            'shortAudio.failed'
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
