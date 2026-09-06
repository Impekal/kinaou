import crypto from 'node:crypto'

export function proxyRelativePath(sourceRelativePath) {
  if (typeof sourceRelativePath !== 'string' || !sourceRelativePath.startsWith('KINAOU/Assets/')) throw new Error('Proxy source must be inside KINAOU/Assets')
  const id = crypto.createHash('sha256').update(sourceRelativePath).digest('hex').slice(0, 24)
  return `KINAOU/Cache/Proxies/${id}_960p.mp4`
}

export function buildProxyArgs(sourceAbsolutePath, outputAbsolutePath) {
  if (!sourceAbsolutePath.startsWith('/') || !outputAbsolutePath.startsWith('/')) throw new Error('Proxy paths must be absolute')
  return ['-y', '-i', sourceAbsolutePath, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale='min(960,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputAbsolutePath]
}

export function requireProxyMediaPath(value) {
  if (typeof value !== 'string' || !value.startsWith('KINAOU/Cache/Proxies/') || !value.endsWith('.mp4') || value.split('/').some((part) => part === '..')) throw new Error('Media streaming is limited to generated video proxies')
  return value
}
