import { z } from 'zod'

export type StorageArea = 'models' | 'projects' | 'assets' | 'cache' | 'temp' | 'renders' | 'archive'
export type StorageBackend = 'browser' | 'desktop-worker'

export interface StorageLocation {
  area: StorageArea
  root: string
  available: boolean
  freeBytes?: number
}

export interface StorageSettings {
  backend: StorageBackend
  workspaceRoot: string
  locations: Record<StorageArea, string>
  managedFolderName: string
}

const storageAreas: StorageArea[] = ['models', 'projects', 'assets', 'cache', 'temp', 'renders', 'archive']

export const defaultStorageSettings: StorageSettings = {
  backend: 'browser',
  workspaceRoot: '',
  managedFolderName: 'KINAOU',
  locations: {
    models: 'KINAOU/Models',
    projects: 'KINAOU/Projects',
    assets: 'KINAOU/Assets',
    cache: 'KINAOU/Cache',
    temp: 'KINAOU/Temp',
    renders: 'KINAOU/Renders',
    archive: 'KINAOU/Archive'
  }
}

const storageSettingsSchema = z.object({
  backend: z.enum(['browser', 'desktop-worker']),
  workspaceRoot: z.string(),
  managedFolderName: z.string().min(1),
  locations: z.object({
    models: z.string().min(1),
    projects: z.string().min(1),
    assets: z.string().min(1),
    cache: z.string().min(1),
    temp: z.string().min(1),
    renders: z.string().min(1),
    archive: z.string().min(1)
  })
})

export function normalizeRelativePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
}

export function isSafeManagedPath(path: string, managedFolderName = 'KINAOU'): boolean {
  const normalized = normalizeRelativePath(path)
  const root = `${managedFolderName}/`
  return normalized === managedFolderName || normalized.startsWith(root)
}

export function assertSafeManagedPath(path: string, managedFolderName = 'KINAOU'): string {
  const normalized = normalizeRelativePath(path)
  if (!isSafeManagedPath(normalized, managedFolderName)) {
    throw new Error(`Refusing storage operation outside managed ${managedFolderName} directory`)
  }
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error('Refusing path traversal outside managed storage')
  }
  return normalized
}

export function parseStorageSettings(value: unknown): StorageSettings {
  const parsed = storageSettingsSchema.parse(value)
  for (const area of storageAreas) assertSafeManagedPath(parsed.locations[area], parsed.managedFolderName)
  return parsed
}

export function configureWorkspaceRoot(settings: StorageSettings, workspaceRoot: string, backend: StorageBackend): StorageSettings {
  return parseStorageSettings({ ...settings, workspaceRoot: workspaceRoot.trim(), backend })
}

export function storageTarget(settings: StorageSettings, area: StorageArea): string {
  const relative = assertSafeManagedPath(settings.locations[area], settings.managedFolderName)
  const root = settings.workspaceRoot.trim().replace(/[\\/]+$/, '')
  return root ? `${root}/${relative}` : relative
}

export interface StorageAdapter {
  status(area: StorageArea): Promise<StorageLocation>
  readText(area: StorageArea, relativePath: string): Promise<string>
  writeText(area: StorageArea, relativePath: string, content: string): Promise<void>
  removeManaged(area: StorageArea, relativePath: string): Promise<void>
  list(area: StorageArea, relativePath?: string): Promise<string[]>
}
