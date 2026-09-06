export interface AssetUploadResult {
  managedPath: string
  name: string
  sizeBytes: number
}

export function parseAssetUploadResult(value: unknown): AssetUploadResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid asset upload response')
  const result = value as Partial<AssetUploadResult>
  if (typeof result.managedPath !== 'string' || !result.managedPath.startsWith('KINAOU/Assets/')) throw new Error('Uploaded asset path is invalid')
  if (typeof result.name !== 'string' || !result.name.trim()) throw new Error('Uploaded asset name is missing')
  if (typeof result.sizeBytes !== 'number' || !Number.isFinite(result.sizeBytes) || result.sizeBytes < 0) throw new Error('Uploaded asset size is invalid')
  return result as AssetUploadResult
}
