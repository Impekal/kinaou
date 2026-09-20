import type { KinaouAsset, KinaouProject } from './project'
import { presenterAssetAvailable } from './portraitPresenter'

export type ReferenceRole = 'portrait' | 'speech'
export interface GenerationReference { assetId: string; path: string; authorized: true }
export interface ReferenceProvenance { role: ReferenceRole; assetId: string; sourcePath: string; authorized: true; sha256: string }
export type GenerationReferences = Partial<Record<ReferenceRole, GenerationReference>>
const roles = ['portrait', 'speech']
const extensions = { portrait: /\.(png|jpg|jpeg|webp)$/i, speech: /\.(wav|mp3|flac|ogg|m4a)$/i }

export function referenceAssetAvailable(asset: KinaouAsset, role: ReferenceRole): boolean {
  return presenterAssetAvailable(asset) && asset.kind === (role === 'portrait' ? 'image' : 'audio') && extensions[role].test(asset.uri)
}

export function buildGenerationReferences(project: KinaouProject, required: ReferenceRole[], selected: Partial<Record<ReferenceRole, string>>, authorized: Partial<Record<ReferenceRole, boolean>>): GenerationReferences {
  return Object.fromEntries(required.map((role) => {
    const asset = project.assets.find((entry) => entry.id === selected[role])
    if (!asset || !referenceAssetAvailable(asset, role)) throw new Error(`Select an online managed ${role} asset`)
    if (authorized[role] !== true) throw new Error(`Confirm permission to use the ${role}`)
    if (typeof asset.metadata.sizeBytes === 'number' && asset.metadata.sizeBytes > 32 * 1024 * 1024) throw new Error('Reference files must be at most 32 MiB')
    return [role, { assetId: asset.id, path: asset.uri, authorized: true }]
  }))
}

export function parseReferenceRoles(value: unknown): ReferenceRole[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 2 || new Set(value).size !== value.length || value.some((role) => !roles.includes(role))) throw new Error('Invalid reference roles')
  return value as ReferenceRole[]
}

export function parseReferenceProvenance(value: unknown): ReferenceProvenance[] {
  if (!Array.isArray(value) || value.length > 2) throw new Error('Invalid reference provenance')
  const seen = new Set<string>()
  return value.map((entry) => {
    if (!entry || !roles.includes(entry.role) || seen.has(entry.role) || typeof entry.assetId !== 'string' || !entry.assetId.trim() || entry.assetId.length > 200 || entry.authorized !== true || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid reference provenance')
    seen.add(entry.role)
    const source = entry.sourcePath
    if (typeof source !== 'string' || !source.startsWith('KINAOU/Assets/') || /[\\\x00-\x1f]/.test(source) || source.split('/').some((part) => !part || part === '.' || part === '..') || !extensions[entry.role as ReferenceRole].test(source)) throw new Error('Invalid reference provenance path')
    return { role: entry.role, assetId: entry.assetId, sourcePath: source, authorized: true, sha256: entry.sha256 }
  })
}
