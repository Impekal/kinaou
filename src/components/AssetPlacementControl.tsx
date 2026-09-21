import { useMemo, useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { compatibleTracks, placeAssetOnTrack } from '../core/timelinePlacement'
import { useUiLanguage } from './UiLanguageProvider'
import { resolveUiMessage, uiMessageReference } from '../core/uiMessages'

interface AssetPlacementControlProps {
  project: KinaouProject
  asset: KinaouAsset
  onProjectChange: (project: KinaouProject) => void
}

export function AssetPlacementControl({ project, asset, onProjectChange }: AssetPlacementControlProps) {
  const { t, language } = useUiLanguage()
  const tracks = useMemo(() => compatibleTracks(project, asset), [project, asset])
  const [targetId, setTargetId] = useState(() => tracks[0]?.id ?? '')
  const [error, setError] = useState('')
  const effectiveTarget = tracks.some((track) => track.id === targetId) ? targetId : tracks[0]?.id ?? ''
  const selectedTrack = tracks.find((track) => track.id === effectiveTarget)

  if (!tracks.length) return <span className="assetPlacementHint">{t('placement.none')}</span>

  const disabledReason = asset.offline
    ? t('placement.offline')
    : !asset.managed
      ? t('placement.unmanaged')
      : !selectedTrack
        ? t('placement.choose')
        : selectedTrack.locked
          ? t('placement.locked', { name: selectedTrack.name })
          : ''

  function place() {
    setError('')
    try {
      onProjectChange(placeAssetOnTrack(project, asset.id, effectiveTarget))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiMessageReference('recovery.placement'))
    }
  }

  return (
    <div className="assetPlacement">
      <select aria-label={t('placement.track', { name: String(asset.metadata.name ?? asset.id) })} value={effectiveTarget} onChange={(event) => { setTargetId(event.target.value); setError('') }}>
        {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}{track.locked ? ` · ${t('placement.lockedShort')}` : ''}</option>)}
      </select>
      <button className="secondaryButton" disabled={Boolean(disabledReason)} onClick={place}>{t('placement.add')}</button>
      {disabledReason && <small className="assetPlacementHint assetPlacementError">{disabledReason}</small>}
      {!disabledReason && error && <small className="inlineError assetPlacementError" role="alert">{t('placement.failed')}<details><summary>{t('common.details')}</summary>{resolveUiMessage(language, error)}</details></small>}
    </div>
  )
}
