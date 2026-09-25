import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  formatProfiles,
  formatReframingRequiresWorker,
  projectFormatPreset,
  type RenderPlan,
  type TargetFormat
} from '../core/render'

import {
  freshPreviewPlan
} from '../core/previewSession'

import {
  buildShortCutPlan,
  createShortCutRenderPlan,
  type ShortCutPlan
} from '../core/shortCutPlan'

import {
  createMaterializedShortDerivative,
  reviewedShortCutKey
} from '../core/shortDerivativeCreate'

import {
  parseShortHighlightProposal,
  type ShortHighlightProposal
} from '../core/shortHighlightProposal'

import {
  buildShortIntelligenceContext
} from '../core/shortIntelligence'

import {
  ShortPreviewSession,
  type ShortPreviewFeedback
} from '../core/shortPreviewSession'

import type {
  KinaouProject
} from '../core/project'

import {
  WorkerClient
} from '../core/workerClient'

import {
  PreviewPlayback
} from './PreviewFeedback'

import {
  ShortPreviewStatus
} from './ShortPreviewPanel'

import {
  useUiLanguage
} from './UiLanguageProvider'


interface Props {
  project:
    KinaouProject

  maximumDurationMs:
    number

  workerUrl:
    string

  workerToken:
    string

  workerConnected:
    boolean

  workerCapabilities:
    string[]

  disabled:
    boolean

  onCreateDerivative?:
    (
      project:
        KinaouProject
    ) => void
}


