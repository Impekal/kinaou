import path from 'node:path'

export function sanitizeUploadName(value) {
  const decoded = decodeHeaderName(value)
  const base = path.basename(decoded).normalize('NFKC')
  const safe = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 180)
  return safe || 'asset.bin'
}

export function managedUploadPaths(id, originalName) {
  const safeName = sanitizeUploadName(originalName)
  const tempRelativePath = `KINAOU/Temp/Uploads/${id}.part`
  const assetRelativePath = `KINAOU/Assets/${id}_${safeName}`
  return { safeName, tempRelativePath, assetRelativePath }
}

function decodeHeaderName(value) {
  if (typeof value !== 'string' || !value.trim()) return 'asset.bin'
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
