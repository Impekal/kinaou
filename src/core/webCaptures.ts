import { parseProject, touchProject, type KinaouProject } from './project'
import { parseWebCaptureProvenance, type WebCaptureJobRecord } from './webCaptureJobs'

const WEB_CAPTURE_PREFIX = 'KINAOU/Assets/WebCaptures/'

export function registerWebCapture(project: KinaouProject, job: WebCaptureJobRecord): KinaouProject {
  if (job.state !== 'succeeded' || !job.imagePath?.startsWith(WEB_CAPTURE_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0) throw new Error('Completed managed web capture job required')
  const provenance = parseWebCaptureProvenance(job.provenance)
  if (project.assets.some((asset) => asset.uri === job.imagePath)) return project
  const url = new URL(provenance.url)
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: 'image', uri: job.imagePath, managed: true, offline: false,
    metadata: {
      name: `Web capture · ${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 120),
      mimeType: 'image/png',
      sizeBytes: job.sizeBytes,
      width: provenance.width,
      height: provenance.height,
      captured: true,
      captureMethod: provenance.adapterId,
      webCaptureJobId: job.id,
      url: provenance.url,
      browserId: provenance.browserId,
      ...(provenance.browserVersion ? { browserVersion: provenance.browserVersion } : {}),
      capturedAt: job.updatedAt
    }
  }] }))
}
