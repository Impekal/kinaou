import { parseProject, touchProject, type KinaouProject } from './project'
import type { SttJobRecord } from './sttJobs'

export function registerTranscriptAsset(project: KinaouProject, sourceAssetId: string, job: SttJobRecord): KinaouProject {
  const source = project.assets.find((asset) => asset.id === sourceAssetId)
  if (!source || !['audio', 'video'].includes(source.kind) || !source.managed) throw new Error('Transcript source must be a managed audio or video asset')
  if (job.state !== 'succeeded' || !job.transcript || !job.transcriptPath) throw new Error('Completed transcript job required')
  if (project.assets.some((asset) => asset.uri === job.transcriptPath)) return project
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: 'document', uri: job.transcriptPath, managed: true, offline: false,
    metadata: { name: `${String(source.metadata.name ?? source.id)} transcript`, mimeType: 'application/json', sourceAssetId, sttJobId: job.id, transcript: job.transcript, adapterId: job.transcript.adapterId, language: job.transcript.language }
  }] }))
}
