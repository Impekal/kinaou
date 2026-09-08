import path from 'node:path'

const MAX_URL_LENGTH = 2000

export const DEFAULT_BROWSER_CANDIDATES = [
  { id: 'chrome', engine: 'chromium', label: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  { id: 'chromium', engine: 'chromium', label: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
  { id: 'firefox', engine: 'gecko', label: 'Firefox', path: '/Applications/Firefox.app/Contents/MacOS/firefox' }
]

export function webCaptureBrowserCandidates(env = {}) {
  const candidates = []
  if (typeof env.KINAOU_CHROMIUM === 'string' && env.KINAOU_CHROMIUM) candidates.push({ id: 'custom-chromium', engine: 'chromium', label: 'Configured Chromium-based browser', path: env.KINAOU_CHROMIUM })
  if (typeof env.KINAOU_FIREFOX === 'string' && env.KINAOU_FIREFOX) candidates.push({ id: 'custom-firefox', engine: 'gecko', label: 'Configured Firefox browser', path: env.KINAOU_FIREFOX })
  candidates.push(...DEFAULT_BROWSER_CANDIDATES)
  return candidates.filter((candidate) => typeof candidate.path === 'string' && path.isAbsolute(candidate.path))
}

export function validateWebCaptureUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL_LENGTH) throw new Error('Capture URL is required (max 2000 characters)')
  let url
  try { url = new URL(value.trim()) } catch { throw new Error('Capture URL must be a valid absolute URL') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Capture URL must use http or https')
  if (url.username || url.password) throw new Error('Capture URL must not contain credentials')
  return url.toString()
}

export function validateWebCaptureRequest(value, browsers) {
  if (!value || typeof value !== 'object') throw new Error('Web capture request is required')
  const browser = (Array.isArray(browsers) ? browsers : []).find((candidate) => candidate.id === value.browserId)
  if (!browser) throw new Error('Requested browser is not available on this machine')
  const url = validateWebCaptureUrl(value.url)
  const width = value.width === undefined ? 1280 : value.width
  const height = value.height === undefined ? 800 : value.height
  if (![width, height].every((dimension) => Number.isInteger(dimension) && dimension >= 320 && dimension <= 4096)) throw new Error('Viewport must use integer pixels between 320 and 4096')
  return { browserId: browser.id, engine: browser.engine, url, width, height }
}

export function webCapturePaths(jobId) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid web capture job ID')
  return {
    image: `KINAOU/Temp/WebCaptures/${jobId}.png`,
    asset: `KINAOU/Assets/WebCaptures/${jobId}.png`
  }
}

// Browser profiles need symlink support (Chrome's SingletonLock, Firefox's lock),
// which exFAT/FAT external drives don't provide — so the throwaway profile lives
// in the machine-local temp directory, never inside the managed root.
export function webCaptureProfileDirectory(jobId, tempRoot) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid web capture job ID')
  if (typeof tempRoot !== 'string' || !path.isAbsolute(tempRoot)) throw new Error('Temp root must be an absolute path')
  return path.join(tempRoot, `kinaou-webcapture-${jobId}-profile`)
}

export function buildWebCaptureCommand({ browserPath, request, targetPath, profilePath }) {
  if (typeof browserPath !== 'string' || !path.isAbsolute(browserPath)) throw new Error('Browser must be configured with an absolute path')
  if (![targetPath, profilePath].every((value) => typeof value === 'string' && path.isAbsolute(value))) throw new Error('Web capture paths must be absolute')
  const { engine, url, width, height } = request
  if (engine === 'chromium') return { executable: browserPath, args: ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profilePath}`, `--window-size=${width},${height}`, '--virtual-time-budget=10000', `--screenshot=${targetPath}`, url] }
  if (engine === 'gecko') return { executable: browserPath, args: ['--headless', '--no-remote', '-profile', profilePath, `--window-size=${width},${height}`, `--screenshot=${targetPath}`, url] }
  throw new Error('Unsupported web capture browser engine')
}

export function buildWebCaptureProvenance(request, browserVersion) {
  return {
    kind: 'real-capture',
    adapterId: 'headless-browser',
    browserId: request.browserId,
    engine: request.engine,
    ...(browserVersion ? { browserVersion } : {}),
    url: request.url,
    width: request.width,
    height: request.height
  }
}
