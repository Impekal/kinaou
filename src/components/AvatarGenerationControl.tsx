import {
  useRef,
  useState
} from 'react'

import {
  avatarEditEligibility,
  completeAvatarEdit,
  prepareAvatarEdit,
  type PreparedAvatarEdit
} from '../core/avatarEditSession'

import type {
  AvatarEditJobRecord
} from '../core/avatarJobs'

import {
  exportAvatarReceiptEvidence
} from '../core/avatarReceiptSession'

import type {
  KinaouProject
} from '../core/project'

import {
  WorkerClient
} from '../core/workerClient'

import type {
  PersistentVersionHistory
} from '../core/versioning'

import {
  useUiLanguage
} from './UiLanguageProvider'

interface Props {
  project: KinaouProject
  avatarId: string
  versionId: string
  instanceId?: string
  history: PersistentVersionHistory
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange:
    (project: KinaouProject) => void
}

interface RunContext {
  project: KinaouProject
  prepared: PreparedAvatarEdit
}

function randomSeed(): number {
  const value =
    new Uint32Array(1)

  crypto.getRandomValues(
    value
  )

  return value[0]
}

export function AvatarGenerationControl({
  project,
  avatarId,
  versionId,
  instanceId,
  history,
  workerUrl,
  workerToken,
  workerConnected,
  workerCapabilities,
  onProjectChange
}: Props) {
  const {
    t
  } = useUiLanguage()

  const projectRef =
    useRef(project)

  projectRef.current =
    project

  const runRef =
    useRef<RunContext | null>(
      null
    )

  const [
    job,
    setJob
  ] =
    useState<
      AvatarEditJobRecord
      | null
    >(null)

  const [
    submitting,
    setSubmitting
  ] =
    useState(false)

  const [
    unknownAcceptance,
    setUnknownAcceptance
  ] =
    useState(false)

  const [
    saved,
    setSaved
  ] =
    useState(false)

  const [
    receiptSaved,
    setReceiptSaved
  ] =
    useState(false)

  const [
    error,
    setError
  ] =
    useState('')

  const [
    receiptError,
    setReceiptError
  ] =
    useState('')

  const target = {
    avatarId,
    versionId,
    ...(instanceId
      ? {
          instanceId
        }
      : {})
  }

  const eligibility =
    avatarEditEligibility(
      project,
      target
    )

  const workerReady =
    workerConnected
    && Boolean(
      workerToken.trim()
    )
    && workerCapabilities
      .includes(
        'avatar-identity-edit'
      )

  const receiptReady =
    workerConnected
    && Boolean(
      workerToken.trim()
    )
    && workerCapabilities
      .includes(
        'avatar-creation-receipt'
      )

  const avatar =
    project.avatars.find(
      entry =>
        entry.id === avatarId
    )

  const version =
    avatar?.versions.find(
      entry =>
        entry.id === versionId
    )

  const instance =
    instanceId
      ? project.avatarInstances
          .find(
            entry =>
              entry.id === instanceId
          )
      : undefined

  const hasOutput =
    Boolean(
      instanceId
        ? instance?.outputAssetId
        : version?.outputAssetId
    )

  const busy =
    submitting
    || job?.state === 'queued'
    || job?.state === 'running'

  function client() {
    return new WorkerClient({
      baseUrl:
        workerUrl,
      token:
        workerToken
    })
  }

  function eligibilityMessage() {
    switch (
      eligibility.reason
    ) {
      case 'image-reference-required':
        return t(
          'avatar.generateReferenceRequired'
        )

      case 'unsupported-directions':
        return t(
          'avatar.generateDirectionsUnsupported'
        )

      case 'target-unavailable':
        return t(
          'avatar.generateTargetUnavailable'
        )

      default:
        return ''
    }
  }

  function jobStateLabel(
    value:
      AvatarEditJobRecord['state']
  ) {
    switch (value) {
      case 'queued':
        return t(
          'avatar.job.queued'
        )

      case 'running':
        return t(
          'avatar.job.running'
        )

      case 'succeeded':
        return t(
          'avatar.job.succeeded'
        )

      case 'failed':
        return t(
          'avatar.job.failed'
        )

      case 'cancelled':
        return t(
          'avatar.job.cancelled'
        )
    }
  }

  async function saveSucceededJob(
    finished:
      AvatarEditJobRecord
  ) {
    const context =
      runRef.current

    if (!context) {
      throw new Error(
        'Avatar generation context is unavailable'
      )
    }

    if (
      projectRef.current
        !== context.project
    ) {
      throw new Error(
        t(
          'avatar.generateStale'
        )
      )
    }

    const completed =
      completeAvatarEdit(
        context.project,
        context.prepared,
        finished,
        new Date()
      )

    history.snapshot(
      context.project,
      'Before saving generated avatar take',
      'system'
    )

    onProjectChange(
      completed.project
    )

    projectRef.current =
      completed.project

    setSaved(true)
    setError('')

    runRef.current =
      null

    if (!receiptReady) {
      return
    }

    try {
      const secured =
        await exportAvatarReceiptEvidence(
          completed.project,
          completed.receipt.id,
          client()
        )

      if (
        projectRef.current
          !== completed.project
      ) {
        throw new Error(
          t(
            'avatar.receiptStale'
          )
        )
      }

      history.snapshot(
        completed.project,
        'Before saving avatar creation receipt evidence',
        'system'
      )

      onProjectChange(
        secured.project
      )

      projectRef.current =
        secured.project

      setReceiptSaved(
        true
      )

      setReceiptError('')
    } catch (cause) {
      setReceiptError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  async function monitor(
    jobId: string
  ) {
    const worker =
      client()

    for (
      let attempt = 0;
      attempt < 180;
      attempt += 1
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            1000
          )
      )

      const current =
        await worker
          .avatarEditJobStatus(
            jobId
          )

      setJob(
        current
      )

      if (
        current.state
          === 'succeeded'
      ) {
        await saveSucceededJob(
          current
        )

        return
      }

      if (
        current.state
          === 'cancelled'
      ) {
        runRef.current =
          null

        return
      }

      if (
        current.state
          === 'failed'
      ) {
        runRef.current =
          null

        throw new Error(
          current.error
          || 'Avatar generation failed'
        )
      }
    }

    throw new Error(
      'Avatar generation did not reach a terminal state in time'
    )
  }

  async function generate() {
    if (
      busy
      || unknownAcceptance
      || !workerReady
      || !eligibility.ready
    ) {
      return
    }

    setSubmitting(true)
    setSaved(false)
    setReceiptSaved(false)
    setError('')
    setReceiptError('')

    let accepted =
      false

    try {
      const startedProject =
        project

      const prepared =
        prepareAvatarEdit(
          startedProject,
          target,
          randomSeed()
        )

      const worker =
        client()

      const started =
        await worker
          .startAvatarEditJob(
            prepared.parameters
          )

      accepted =
        true

      runRef.current = {
        project:
          startedProject,
        prepared
      }

      setJob(
        started
      )

      setSubmitting(false)

      await monitor(
        started.id
      )
    } catch (cause) {
      if (!accepted) {
        setUnknownAcceptance(
          true
        )
      }

      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )

      setSubmitting(false)
    }
  }

  async function checkKnownJob() {
    if (
      !job
      || ![
        'queued',
        'running'
      ].includes(
        job.state
      )
      || !runRef.current
    ) {
      return
    }

    setError('')

    try {
      await monitor(
        job.id
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  async function cancel() {
    if (
      !job
      || ![
        'queued',
        'running'
      ].includes(
        job.state
      )
    ) {
      return
    }

    try {
      const cancelled =
        await client()
          .cancelAvatarEditJob(
            job.id
          )

      setJob(
        cancelled
      )

      runRef.current =
        null

      setError('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  return (
    <div className="stack">
      {!workerReady && (
        <small>
          {t(
            'avatar.generateWorkerUnavailable'
          )}
        </small>
      )}

      {workerReady
        && !eligibility.ready && (
        <small>
          {eligibilityMessage()}
        </small>
      )}

      {job && (
        <small>
          {t(
            'avatar.generateJobState',
            {
              state:
                jobStateLabel(
                  job.state
                )
            }
          )}
        </small>
      )}

      <div className="stackControls">
        <button
          className="primary"
          disabled={
            busy
            || unknownAcceptance
            || !workerReady
            || !eligibility.ready
          }
          onClick={
            () =>
              void generate()
          }
        >
          {submitting
            ? t(
                'avatar.generateSubmitting'
              )
            : busy
              ? t(
                  'avatar.generating'
                )
              : hasOutput
                ? t(
                    'avatar.retake'
                  )
                : t(
                    'avatar.generate'
                  )}
        </button>

        {job
          && [
            'queued',
            'running'
          ].includes(
            job.state
          ) && (
          <>
            <button
              className="secondaryButton"
              onClick={
                () =>
                  void checkKnownJob()
              }
            >
              {t(
                'avatar.generateCheck'
              )}
            </button>

            <button
              className="secondaryButton"
              onClick={
                () =>
                  void cancel()
              }
            >
              {t(
                'avatar.generateCancel'
              )}
            </button>
          </>
        )}
      </div>

      {unknownAcceptance && (
        <div className="warning">
          {t(
            'avatar.generateUnknown'
          )}

          <button
            className="secondaryButton"
            onClick={() => {
              setUnknownAcceptance(
                false
              )
              setError('')
            }}
          >
            {t(
              'avatar.generateUnknownClear'
            )}
          </button>
        </div>
      )}

      {saved && (
        <div
          className="successBox"
          role="status"
        >
          {t(
            'avatar.generateSaved'
          )}
        </div>
      )}

      {receiptSaved && (
        <div
          className="successBox"
          role="status"
        >
          {t(
            'avatar.generateReceiptSaved'
          )}
        </div>
      )}

      {receiptError && (
        <div
          className="warning"
          role="status"
        >
          {t(
            'avatar.generateReceiptPending'
          )}
          <details>
            <summary>
              {t(
                'common.details'
              )}
            </summary>
            {receiptError}
          </details>
        </div>
      )}

      {error && (
        <div
          className="errorBox"
          role="alert"
        >
          {t(
            'avatar.generateFailed'
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
