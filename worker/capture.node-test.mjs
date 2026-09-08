import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAppActivateCommand, buildAppWindowBoundsCommand, buildCaptureCommand, buildCaptureProvenance, captureAssetRelativePath, captureTempRelativePath, parseAppWindowBounds, validateAppName, validateCaptureRequest } from './capture.mjs'

test('validates and bounds capture requests', () => {
  assert.deepEqual(validateCaptureRequest({ kind: 'screenshot' }), { kind: 'screenshot', displayId: 1, delaySeconds: 0, region: null, interactive: false, appName: null })
  assert.deepEqual(validateCaptureRequest({ kind: 'recording', durationMs: 30_000, displayId: 2 }), { kind: 'recording', displayId: 2, delaySeconds: 0, region: null, interactive: false, appName: null, durationMs: 30_000 })
  assert.equal(validateCaptureRequest({ kind: 'screenshot', interactive: true }).interactive, true)
  assert.throws(() => validateCaptureRequest({ kind: 'recording', durationMs: 30_000, interactive: true }), /only supported for screenshots/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', interactive: true, delaySeconds: 3 }), /does not take a delay/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', interactive: true, region: { x: 0, y: 0, width: 100, height: 100 } }), /mutually exclusive/)
  assert.throws(() => validateCaptureRequest({ kind: 'window' }), /screenshot or recording/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', displayId: 0 }), /display/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', delaySeconds: 11 }), /delay/)
  assert.throws(() => validateCaptureRequest({ kind: 'recording', durationMs: 30_000, delaySeconds: 3 }), /only supported for screenshots/)
  assert.throws(() => validateCaptureRequest({ kind: 'recording', durationMs: 500 }), /duration/)
  assert.throws(() => validateCaptureRequest({ kind: 'recording', durationMs: 700_000 }), /duration/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', region: { x: -1, y: 0, width: 100, height: 100 } }), /region/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', region: { x: 0, y: 0, width: 4, height: 100 } }), /region/)
})

test('creates only managed capture paths with safe IDs', () => {
  assert.equal(captureTempRelativePath('cap-1', 'screenshot'), 'KINAOU/Temp/Captures/cap-1.png')
  assert.equal(captureAssetRelativePath('cap-1', 'recording'), 'KINAOU/Assets/Captures/cap-1.mov')
  assert.throws(() => captureTempRelativePath('../evil', 'screenshot'), /job ID/)
  assert.throws(() => captureAssetRelativePath('cap-1', 'gif'), /screenshot or recording/)
})

test('builds shell-free screencapture commands for screenshots and recordings', () => {
  const screenshot = buildCaptureCommand({ request: { kind: 'screenshot', displayId: 2, delaySeconds: 5 }, targetPath: '/Volumes/SSD/KINAOU/Temp/Captures/cap-1.png' })
  assert.equal(screenshot.executable, '/usr/sbin/screencapture')
  assert.deepEqual(screenshot.args, ['-x', '-t', 'png', '-T', '5', '-D', '2', '/Volumes/SSD/KINAOU/Temp/Captures/cap-1.png'])
  const region = buildCaptureCommand({ request: { kind: 'screenshot', region: { x: 10, y: 20, width: 800, height: 600 } }, targetPath: '/tmp/cap.png' })
  assert.deepEqual(region.args, ['-x', '-t', 'png', '-R', '10,20,800,600', '/tmp/cap.png'])
  const recording = buildCaptureCommand({ request: { kind: 'recording', durationMs: 90_000 }, targetPath: '/tmp/cap.mov' })
  assert.deepEqual(recording.args, ['-x', '-v', '-V', '90', '-D', '1', '/tmp/cap.mov'])
  const interactive = buildCaptureCommand({ request: { kind: 'screenshot', interactive: true }, targetPath: '/tmp/cap.png' })
  assert.deepEqual(interactive.args, ['-x', '-t', 'png', '-i', '/tmp/cap.png'])
  assert.throws(() => buildCaptureCommand({ request: { kind: 'screenshot' }, targetPath: 'relative.png' }), /absolute/)
  assert.throws(() => buildCaptureCommand({ screencapturePath: 'screencapture', request: { kind: 'screenshot' }, targetPath: '/tmp/cap.png' }), /absolute/)
})

test('stamps real-capture provenance distinct from generated visuals', () => {
  const provenance = buildCaptureProvenance({ kind: 'recording', durationMs: 30_000, region: { x: 0, y: 0, width: 1280, height: 720 } })
  assert.deepEqual(provenance, { kind: 'real-capture', adapterId: 'macos-screencapture', displayId: 1, delaySeconds: 0, region: { x: 0, y: 0, width: 1280, height: 720 }, interactive: false, appName: null, requestedDurationMs: 30_000 })
  assert.equal(buildCaptureProvenance({ kind: 'screenshot' }).requestedDurationMs, null)
  assert.equal(buildCaptureProvenance({ kind: 'screenshot', interactive: true }).interactive, true)
  assert.equal(buildCaptureProvenance({ kind: 'screenshot', appName: ' Firefox ' }).appName, 'Firefox')
})

test('validates app names and app capture exclusivity', () => {
  assert.equal(validateAppName('Google Chrome'), 'Google Chrome')
  assert.throws(() => validateAppName('bad"name'), /quotes/)
  assert.throws(() => validateAppName('-leading'), /alphanumeric/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', appName: 'Firefox', interactive: true }), /mutually exclusive/)
  assert.throws(() => validateCaptureRequest({ kind: 'screenshot', appName: 'Firefox', region: { x: 0, y: 0, width: 100, height: 100 } }), /mutually exclusive/)
  assert.equal(validateCaptureRequest({ kind: 'recording', appName: 'Firefox', durationMs: 30_000 }).appName, 'Firefox')
})

test('builds injection-free osascript commands passing the app name as argv', () => {
  const activate = buildAppActivateCommand('My "Evil\' App'.replace(/["']/g, ''))
  assert.equal(activate.executable, '/usr/bin/osascript')
  assert.equal(activate.args.at(-1), 'My Evil App')
  assert.ok(activate.args.includes('tell application (item 1 of argv) to activate'))
  const bounds = buildAppWindowBoundsCommand('Firefox')
  assert.equal(bounds.args.at(-1), 'Firefox')
  assert.ok(bounds.args.some((arg) => arg.includes('first process whose name is (item 1 of argv)')))
  assert.ok(!bounds.args.some((arg) => arg.includes('Firefox') && arg !== 'Firefox'))
})

test('parses and bounds resolved app window regions including negative coordinates', () => {
  assert.deepEqual(parseAppWindowBounds('-1440,22,1440,878\n'), { x: -1440, y: 22, width: 1440, height: 878 })
  assert.throws(() => parseAppWindowBounds('garbage'), /window position/)
  assert.throws(() => parseAppWindowBounds('0,0,4,4'), /out of range/)
  const command = buildCaptureCommand({ request: { kind: 'screenshot', appName: 'Firefox' }, targetPath: '/tmp/app.png', resolvedRegion: parseAppWindowBounds('-1440,22,1440,878') })
  assert.deepEqual(command.args, ['-x', '-t', 'png', '-R', '-1440,22,1440,878', '/tmp/app.png'])
  assert.throws(() => buildCaptureCommand({ request: { kind: 'screenshot', appName: 'Firefox' }, targetPath: '/tmp/app.png' }), /resolved window bounds/)
})
