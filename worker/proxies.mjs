import crypto from 'node:crypto'

export function proxyRelativePath(sourceRelativePath) {
  if (typeof sourceRelativePath !== 'string' || !sourceRelativePath.startsWith('KINAOU/Assets/')) throw new Error('Proxy source must be inside KINAOU/Assets')
  const id = crypto.createHash('sha256').update(sourceRelativePath).digest('hex').slice(0, 24)
  return `KINAOU/Cache/Proxies/${id}_960p.mp4`
}

export function thumbnailRelativePath(sourceRelativePath) {
  if (typeof sourceRelativePath !== 'string' || !sourceRelativePath.startsWith('KINAOU/Assets/')) throw new Error('Thumbnail source must be inside KINAOU/Assets')
  const id = crypto.createHash('sha256').update(sourceRelativePath).digest('hex').slice(0, 24)
  return `KINAOU/Cache/Thumbnails/${id}_poster.jpg`
}

export function buildProxyArgs(sourceAbsolutePath, outputAbsolutePath) {
  if (!sourceAbsolutePath.startsWith('/') || !outputAbsolutePath.startsWith('/')) throw new Error('Proxy paths must be absolute')
  return ['-y', '-i', sourceAbsolutePath, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale='min(960,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputAbsolutePath]
}

export function requireProxyMediaPath(value) {
  if (typeof value !== 'string' || !value.startsWith('KINAOU/Cache/Proxies/') || !value.endsWith('.mp4') || value.split('/').some((part) => part === '..')) throw new Error('Media streaming is limited to generated video proxies')
  return value
}

export function previewMediaType(value) {
  if (typeof value !== 'string' || value.split('/').some((part) => part === '..')) throw new Error('Invalid preview media path')
  if (value.startsWith('KINAOU/Cache/Proxies/') && value.endsWith('.mp4')) return 'video/mp4'
  if (value.startsWith('KINAOU/Cache/Thumbnails/') && value.endsWith('.jpg')) return 'image/jpeg'
  throw new Error('Media streaming is limited to generated preview assets')
}

export function buildThumbnailArgs(sourceAbsolutePath, outputAbsolutePath) {
  if (!sourceAbsolutePath.startsWith('/') || !outputAbsolutePath.startsWith('/')) throw new Error('Thumbnail paths must be absolute')
  return ['-y', '-ss', '0.000', '-i', sourceAbsolutePath, '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-q:v', '3', outputAbsolutePath]
}
