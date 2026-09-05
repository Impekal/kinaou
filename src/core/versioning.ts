import type { KinaouProject } from './project'

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
