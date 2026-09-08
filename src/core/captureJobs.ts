export type CaptureJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type CaptureKind = 'screenshot' | 'recording'

export interface CaptureRegion { x: number; y: number; width: number; height: number }

export interface RealCaptureProvenance {
  kind: 'real-capture'
  adapterId: 'macos-screencapture'
  displayId: number
  delaySeconds: number
  region: CaptureRegion | null
  interactive: boolean
  appName: string | null
  resolvedRegion?: CaptureRegion
  requestedDurationMs: number | null
}

export interface CaptureJobRecord {
  id: string
  kind: CaptureKind
  state: CaptureJobState
  progress: number
  createdAt: string
  updatedAt: string
  provenance: RealCaptureProvenance
  capturePath?: string
  sizeBytes?: number
  durationMs?: number
  width?: number
  height?: number
  error?: string
}

export interface CaptureRequest {
  kind: CaptureKind
  displayId?: number
  delaySeconds?: number
  region?: CaptureRegion
  interactive?: boolean
  appName?: string
  durationMs?: number
}

const CAPTURE_PREFIX = 'KINAOU/Assets/Captures/'

export function parseRealCaptureProvenance(value: unknown): RealCaptureProvenance {
  if (!value || typeof value !== 'object') throw new Error('Invalid capture provenance')
  const provenance = value as Partial<RealCaptureProvenance>
  if (provenance.kind !== 'real-capture' || provenance.adapterId !== 'macos-screencapture') throw new Error('Invalid capture provenance identity')
  if (!Number.isInteger(provenance.displayId) || (provenance.displayId as number) < 1 || !Number.isInteger(provenance.delaySeconds) || (provenance.delaySeconds as number) < 0 || typeof provenance.interactive !== 'boolean') throw new Error('Invalid capture provenance target')
  if (provenance.appName !== null && (typeof provenance.appName !== 'string' || !provenance.appName)) throw new Error('Invalid capture provenance app name')
  for (const region of [provenance.region, provenance.resolvedRegion]) {
    if (region === null || region === undefined) continue
    const candidate = region as Partial<CaptureRegion>
    if (![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isInteger)) throw new Error('Invalid capture provenance region')
  }
  if (provenance.requestedDurationMs !== null && (!Number.isInteger(provenance.requestedDurationMs) || (provenance.requestedDurationMs as number) <= 0)) throw new Error('Invalid capture provenance duration')
  return provenance as RealCaptureProvenance
}

export function parseCaptureJob(value: unknown): CaptureJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid capture job response')
  const job = value as Partial<CaptureJobRecord>
  if (typeof job.id !== 'string' || !['screenshot', 'recording'].includes(String(job.kind)) || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state))) throw new Error('Invalid capture job identity or state')
  if (typeof job.progress !== 'number' || job.progress < 0 || job.progress > 1 || typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') throw new Error('Invalid capture job progress or timestamps')
  parseRealCaptureProvenance(job.provenance)
  if (job.state === 'succeeded') {
    if (!job.capturePath?.startsWith(CAPTURE_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0) throw new Error('Invalid completed capture result')
    if (job.kind === 'recording' && (typeof job.durationMs !== 'number' || job.durationMs <= 0)) throw new Error('Invalid completed capture result')
  }
  return job as CaptureJobRecord
}
