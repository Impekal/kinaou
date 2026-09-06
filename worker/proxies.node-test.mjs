import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProxyArgs, buildThumbnailArgs, buildWaveformArgs, previewMediaType, proxyRelativePath, requireProxyMediaPath, thumbnailRelativePath, waveformRelativePath } from './proxies.mjs'

test('derives deterministic proxy paths only below managed cache', () => {
  assert.equal(proxyRelativePath('KINAOU/Assets/demo.mov'), proxyRelativePath('KINAOU/Assets/demo.mov'))
  assert.match(proxyRelativePath('KINAOU/Assets/demo.mov'), /^KINAOU\/Cache\/Proxies\/[a-f0-9]{24}_960p\.mp4$/)
  assert.throws(() => proxyRelativePath('../demo.mov'))
})

test('builds a bounded H.264 proxy command without a shell', () => {
  const args = buildProxyArgs('/Volumes/Media/KINAOU/Assets/demo.mov', '/Volumes/Media/KINAOU/Cache/Proxies/demo.mp4')
  assert.deepEqual(args.slice(0, 3), ['-y', '-i', '/Volumes/Media/KINAOU/Assets/demo.mov'])
  assert.ok(args.includes("scale='min(960,iw)':-2"))
  assert.equal(args.at(-1), '/Volumes/Media/KINAOU/Cache/Proxies/demo.mp4')
})

test('allows streaming generated proxies but rejects assets and traversal', () => {
  assert.equal(requireProxyMediaPath('KINAOU/Cache/Proxies/demo.mp4'), 'KINAOU/Cache/Proxies/demo.mp4')
  assert.throws(() => requireProxyMediaPath('KINAOU/Assets/demo.mp4'))
  assert.throws(() => requireProxyMediaPath('KINAOU/Cache/Proxies/../secret.mp4'))
})

test('derives and builds managed JPEG thumbnails', () => {
  assert.match(thumbnailRelativePath('KINAOU/Assets/demo.mov'), /^KINAOU\/Cache\/Thumbnails\/[a-f0-9]{24}_poster\.jpg$/)
  const args = buildThumbnailArgs('/Volumes/Media/KINAOU/Assets/demo.mov', '/Volumes/Media/KINAOU/Cache/Thumbnails/demo.jpg')
  assert.ok(args.includes('-frames:v'))
  assert.equal(args.at(-1), '/Volumes/Media/KINAOU/Cache/Thumbnails/demo.jpg')
  assert.equal(previewMediaType('KINAOU/Cache/Thumbnails/demo.jpg'), 'image/jpeg')
  assert.equal(previewMediaType('KINAOU/Cache/Proxies/demo.mp4'), 'video/mp4')
  assert.equal(previewMediaType('KINAOU/Cache/Previews/timeline.mp4'), 'video/mp4')
  assert.throws(() => previewMediaType('KINAOU/Assets/demo.mov'))
})

test('derives and builds managed audio waveform images', () => {
  assert.match(waveformRelativePath('KINAOU/Assets/voice.wav'), /^KINAOU\/Cache\/Waveforms\/[a-f0-9]{24}_waveform\.png$/)
  const args = buildWaveformArgs('/Volumes/Media/KINAOU/Assets/voice.wav', '/Volumes/Media/KINAOU/Cache/Waveforms/voice.png')
  assert.ok(args.includes('aformat=channel_layouts=mono,showwavespic=s=1200x160:colors=8d78ff'))
  assert.equal(previewMediaType('KINAOU/Cache/Waveforms/voice.png'), 'image/png')
})
