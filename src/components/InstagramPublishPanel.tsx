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

import {
  parseInstagramBrokerCallbackUrl,
  type InstagramOAuthSession,
  type InstagramPublishPending
} from '../core/instagramPublishing'

import {
  WorkerClient
} from '../core/workerClient'

import {
  useUiLanguage
} from './UiLanguageProvider'


interface InstagramPublishPanelProps {
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
    'publish.instagram.attempt.confirmed',

  submitting:
    'publish.instagram.attempt.submitting',

  succeeded:
    'publish.instagram.attempt.succeeded',

  failed:
    'publish.instagram.attempt.failed',

  cancelled:
    'publish.instagram.attempt.cancelled'
} as const


export function InstagramPublishPanel({
  projectId,
  workerUrl,
  workerToken,
  workerConnected,
  workerCapabilities
}: InstagramPublishPanelProps) {
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
      InstagramOAuthSession
    >({
      state:
        'idle'
    })


  const [
    callbackUrl,
    setCallbackUrl
  ] =
    useState(
      ''
    )


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
    pending,
    setPending
  ] =
    useState<
      InstagramPublishPending
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
      'instagram-oauth'
    )

  const publishSupported =
    workerCapabilities.includes(
      'instagram-publish'
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


  const instagramPackages =
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
              .platform === 'instagram'
            && entry.document
              .placement === 'instagram-reel'
        ),
      [
        packages
      ]
    )


  const selectedPackage =
    instagramPackages
      .find(
        entry =>
          entry.path === selectedPath
      )
    ?? instagramPackages[
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


  function clearPublishingState() {
    setIntegrity(
      null
    )

    setConfirmed(
      false
    )

    setAttempt(
      null
    )

    setPending(
      null
    )
  }


  async function refreshCredential() {
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
              === 'instagram'
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
              'publish.instagram.error.credentials'
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

    setCallbackUrl(
      ''
    )


    try {
      setOauthSession(
        await client()
          .startInstagramOAuth()
      )

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.instagram.error.oauth'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function completeOAuth() {
    if (
      oauthSession.state
        !== 'awaiting-user'
      || !callbackUrl.trim()
      || busy
    ) {
      return
    }


    setBusy(
      'oauth-complete'
    )

    setError(
      ''
    )


    try {
      const callback =
        parseInstagramBrokerCallbackUrl(
          callbackUrl
        )


      const session =
        await client()
          .completeInstagramOAuth({
            schemaVersion:
              1,

            sessionId:
              oauthSession.sessionId,

            state:
              callback.state,

            code:
              callback.code
          })


      /*
       * The authorization code is one-time material. Remove it from
       * component state immediately after successful completion.
       */
      setCallbackUrl(
        ''
      )

      setOauthSession(
        session
      )


      const statuses =
        await client()
          .platformCredentialStatuses()


      setCredential(
        statuses.find(
          status =>
            status.platform
              === 'instagram'
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
              'publish.instagram.error.oauth'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function refreshOAuthStatus() {
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
      setOauthSession(
        await client()
          .instagramOAuthStatus()
      )

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.instagram.error.oauth'
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
          .cancelInstagramOAuth()
      )

      setCallbackUrl(
        ''
      )

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.instagram.error.oauth'
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
          .disconnectInstagram()
      )

      setCredential(
        null
      )

      setCallbackUrl(
        ''
      )

      clearPublishingState()

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.instagram.error.disconnect'
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
      const all =
        await client()
          .listPublishPackages(
            projectId
          )


      const filtered =
        all.filter(
          entry =>
            entry.document
              .schemaVersion === 3
            && entry.document
              .platform === 'instagram'
            && entry.document
              .placement === 'instagram-reel'
        )


      setPackages(
        filtered
      )


      setSelectedPath(
        current =>
          filtered.some(
            entry =>
              entry.path === current
          )
            ? current
            : (
                filtered[
                  0
                ]?.path
                ?? ''
              )
      )


      clearPublishingState()

    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.instagram.error.packages'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function verifyPackage() {
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

    clearPublishingState()


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
              'publish.instagram.error.integrity'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function publishReel() {
    if (
      !selectedPackage
      || !integrity
      || !verified
      || !confirmed
      || !connected
      || !publishSupported
      || !canUseWorker
      || busy
      || pending
    ) {
      return
    }


    let submitting:
      PlatformPublishAttempt
      | null =
        null


    setBusy(
      'publish'
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


      if (
        draft.platform
          !== 'instagram'
        || draft.placement
          !== 'instagram-reel'
      ) {
        throw new Error(
          'Selected package is not an Instagram Reel'
        )
      }


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


      const result =
        await client()
          .publishInstagram(
            request,
            submitting.id
          )


      if (
        'kind'
        in result
      ) {
        setPending(
          result
        )

        setConfirmed(
          false
        )

        return
      }


      setAttempt(
        succeedPlatformPublishAttempt(
          submitting,
          result
        )
      )

      setPending(
        null
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
          // Preserve original failure.
        }
      }


      /*
       * A new attempt requires a fresh package integrity review.
       */
      setIntegrity(
        null
      )

      setConfirmed(
        false
      )

      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.instagram.error.publish'
            )
      )

    } finally {
      setBusy(
        ''
      )
    }
  }


  async function resumePending() {
    if (
      !pending
      || !attempt
      || attempt.state
        !== 'submitting'
      || !canUseWorker
      || !publishSupported
      || busy
    ) {
      return
    }


    setBusy(
      'resume'
    )

    setError(
      ''
    )


    try {
      const result =
        await client()
          .resumeInstagramPublish(
            pending
          )


      if (
        'kind'
        in result
      ) {
        setPending(
          result
        )

        return
      }


      setAttempt(
        succeedPlatformPublishAttempt(
          attempt,
          result
        )
      )

      setPending(
        null
      )

    } catch (
      cause
    ) {
      /*
       * Do not auto-retry and do not silently create a replacement
       * container. Keep the pending ticket so the user decides what to do.
       */
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'publish.instagram.error.resume'
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
              'publish.instagram.eyebrow'
            )}
          </div>

          <h3>
            {t(
              'publish.instagram.heading'
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
              ? 'publish.instagram.connected'
              : credential
                ? 'publish.instagram.notConnected'
                : 'publish.instagram.unknown'
          )}
        </span>
      </div>


      <p>
        {t(
          'publish.instagram.help'
        )}
      </p>


      <div className="note">
        <strong>
          {t(
            'publish.instagram.delivery.heading'
          )}
        </strong>

        <br />

        {t(
          'publish.instagram.delivery.help'
        )}
      </div>


      {!workerConnected
        && (
          <small>
            {t(
              'publish.instagram.workerOffline'
            )}
          </small>
        )}


      {workerConnected
        && !publishSupported
        && (
          <small>
            {t(
              'publish.instagram.publishUnavailable'
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
                void refreshCredential()
            }
          >
            {t(
              busy === 'credentials'
                ? 'publish.instagram.connection.checking'
                : 'publish.instagram.connection.check'
            )}
          </button>


          {!connected
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
                    void startOAuth()
                }
              >
                {t(
                  busy === 'oauth-start'
                    ? 'publish.instagram.oauth.starting'
                    : 'publish.instagram.oauth.start'
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
                  'publish.instagram.disconnect'
                )}
              </button>
            )}
        </div>


        {credential
          && (
            <small>
              {t(
                'publish.instagram.connection.summary',
                {
                  provider:
                    credential.provider,

                  account:
                    credential.accountLabel
                    ?? t(
                      'publish.instagram.account.unknown'
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
                  'publish.instagram.oauth.awaiting'
                )}
              </strong>

              <br />

              {t(
                'publish.instagram.oauth.openHelp'
              )}

              <br />

              <a
                href={
                  oauthSession.authorizationUrl
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(
                  'publish.instagram.oauth.open'
                )}
              </a>


              <label>
                {t(
                  'publish.instagram.oauth.callback'
                )}

                <input
                  value={
                    callbackUrl
                  }
                  disabled={
                    Boolean(
                      busy
                    )
                  }
                  autoComplete="off"
                  placeholder={
                    t(
                      'publish.instagram.oauth.callbackPlaceholder'
                    )
                  }
                  onChange={
                    event =>
                      setCallbackUrl(
                        event.target.value
                      )
                  }
                />
              </label>


              <small>
                {t(
                  'publish.instagram.oauth.callbackHelp'
                )}
              </small>


              <div className="publishDefaultActions">
                <button
                  className="secondaryButton"
                  disabled={
                    !callbackUrl.trim()
                    || Boolean(
                      busy
                    )
                  }
                  onClick={
                    () =>
                      void completeOAuth()
                  }
                >
                  {t(
                    busy === 'oauth-complete'
                      ? 'publish.instagram.oauth.completing'
                      : 'publish.instagram.oauth.complete'
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
                      void refreshOAuthStatus()
                  }
                >
                  {t(
                    busy === 'oauth-status'
                      ? 'publish.instagram.oauth.checking'
                      : 'publish.instagram.oauth.check'
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
                    'publish.instagram.oauth.cancel'
                  )}
                </button>
              </div>
            </div>
          )}


        {oauthSession.state
          === 'connected'
          && oauthSession.account
          && (
            <div className="note">
              <strong>
                {
                  oauthSession.account
                    .accountLabel
                }
              </strong>

              {oauthSession.connectedAt
                && (
                  <>
                    <br />

                    {t(
                      'publish.instagram.oauth.connectedAt',
                      {
                        date:
                          date(
                            oauthSession.connectedAt
                          )
                      }
                    )}
                  </>
                )}
            </div>
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
            || Boolean(
              pending
            )
          }
          onClick={
            () =>
              void loadPackages()
          }
        >
          {t(
            busy === 'packages'
              ? 'publish.instagram.packages.loading'
              : 'publish.instagram.packages.load'
          )}
        </button>


        {packages !== null
          && instagramPackages.length === 0
          && (
            <small>
              {t(
                'publish.instagram.packages.empty'
              )}
            </small>
          )}


        {instagramPackages.length > 0
          && (
            <label>
              {t(
                'publish.instagram.package'
              )}

              <select
                value={
                  selectedPackage?.path
                  ?? ''
                }
                disabled={
                  Boolean(
                    busy
                  )
                  || Boolean(
                    pending
                  )
                }
                onChange={
                  event => {
                    setSelectedPath(
                      event.target.value
                    )

                    clearPublishingState()
                  }
                }
              >
                {instagramPackages.map(
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
                        entry.document.title
                      }
                      {' · Instagram Reel'}
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
                  selectedPackage.path
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
                  || Boolean(
                    pending
                  )
                }
                onClick={
                  () =>
                    void verifyPackage()
                }
              >
                {t(
                  busy === 'integrity'
                    ? 'publish.instagram.integrity.checking'
                    : 'publish.instagram.integrity.check'
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
                  ? 'publish.instagram.integrity.ready'
                  : 'publish.instagram.integrity.blocked',
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
          && !pending
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
                      event.target.checked
                    )
                }
              />

              {' '}

              {t(
                'publish.instagram.confirm'
              )}
            </label>
          )}


        {!pending
          && (
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
                  void publishReel()
              }
            >
              {t(
                busy === 'publish'
                  ? 'publish.instagram.publishing'
                  : 'publish.instagram.publish'
              )}
            </button>
          )}


        {pending
          && (
            <div className="note">
              <strong>
                {t(
                  'publish.instagram.pending.heading'
                )}
              </strong>

              <br />

              {t(
                'publish.instagram.pending.help'
              )}

              <br />

              <small>
                {t(
                  'publish.instagram.pending.created',
                  {
                    date:
                      date(
                        pending.issuedAt
                      )
                  }
                )}
              </small>

              <br />

              <button
                className="primary"
                disabled={
                  Boolean(
                    busy
                  )
                }
                onClick={
                  () =>
                    void resumePending()
                }
              >
                {t(
                  busy === 'resume'
                    ? 'publish.instagram.pending.checking'
                    : 'publish.instagram.pending.check'
                )}
              </button>
            </div>
          )}


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
                && (
                  <>
                    <br />

                    {t(
                      'publish.instagram.result.id',
                      {
                        id:
                          attempt.receipt.remote.id
                      }
                    )}
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
