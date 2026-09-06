import { registerAsset } from './assets'
import type { KinaouProject } from './project'
import type { MediaProbeResult } from './workerProtocol'

export type ImportableMediaKind = 'video' | 'audio' | 'image'

export interface ProbedMediaImport {
  kind: ImportableMediaKind
  managedPath: string
  name: string
  probe: MediaProbeResult
}

export function importProbedMedia(project: KinaouProject, input: ProbedMediaImport): KinaouProject {
  const managedPath = input.managedPath.trim()
  if (!managedPath.startsWith('KINAOU/Assets/')) throw new Error('Imported media must live under KINAOU/Assets')

  return registerAsset(project, {
    kind: input.kind,
    uri: managedPath,
    name: input.name,
    managed: true,
    ...(input.probe.sizeBytes !== undefined ? { sizeBytes: input.probe.sizeBytes } : {}),
    ...(input.probe.durationMs !== undefined ? { durationMs: input.probe.durationMs } : {}),
    mimeType: input.probe.mimeType,
    metadata: undefined
  } as never)
}