export function ShortIntelligencePanel({
  project,
  maximumDurationMs,
  workerUrl,
  workerToken,
  workerConnected,
  workerCapabilities,
  disabled,
  onCreateDerivative
}: Props) {
  const {
    language,
    t
  } =
    useUiLanguage()

  const context =
    useMemo(
      () =>
        buildShortIntelligenceContext(
          project,
          maximumDurationMs
        ),
      [
        project,
        maximumDurationMs
      ]
    )

  const connection =
    JSON.stringify([
      workerUrl,
      workerToken,
      workerConnected,
      [...workerCapabilities]
        .sort()
    ])

  const scope =
    JSON.stringify([
      project.id,
      project.updatedAt,
      maximumDurationMs,
      connection
    ])

  const requestEpoch =
    useRef(
      0
    )

  const session =
    useRef<
      ShortPreviewSession
      | null
    >(
      null
    )

  const objectUrl =
    useRef(
      ''
    )

  const [
    models,
    setModels
  ] =
    useState<
      Array<{
        id: string
        sizeBytes: number
      }>
    >([])

  const [
    modelsConnection,
    setModelsConnection
  ] =
    useState(
      ''
    )

  const [
    model,
    setModel
  ] =
    useState(
      ''
    )

  const [
    proposal,
    setProposal
  ] =
    useState<
      ShortHighlightProposal
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
    >([])

  const [
    pending,
    setPending
  ] =
    useState(
      false
    )

  const [
    message,
    setMessage
  ] =
    useState<
      | 'models'
      | 'noModels'
      | 'proposal'
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

  const [
    format,
    setFormat
  ] =
    useState<
      TargetFormat
    >(
      'vertical'
    )

  const [
    feedback,
    setFeedback
  ] =
    useState<
      ShortPreviewFeedback
    >({
      phase:
        'idle'
    })

  const [
    url,
    setUrl
  ] =
    useState(
      ''
    )

  const [
    acceptedPreviewKey,
    setAcceptedPreviewKey
  ] =
    useState(
      ''
    )

  const [
    creating,
    setCreating
  ] =
    useState(
      false
    )


  function disposePreview(
    resetState =
      true
  ) {
    session.current
      ?.detach()

    session.current =
      null

    if (
      objectUrl.current
    ) {
      URL.revokeObjectURL(
        objectUrl.current
      )

      objectUrl.current =
        ''
    }

    if (resetState) {
      setUrl('')
      setAcceptedPreviewKey('')
      setFeedback({
        phase:
          'idle'
      })
    }
  }


  useEffect(
    () => {
      requestEpoch.current +=
        1

      setProposal(null)
      setSelected([])
      setPending(false)
      setCreating(false)
      setMessage(null)
      setError('')

      disposePreview()

      return () => {
        session.current
          ?.detach()

        session.current =
          null

        if (
          objectUrl.current
        ) {
          URL.revokeObjectURL(
            objectUrl.current
          )

          objectUrl.current =
            ''
        }
      }
    },
    [scope]
  )


  const modelAvailable =
    workerConnected
    && Boolean(
      workerToken.trim()
    )
    && workerCapabilities
      .includes(
        'local-llm'
      )

  const installedModels =
    modelsConnection
      === connection
      ? models
      : []

  const installedModel =
    installedModels.some(
      item =>
        item.id
        === model
    )

  const previewWorkerAvailable =
    workerConnected
    && Boolean(
      workerToken.trim()
    )
    && workerCapabilities
      .includes(
        'ffmpeg'
      )

  const reframingBlocked =
    formatReframingRequiresWorker(
      project,
      format
    )
    && !workerCapabilities
      .includes(
        'format-reframing'
      )

  const previewBusy =
    [
      'starting',
      'queued',
      'running',
      'loading',
      'cancelling'
    ].includes(
      feedback.phase
    )

  const busy =
    disabled
    || pending
    || previewBusy
    || creating


  let cut:
    ShortCutPlan
    | null =
      null

  let cutError =
    ''

  if (
    proposal
    && selected.length
  ) {
    try {
      cut =
        buildShortCutPlan(
          context,
          proposal,
          selected
        )
    } catch (cause) {
      cutError =
        cause instanceof Error
          ? cause.message
          : String(cause)
    }
  }


  let previewPlan:
    RenderPlan
    | null =
      null

  let previewPlanError =
    ''

  if (
    cut
    && !cutError
  ) {
    try {
      previewPlan =
        createShortCutRenderPlan(
          project,
          cut,
          projectFormatPreset(
            project,
            format,
            'preview'
          ),
          'KINAOU/Cache/Previews/intelligent-short.mp4'
        )
    } catch (cause) {
      previewPlanError =
        cause instanceof Error
          ? cause.message
          : String(cause)
    }
  }

  const currentReviewKey =
    cut
      ? reviewedShortCutKey(
          project,
          cut,
          format
        )
      : ''

  const creationReady =
    Boolean(
      onCreateDerivative
    )
    && Boolean(
      cut
    )
    && !cutError
    && !previewPlanError
    && feedback.phase
      === 'ready'
    && Boolean(
      url
    )
    && acceptedPreviewKey
      === currentReviewKey


  async function detectModels() {
    if (
      busy
      || !modelAvailable
    ) {
      return
    }

    const epoch =
      ++requestEpoch.current

    setPending(true)
    setMessage(null)
    setError('')

    try {
      const items =
        await new WorkerClient({
          baseUrl:
            workerUrl,
          token:
            workerToken
        })
          .listLocalModels()

      if (
        epoch
        !== requestEpoch.current
      ) {
        return
      }

      setModels(items)
      setModelsConnection(
        connection
      )

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
      if (
        epoch
        === requestEpoch.current
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : String(cause)
        )
      }
    } finally {
      if (
        epoch
        === requestEpoch.current
      ) {
        setPending(false)
      }
    }
  }


  async function generate() {
    if (
      busy
      || !modelAvailable
      || !installedModel
      || !context.readiness
        .ready
    ) {
      return
    }

    const epoch =
      ++requestEpoch.current

    setPending(true)
    setProposal(null)
    setSelected([])
    setMessage(null)
    setError('')

    disposePreview()

    try {
      const raw =
        await new WorkerClient({
          baseUrl:
            workerUrl,
          token:
            workerToken
        })
          .generateShortHighlightProposal(
            model,
            context
          )

      if (
        epoch
        !== requestEpoch.current
      ) {
        return
      }

      const validated =
        parseShortHighlightProposal(
          raw,
          context
        )

      setProposal(
        validated
      )

      setMessage(
        'proposal'
      )
    } catch (cause) {
      if (
        epoch
        === requestEpoch.current
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : String(cause)
        )
      }
    } finally {
      if (
        epoch
        === requestEpoch.current
      ) {
        setPending(false)
      }
    }
  }


  function toggleCandidate(
    id: string,
    checked: boolean
  ) {
    disposePreview()

    setSelected(
      current =>
        checked
          ? [
              ...current,
              id
            ]
          : current.filter(
              candidateId =>
                candidateId
                !== id
            )
    )
  }


  function changeFormat(
    next:
      TargetFormat
  ) {
    disposePreview()
    setFormat(next)
  }


  function renderPreview() {
    if (
      busy
      || !previewPlan
      || !cut
      || !previewWorkerAvailable
      || reframingBlocked
    ) {
      return
    }

    disposePreview()

    const reviewedKey =
      currentReviewKey

    const currentPlan =
      freshPreviewPlan(
        previewPlan
      )

    const nextSession =
      new ShortPreviewSession(
        currentPlan,
        {
          client:
            new WorkerClient({
              baseUrl:
                workerUrl,
              token:
                workerToken
            }),

          publish:
            setFeedback,

          accept:
            blob => {
              if (
                objectUrl.current
              ) {
                URL.revokeObjectURL(
                  objectUrl.current
                )
              }

              objectUrl.current =
                URL.createObjectURL(
                  blob
                )

              setUrl(
                objectUrl.current
              )

              setAcceptedPreviewKey(
                reviewedKey
              )
            }
        }
      )

    session.current =
      nextSession

    void nextSession.run()
  }


  function createDerivative() {
    if (
      creating
      || !creationReady
      || !cut
      || !onCreateDerivative
    ) {
      return
    }

    setCreating(true)
    setError('')

    try {
      const child =
        createMaterializedShortDerivative(
          project,
          cut,
          format
        )

      onCreateDerivative(
        child
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )

      setCreating(false)
    }
  }


  const seconds =
    (
      value: number
    ) =>
      (
        value
        / 1000
      ).toLocaleString(
        language,
        {
          maximumFractionDigits:
            3
        }
      )


  return (
    <div className="renderJob">
      <div className="renderJobHead">
        <div>
          <div className="eyebrow">
            {t(
              'shortIntelligence.eyebrow'
            )}
          </div>

          <strong>
            {t(
              'shortIntelligence.heading'
            )}
          </strong>
        </div>

        <span
          className={
            context.readiness
              .ready
              ? 'status online'
              : 'status missing'
          }
        >
          {t(
            context.readiness
              .ready
              ? 'shortIntelligence.ready'
              : 'shortIntelligence.notReady'
          )}
        </span>
      </div>

      <p className="cardBody">
        {t(
          'shortIntelligence.help'
        )}
      </p>

      <p className="cardBody">
        {t(
          'shortIntelligence.evidence',
          {
            scenes:
              context.readiness
                .anchoredSceneCount,

            segments:
              context.readiness
                .transcriptSegmentCount
          }
        )}
      </p>

      <p className="cardBody">
        {t(
          'shortIntelligence.policy'
        )}
      </p>

      {context.readiness
        .issues.map(
          (
            issue,
            index
          ) => (
            <div
              key={
                `${issue.code}-${issue.sceneId ?? index}`
              }
              className={
                issue.severity
                  === 'blocking'
                  ? 'warning'
                  : 'note'
              }
            >
              {issue.message}
            </div>
          )
        )}

      <div className="directorActions">
        <button
          className="secondaryButton"
          disabled={
            busy
            || !modelAvailable
          }
          onClick={
            () =>
              void detectModels()
          }
        >
          {t(
            'shortIntelligence.detect'
          )}
        </button>

        <label>
          {t(
            'shortIntelligence.model'
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
                'shortIntelligence.chooseModel'
              )}
            </option>

            {installedModels.map(
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

        <button
          className="primary"
          disabled={
            busy
            || !modelAvailable
            || !installedModel
            || !context
              .readiness
              .ready
          }
          onClick={
            () =>
              void generate()
          }
        >
          {t(
            pending
              ? 'shortIntelligence.generating'
              : 'shortIntelligence.generate'
          )}
        </button>
      </div>

      {message === 'models' && (
        <div
          className="note"
          role="status"
        >
          {t(
            'shortIntelligence.modelsLoaded'
          )}
        </div>
      )}

      {message === 'noModels' && (
        <div
          className="note"
          role="status"
        >
          {t(
            'shortIntelligence.noModels'
          )}
        </div>
      )}

      {message === 'proposal'
        && proposal && (
          <div
            className="note"
            role="status"
          >
            {t(
              'shortIntelligence.proposalReady',
              {
                count:
                  proposal
                    .candidates
                    .length
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
            'shortIntelligence.failed'
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

      {proposal && (
        <div className="stack">
          {proposal.candidates.map(
            candidate => (
              <div
                className="renderMeta"
                key={
                  candidate.id
                }
              >
                <div className="stack">
                  <strong>
                    {candidate.hook}
                  </strong>

                  <small>
                    {t(
                      'shortIntelligence.order',
                      {
                        value:
                          candidate.order
                      }
                    )}
                    {' · '}
                    {t(
                      'shortIntelligence.range',
                      {
                        start:
                          seconds(
                            candidate.inMs
                          ),

                        end:
                          seconds(
                            candidate.outMs
                          ),

                        duration:
                          seconds(
                            candidate.outMs
                            - candidate.inMs
                          )
                      }
                    )}
                  </small>

                  <span>
                    {candidate.rationale}
                  </span>

                  <details>
                    <summary>
                      {t(
                        'shortIntelligence.evidenceHeading'
                      )}
                    </summary>

                    {candidate.evidence.map(
                      evidence => (
                        <code
                          key={
                            `${evidence.kind}:${evidence.id}`
                          }
                        >
                          {evidence.kind}
                          {' · '}
                          {evidence.id}
                        </code>
                      )
                    )}
                  </details>
                </div>

                <label className="checkRow">
                  <input
                    type="checkbox"
                    disabled={
                      busy
                    }
                    checked={
                      selected.includes(
                        candidate.id
                      )
                    }
                    onChange={
                      event =>
                        toggleCandidate(
                          candidate.id,
                          event.target
                            .checked
                        )
                    }
                  />

                  {t(
                    'shortIntelligence.include'
                  )}
                </label>
              </div>
            )
          )}
        </div>
      )}

      {cutError && (
        <div
          className="warning"
          role="alert"
        >
          {t(
            'shortIntelligence.invalidSelection'
          )}

          <details>
            <summary>
              {t(
                'common.details'
              )}
            </summary>

            {cutError}
          </details>
        </div>
      )}

      {cut && !cutError && (
        <div className="stack">
          <div className="renderJobHead">
            <strong>
              {t(
                'shortIntelligence.cutHeading'
              )}
            </strong>

            <span>
              {t(
                'shortIntelligence.cutSummary',
                {
                  count:
                    cut.segments
                      .length,

                  duration:
                    seconds(
                      cut.durationMs
                    )
                }
              )}
            </span>
          </div>

          {cut.segments.map(
            segment => (
              <div
                key={
                  segment
                    .candidateId
                }
                className="note"
              >
                {t(
                  'shortIntelligence.segment',
                  {
                    position:
                      segment.position,

                    hook:
                      segment.hook,

                    sourceStart:
                      seconds(
                        segment
                          .sourceInMs
                      ),

                    sourceEnd:
                      seconds(
                        segment
                          .sourceOutMs
                      ),

                    destStart:
                      seconds(
                        segment
                          .destinationInMs
                      ),

                    destEnd:
                      seconds(
                        segment
                          .destinationOutMs
                      )
                  }
                )}
              </div>
            )
          )}

          <div className="renderJobHead">
            <strong>
              {t(
                'shortIntelligence.format'
              )}
            </strong>
          </div>

          <div
            className="formatChooser"
            role="group"
            aria-label={
              t(
                'shortIntelligence.format'
              )
            }
          >
            {(
              Object.keys(
                formatProfiles
              ) as TargetFormat[]
            ).map(
              id => (
                <button
                  key={
                    id
                  }
                  className={
                    id === format
                      ? 'formatOption active'
                      : 'formatOption'
                  }
                  aria-pressed={
                    id === format
                  }
                  disabled={
                    busy
                  }
                  onClick={
                    () =>
                      changeFormat(
                        id
                      )
                  }
                >
                  <strong>
                    {t(
                      `export.${id}`
                    )}
                  </strong>

                  <small>
                    {
                      formatProfiles[
                        id
                      ].aspect
                    }
                    {' · '}
                    {
                      formatProfiles[
                        id
                      ].preview
                        .width
                    }
                    ×
                    {
                      formatProfiles[
                        id
                      ].preview
                        .height
                    }
                  </small>
                </button>
              )
            )}
          </div>

          <p className="cardBody">
            {t(
              'shortIntelligence.previewHelp'
            )}
          </p>

          {previewPlanError && (
            <div className="warning">
              {previewPlanError}
            </div>
          )}

          {reframingBlocked && (
            <div className="warning">
              {t(
                'shortIntelligence.reframingBlocked'
              )}
            </div>
          )}

          {!previewWorkerAvailable && (
            <div className="warning">
              {t(
                'shortIntelligence.previewUnavailable'
              )}
            </div>
          )}

          <div className="renderActions">
            <button
              className="primary"
              disabled={
                busy
                || !previewPlan
                || !previewWorkerAvailable
                || reframingBlocked
              }
              onClick={
                renderPreview
              }
            >
              {t(
                url
                  ? 'shortIntelligence.refresh'
                  : 'shortIntelligence.render'
              )}
            </button>

            {feedback.job
              && [
                'queued',
                'running'
              ].includes(
                feedback.job.state
              ) && (
                <button
                  className="dangerButton"
                  disabled={
                    feedback.phase
                    === 'cancelling'
                  }
                  onClick={
                    () =>
                      void session
                        .current
                        ?.cancel()
                  }
                >
                  {t(
                    'shortIntelligence.cancel'
                  )}
                </button>
              )}
          </div>

          <ShortPreviewStatus
            feedback={
              feedback
            }
          />

          {url && (
            <PreviewPlayback
              key={
                url
              }
              url={
                url
              }
              durationSeconds={
                cut.durationMs
                / 1000
              }
            />
          )}

          {creationReady && (
            <ShortDerivativeCreateAction
              ready={
                creationReady
              }
              creating={
                creating
              }
              onCreate={
                createDerivative
              }
            />
          )}
        </div>
      )}
    </div>
  )
}


export function ShortDerivativeCreateAction({
  ready,
  creating,
  onCreate
}: {
  ready:
    boolean

  creating:
    boolean

  onCreate:
    () => void
}) {
  const {
    t
  } =
    useUiLanguage()

  return (
    <div className="card stack">
      <p className="cardBody">
        {t(
          'shortIntelligence.createHelp'
        )}
      </p>

      <div className="renderActions">
        <button
          className="primary"
          disabled={
            !ready
            || creating
          }
          onClick={
            onCreate
          }
        >
          {t(
            creating
              ? 'shortIntelligence.creating'
              : 'shortIntelligence.create'
          )}
        </button>
      </div>
    </div>
  )
}
