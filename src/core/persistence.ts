import { parseProject, type KinaouProject } from './project'
import { defaultStorageSettings, parseStorageSettings, type StorageSettings } from './storage'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PROJECT_INDEX_KEY = 'kinaou.projects.index.v1'
const PROJECT_PREFIX = 'kinaou.project.v1.'
const STORAGE_KEY = 'kinaou.storage.v1'

function parseIndex(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export class ProjectRepository {
  constructor(private readonly store: KeyValueStore) {}

  save(project: KinaouProject): KinaouProject {
    const parsed = parseProject(project)
    this.store.setItem(`${PROJECT_PREFIX}${parsed.id}`, JSON.stringify(parsed))
    const index = parseIndex(this.store.getItem(PROJECT_INDEX_KEY))
    if (!index.includes(parsed.id)) {
      this.store.setItem(PROJECT_INDEX_KEY, JSON.stringify([...index, parsed.id]))
    }
    return parsed
  }

  load(id: string): KinaouProject | null {
    const raw = this.store.getItem(`${PROJECT_PREFIX}${id}`)
    if (!raw) return null
    try {
      return parseProject(JSON.parse(raw))
    } catch {
      return null
    }
  }

  list(): KinaouProject[] {
    return parseIndex(this.store.getItem(PROJECT_INDEX_KEY))
      .map((id) => this.load(id))
      .filter((project): project is KinaouProject => project !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  remove(id: string): void {
    this.store.removeItem(`${PROJECT_PREFIX}${id}`)
    const next = parseIndex(this.store.getItem(PROJECT_INDEX_KEY)).filter((candidate) => candidate !== id)
    this.store.setItem(PROJECT_INDEX_KEY, JSON.stringify(next))
  }
}

export class StorageSettingsRepository {
  constructor(private readonly store: KeyValueStore) {}

  load(): StorageSettings {
    const raw = this.store.getItem(STORAGE_KEY)
    if (!raw) return defaultStorageSettings
    try {
      return parseStorageSettings(JSON.parse(raw))
    } catch {
      return defaultStorageSettings
    }
  }

  save(settings: StorageSettings): StorageSettings {
    const parsed = parseStorageSettings(settings)
    this.store.setItem(STORAGE_KEY, JSON.stringify(parsed))
    return parsed
  }
}
