import {
  useMemo,
  useState
} from 'react'

import type {
  PlatformCredentialStatus
} from '../core/platformCredentials'

import {
  beginPlatformPublishAttempt,
  confirmPlatformPublishDraft,
  createPlatformPublishAttempt,
  failPlatformPublishAttempt,
  preparePlatformPublishDraft,
  succeedPlatformPublishAttempt,
  type PlatformPublishAttempt
} from '../core/platformPublishing'

import type {
  PublishIntegrityResult,
  PublishPackageEntry
} from '../core/publishPackage'

import type {
  YouTubeOAuthSession
} from '../core/youtubePublishing'

import {
  WorkerClient
} from '../core/workerClient'

import {
  useUiLanguage
} from './UiLanguageProvider'


interface YouTubePublishPanelProps {
  projectId:
    string

  workerUrl:
    string

  workerToken:
    string

  workerConnected:
    boolean

  workerCapabilities:
    string[]
}


const attemptStateKeys = {
  confirmed:
    'publish.youtube.attempt.confirmed',

  submitting:
    'publish.youtube.attempt.submitting',

  succeeded:
    'publish.youtube.attempt.succeeded',

  failed:
    'publish.youtube.attempt.failed',

  cancelled:
    'publish.youtube.attempt.cancelled'
} as const


