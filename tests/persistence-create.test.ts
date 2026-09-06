import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { ProjectRepository, StorageSettingsRepository, type KeyValueStore } from '../src/core/persistence'
import { configureWorkspaceRoot, defaultStorageSettings, parseStorageSettings, storageTarget } from '../src/core/storage'
import { PersistentVersionHistory } from '../src/core/versioning'

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

describe('persistent version history', () => {
  it('persists named snapshots and makes restore reversible', () => {
    const store = new MemoryStore()
    const now = () => new Date('2026-09-06T12:00:00.000Z')
    const history = new PersistentVersionHistory(store, 100, now)
    const original = createProjectFromInput({ title: 'Original', kind: 'idea', content: 'First' }, new Date('2026-09-06T10:00:00.000Z'))
    const target = history.snapshot(original, 'First cut', 'user')
    const changed = { ...original, title: 'Changed', updatedAt: '2026-09-06T11:00:00.000Z' }
    const restored = new PersistentVersionHistory(store, 100, now).restoreReversibly(changed, target.id)
    expect(restored.project.title).toBe('Original')
    expect(restored.project.metadata.restoredFromVersionId).toBe(target.id)
    expect(history.list(original.id)).toHaveLength(2)
    expect(history.list(original.id).at(-1)?.label).toBe('Before restore: First cut')
  })

  it('caps history, ignores corrupt entries and deletes only an exact snapshot', () => {
    const store = new MemoryStore()
    const history = new PersistentVersionHistory(store, 2)
    const project = createProjectFromInput({ title: 'History', kind: 'idea', content: '' })
    history.snapshot(project, 'One'); history.snapshot(project, 'Two'); const third = history.snapshot(project, 'Three')
    expect(history.list(project.id).map((item) => item.label)).toEqual(['Two', 'Three'])
    history.delete(project.id, third.id)
    expect(history.list(project.id).map((item) => item.label)).toEqual(['Two'])
    expect(() => history.delete(project.id, 'missing')).toThrow(/not found/)
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
