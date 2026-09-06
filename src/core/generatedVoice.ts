import { parseProject, touchProject, type KinaouProject } from './project'
import type { TtsJobRecord } from './ttsJobs'

export function registerGeneratedVoice(project: KinaouProject, job: TtsJobRecord, sourceText: string): KinaouProject {
  if (job.state !== 'succeeded' || !job.audioPath || !job.durationMs || job.sizeBytes === undefined) throw new Error('Completed TTS job required')
  if (project.assets.some((asset) => asset.uri === job.audioPath)) return project
  const text = sourceText.trim()
  if (!text) throw new Error('Generated voice source text is required')
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: 'audio', uri: job.audioPath, managed: true, offline: false,
    metadata: { name: `Generated voice · ${text.slice(0, 60)}`, mimeType: 'audio/wav', durationMs: job.durationMs, sizeBytes: job.sizeBytes, adapterId: 'piper', voicePath: job.voicePath, ttsJobId: job.id, sourceText: text }
  }] }))
}
