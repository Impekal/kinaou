import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProxyArgs, proxyRelativePath, requireProxyMediaPath } from './proxies.mjs'

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
