import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  AiEditorRequestScope as RequestScope
} from '../core/aiEditorReview'

import type {
  KinaouProject
} from '../core/project'

import {
  projectShortDerivativeLineage
} from '../core/shortDerivative'

import {
  buildShortFinishingContext
} from '../core/shortFinishing'

import {
  commitShortReframeReview,
  reviewShortReframeProposal,
  shortReframeProjectKey,
  type ShortReframeReview
} from '../core/shortReframing'

import {
  buildShortReframeModelContext
} from '../core/shortReframingModel'

import type {
  PersistentVersionHistory
} from '../core/versioning'

import {
  WorkerClient
} from '../core/workerClient'

import {
  useUiLanguage
} from './UiLanguageProvider'


interface Props {
  project:
    KinaouProject

  history:
    PersistentVersionHistory

  workerUrl:
    string

  workerToken:
    string

  workerConnected:
    boolean

  workerCapabilities:
    string[]

  onProjectChange:
    (
      project:
        KinaouProject
    ) => void
}


export function ShortReframeReviewChanges({
  review,
  selected,
  busy,
  onToggle
}: {
  review:
    ShortReframeReview

  selected:
    string[]

  busy:
    boolean

  onToggle:
    (
      operationId:
        string,
      checked:
        boolean
    ) => void
}) {
  const {
    t
  } =
    useUiLanguage()

  const percent =
    (
      value:
        number
    ) =>
      Math.round(
        value * 100
      )

  return (
    <div className="aiDiffs">
      {review.changes.map(
        change => (
          <label
            key={
              change.operationId
            }
          >
            <input
              type="checkbox"
              disabled={
                busy
              }
              checked={
                selected.includes(
                  change.operationId
                )
              }
              onChange={
                event =>
                  onToggle(
                    change.operationId,
                    event.target
                      .checked
                  )
              }
            />

            <span>
              <strong>
                {change.reason}
              </strong>

              <small>
                {t(
                  'shortFinish.before'
                )}
                :
                {' '}
                {t(
                  'shortFinish.focus',
                  {
                    x:
                      percent(
                        change.current
                          .focusX
                      ),

                    y:
                      percent(
                        change.current
                          .focusY
                      )
                  }
                )}
              </small>

              <small>
                {t(
                  'shortFinish.after'
                )}
                :
                {' '}
                {t(
                  'shortFinish.focus',
                  {
                    x:
                      percent(
                        change.proposed
                          .focusX
                      ),

                    y:
                      percent(
                        change.proposed
                          .focusY
                      )
                  }
                )}
              </small>

              <small>
                {change.sceneId}
                {' · '}
                {change.clipId}
              </small>

              <small>
                {t(
                  'shortFinish.include'
                )}
              </small>
            </span>
          </label>
        )
      )}
    </div>
  )
}


