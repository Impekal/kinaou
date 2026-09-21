import { parseProject, touchProject, type KinaouProject } from './project'
import { assertSttPath, parseSttJob, type SttJobRecord } from './sttJobs'

export function registerTranscriptAsset(project: KinaouProject, sourceAssetId: string, value: SttJobRecord): KinaouProject {
  const source = project.assets.find((asset) => asset.id === sourceAssetId)
  if (!source || !['audio', 'video'].includes(source.kind) || !source.managed || source.offline) throw new Error('Transcript source must be an available managed audio or video asset')
  assertSttPath(source.uri, 'KINAOU/Assets/')
  const job = parseSttJob(value)
  if (job.state !== 'succeeded' || !job.transcript || !job.transcriptPath) throw new Error('Completed transcript job required')
  const existing = project.assets.find((asset) => asset.uri === job.transcriptPath)
  if (existing) {
    if (existing.kind !== 'document' || !existing.managed || existing.metadata.sourceAssetId !== sourceAssetId || existing.metadata.sttJobId !== job.id || JSON.stringify(existing.metadata.transcript) !== JSON.stringify(job.transcript)) throw Error('Transcript path is already registered with different attribution')
    return project
  }
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: 'document', uri: job.transcriptPath, managed: true, offline: false,
    metadata: { name: `${String(source.metadata.name ?? source.id)} transcript`, mimeType: 'application/json', sourceAssetId, sttJobId: job.id, transcript: job.transcript, adapterId: job.transcript.adapterId, language: job.transcript.language }
  }] }))
}
