import { parseRealCaptureProvenance, type CaptureJobRecord } from './captureJobs'
import { parseProject, touchProject, type KinaouProject } from './project'

const CAPTURE_PREFIX = 'KINAOU/Assets/Captures/'

export function registerCapturedMedia(project: KinaouProject, job: CaptureJobRecord): KinaouProject {
  if (job.state !== 'succeeded' || !job.capturePath?.startsWith(CAPTURE_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0) throw new Error('Completed managed capture job required')
  if (job.kind === 'recording' && (typeof job.durationMs !== 'number' || job.durationMs <= 0)) throw new Error('Completed managed capture job required')
  const provenance = parseRealCaptureProvenance(job.provenance)
  if (project.assets.some((asset) => asset.uri === job.capturePath)) return project
  const recording = job.kind === 'recording'
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: recording ? 'video' : 'image', uri: job.capturePath, managed: true, offline: false,
    metadata: {
      name: `Screen ${recording ? 'recording' : 'screenshot'} · ${job.updatedAt}`,
      mimeType: recording ? 'video/quicktime' : 'image/png',
      sizeBytes: job.sizeBytes,
      ...(recording ? { durationMs: job.durationMs } : {}),
      ...(job.width !== undefined ? { width: job.width, height: job.height } : {}),
      captured: true,
      captureMethod: provenance.adapterId,
      captureJobId: job.id,
      displayId: provenance.displayId,
      region: provenance.region,
      capturedAt: job.updatedAt
    }
  }] }))
}
