import { parseProject, touchProject, type KinaouProject, type KinaouAsset } from './project'
import { assertSttPath, parseSttJob, type SttJobRecord } from './sttJobs'
import { courseNarrationSourceSchema } from './courseNarration'

/** Retained attribution also identifies a course transcript after its source is removed. */
export function isCourseTranscript(project: KinaouProject, asset: KinaouAsset): boolean {
  return asset.kind === 'document' && (asset.metadata.courseNarrationSource !== undefined
    || project.assets.some(source => source.id === asset.metadata.sourceAssetId && source.metadata.courseNarrationSource !== undefined))
}

export function registerTranscriptAsset(project: KinaouProject, sourceAssetId: string, value: SttJobRecord): KinaouProject {
  const source = project.assets.find((asset) => asset.id === sourceAssetId)
  if (!source || !['audio', 'video'].includes(source.kind) || !source.managed || source.offline) throw new Error('Transcript source must be an available managed audio or video asset')
  assertSttPath(source.uri, 'KINAOU/Assets/')
  const job = parseSttJob(value)
  if (job.state !== 'succeeded' || !job.transcript || !job.transcriptPath) throw new Error('Completed transcript job required')
  const courseSource = source.metadata.courseNarrationSource === undefined ? undefined : courseNarrationSourceSchema.parse(source.metadata.courseNarrationSource)
  if (courseSource && courseSource.projectId !== project.id) throw new Error('Transcript course source belongs to another project')
  const existing = project.assets.find((asset) => asset.uri === job.transcriptPath)
  if (existing) {
    if (existing.kind !== 'document' || !existing.managed || existing.metadata.sourceAssetId !== sourceAssetId || existing.metadata.sttJobId !== job.id || JSON.stringify(existing.metadata.transcript) !== JSON.stringify(job.transcript) || (existing.metadata.courseNarrationSource !== undefined && JSON.stringify(existing.metadata.courseNarrationSource) !== JSON.stringify(courseSource))) throw Error('Transcript path is already registered with different attribution')
    return project
  }
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: 'document', uri: job.transcriptPath, managed: true, offline: false,
    metadata: { name: `${String(source.metadata.name ?? source.id)} transcript`, mimeType: 'application/json', sourceAssetId, sttJobId: job.id, transcript: job.transcript, adapterId: job.transcript.adapterId, language: job.transcript.language, ...(courseSource ? { courseNarrationSource: courseSource } : {}) }
  }] }))
}
