import { parseProject, touchProject, type KinaouProject } from './project'
import { parseSpeechJob, speechJobFromLegacyTts, type SpeechJobRecord } from './speechJobs'
import type { TtsJobRecord } from './ttsJobs'

type GeneratedSpeechJob = SpeechJobRecord | TtsJobRecord

function normalizeJob(job: GeneratedSpeechJob): SpeechJobRecord {
  return 'adapterId' in job
    ? parseSpeechJob(job)
    : speechJobFromLegacyTts(job)
}

export function registerGeneratedVoice(
  project: KinaouProject,
  value: GeneratedSpeechJob,
  sourceText: string
): KinaouProject {
  const job = normalizeJob(value)

  if (
    job.state !== 'succeeded'
    || !job.audioPath
    || !job.durationMs
    || job.sizeBytes === undefined
  ) {
    throw new Error('Completed speech job required')
  }

  if (project.assets.some((asset) => asset.uri === job.audioPath)) {
    return project
  }

  const text = sourceText.trim()

  if (!text) {
    throw new Error('Generated voice source text is required')
  }

  const metadata = {
    name: `Generated voice · ${text.slice(0, 60)}`,
    mimeType: 'audio/wav',
    durationMs: job.durationMs,
    sizeBytes: job.sizeBytes,
    adapterId: job.adapterId,
    voiceId: job.voiceId,
    speechJobId: job.id,
    sourceText: text,
    ...(job.language
      ? { speechLanguage: job.language }
      : {}),
    ...(job.modelId
      ? { speechModelId: job.modelId }
      : {}),
    ...(job.referenceAssetId
      ? {
          speechReferenceAssetId:
            job.referenceAssetId
        }
      : {}),
    ...(job.seed !== undefined
      ? { speechSeed: job.seed }
      : {}),
    ...(job.tempoFactor !== undefined
      ? {
          speechTempoFactor:
            job.tempoFactor
        }
      : {}),
    ...(job.adapterId === 'piper' ? {
      voicePath: job.voiceId,
      ttsJobId: job.id
    } : {})
  }

  return parseProject(touchProject({
    ...project,
    assets: [
      ...project.assets,
      {
        id: crypto.randomUUID(),
        kind: 'audio',
        uri: job.audioPath,
        managed: true,
        offline: false,
        metadata
      }
    ]
  }))
}
