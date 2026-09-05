export type StorageArea = 'models' | 'projects' | 'assets' | 'cache' | 'temp' | 'renders' | 'archive'

export interface StorageLocation {
  area: StorageArea
  root: string
  available: boolean
  freeBytes?: number
}

export interface StorageSettings {
  locations: Record<StorageArea, string>
  managedFolderName: string
}

export const defaultStorageSettings: StorageSettings = {
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

export interface StorageAdapter {
  status(area: StorageArea): Promise<StorageLocation>
  readText(area: StorageArea, relativePath: string): Promise<string>
  writeText(area: StorageArea, relativePath: string, content: string): Promise<void>
  removeManaged(area: StorageArea, relativePath: string): Promise<void>
  list(area: StorageArea, relativePath?: string): Promise<string[]>
}