export function ShortFinishingPanel({
  project,
  history,
  workerUrl,
  workerToken,
  workerConnected,
  workerCapabilities,
  onProjectChange
}: Props) {
  const {
    t
  } =
    useUiLanguage()

  const derivative =
    projectShortDerivativeLineage(
      project
    )

  const finishing =
    buildShortFinishingContext(
      project
    )

  const [
    models,
    setModels
  ] =
    useState<{
      connection:
        string

      items:
        Array<{
          id:
            string

          sizeBytes:
            number
        }>
    } | null>(
      null
    )

  const [
    model,
    setModel
  ] =
    useState(
      ''
    )

  const [
    instruction,
    setInstruction
  ] =
    useState(
      ''
    )

  const [
    reviewed,
    setReviewed
  ] =
    useState<
      ShortReframeReview
      | null
    >(
      null
    )

  const [
    selected,
    setSelected
  ] =
    useState<
      string[]
    >(
      []
    )

  const [
    message,
    setMessage
  ] =
    useState<
      | 'models'
      | 'noModels'
      | 'valid'
      | 'applied'
      | null
    >(
      null
    )

  const [
    appliedCount,
    setAppliedCount
  ] =
    useState(
      0
    )

  const [
    error,
    setError
  ] =
    useState(
      ''
    )

  const [
    pending,
    setPending
  ] =
    useState<{
      current:
        () => boolean
    } | null>(
      null
    )

  const scope =
    useRef(
      new RequestScope()
    )

  const inFlight =
    useRef<
      (() => boolean)
      | null
    >(
      null
    )

  const projectKey =
    shortReframeProjectKey(
      project
    )

  const connection =
    JSON.stringify([
      workerUrl,
      workerToken,
      workerConnected,
      workerCapabilities
        .includes(
          'local-llm'
        )
    ])

  scope.current.update(
    JSON.stringify([
      projectKey,
      connection
    ])
  )

  useEffect(
    () => {
      scope.current.attach()

      return () =>
        scope.current.detach()
    },
    []
  )

  useEffect(
    () => {
      setModels(null)
      setModel('')
      setInstruction('')
      setReviewed(null)
      setSelected([])
      setMessage(null)
      setError('')
      setPending(null)
      inFlight.current =
        null
    },
    [
      project.id
    ]
  )

  if (!derivative) {
    return null
  }

  const busy =
    Boolean(
      pending?.current()
    )

  const installed =
    models?.connection
      === connection
      ? models.items
      : []

  const installedModel =
    installed.some(
      item =>
        item.id
        === model
    )

  const canGenerate =
    finishing.readiness
      .ready
    && workerConnected
    && Boolean(
      workerToken.trim()
    )
    && workerCapabilities
      .includes(
        'local-llm'
      )

  const stale =
    Boolean(
      reviewed
      && reviewed.projectKey
        !== projectKey
    )


  async function detectModels() {
    if (
      busy
      || inFlight.current?.()
      || !canGenerate
    ) {
      return
    }

    const current =
      scope.current.begin()

    inFlight.current =
      current

    setPending({
      current
    })

    setError('')
    setMessage(null)

    try {
      const items =
        await new WorkerClient({
          baseUrl:
            workerUrl,

          token:
            workerToken
        })
          .listLocalModels()

      if (!current()) {
        return
      }

      setModels({
        connection,
        items
      })

      setModel(
        items[0]?.id
        ?? ''
      )

      setMessage(
        items.length
          ? 'models'
          : 'noModels'
      )
    } catch (cause) {
      if (current()) {
        setError(
          cause instanceof Error
            ? cause.message
            : String(cause)
        )
      }
    } finally {
      if (current()) {
        inFlight.current =
          null

        setPending(null)
      }
    }
  }


  async function generate() {
    if (
      busy
      || inFlight.current?.()
      || !canGenerate
      || !installedModel
      || !instruction.trim()
    ) {
      return
    }

    const current =
      scope.current.begin()

    inFlight.current =
      current

    setPending({
      current
    })

    setReviewed(null)
    setSelected([])
    setMessage(null)
    setError('')

    try {
      const context =
        buildShortReframeModelContext(
          project
        )

      const raw =
        await new WorkerClient({
          baseUrl:
            workerUrl,

          token:
            workerToken
        })
          .generateShortReframeProposal(
            model,
            instruction,
            context
          )

      if (!current()) {
        return
      }

      const next =
        reviewShortReframeProposal(
          project,
          raw
        )

      setReviewed(
        next
      )

      setSelected([])

      setMessage(
        'valid'
      )
    } catch (cause) {
      if (current()) {
        setReviewed(null)
        setSelected([])

        setError(
          cause instanceof Error
            ? cause.message
            : String(cause)
        )
      }
    } finally {
      if (current()) {
        inFlight.current =
          null

        setPending(null)
      }
    }
  }


  function toggle(
    operationId:
      string,

    checked:
      boolean
  ) {
    setSelected(
      current =>
        checked
          ? [
              ...current,
              operationId
            ]
          : current.filter(
              id =>
                id
                !== operationId
            )
    )
  }


  function apply() {
    if (
      !reviewed
      || !selected.length
      || stale
      || busy
    ) {
      return
    }

    setError('')
    setMessage(null)

    try {
      const count =
        commitShortReframeReview(
          project,
          reviewed,
          selected,
          history,
          onProjectChange
        )

      setAppliedCount(
        count
      )

      setReviewed(null)
      setSelected([])

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
            'shortFinish.eyebrow'
          )}
        </div>

        <h3>
          {t(
            'shortFinish.heading'
          )}
        </h3>

        <p>
          {t(
            'shortFinish.help'
          )}
        </p>

        <p>
          {t(
            'shortFinish.boundary'
          )}
        </p>

        <span
          className={
            finishing.readiness
              .ready
              ? 'status online'
              : 'status missing'
          }
        >
          {t(
            finishing.readiness
              .ready
              ? 'shortFinish.ready'
              : 'shortFinish.notReady'
          )}
        </span>
      </div>

      {finishing.readiness
        .issues.map(
          (
            issue,
            index
          ) => (
            <div
              key={
                `${issue.code}-${issue.assetId ?? index}`
              }
              className={
                issue.severity
                  === 'blocking'
                  ? 'warning'
                  : 'note'
              }
            >
              {t(
                'shortFinish.issue',
                {
                  message:
                    issue.message
                }
              )}
            </div>
          )
        )}

      <div className="localAiEditor">
        <label>
          {t(
            'shortFinish.instruction'
          )}

          <input
            disabled={
              busy
            }
            value={
              instruction
            }
            maxLength={
              4000
            }
            onChange={
              event =>
                setInstruction(
                  event.target
                    .value
                )
            }
            placeholder={
              t(
                'shortFinish.instructionHint'
              )
            }
          />
        </label>

        <label>
          {t(
            'shortFinish.model'
          )}

          <select
            disabled={
              busy
            }
            value={
              installedModel
                ? model
                : ''
            }
            onChange={
              event =>
                setModel(
                  event.target
                    .value
                )
            }
          >
            <option value="">
              {t(
                'shortFinish.chooseModel'
              )}
            </option>

            {installed.map(
              item => (
                <option
                  key={
                    item.id
                  }
                  value={
                    item.id
                  }
                >
                  {item.id}
                </option>
              )
            )}
          </select>
        </label>

        <div className="directorActions">
          <button
            className="secondaryButton"
            disabled={
              busy
              || !canGenerate
            }
            onClick={
              () =>
                void detectModels()
            }
          >
            {t(
              'shortFinish.detect'
            )}
          </button>

          <button
            className="primary"
            disabled={
              busy
              || !canGenerate
              || !installedModel
              || !instruction.trim()
            }
            onClick={
              () =>
                void generate()
            }
          >
            {t(
              busy
                ? 'shortFinish.busy'
                : 'shortFinish.generate'
            )}
          </button>
        </div>

        <small>
          {t(
            'shortFinish.noPixel'
          )}
        </small>
      </div>

      {stale && (
        <div
          className="warning"
          role="status"
        >
          {t(
            'shortFinish.stale'
          )}
        </div>
      )}

      {message
        && !stale && (
          <div
            className="note"
            role="status"
          >
            {t(
              `shortFinish.${message}`,
              {
                count:
                  appliedCount
              }
            )}
          </div>
        )}

      {error && (
        <div
          className="errorBox"
          role="alert"
        >
          {t(
            'shortFinish.failed'
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

      {reviewed
        && !stale && (
          <>
            {reviewed.proposal
              .provenance
              .modelId && (
                <small>
                  {t(
                    'shortFinish.provenance',
                    {
                      adapter:
                        reviewed
                          .proposal
                          .provenance
                          .adapterId
                        ?? 'local',

                      model:
                        reviewed
                          .proposal
                          .provenance
                          .modelId
                        ?? ''
                    }
                  )}
                </small>
              )}

            <ShortReframeReviewChanges
              review={
                reviewed
              }
              selected={
                selected
              }
              busy={
                busy
              }
              onToggle={
                toggle
              }
            />

            <div className="directorActions">
              <button
                className="primary"
                disabled={
                  busy
                  || !selected.length
                }
                onClick={
                  apply
                }
              >
                {t(
                  'shortFinish.apply',
                  {
                    count:
                      selected.length
                  }
                )}
              </button>
            </div>
          </>
        )}
    </div>
  )
}
