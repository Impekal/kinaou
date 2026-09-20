import type { CaptionInput } from './captions'
import type { KinaouProject } from './project'
import type { PersistentVersionHistory } from './versioning'

export function captionDraftInput(text: string, start: string, duration: string): CaptionInput | null {
  if (!text.trim() || !start.trim() || !duration.trim()) return null
  const startSeconds = Number(start), durationSeconds = Number(duration)
  if (!Number.isFinite(startSeconds) || !Number.isFinite(durationSeconds) || startSeconds < 0 || durationSeconds <= 0) return null
  const startMs = Math.round(startSeconds * 1000), durationMs = Math.round(durationSeconds * 1000)
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(durationMs) || durationMs <= 0 || !Number.isSafeInteger(startMs + durationMs)) return null
  return { text, startMs, durationMs }
}

/** Calculate first; failed validation must not consume a history slot. */
export function commitCaptionChange(project: KinaouProject, change: () => KinaouProject, history: Pick<PersistentVersionHistory, 'snapshot'>, persist: (project: KinaouProject) => void, label: string): KinaouProject {
  const next = change()
  history.snapshot(project, label, 'system')
  persist(next)
  return next
}
