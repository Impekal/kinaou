import path from 'node:path'

const CAPTURE_KINDS = ['screenshot', 'recording']
const MAX_COORDINATE = 20_000

export const MAX_RECORDING_MS = 10 * 60_000
export const DEFAULT_SCREENCAPTURE_PATH = '/usr/sbin/screencapture'
export const DEFAULT_OSASCRIPT_PATH = '/usr/bin/osascript'

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateAppName(value) {
  if (typeof value !== 'string') throw new Error('App name is required')
  const name = value.trim()
  if (!name || name.length > 100 || !/^[A-Za-z0-9]/.test(name) || /["\\\u0000-\u001f]/.test(name)) throw new Error('App name must start alphanumeric, stay under 100 characters and contain no quotes, backslashes or control characters')
  return name
}

export function validateCaptureRequest(value) {
  if (!isRecord(value)) throw new Error('Capture request is required')
  if (!CAPTURE_KINDS.includes(value.kind)) throw new Error('Capture kind must be screenshot or recording')
  const interactive = value.interactive === true
  if (interactive && value.kind !== 'screenshot') throw new Error('Interactive on-screen selection is only supported for screenshots')
  const appName = value.appName === undefined || value.appName === null ? null : validateAppName(value.appName)
  if (appName && interactive) throw new Error('App-window capture and interactive selection are mutually exclusive')
  if (appName && value.region !== undefined && value.region !== null) throw new Error('App-window capture and a fixed region are mutually exclusive')
  const displayId = value.displayId === undefined ? 1 : value.displayId
  if (!Number.isInteger(displayId) || displayId < 1 || displayId > 16) throw new Error('Capture display must be an integer between 1 and 16')
  const delaySeconds = value.delaySeconds === undefined ? 0 : value.delaySeconds
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 10) throw new Error('Capture delay must be 0–10 seconds')
  if (value.kind === 'recording' && delaySeconds !== 0) throw new Error('A start delay is only supported for screenshots')
  if (interactive && delaySeconds !== 0) throw new Error('Interactive selection waits for your click and does not take a delay')
  let region = null
  if (value.region !== undefined && value.region !== null) {
    if (interactive) throw new Error('Interactive selection and a fixed region are mutually exclusive')
    const candidate = isRecord(value.region) ? value.region : {}
    const { x, y, width, height } = candidate
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || x > MAX_COORDINATE || y > MAX_COORDINATE || width < 16 || height < 16 || width > MAX_COORDINATE || height > MAX_COORDINATE) throw new Error('Capture region must use bounded integer pixel values')
    region = { x, y, width, height }
  }
  if (value.kind === 'recording') {
    if (!Number.isInteger(value.durationMs) || value.durationMs < 1000 || value.durationMs > MAX_RECORDING_MS) throw new Error('Recording duration must be between 1 and 600 seconds')
    return { kind: 'recording', displayId, delaySeconds, region, interactive: false, appName, durationMs: value.durationMs }
  }
  return { kind: 'screenshot', displayId, delaySeconds, region, interactive, appName }
}

export function buildAppActivateCommand(appName, osascriptPath = DEFAULT_OSASCRIPT_PATH) {
  if (typeof osascriptPath !== 'string' || !path.isAbsolute(osascriptPath)) throw new Error('osascript must be configured with an absolute path')
  return { executable: osascriptPath, args: ['-e', 'on run argv', '-e', 'tell application (item 1 of argv) to activate', '-e', 'end run', validateAppName(appName)] }
}

export function buildAppWindowBoundsCommand(appName, osascriptPath = DEFAULT_OSASCRIPT_PATH) {
  if (typeof osascriptPath !== 'string' || !path.isAbsolute(osascriptPath)) throw new Error('osascript must be configured with an absolute path')
  return {
    executable: osascriptPath,
    args: [
      '-e', 'on run argv',
      '-e', 'tell application "System Events" to tell (first process whose name is (item 1 of argv))',
      '-e', 'set {x, y} to position of front window',
      '-e', 'set {w, h} to size of front window',
      '-e', 'end tell',
      '-e', 'return (x as text) & "," & y & "," & w & "," & h',
      '-e', 'end run',
      validateAppName(appName)
    ]
  }
}

export function parseAppWindowBounds(stdout) {
  const match = /^(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(String(stdout).trim())
  if (!match) throw new Error('Could not read the app window position')
  const bounds = { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) }
  if (bounds.width < 16 || bounds.height < 16 || bounds.width > MAX_COORDINATE || bounds.height > MAX_COORDINATE || Math.abs(bounds.x) > MAX_COORDINATE || Math.abs(bounds.y) > MAX_COORDINATE) throw new Error('App window bounds are out of range')
  return bounds
}

export function captureFileExtension(kind) {
  if (!CAPTURE_KINDS.includes(kind)) throw new Error('Capture kind must be screenshot or recording')
  return kind === 'recording' ? 'mov' : 'png'
}

export function captureTempRelativePath(captureId, kind) {
  if (!/^[a-zA-Z0-9-]+$/.test(captureId)) throw new Error('Invalid capture job ID')
  return `KINAOU/Temp/Captures/${captureId}.${captureFileExtension(kind)}`
}

export function captureAssetRelativePath(captureId, kind) {
  if (!/^[a-zA-Z0-9-]+$/.test(captureId)) throw new Error('Invalid capture job ID')
  return `KINAOU/Assets/Captures/${captureId}.${captureFileExtension(kind)}`
}

export function buildCaptureCommand({ screencapturePath = DEFAULT_SCREENCAPTURE_PATH, request, targetPath, resolvedRegion = null }) {
  if (typeof screencapturePath !== 'string' || !path.isAbsolute(screencapturePath)) throw new Error('screencapture must be configured with an absolute path')
  if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) throw new Error('Capture target path must be absolute')
  const validated = validateCaptureRequest(request)
  if (validated.appName && !resolvedRegion) throw new Error('App-window capture requires resolved window bounds')
  const args = ['-x']
  if (validated.kind === 'recording') args.push('-v', '-V', String(Math.round(validated.durationMs / 1000)))
  else {
    args.push('-t', 'png')
    if (validated.delaySeconds > 0) args.push('-T', String(validated.delaySeconds))
  }
  if (validated.interactive) args.push('-i')
  else if (resolvedRegion) args.push('-R', `${resolvedRegion.x},${resolvedRegion.y},${resolvedRegion.width},${resolvedRegion.height}`)
  else if (validated.region) args.push('-R', `${validated.region.x},${validated.region.y},${validated.region.width},${validated.region.height}`)
  else args.push('-D', String(validated.displayId))
  args.push(targetPath)
  return { executable: screencapturePath, args }
}

export function buildCaptureProvenance(request) {
  const validated = validateCaptureRequest(request)
  return {
    kind: 'real-capture',
    adapterId: 'macos-screencapture',
    displayId: validated.displayId,
    delaySeconds: validated.delaySeconds,
    region: validated.region,
    interactive: validated.interactive,
    appName: validated.appName,
    requestedDurationMs: validated.kind === 'recording' ? validated.durationMs : null
  }
}
