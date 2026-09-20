import { referenceAssetAvailable, type ReferenceRole } from '../core/generationReferences'
import type { KinaouProject } from '../core/project'

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
  if (!roles.length) return null
  return <fieldset disabled={disabled} className="stack">
    <legend>Required local references</legend>
    <p>Only the selected files are copied to your local ComfyUI input folder (up to 32 MiB each). Copies stay there after a run or cancellation. Review and remove them in ComfyUI when no longer needed. Nothing is uploaded by KINAOU to a cloud service.</p>
    <p>Use a trusted local-only workflow. These inputs do not certify animation or lip sync: the installed workflow must implement it. No model is installed or downloaded here.</p>
    {roles.map((role) => <div key={role} className="stack">
      <label>{role === 'portrait' ? 'Portrait image' : 'Speech recording (your own voice or authorized narration)'}<select value={selected[role] ?? ''} onChange={(event) => onSelect(role, event.target.value)}>
        <option value="">Choose an imported asset</option>
        {project.assets.filter((asset) => referenceAssetAvailable(asset, role)).map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.uri)}</option>)}
      </select></label>
      <label><input type="checkbox" checked={authorized[role] === true} onChange={(event) => onAuthorize(role, event.target.checked)} />{role === 'portrait' ? 'I have permission to use this likeness, or it is my fictional generated identity.' : 'This is my recording, or I have permission to use this voice and recording.'}</label>
    </div>)}
  </fieldset>
}
