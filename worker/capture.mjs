import path from 'node:path'

const CAPTURE_KINDS = ['screenshot', 'recording']
const MAX_COORDINATE = 20_000

export const MAX_RECORDING_MS = 10 * 60_000
export const DEFAULT_SCREENCAPTURE_PATH = '/usr/sbin/screencapture'

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateCaptureRequest(value) {
  if (!isRecord(value)) throw new Error('Capture request is required')
  if (!CAPTURE_KINDS.includes(value.kind)) throw new Error('Capture kind must be screenshot or recording')
  const displayId = value.displayId === undefined ? 1 : value.displayId
  if (!Number.isInteger(displayId) || displayId < 1 || displayId > 16) throw new Error('Capture display must be an integer between 1 and 16')
  const delaySeconds = value.delaySeconds === undefined ? 0 : value.delaySeconds
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 10) throw new Error('Capture delay must be 0–10 seconds')
  if (value.kind === 'recording' && delaySeconds !== 0) throw new Error('A start delay is only supported for screenshots')
  let region = null
  if (value.region !== undefined && value.region !== null) {
    const candidate = isRecord(value.region) ? value.region : {}
    const { x, y, width, height } = candidate
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || x > MAX_COORDINATE || y > MAX_COORDINATE || width < 16 || height < 16 || width > MAX_COORDINATE || height > MAX_COORDINATE) throw new Error('Capture region must use bounded integer pixel values')
    region = { x, y, width, height }
  }
  if (value.kind === 'recording') {
    if (!Number.isInteger(value.durationMs) || value.durationMs < 1000 || value.durationMs > MAX_RECORDING_MS) throw new Error('Recording duration must be between 1 and 600 seconds')
    return { kind: 'recording', displayId, delaySeconds, region, durationMs: value.durationMs }
  }
  return { kind: 'screenshot', displayId, delaySeconds, region }
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

export function buildCaptureCommand({ screencapturePath = DEFAULT_SCREENCAPTURE_PATH, request, targetPath }) {
  if (typeof screencapturePath !== 'string' || !path.isAbsolute(screencapturePath)) throw new Error('screencapture must be configured with an absolute path')
  if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) throw new Error('Capture target path must be absolute')
  const validated = validateCaptureRequest(request)
  const args = ['-x']
  if (validated.kind === 'recording') args.push('-v', '-V', String(Math.round(validated.durationMs / 1000)))
  else {
    args.push('-t', 'png')
    if (validated.delaySeconds > 0) args.push('-T', String(validated.delaySeconds))
  }
  if (validated.region) args.push('-R', `${validated.region.x},${validated.region.y},${validated.region.width},${validated.region.height}`)
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
    requestedDurationMs: validated.kind === 'recording' ? validated.durationMs : null
  }
}
