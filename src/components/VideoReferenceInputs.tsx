import { referenceAssetAvailable, type ReferenceRole } from '../core/generationReferences'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

interface Props {
  project: KinaouProject
  roles: ReferenceRole[]
  selected: Partial<Record<ReferenceRole, string>>
  authorized: Partial<Record<ReferenceRole, boolean>>
  disabled: boolean
  onSelect: (role: ReferenceRole, id: string) => void
  onAuthorize: (role: ReferenceRole, authorized: boolean) => void
}

export function VideoReferenceInputs({ project, roles, selected, authorized, disabled, onSelect, onAuthorize }: Props) {
  const { t } = useUiLanguage()
  if (!roles.length) return null
  return <fieldset disabled={disabled} className="stack">
    <legend>{t('video.references')}</legend>
    <p>{t('video.referenceHelp')}</p>
    <p>{t('video.referenceLimit')}</p>
    {roles.map((role) => <div key={role} className="stack">
      <label>{t(role === 'portrait' ? 'video.portrait' : 'video.speech')}<select value={selected[role] ?? ''} onChange={(event) => onSelect(role, event.target.value)}>
        <option value="">{t('video.chooseReference')}</option>
        {project.assets.filter((asset) => referenceAssetAvailable(asset, role)).map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.uri)}</option>)}
      </select></label>
      <label><input type="checkbox" checked={authorized[role] === true} onChange={(event) => onAuthorize(role, event.target.checked)} />{t(role === 'portrait' ? 'video.portraitPermission' : 'video.speechPermission')}</label>
    </div>)}
  </fieldset>
}
