import test from 'node:test'
import assert from 'node:assert/strict'
import { managedUploadPaths, sanitizeUploadName } from './asset-upload.mjs'

test('sanitizes browser-provided filenames without escaping managed storage', () => {
  assert.equal(sanitizeUploadName(encodeURIComponent('../../My: Clip?.mp4')), 'My- Clip-.mp4')
  assert.equal(sanitizeUploadName('...'), 'asset.bin')
})

test('creates temp and final paths exclusively below KINAOU managed folders', () => {
  const paths = managedUploadPaths('abc123', 'demo.mp4')
  assert.equal(paths.tempRelativePath, 'KINAOU/Temp/Uploads/abc123.part')
  assert.equal(paths.assetRelativePath, 'KINAOU/Assets/abc123_demo.mp4')
})
