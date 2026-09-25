import {
  useEffect,
  useState
} from 'react'

import {
  WorkerClient
} from '../core/workerClient'

import type {
  AvatarRenderRuntime
} from '../core/avatarRenderRuntime'

import {
  useUiLanguage
} from './UiLanguageProvider'


interface Props {
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
}


function gib(
  bytes?: number
) {
  if (
    bytes === undefined
  ) {
    return undefined
  }

  return (
    bytes
    / 1024
    / 1024
    / 1024
  ).toFixed(1)
}


export function AvatarRenderRuntimeStatus({
  workerUrl,
  workerToken,
  workerConnected,
  workerCapabilities
}: Props) {
  const {
    t
  } = useUiLanguage()

  const [
    runtime,
    setRuntime
  ] = useState<
    AvatarRenderRuntime | null
  >(null)

  const [
    busy,
    setBusy
  ] = useState(false)

  const [
    error,
    setError
  ] = useState('')

  const runtimeCapable =
    workerCapabilities.includes(
      'avatar-render-runtime'
    )

  useEffect(
    () => {
      let cancelled =
        false

      if (
        !workerConnected
        || !workerToken.trim()
        || !runtimeCapable
      ) {
        setRuntime(null)
        setBusy(false)
        setError('')
        return () => {
          cancelled = true
        }
      }

      setBusy(true)
      setError('')

      const client =
        new WorkerClient({
          baseUrl:
            workerUrl,
          token:
            workerToken
        })

      void client
        .avatarRenderRuntime()
        .then(
          value => {
            if (!cancelled) {
              setRuntime(
                value
              )
            }
          }
        )
        .catch(
          cause => {
            if (!cancelled) {
              setRuntime(null)

              setError(
                cause instanceof Error
                  ? cause.message
                  : String(cause)
              )
            }
          }
        )
        .finally(
          () => {
            if (!cancelled) {
              setBusy(false)
            }
          }
        )

      return () => {
        cancelled = true
      }
    },
    [
      workerUrl,
      workerToken,
      workerConnected,
      runtimeCapable
    ]
  )

  const previewAvailable =
    runtime?.preview
      .available
    === true

  const finalAvailable =
    runtime?.localGenerative
      .available
    === true

  const finalEngine =
    finalAvailable
      ? runtime
          ?.localGenerative
          .engine
      : undefined

  const systemRam =
    gib(
      runtime?.host
        .systemMemoryBytes
    )

  const vram =
    gib(
      runtime?.host
        .vramBytes
    )

  return (
    <div className="card stack">
      <div>
        <div className="eyebrow">
          {t(
            'avatar.renderEyebrow'
          )}
        </div>

        <h3>
          {t(
            'avatar.renderHeading'
          )}
        </h3>

        <p>
          {t(
            'avatar.renderHelp'
          )}
        </p>
      </div>

      {(
        !workerConnected
        || !runtimeCapable
      ) && (
        <div className="warning">
          {t(
            'avatar.renderWorkerUnavailable'
          )}
        </div>
      )}

      {busy && (
        <div className="status">
          {t(
            'avatar.renderChecking'
          )}
        </div>
      )}

      {error && (
        <div
          className="warning"
          role="alert"
        >
          {error}
        </div>
      )}

      {runtime && (
        <>
          <div>
            <strong>
              {t(
                'avatar.renderPreview'
              )}
            </strong>
            {' '}
            <span
              className={
                previewAvailable
                  ? 'status online'
                  : 'status'
              }
            >
              {t(
                previewAvailable
                  ? 'avatar.renderLocalAvailable'
                  : 'avatar.renderUnavailable'
              )}
            </span>

            {!previewAvailable && (
              <p>
                {t(
                  'avatar.renderPreviewUnavailable'
                )}
              </p>
            )}
          </div>

          <div>
            <strong>
              {t(
                'avatar.renderFinal'
              )}
            </strong>
            {' '}
            <span
              className={
                finalAvailable
                  ? 'status online'
                  : 'status'
              }
            >
              {t(
                finalAvailable
                  ? 'avatar.renderLocalAvailable'
                  : 'avatar.renderNotInstalled'
              )}
            </span>

            {!finalAvailable && (
              <p>
                {t(
                  'avatar.renderFinalUnavailable'
                )}
              </p>
            )}

            {finalEngine && (
              <p>
                {t(
                  'avatar.renderEngine',
                  {
                    engine:
                      finalEngine
                        .engineId,
                    model:
                      finalEngine
                        .modelId
                  }
                )}
              </p>
            )}
          </div>

          <details>
            <summary>
              {t(
                'common.details'
              )}
            </summary>

            <div className="stack">
              <div>
                {t(
                  'avatar.renderHost',
                  {
                    platform:
                      runtime
                        .host
                        .platform,
                    arch:
                      runtime
                        .host
                        .arch,
                    accelerator:
                      runtime
                        .host
                        .accelerator
                        .toUpperCase()
                  }
                )}
              </div>

              {runtime.host
                .acceleratorName && (
                <div>
                  {
                    runtime.host
                      .acceleratorName
                  }
                </div>
              )}

              {vram && (
                <div>
                  VRAM: {vram} GiB
                </div>
              )}

              {systemRam && (
                <div>
                  RAM: {systemRam} GiB
                </div>
              )}
            </div>
          </details>

          <div className="card note">
            {t(
              'avatar.renderCostPolicy'
            )}
          </div>
        </>
      )}
    </div>
  )
}
