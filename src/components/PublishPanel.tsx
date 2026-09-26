import { useEffect, useMemo, useState } from 'react'
import { projectExportHistory } from '../core/exportHistory'
import { buildPublishPackageRequest, clearProjectPublishDefaults, parsePublishTags, projectPublishDefaults, publishPreflightMatchesReceipt, saveProjectPublishDefaults, type PublishIntegrityResult, type PublishPackageEntry, type PublishPackageResult, type PublishPreflightResult, type PublishTarget } from '../core/publishPackage'
import type { KinaouProject } from '../core/project'
import type { TargetFormat } from '../core/render'
import {
  defaultPublishPlacementForPlatform,
  publishPlacementProfiles,
  reviewPublishPlacement,
  type PublishPlacement
} from '../core/publishProfiles'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
import { displayExportReceiptLabel } from '../core/uiSystemLabels'

interface PublishPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}

export const publishTargetKeys = {
  youtube: 'publish.platform.youtube',
  instagram: 'publish.platform.instagram',
  tiktok: 'publish.platform.tiktok',
  generic: 'publish.platform.generic'
} as const

export const publishPlacementKeys = {
  'youtube-video': 'publish.placement.youtube-video',
  'youtube-short': 'publish.placement.youtube-short',
  'instagram-reel': 'publish.placement.instagram-reel',
  'instagram-feed': 'publish.placement.instagram-feed',
  'tiktok-video': 'publish.placement.tiktok-video',
  generic: 'publish.placement.generic'
} as const

export const publishPlacementIssueKeys = {
  format: 'publish.placement.issue.format',
  'duration-minimum': 'publish.placement.issue.duration-minimum',
  'duration-maximum': 'publish.placement.issue.duration-maximum',
  'title-required': 'publish.placement.issue.title-required',
  'title-length': 'publish.placement.issue.title-length',
  'description-length': 'publish.placement.issue.description-length',
  'tag-count': 'publish.placement.issue.tag-count',
  'tag-length': 'publish.placement.issue.tag-length'
} as const

export const publishFormatKeys = {
  landscape: 'publish.format.landscape',
  vertical: 'publish.format.vertical',
  square: 'publish.format.square'
} as const

export const publishIntegrityKeys = {
  unchanged: 'publish.integrity.unchanged',
  modified: 'publish.integrity.modified',
  missing: 'publish.integrity.missing',
  unverifiable: 'publish.integrity.unverifiable'
} as const

const preflightCheckKeys = {
  size: 'publish.preflight.check.size',
  videoStream: 'publish.preflight.check.video',
  dimensions: 'publish.preflight.check.dimensions'
} as const

