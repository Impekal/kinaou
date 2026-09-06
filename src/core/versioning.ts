import { parseProject, type KinaouProject } from './project'
import type { KeyValueStore } from './persistence'

export interface ProjectVersion {
  id: string
  createdAt: string
  label: string
  source: 'user' | 'ai' | 'system'
  project: KinaouProject
}

export class VersionHistory {
  private readonly versions: ProjectVersion[] = []

  constructor(private readonly maxEntries = 100) {}

  snapshot(project: KinaouProject, label: string, source: ProjectVersion['source']): ProjectVersion {
    const version: ProjectVersion = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      label,
      source,
      project: structuredClone(project)
    }
    this.versions.push(version)
    if (this.versions.length > this.maxEntries) this.versions.shift()
    return structuredClone(version)
  }

  list(): ProjectVersion[] {
    return structuredClone(this.versions)
  }

  restore(versionId: string): KinaouProject {
    const version = this.versions.find((item) => item.id === versionId)
    if (!version) throw new Error(`Version not found: ${versionId}`)
    return structuredClone(version.project)
  }
}

const VERSION_PREFIX = 'kinaou.versions.v1.'

function parseVersions(raw: string | null, projectId: string): ProjectVersion[] {
  if (!raw) return []
  try {
    const values = JSON.parse(raw)
    if (!Array.isArray(values)) return []
    return values.flatMap((value): ProjectVersion[] => {
      if (!value || typeof value !== 'object') return []
      const candidate = value as Partial<ProjectVersion>
      if (typeof candidate.id !== 'string' || typeof candidate.createdAt !== 'string' || typeof candidate.label !== 'string' || !['user', 'ai', 'system'].includes(String(candidate.source))) return []
      try {
        const project = parseProject(candidate.project)
        return project.id === projectId ? [{ id: candidate.id, createdAt: candidate.createdAt, label: candidate.label, source: candidate.source as ProjectVersion['source'], project }] : []
      } catch { return [] }
    })
  } catch { return [] }
}

export class PersistentVersionHistory {
  constructor(private readonly store: KeyValueStore, private readonly maxEntries = 100, private readonly now: () => Date = () => new Date()) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('Version history size must be positive')
  }

  snapshot(project: KinaouProject, label: string, source: ProjectVersion['source'] = 'user'): ProjectVersion {
    const parsed = parseProject(project)
    const normalizedLabel = label.trim()
    if (!normalizedLabel) throw new Error('Version label is required')
    const version: ProjectVersion = { id: crypto.randomUUID(), createdAt: this.now().toISOString(), label: normalizedLabel.slice(0, 120), source, project: structuredClone(parsed) }
    const versions = [...this.list(parsed.id), version].slice(-this.maxEntries)
    this.write(parsed.id, versions)
    return structuredClone(version)
  }

  list(projectId: string): ProjectVersion[] {
    return structuredClone(parseVersions(this.store.getItem(`${VERSION_PREFIX}${projectId}`), projectId))
  }

  delete(projectId: string, versionId: string): void {
    const versions = this.list(projectId)
    if (!versions.some((version) => version.id === versionId)) throw new Error(`Version not found: ${versionId}`)
    this.write(projectId, versions.filter((version) => version.id !== versionId))
  }

  restoreReversibly(current: KinaouProject, versionId: string): { project: KinaouProject; safetyVersion: ProjectVersion } {
    const versions = this.list(current.id)
    const target = versions.find((version) => version.id === versionId)
    if (!target) throw new Error(`Version not found: ${versionId}`)
    const safetyVersion = this.snapshot(current, `Before restore: ${target.label}`, 'system')
    const project = parseProject({ ...structuredClone(target.project), updatedAt: this.now().toISOString(), metadata: { ...target.project.metadata, restoredFromVersionId: target.id } })
    return { project, safetyVersion }
  }

  private write(projectId: string, versions: ProjectVersion[]): void {
    this.store.setItem(`${VERSION_PREFIX}${projectId}`, JSON.stringify(versions))
  }
}
