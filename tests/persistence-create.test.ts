import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { ProjectRepository, StorageSettingsRepository, type KeyValueStore } from '../src/core/persistence'
import { configureWorkspaceRoot, defaultStorageSettings, parseStorageSettings, storageTarget } from '../src/core/storage'

class MemoryStore implements KeyValueStore {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('create flow', () => {
  it('turns an idea into a persistent-ready project skeleton without pretending AI ran', () => {
    const project = createProjectFromInput({ title: '  Zanzibar film  ', kind: 'idea', content: 'Trace the port city across time.' }, new Date('2026-09-06T00:00:00.000Z'))
    expect(project.title).toBe('Zanzibar film')
    expect(project.tracks.map((track) => track.type)).toEqual(['video', 'voice', 'music', 'caption'])
    expect(project.storyboard[0].description).toBe('Trace the port city across time.')
    expect(project.metadata.sourceInput).toEqual({ kind: 'idea', content: 'Trace the port city across time.' })
  })
})

describe('project persistence', () => {
  it('saves, reloads and lists projects using the storage contract', () => {
    const repository = new ProjectRepository(new MemoryStore())
    const first = createProjectFromInput({ title: 'First', kind: 'idea', content: 'A' })
    const second = createProjectFromInput({ title: 'Second', kind: 'url', content: 'https://example.com' })
    repository.save(first)
    repository.save(second)

    expect(repository.load(first.id)?.title).toBe('First')
    expect(repository.list()).toHaveLength(2)
  })

  it('removes only the selected project record from its own index', () => {
    const repository = new ProjectRepository(new MemoryStore())
    const project = createProjectFromInput({ title: 'Disposable', kind: 'idea', content: '' })
    repository.save(project)
    repository.remove(project.id)
    expect(repository.load(project.id)).toBeNull()
    expect(repository.list()).toEqual([])
  })
})

describe('storage profile persistence', () => {
  it('persists an external SSD profile without widening the managed KINAOU boundary', () => {
    const store = new MemoryStore()
    const repository = new StorageSettingsRepository(store)
    const external = configureWorkspaceRoot(defaultStorageSettings, '/Volumes/KINAOU-SSD', 'desktop-worker')
    repository.save(external)

    const loaded = repository.load()
    expect(loaded.backend).toBe('desktop-worker')
    expect(storageTarget(loaded, 'models')).toBe('/Volumes/KINAOU-SSD/KINAOU/Models')
    expect(storageTarget(loaded, 'projects')).toBe('/Volumes/KINAOU-SSD/KINAOU/Projects')
  })

  it('rejects a storage configuration that points a managed area outside KINAOU', () => {
    expect(() => parseStorageSettings({
      ...defaultStorageSettings,
      locations: { ...defaultStorageSettings.locations, projects: 'Documents' }
    })).toThrow(/outside managed KINAOU directory/)
  })

  it('falls back to safe defaults when persisted settings are corrupt', () => {
    const store = new MemoryStore()
    store.setItem('kinaou.storage.v1', '{broken json')
    const loaded = new StorageSettingsRepository(store).load()
    expect(loaded).toEqual(defaultStorageSettings)
  })
})