export function PublishPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: PublishPanelProps) {
  const { t, language } = useUiLanguage()
  const receipts = useMemo(() => projectExportHistory(project), [project])
  const savedDefaults = projectPublishDefaults(project)
  const [selectedJobId, setSelectedJobId] = useState(() => receipts[0]?.jobId ?? '')
  const [platform, setPlatform] = useState<PublishTarget>(() => savedDefaults?.platform ?? 'youtube')
  const [placement, setPlacement] = useState<PublishPlacement>(() =>
    defaultPublishPlacementForPlatform(
      savedDefaults?.platform ?? 'youtube',
      receipts[0]?.format
    )
  )
  const [title, setTitle] = useState(() => savedDefaults?.title ?? project.title)
  const [description, setDescription] = useState(() => savedDefaults?.description ?? '')
  const [tags, setTags] = useState(() => savedDefaults?.tags.join(', ') ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PublishPackageResult | null>(null)
  const [preflight, setPreflight] = useState<PublishPreflightResult | null>(null)
  const [preflightBusy, setPreflightBusy] = useState(false)
  const [error, setError] = useState('')
  const [packages, setPackages] = useState<PublishPackageEntry[] | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState('')
  const [libraryMessage, setLibraryMessage] = useState('')
  const [integrityByPath, setIntegrityByPath] = useState<Record<string, PublishIntegrityResult>>({})
  const [integrityBusyPath, setIntegrityBusyPath] = useState('')
  const [defaultsMessage, setDefaultsMessage] = useState('')
  const selected = receipts.find((receipt) => receipt.jobId === selectedJobId) ?? receipts[0]
  const packageSupported = workerCapabilities.includes('publish-package')
  const preflightSupported = workerCapabilities.includes('publish-preflight')
  const librarySupported = workerCapabilities.includes('publish-package-library')
  const integritySupported = workerCapabilities.includes('publish-package-integrity')
  const currentPreflight = publishPreflightMatchesReceipt(preflight, selected) ? preflight : null
  const operationBusy = busy || preflightBusy || Boolean(integrityBusyPath)

  const placementChoices =
    Object.values(
      publishPlacementProfiles
    ).filter(
      profile =>
        profile.platform
        === platform
    )

  const placementReviewState = (() => {
    if (!selected) {
      return {
        review: null,
        error: ''
      }
    }

    try {
      return {
        review:
          reviewPublishPlacement(
            selected,
            placement,
            {
              title,
              description,
              tags:
                parsePublishTags(
                  tags
                )
            }
          ),

        error:
          ''
      }
    } catch (cause) {
      return {
        review:
          null,

        error:
          cause instanceof Error
            ? cause.message
            : String(cause)
      }
    }
  })()

  const date = (value: string) => new Date(value).toLocaleString(language)
  const platformLabel = (value: PublishTarget) => t(publishTargetKeys[value])
  const placementLabel = (value: PublishPlacement) => t(publishPlacementKeys[value])
  const formatLabel = (value: TargetFormat) => t(publishFormatKeys[value])

  useEffect(() => {
    const defaults = projectPublishDefaults(project)
    setSelectedJobId(receipts[0]?.jobId ?? '')

    const defaultPlatform =
      defaults?.platform
      ?? 'youtube'

    setPlatform(
      defaultPlatform
    )

    setPlacement(
      defaultPublishPlacementForPlatform(
        defaultPlatform,
        receipts[0]?.format
      )
    )

    setTitle(defaults?.title ?? project.title)
    setDescription(defaults?.description ?? '')
    setTags(defaults?.tags.join(', ') ?? '')
    setResult(null)
    setPreflight(null)
    setPreflightBusy(false)
    setError('')
    setPackages(null)
    setListError('')
    setLibraryMessage('')
    setIntegrityByPath({})
    setIntegrityBusyPath('')
    setDefaultsMessage('')
  }, [project.id])

  useEffect(() => {
    setPreflight(null)
    setResult(null)
    setError('')
  }, [selected?.jobId, selected?.outputRelativePath])

  function useSavedDefaults() {
    if (!savedDefaults) return
    setPlatform(savedDefaults.platform)

    setPlacement(
      defaultPublishPlacementForPlatform(
        savedDefaults.platform,
        selected?.format
      )
    )

    setTitle(savedDefaults.title)
    setDescription(savedDefaults.description)
    setTags(savedDefaults.tags.join(', '))
    setResult(null)
    setError('')
    setDefaultsMessage(t('publish.defaults.loaded'))
  }

  function saveDefaults() {
    try {
      const next = saveProjectPublishDefaults(project, { platform, title, description, tags })
      onProjectChange(next)
      setError('')
      setDefaultsMessage(t(next === project ? 'publish.defaults.already' : 'publish.defaults.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('publish.error.defaults'))
    }
  }

  function clearDefaults() {
    const next = clearProjectPublishDefaults(project)
    onProjectChange(next)
    setDefaultsMessage(t('publish.defaults.cleared'))
  }

  async function refreshPackages(client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })) {
    if (!workerConnected || !librarySupported || !workerToken.trim() || listBusy || integrityBusyPath) return
    setListBusy(true)
    setListError('')
    try {
      setPackages(await client.listPublishPackages(project.id))
      setIntegrityByPath({})
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : t('publish.error.library'))
    } finally {
      setListBusy(false)
    }
  }

  async function createPackage() {
    if (!selected || !placementReviewState.review?.ready || !workerConnected || !packageSupported || !preflightSupported || !integritySupported || !currentPreflight?.ready || operationBusy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const request = buildPublishPackageRequest(project, selected, {
        platform,
        placement,
        title,
        description,
        tags
      })
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      setResult(await client.createPublishPackage(request))
      await refreshPackages(client)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('publish.error.create'))
    } finally {
      setBusy(false)
    }
  }

  async function checkPreflight() {
    if (!selected || !workerConnected || !preflightSupported || !workerToken.trim() || operationBusy) return
    setPreflightBusy(true)
    setPreflight(null)
    setResult(null)
    setError('')
    try {
      setPreflight(await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).preflightPublishExport(selected))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('publish.error.preflight'))
    } finally {
      setPreflightBusy(false)
    }
  }

  function openPackage(entry: PublishPackageEntry) {
    const document = entry.document
    const matchingReceipt = receipts.find((receipt) => receipt.jobId === document.media.jobId && receipt.outputRelativePath === document.media.outputRelativePath)
    if (matchingReceipt) setSelectedJobId(matchingReceipt.jobId)
    setPlatform(document.platform)

    setPlacement(
      document.schemaVersion === 3
        ? document.placement
        : defaultPublishPlacementForPlatform(
            document.platform,
            document.media.format
          )
    )

    setTitle(document.title)
    setDescription(document.description)
    setTags(document.tags.join(', '))
    setResult(null)
    setError('')
    setLibraryMessage(t(matchingReceipt ? 'publish.library.openedMatched' : 'publish.library.openedUnmatched', { path: entry.path }))
  }

  async function verifyPackage(entry: PublishPackageEntry) {
    if (!workerConnected || !integritySupported || integrityBusyPath || entry.document.schemaVersion === 1) return
    setIntegrityBusyPath(entry.path)
    setListError('')
    try {
      const verification = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).verifyPublishPackageIntegrity(entry.path)
      setIntegrityByPath((current) => ({ ...current, [entry.path]: verification }))
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : t('publish.error.integrity'))
    } finally {
      setIntegrityBusyPath('')
    }
  }

  const preflightActualDimensions = currentPreflight?.actual.width && currentPreflight.actual.height
    ? `${currentPreflight.actual.width}×${currentPreflight.actual.height}`
    : t('publish.preflight.noDimensions')
  const preflightActualDuration = currentPreflight?.actual.durationMs === undefined
    ? t('publish.preflight.unknownDuration')
    : `${(currentPreflight.actual.durationMs / 1000).toFixed(3)} s`
  const preflightVideoCodec = currentPreflight?.actual.videoCodec ?? t('publish.preflight.noVideo')
  const preflightAudioCodec = currentPreflight?.actual.audioCodec
    ? t('publish.preflight.audio', { codec: currentPreflight.actual.audioCodec })
    : t('publish.preflight.noAudio')

  return (
    <section className="stack">
      <div className="sectionLead"><div><div className="eyebrow">{t('publish.eyebrow')}</div><h2>{t('publish.heading')}</h2></div><span className={packageSupported && preflightSupported && integritySupported ? 'status online' : 'status'}>{t(packageSupported && preflightSupported && integritySupported ? 'publish.status.ready' : workerConnected ? 'publish.status.restart' : 'publish.status.offline')}</span></div>
      <div className="card settingsPanel">
        <div>
          <h3>{t('publish.card.heading')}</h3>
          <p>{t('publish.card.help')}</p>
          {selected && <div className="note"><strong>{displayExportReceiptLabel(selected, t)}</strong><br />{formatLabel(selected.format)} · {(selected.durationMs / 1000).toFixed(1)} s<br /><code>{selected.outputRelativePath}</code></div>}
        </div>
        <div className="formStack">
          <label>{t('publish.export')}<select value={selected?.jobId ?? ''} disabled={!receipts.length || operationBusy} onChange={(event) => { setSelectedJobId(event.target.value); setResult(null); setPreflight(null) }}>
            {!receipts.length && <option value="">{t('publish.export.empty')}</option>}
            {receipts.map((receipt) => <option key={receipt.jobId} value={receipt.jobId}>{displayExportReceiptLabel(receipt, t)} · {formatLabel(receipt.format)} · {date(receipt.completedAt)}</option>)}
          </select></label>
          <label>{t('publish.destination')}<select value={platform} disabled={operationBusy} onChange={(event) => {
            const nextPlatform = event.target.value as PublishTarget
            setPlatform(nextPlatform)
            setPlacement(defaultPublishPlacementForPlatform(nextPlatform, selected?.format))
            setResult(null)
          }}>
            {(Object.keys(publishTargetKeys) as PublishTarget[]).map((target) => <option key={target} value={target}>{platformLabel(target)}</option>)}
          </select></label>

          <label>{t('publish.placement')}<select value={placement} disabled={operationBusy} onChange={(event) => {
            setPlacement(event.target.value as PublishPlacement)
            setResult(null)
          }}>
            {placementChoices.map((profile) => <option key={profile.id} value={profile.id}>{placementLabel(profile.id)}</option>)}
          </select></label>

          <small>{t('publish.placement.help')}</small>
          <label>{t('publish.title')}<input maxLength={200} value={title} disabled={operationBusy} onChange={(event) => { setTitle(event.target.value); setResult(null) }} /></label>
          <label>{t('publish.description')}<textarea maxLength={5000} value={description} disabled={operationBusy} onChange={(event) => { setDescription(event.target.value); setResult(null) }} /></label>
          <label>{t('publish.tags')}<input value={tags} disabled={operationBusy} placeholder={t('publish.tags.placeholder')} onChange={(event) => { setTags(event.target.value); setResult(null) }} /></label>
          <div className="publishDefaultActions"><button className="secondaryButton" disabled={operationBusy || !title.trim()} onClick={saveDefaults}>{t('publish.defaults.save')}</button>{savedDefaults && <><button className="secondaryButton" disabled={operationBusy} onClick={useSavedDefaults}>{t('publish.defaults.use')}</button><button className="secondaryButton" disabled={operationBusy} onClick={clearDefaults}>{t('publish.defaults.clear')}</button></>}</div>
          {savedDefaults && <small>{t('publish.defaults.summary', { platform: platformLabel(savedDefaults.platform), date: date(savedDefaults.updatedAt) })}</small>}
          {defaultsMessage && <div className="note">{defaultsMessage}</div>}
          <button className="secondaryButton" disabled={!selected || !workerConnected || !preflightSupported || !workerToken.trim() || operationBusy} onClick={checkPreflight}>{t(preflightBusy ? 'publish.preflight.inspecting' : currentPreflight ? 'publish.preflight.refresh' : 'publish.preflight.check')}</button>
          <button className="primary" disabled={!selected || !placementReviewState.review?.ready || !workerConnected || !packageSupported || !preflightSupported || !integritySupported || !currentPreflight?.ready || !workerToken.trim() || !title.trim() || operationBusy} onClick={createPackage}>{t(busy ? 'publish.package.writing' : 'publish.package.create')}</button>
          {!workerConnected && <small>{t('publish.connect')}</small>}
          {workerConnected && (!packageSupported || !preflightSupported || !integritySupported) && <small>{t('publish.capability')}</small>}
          {!receipts.length && <small>{t('publish.noExports')}</small>}
        </div>
      </div>

      {selected && <div className="card availabilityPanel">
        <div className="sectionLead">
          <div>
            <div className="eyebrow">{t('publish.placement.review.eyebrow')}</div>
            <h3>{placementLabel(placement)}</h3>
          </div>

          <span className={placementReviewState.review?.ready ? 'status online' : 'status missing'}>
            {t(placementReviewState.review?.ready ? 'publish.preflight.ready' : 'publish.preflight.blocked')}
          </span>
        </div>

        <p>
          {t(
            placementReviewState.review?.ready
              ? 'publish.placement.review.ready'
              : 'publish.placement.review.blocked'
          )}
        </p>

        {placementReviewState.review && <small>
          {t('publish.placement.review.preferred', {
            format: formatLabel(placementReviewState.review.preferredFormat)
          })}
        </small>}

        {placementReviewState.error && <div className="warning">
          {t('publish.placement.review.metadataInvalid', {
            message: placementReviewState.error
          })}
        </div>}

        {placementReviewState.review && placementReviewState.review.issues.length > 0 && <div className="publishPreflightChecks">
          {placementReviewState.review.issues.map((issue) =>
            <span className="badge offline" key={issue.code}>
              {t(publishPlacementIssueKeys[issue.code])}
            </span>
          )}
        </div>}
      </div>}

      {currentPreflight && <div className="card availabilityPanel">
        <div className="sectionLead"><div><div className="eyebrow">{t('publish.preflight.eyebrow')}</div><h3>{t(currentPreflight.ready ? 'publish.preflight.match' : 'publish.preflight.mismatch')}</h3></div><span className={currentPreflight.ready ? 'status online' : 'status missing'}>{t(currentPreflight.ready ? 'publish.preflight.ready' : 'publish.preflight.blocked')}</span></div>
        <p>{t('publish.preflight.summary', {
          expectedWidth: currentPreflight.expected.width,
          expectedHeight: currentPreflight.expected.height,
          expectedDuration: (currentPreflight.expected.durationMs / 1000).toFixed(3),
          actualDimensions: preflightActualDimensions,
          actualDuration: preflightActualDuration,
          videoCodec: preflightVideoCodec,
          audioCodec: preflightAudioCodec
        })}</p>
        <div className="publishPreflightChecks">
          {(['size', 'videoStream', 'dimensions', 'duration'] as const).map((id) => {
            const label = id === 'duration'
              ? t('publish.preflight.check.duration', { tolerance: currentPreflight.durationToleranceMs })
              : t(preflightCheckKeys[id])
            return <span className={currentPreflight.checks[id] ? 'badge' : 'badge offline'} key={id}>{t(currentPreflight.checks[id] ? 'publish.preflight.pass' : 'publish.preflight.fail')} · {label}</span>
          })}
        </div>
        <small>{t('publish.preflight.checked', { date: date(currentPreflight.checkedAt), size: (currentPreflight.actual.sizeBytes / 1024 / 1024).toFixed(1) })}</small>
      </div>}

      {result && <div className="card availabilityPanel"><div className="eyebrow">{t('publish.result.eyebrow')}</div><h3>{t('publish.result.heading', { platform: result.schemaVersion === 3 ? placementLabel(result.placement) : platformLabel(result.platform) })}</h3><p>{t('publish.result.help')}</p><code>{result.path}</code><small>{t('publish.result.meta', { bytes: result.sizeBytes, sha: result.sourceSha256.slice(0, 12), date: date(result.createdAt) })}</small></div>}

      {error && <div className="card errorBox">{error}</div>}

      <div className="card publishLibrary">
        <div className="sectionLead"><div><div className="eyebrow">{t('publish.library.eyebrow')}</div><h3>{t('publish.library.heading')}</h3></div><button className="secondaryButton" disabled={!workerConnected || !librarySupported || !workerToken.trim() || listBusy || Boolean(integrityBusyPath)} onClick={() => void refreshPackages()}>{t(listBusy ? 'publish.library.checking' : 'publish.library.refresh')}</button></div>
        <p>{t('publish.library.help')}</p>
        {workerConnected && !librarySupported && <small>{t('publish.library.restart')}</small>}
        {libraryMessage && <div className="note">{libraryMessage}</div>}
        {packages === null && !listError && <small>{t('publish.library.initial')}</small>}
        {packages?.length === 0 && <small>{t('publish.library.empty')}</small>}
        {packages && packages.length > 0 && <div className="publishPackageList">{packages.map((entry) => {
          const verification = integrityByPath[entry.path]
          const integrityLabel = entry.document.schemaVersion === 1
            ? t('publish.integrity.legacy')
            : verification
              ? t(publishIntegrityKeys[verification.status])
              : t('publish.integrity.notVerified')
          const integrityGood = verification?.status === 'unchanged'
          const checkedLabel = verification
            ? verification.actualSha256
              ? t('publish.integrity.checkedSha', { date: date(verification.checkedAt), sha: verification.actualSha256.slice(0, 12) })
              : t('publish.integrity.checked', { date: date(verification.checkedAt) })
            : ''
          const destinationLabel =
            entry.document.schemaVersion === 3
              ? placementLabel(entry.document.placement)
              : platformLabel(entry.document.platform)

          return <div className="publishPackageRow" key={entry.path}>
            <div><strong>{entry.document.title}</strong><small>{destinationLabel} · {formatLabel(entry.document.media.format)} · {date(entry.document.createdAt)}</small><code>{entry.path}</code>{verification && <small>{checkedLabel}</small>}</div>
            <div className="publishPackageActions"><span className={entry.sourceAvailable ? 'badge' : 'badge offline'}>{t(entry.sourceAvailable ? 'publish.source.available' : 'publish.source.missing')}</span><span className={integrityGood ? 'badge' : 'badge offline'}>{integrityLabel}</span>{entry.document.schemaVersion !== 1 && <button className="secondaryButton" disabled={busy || listBusy || !integritySupported || Boolean(integrityBusyPath)} onClick={() => void verifyPackage(entry)}>{t(integrityBusyPath === entry.path ? 'publish.integrity.hashing' : 'publish.integrity.verify')}</button>}<button className="secondaryButton" disabled={busy || listBusy} onClick={() => openPackage(entry)}>{t('publish.library.openMetadata')}</button></div>
          </div>
        })}</div>}
        {listError && <div className="errorBox">{listError}</div>}
      </div>
    </section>
  )
}
