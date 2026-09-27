import { addCaption } from './captions'
import { projectCourse } from './course'
import { courseNarrationSourceSchema } from './courseNarration'
import { parseProject, type KinaouProject } from './project'
import { assertSttPath, parseSttTranscript } from './sttJobs'
import { applyTimelineOperation } from './timeline'

export type CourseCaptionErrorCode = 'source' | 'transcript' | 'language' | 'placement' | 'segments' | 'track' | 'overlap' | 'duplicate' | 'stale'
export class CourseCaptionError extends Error {
  constructor(readonly code: CourseCaptionErrorCode) { super(`Course transcript captions: ${code}`) }
}
export const courseCaptionLimits = { segments: 1000, bytes: 200000 } as const
export interface CourseCaptionReview {
  readonly transcriptId: string; readonly sourceAssetId: string; readonly sourceClipId: string
  readonly lessonTitle: string; readonly language: string
  readonly segments: ReadonlyArray<Readonly<{ index: number; text: string; startMs: number; durationMs: number; sourceStartMs: number; sourceEndMs: number }>>
}
const reviews = new WeakMap<CourseCaptionReview, { baseline: string; transcriptId: string }>()
function fail(code: CourseCaptionErrorCode): never { throw new CourseCaptionError(code) }

function plan(project: KinaouProject, transcriptId: string): CourseCaptionReview {
  const transcripts = project.assets.filter(asset => asset.id === transcriptId)
  const transcriptAsset = transcripts[0]
  if (transcripts.length !== 1 || transcriptAsset.kind !== 'document' || !transcriptAsset.managed || transcriptAsset.offline) fail('transcript')
  try { assertSttPath(transcriptAsset.uri, 'KINAOU/Projects/Transcripts/') } catch { fail('transcript') }
  let transcript
  try { transcript = parseSttTranscript(transcriptAsset.metadata.transcript) } catch { fail('transcript') }
  const sources = project.assets.filter(asset => asset.id === transcriptAsset.metadata.sourceAssetId), source = sources[0]
  if (sources.length !== 1 || source.kind !== 'audio' || !source.managed || source.offline) fail('source')
  try { assertSttPath(source.uri, 'KINAOU/Assets/') } catch { fail('source') }
  const bound = courseNarrationSourceSchema.safeParse(source.metadata.courseNarrationSource)
  if (!bound.success || bound.data.projectId !== project.id) fail('source')
  if (transcriptAsset.metadata.courseNarrationSource !== undefined) {
    const retained = courseNarrationSourceSchema.safeParse(transcriptAsset.metadata.courseNarrationSource)
    if (!retained.success || JSON.stringify(retained.data) !== JSON.stringify(bound.data)) fail('source')
  }
  let course
  try { course = projectCourse(project) } catch { fail('source') }
  const lesson = course?.modules.flatMap(module => module.lessons).find(entry => entry.id === bound.data.course.lessonId)
  if (!course || course.id !== bound.data.course.courseId || course.language !== bound.data.course.language || !lesson?.script?.trim() || lesson.script.trim() !== source.metadata.sourceText) fail('source')
  if (transcript.language.toLowerCase().split(/[-_]/)[0] !== course.language) fail('language')
  const measured = source.metadata.durationMs
  if (typeof measured !== 'number' || !Number.isFinite(measured) || measured <= 0 || measured > 86400000) fail('placement')
  const durationMs = Math.ceil(measured)
  const placements = project.tracks.flatMap(track => track.clips.filter(clip => clip.assetId === source.id).map(clip => ({ track, clip })))
  if (placements.length !== 1) fail('placement')
  const { track, clip } = placements[0]
  if (!['voice', 'dialog'].includes(track.type) || track.muted || clip.gain <= 0 || clip.sourceOffsetMs !== 0 || clip.speed !== 1 || clip.durationMs !== durationMs || clip.startMs !== lesson.range.inMs || clip.startMs + clip.durationMs > lesson.range.outMs) fail('placement')
  if (!transcript.segments.length || transcript.segments.length > courseCaptionLimits.segments || new TextEncoder().encode(JSON.stringify(transcript)).length > courseCaptionLimits.bytes) fail('segments')
  let previousEnd = 0
  const segments = transcript.segments.map((segment, index) => {
    if (segment.startMs < previousEnd || segment.endMs > durationMs) fail('segments')
    previousEnd = segment.endMs
    return { index, text: segment.text.trim(), startMs: clip.startMs + segment.startMs, durationMs: segment.endMs - segment.startMs, sourceStartMs: segment.startMs, sourceEndMs: segment.endMs }
  })
  const captionTracks = project.tracks.filter(entry => entry.type === 'caption')
  if (captionTracks.length > 1 || captionTracks.some(entry => entry.locked || entry.muted)) fail('track')
  for (const existingTrack of project.tracks) for (const existingClip of existingTrack.clips) {
    const asset = project.assets.find(entry => entry.id === existingClip.assetId)
    if (asset?.kind !== 'caption') continue
    if (asset.metadata.transcriptAssetId === transcriptId || asset.metadata.courseNarrationAssetId === source.id) fail('duplicate')
    if (!existingTrack.muted && segments.some(segment => existingClip.startMs < segment.startMs + segment.durationMs && existingClip.startMs + existingClip.durationMs > segment.startMs)) fail('overlap')
  }
  return { transcriptId, sourceAssetId: source.id, sourceClipId: clip.id, lessonTitle: lesson.title, language: course.language, segments }
}

/** Real transcript times only; no script-derived estimates or automatic correctness claim. */
export function reviewCourseTranscriptCaptions(project: KinaouProject, transcriptId: string): CourseCaptionReview {
  const result = plan(project, transcriptId)
  const review = Object.freeze({ ...result, segments: Object.freeze(result.segments.map(segment => Object.freeze(segment))) })
  reviews.set(review, { baseline: JSON.stringify(project), transcriptId })
  return review
}
export function courseCaptionReviewIsCurrent(project: KinaouProject, review: CourseCaptionReview): boolean {
  return reviews.get(review)?.baseline === JSON.stringify(project)
}
export function applyCourseTranscriptCaptions(project: KinaouProject, review: CourseCaptionReview): KinaouProject {
  const scope = reviews.get(review)
  if (!scope || !courseCaptionReviewIsCurrent(project, review)) fail('stale')
  const checked = plan(project, scope.transcriptId)
  let next = project
  if (!next.tracks.some(track => track.type === 'caption')) next = applyTimelineOperation(next, { type: 'add-track', track: { id: crypto.randomUUID(), type: 'caption', name: 'Captions', locked: false, muted: false, clips: [] } })
  for (const segment of checked.segments) {
    next = addCaption(next, segment)
    const last = next.assets.at(-1)!
    next = { ...next, assets: next.assets.map(asset => asset.id === last.id ? { ...asset, metadata: { ...asset.metadata, transcriptAssetId: checked.transcriptId, transcriptSegmentIndex: segment.index, courseNarrationAssetId: checked.sourceAssetId, courseNarrationClipId: checked.sourceClipId, sourceStartMs: segment.sourceStartMs, sourceEndMs: segment.sourceEndMs, adapterId: 'whisper.cpp', courseNarrationSource: project.assets.find(asset => asset.id === checked.sourceAssetId)!.metadata.courseNarrationSource } } : asset) }
  }
  return parseProject(next)
}
