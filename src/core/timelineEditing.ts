import { parseProject, type KinaouProject, type KinaouAsset, type TimelineClip } from './project'
import { clipSpeedFitsSource } from './timeline'
import type { PersistentVersionHistory } from './versioning'

export function timelineTrimFits(asset: KinaouAsset | undefined, clip: TimelineClip, deltaMs: number): boolean {
  const durationMs = Math.max(250, clip.durationMs + deltaMs)
  return durationMs !== clip.durationMs && (deltaMs >= 0 || durationMs < clip.durationMs)
    && durationMs >= (clip.fades?.inMs ?? 0) + (clip.fades?.outMs ?? 0)
    && durationMs >= (clip.transitionIn?.durationMs ?? 0)
    && clipSpeedFitsSource(asset, { ...clip, durationMs }, clip.speed)
}

export function commitTimelineChange(project: KinaouProject, change: () => KinaouProject, history: Pick<PersistentVersionHistory, 'snapshot'>, persist: (project: KinaouProject) => void): KinaouProject {
  const next = parseProject(change())
  history.snapshot(project, 'Before manual timeline edit', 'system')
  persist(next)
  return next
}