export function YouTubePublishPanel({
  projectId,
  workerUrl,
  workerToken,
  workerConnected,
  workerCapabilities
}: YouTubePublishPanelProps) {
  const {
    t,
    language
  } =
    useUiLanguage()


  const [
    credential,
    setCredential
  ] =
    useState<
      PlatformCredentialStatus
      | null
    >(
      null
    )


  const [
    oauthSession,
    setOauthSession
  ] =
    useState<
      YouTubeOAuthSession
    >({
      state:
        'idle'
    })


  const [
    packages,
    setPackages
  ] =
    useState<
      PublishPackageEntry[]
      | null
    >(
      null
    )


  const [
    selectedPath,
    setSelectedPath
  ] =
    useState(
      ''
    )


  const [
    integrity,
    setIntegrity
  ] =
    useState<
      PublishIntegrityResult
      | null
    >(
      null
    )


  const [
    confirmed,
    setConfirmed
  ] =
    useState(
      false
    )


  const [
    attempt,
    setAttempt
  ] =
    useState<
      PlatformPublishAttempt
      | null
    >(
      null
    )


  const [
    busy,
    setBusy
  ] =
    useState(
      ''
    )


  const [
    error,
    setError
  ] =
    useState(
      ''
    )


  const credentialSupported =
    workerCapabilities.includes(
      'publish-credentials'
    )

  const oauthSupported =
    workerCapabilities.includes(
      'youtube-oauth'
    )

  const publishSupported =
    workerCapabilities.includes(
      'youtube-publish'
    )

  const librarySupported =
    workerCapabilities.includes(
      'publish-package-library'
    )

  const integritySupported =
    workerCapabilities.includes(
      'publish-package-integrity'
    )


  const canUseWorker =
    workerConnected
    && Boolean(
      workerToken.trim()
    )


  const youtubePackages =
    useMemo(
      () =>
        (
          packages
          ?? []
        ).filter(
          entry =>
            entry.document
              .schemaVersion === 3
            && entry.document
              .platform === 'youtube'
            && entry.document
              .placement.startsWith(
                'youtube-'
              )
        ),
      [
        packages
      ]
    )


  const selectedPackage =
    youtubePackages
      .find(
        entry =>
          entry.path
          === selectedPath
      )
    ?? youtubePackages[
      0
    ]


  const connected =
    credential?.state
      === 'available'


  const verified =
    Boolean(
      selectedPackage
      && integrity
      && integrity.packagePath
        === selectedPackage.path
      && integrity.status
        === 'unchanged'
    )


  function client() {
    return new WorkerClient({
      baseUrl:
        workerUrl,

      token:
        workerToken
    })
  }


  function resetPublishReview() {
    setIntegrity(
      null
    )

    setConfirmed(
      false
    )

    setAttempt(
      null
    )
  }


  async function refreshConnection() {
    if (
      !canUseWorker
      || !credentialSupported
      || busy
    ) {
      return
    }

    setBusy(
      'credentials'
    )

    setError(
      ''
    )

    try {
      const statuses =
        await client()
          .platformCredentialStatuses()

      setCredential(
        statuses.find(
          status =>
            status.platform
            === 'youtube'
        )
        ?? null
      )

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.credentials'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function startOAuth() {
    if (
      !canUseWorker
      || !oauthSupported
      || busy
    ) {
      return
    }

    setBusy(
      'oauth-start'
    )

    setError(
      ''
    )

    try {
      setOauthSession(
        await client()
          .startYouTubeOAuth()
      )

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.oauth'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function refreshOAuth() {
    if (
      !canUseWorker
      || !oauthSupported
      || busy
    ) {
      return
    }

    setBusy(
      'oauth-status'
    )

    setError(
      ''
    )

    try {
      const session =
        await client()
          .youtubeOAuthStatus()

      setOauthSession(
        session
      )

      if (
        session.state
        === 'connected'
      ) {
        const statuses =
          await client()
            .platformCredentialStatuses()

        setCredential(
          statuses.find(
            status =>
              status.platform
              === 'youtube'
          )
          ?? null
        )
      }

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.oauth'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function cancelOAuth() {
    if (
      !canUseWorker
      || !oauthSupported
      || busy
    ) {
      return
    }

    setBusy(
      'oauth-cancel'
    )

    setError(
      ''
    )

    try {
      setOauthSession(
        await client()
          .cancelYouTubeOAuth()
      )

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.oauth'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function disconnect() {
    if (
      !canUseWorker
      || !oauthSupported
      || busy
    ) {
      return
    }

    setBusy(
      'disconnect'
    )

    setError(
      ''
    )

    try {
      setOauthSession(
        await client()
          .disconnectYouTube()
      )

      setCredential(
        null
      )

      resetPublishReview()

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.disconnect'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function loadPackages() {
    if (
      !canUseWorker
      || !librarySupported
      || busy
    ) {
      return
    }

    setBusy(
      'packages'
    )

    setError(
      ''
    )

    try {
      const result =
        await client()
          .listPublishPackages(
            projectId
          )

      const filtered =
        result.filter(
          entry =>
            entry.document
              .schemaVersion === 3
            && entry.document
              .platform === 'youtube'
            && entry.document
              .placement.startsWith(
                'youtube-'
              )
        )

      setPackages(
        filtered
      )

      setSelectedPath(
        current =>
          filtered.some(
            entry =>
              entry.path
              === current
          )
            ? current
            : (
                filtered[
                  0
                ]?.path
                ?? ''
              )
      )

      resetPublishReview()

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.packages'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function verifySelectedPackage() {
    if (
      !selectedPackage
      || !canUseWorker
      || !integritySupported
      || busy
    ) {
      return
    }

    setBusy(
      'integrity'
    )

    setError(
      ''
    )

    setIntegrity(
      null
    )

    setConfirmed(
      false
    )

    setAttempt(
      null
    )

    try {
      setIntegrity(
        await client()
          .verifyPublishPackageIntegrity(
            selectedPackage.path
          )
      )

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.integrity'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function uploadPrivate() {
    if (
      !selectedPackage
      || !integrity
      || !verified
      || !confirmed
      || !connected
      || !canUseWorker
      || !publishSupported
      || busy
    ) {
      return
    }


    let submitting:
      PlatformPublishAttempt
      | null =
        null


    setBusy(
      'upload'
    )

    setError(
      ''
    )


    try {
      const draft =
        preparePlatformPublishDraft(
          selectedPackage,
          integrity
        )

      const request =
        confirmPlatformPublishDraft(
          draft
        )

      const created =
        createPlatformPublishAttempt(
          request
        )

      submitting =
        beginPlatformPublishAttempt(
          created
        )

      setAttempt(
        submitting
      )


      const receipt =
        await client()
          .publishYouTube(
            request,
            submitting.id
          )


      const succeeded =
        succeedPlatformPublishAttempt(
          submitting,
          receipt
        )

      setAttempt(
        succeeded
      )

      setConfirmed(
        false
      )

    } catch (
      cause
    ) {
      if (
        submitting
      ) {
        try {
          setAttempt(
            failPlatformPublishAttempt(
              submitting,
              cause instanceof Error
                ? cause.message
                : String(
                    cause
                  )
            )
          )
        } catch {
          // Preserve the original publishing error.
        }
      }

      setConfirmed(
        false
      )

      /*
       * A failed attempt gets no automatic retry. Re-verification is
       * required before another explicit upload attempt.
       */
      setIntegrity(
        null
      )

      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.youtube.error.upload'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  const date =
    (
      value:
        string
    ) =>
      new Date(
        value
      ).toLocaleString(
        language
      )


  return (
    <div className="card availabilityPanel">
      <div className="sectionLead">
        <div>
          <div className="eyebrow">
            {t(
              'publish.youtube.eyebrow'
            )}
          </div>

          <h3>
            {t(
              'publish.youtube.heading'
            )}
          </h3>
        </div>

        <span
          className={
            connected
              ? 'status online'
              : 'status'
          }
        >
          {t(
            connected
              ? 'publish.youtube.connected'
              : credential
                ? 'publish.youtube.notConnected'
                : 'publish.youtube.unknown'
          )}
        </span>
      </div>


      <p>
        {t(
          'publish.youtube.help'
        )}
      </p>


      <div className="note">
        <strong>
          {t(
            'publish.youtube.private.heading'
          )}
        </strong>

        <br />

        {t(
          'publish.youtube.private.help'
        )}
      </div>


      {!workerConnected && (
        <small>
          {t(
            'publish.youtube.workerOffline'
          )}
        </small>
      )}


      {workerConnected
        && !publishSupported
        && (
          <small>
            {t(
              'publish.youtube.restart'
            )}
          </small>
        )}


      <div className="formStack">
        <div className="publishDefaultActions">
          <button
            className="secondaryButton"
            disabled={
              !canUseWorker
              || !credentialSupported
              || Boolean(
                busy
              )
            }
            onClick={
              () =>
                void refreshConnection()
            }
          >
            {t(
              busy === 'credentials'
                ? 'publish.youtube.connection.checking'
                : 'publish.youtube.connection.check'
            )}
          </button>


          {!connected
            && oauthSupported
            && (
              <button
                className="secondaryButton"
                disabled={
                  !canUseWorker
                  || Boolean(
                    busy
                  )
                }
                onClick={
                  () =>
                    void startOAuth()
                }
              >
                {t(
                  busy === 'oauth-start'
                    ? 'publish.youtube.oauth.starting'
                    : 'publish.youtube.oauth.start'
                )}
              </button>
            )}


          {connected
            && credential
              ?.provider
              === 'system-keychain'
            && oauthSupported
            && (
              <button
                className="secondaryButton"
                disabled={
                  Boolean(
                    busy
                  )
                }
                onClick={
                  () =>
                    void disconnect()
                }
              >
                {t(
                  'publish.youtube.disconnect'
                )}
              </button>
            )}
        </div>


        {credential
          && (
            <small>
              {t(
                'publish.youtube.connection.summary',
                {
                  provider:
                    credential.provider,

                  refresh:
                    credential
                      .refreshTokenAvailable
                      ? t(
                          'publish.youtube.yes'
                        )
                      : t(
                          'publish.youtube.no'
                        ),

                  access:
                    credential
                      .accessTokenAvailable
                      ? t(
                          'publish.youtube.yes'
                        )
                      : t(
                          'publish.youtube.no'
                        )
                }
              )}
            </small>
          )}


        {oauthSession.state
          === 'awaiting-user'
          && (
            <div className="note">
              <strong>
                {t(
                  'publish.youtube.oauth.awaiting'
                )}
              </strong>

              <br />

              {t(
                'publish.youtube.oauth.openHelp'
              )}

              <br />

              <a
                href={
                  oauthSession
                    .authorizationUrl
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(
                  'publish.youtube.oauth.open'
                )}
              </a>

              <div className="publishDefaultActions">
                <button
                  className="secondaryButton"
                  disabled={
                    Boolean(
                      busy
                    )
                  }
                  onClick={
                    () =>
                      void refreshOAuth()
                  }
                >
                  {t(
                    busy === 'oauth-status'
                      ? 'publish.youtube.oauth.checking'
                      : 'publish.youtube.oauth.check'
                  )}
                </button>

                <button
                  className="secondaryButton"
                  disabled={
                    Boolean(
                      busy
                    )
                  }
                  onClick={
                    () =>
                      void cancelOAuth()
                  }
                >
                  {t(
                    'publish.youtube.oauth.cancel'
                  )}
                </button>
              </div>
            </div>
          )}


        {oauthSession.state
          === 'connected'
          && oauthSession.connectedAt
          && (
            <small>
              {t(
                'publish.youtube.oauth.connectedAt',
                {
                  date:
                    date(
                      oauthSession
                        .connectedAt
                    )
                }
              )}
            </small>
          )}


        {oauthSession.state
          === 'failed'
          && (
            <div className="errorBox">
              {oauthSession.error}
            </div>
          )}


        <button
          className="secondaryButton"
          disabled={
            !canUseWorker
            || !librarySupported
            || Boolean(
              busy
            )
          }
          onClick={
            () =>
              void loadPackages()
          }
        >
          {t(
            busy === 'packages'
              ? 'publish.youtube.packages.loading'
              : 'publish.youtube.packages.load'
          )}
        </button>


        {packages !== null
          && youtubePackages.length === 0
          && (
            <small>
              {t(
                'publish.youtube.packages.empty'
              )}
            </small>
          )}


        {youtubePackages.length > 0
          && (
            <label>
              {t(
                'publish.youtube.package'
              )}

              <select
                value={
                  selectedPackage
                    ?.path
                  ?? ''
                }
                disabled={
                  Boolean(
                    busy
                  )
                }
                onChange={
                  event => {
                    setSelectedPath(
                      event.target
                        .value
                    )

                    resetPublishReview()
                  }
                }
              >
                {youtubePackages.map(
                  entry => (
                    <option
                      key={
                        entry.path
                      }
                      value={
                        entry.path
                      }
                    >
                      {
                        entry.document
                          .title
                      }
                      {' · '}
                      {
                        entry.document
                          .schemaVersion === 3
                          ? entry.document
                              .placement
                          : entry.document
                              .platform
                      }
                    </option>
                  )
                )}
              </select>
            </label>
          )}


        {selectedPackage
          && (
            <>
              <code>
                {
                  selectedPackage
                    .path
                }
              </code>

              <button
                className="secondaryButton"
                disabled={
                  !canUseWorker
                  || !integritySupported
                  || Boolean(
                    busy
                  )
                }
                onClick={
                  () =>
                    void verifySelectedPackage()
                }
              >
                {t(
                  busy === 'integrity'
                    ? 'publish.youtube.integrity.checking'
                    : 'publish.youtube.integrity.check'
                )}
              </button>
            </>
          )}


        {integrity
          && (
            <div
              className={
                verified
                  ? 'note'
                  : 'warning'
              }
            >
              {t(
                verified
                  ? 'publish.youtube.integrity.ready'
                  : 'publish.youtube.integrity.blocked',
                {
                  status:
                    integrity.status
                }
              )}
            </div>
          )}


        {selectedPackage
          && verified
          && connected
          && publishSupported
          && (
            <label>
              <input
                type="checkbox"
                checked={
                  confirmed
                }
                disabled={
                  Boolean(
                    busy
                  )
                }
                onChange={
                  event =>
                    setConfirmed(
                      event.target
                        .checked
                    )
                }
              />

              {' '}

              {t(
                'publish.youtube.confirm'
              )}
            </label>
          )}


        <button
          className="primary"
          disabled={
            !selectedPackage
            || !verified
            || !connected
            || !publishSupported
            || !confirmed
            || Boolean(
              busy
            )
          }
          onClick={
            () =>
              void uploadPrivate()
          }
        >
          {t(
            busy === 'upload'
              ? 'publish.youtube.uploading'
              : 'publish.youtube.upload'
          )}
        </button>


        {attempt
          && (
            <div
              className={
                attempt.state
                  === 'failed'
                  ? 'errorBox'
                  : 'note'
              }
            >
              <strong>
                {t(
                  attemptStateKeys[
                    attempt.state
                  ]
                )}
              </strong>

              {attempt.error
                && (
                  <>
                    <br />
                    {
                      attempt.error
                    }
                  </>
                )}

              {attempt.receipt
                ?.remote.url
                && (
                  <>
                    <br />

                    <a
                      href={
                        attempt.receipt
                          .remote.url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t(
                        'publish.youtube.result.open'
                      )}
                    </a>
                  </>
                )}
            </div>
          )}


        {error
          && (
            <div className="errorBox">
              {error}
            </div>
          )}
      </div>
    </div>
  )
}
