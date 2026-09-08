import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWebCaptureCommand, buildWebCaptureProvenance, validateWebCaptureRequest, validateWebCaptureUrl, webCaptureBrowserCandidates, webCapturePaths } from './webcapture.mjs'

const browsers = [
  { id: 'chrome', engine: 'chromium', label: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  { id: 'firefox', engine: 'gecko', label: 'Firefox', path: '/Applications/Firefox.app/Contents/MacOS/firefox' }
]

test('accepts only credential-free http(s) URLs', () => {
  assert.equal(validateWebCaptureUrl(' https://example.org/docs?tab=1 '), 'https://example.org/docs?tab=1')
  assert.throws(() => validateWebCaptureUrl('file:///etc/passwd'), /http or https/)
  assert.throws(() => validateWebCaptureUrl('https://user:secret@example.org'), /credentials/)
  assert.throws(() => validateWebCaptureUrl('not a url'), /valid absolute URL/)
})

test('validates web capture requests against actually available browsers', () => {
  const request = validateWebCaptureRequest({ browserId: 'chrome', url: 'https://example.org' }, browsers)
  assert.deepEqual(request, { browserId: 'chrome', engine: 'chromium', url: 'https://example.org/', width: 1280, height: 800 })
  assert.throws(() => validateWebCaptureRequest({ browserId: 'edge', url: 'https://example.org' }, browsers), /not available/)
  assert.throws(() => validateWebCaptureRequest({ browserId: 'chrome', url: 'https://example.org', width: 100 }, browsers), /Viewport/)
})

test('creates only managed web capture paths and honors env-configured browsers', () => {
  assert.deepEqual(webCapturePaths('web-1'), { image: 'KINAOU/Temp/WebCaptures/web-1.png', profile: 'KINAOU/Temp/WebCaptures/web-1-profile', asset: 'KINAOU/Assets/WebCaptures/web-1.png' })
  assert.throws(() => webCapturePaths('../evil'), /job ID/)
  const candidates = webCaptureBrowserCandidates({ KINAOU_CHROMIUM: '/opt/pw-browsers/chromium', KINAOU_FIREFOX: 'relative/firefox' })
  assert.equal(candidates[0].id, 'custom-chromium')
  assert.ok(!candidates.some((candidate) => candidate.path === 'relative/firefox'))
})

test('builds shell-free headless screenshot commands per engine', () => {
  const request = validateWebCaptureRequest({ browserId: 'chrome', url: 'https://example.org', width: 1440, height: 900 }, browsers)
  const chrome = buildWebCaptureCommand({ browserPath: browsers[0].path, request, targetPath: '/tmp/web.png', profilePath: '/tmp/profile' })
  assert.deepEqual(chrome.args, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/profile', '--window-size=1440,900', '--virtual-time-budget=10000', '--screenshot=/tmp/web.png', 'https://example.org/'])
  const gecko = buildWebCaptureCommand({ browserPath: browsers[1].path, request: { ...request, browserId: 'firefox', engine: 'gecko' }, targetPath: '/tmp/web.png', profilePath: '/tmp/profile' })
  assert.deepEqual(gecko.args, ['--headless', '--no-remote', '-profile', '/tmp/profile', '--window-size=1440,900', '--screenshot=/tmp/web.png', 'https://example.org/'])
  assert.throws(() => buildWebCaptureCommand({ browserPath: 'chrome', request, targetPath: '/tmp/web.png', profilePath: '/tmp/profile' }), /absolute/)
})

test('stamps real-capture web provenance with browser and viewport', () => {
  const request = validateWebCaptureRequest({ browserId: 'chrome', url: 'https://example.org' }, browsers)
  assert.deepEqual(buildWebCaptureProvenance(request, 'Chromium 129.0'), { kind: 'real-capture', adapterId: 'headless-browser', browserId: 'chrome', engine: 'chromium', browserVersion: 'Chromium 129.0', url: 'https://example.org/', width: 1280, height: 800 })
  assert.equal(buildWebCaptureProvenance(request).browserVersion, undefined)
})
