import { z } from 'zod'
import { courseExportContextSchema, courseScriptLimits, projectCourse } from './course'
import { registerGeneratedVoice } from './generatedVoice'
import { parseProject, type KinaouProject, type KinaouAsset } from './project'
import { speechVoiceSupports, type SpeechVoiceDescriptor } from './speech'
import type { SpeechDeliveryOptions } from './speechDelivery'
import type { SpeechJobRecord } from './speechJobs'
import type { SpeechRetakeContext } from './speechRetakes'

export const courseNarrationSourceSchema = z.object({
  schemaVersion: z.literal(1), projectId: z.string().min(1).max(200), course: courseExportContextSchema
}).strict()
const bindingSchema = courseNarrationSourceSchema.extend({ script: z.string().trim().min(1).max(courseScriptLimits.lesson) }).strict()
export type CourseNarrationBinding = z.infer<typeof bindingSchema>

export function bindCourseNarration(project: KinaouProject, lessonId: string): CourseNarrationBinding {
  const course = projectCourse(project)
  if (!course) throw new Error('No saved course')
  const module = course.modules.find(entry => entry.lessons.some(lesson => lesson.id === lessonId))
  const lesson = module?.lessons.find(entry => entry.id === lessonId)
  if (!module || !lesson?.script?.trim()) throw new Error('Saved lesson with a nonblank script required')
  return bindingSchema.parse({ schemaVersion: 1, projectId: project.id, script: lesson.script, course: {
    courseId: course.id, moduleId: module.id, lessonId: lesson.id, outlineRevision: course.revision,
    courseTitle: course.title, moduleTitle: module.title, lessonTitle: lesson.title, language: course.language
  } })
}

export function assertCourseNarrationBinding(project: KinaouProject, value: CourseNarrationBinding, text: string): CourseNarrationBinding {
  const binding = bindingSchema.parse(value)
  const current = bindCourseNarration(project, binding.course.lessonId)
  if (JSON.stringify(binding) !== JSON.stringify(current) || text.trim() !== binding.script) throw new Error('Course narration source changed; explicitly reload the saved lesson script')
  return binding
}

export function assertCourseNarrationVoice(binding: CourseNarrationBinding, voice: SpeechVoiceDescriptor, options: SpeechDeliveryOptions) {
  const language = bindingSchema.parse(binding).course.language
  if (speechVoiceSupports(voice, 'language-control')) {
    if (options.language !== language) throw new Error('Speech language must match the saved course language; this action does not translate')
  } else if (voice.locale?.split('-')[0] !== language || (options.language !== undefined && options.language !== language)) {
    throw new Error('Course narration requires a voice with a matching known locale or explicit language control')
  }
}

export function assertCourseNarrationRetake(asset: KinaouAsset, binding?: CourseNarrationBinding) {
  const previous = asset.metadata.courseNarrationSource
  if (previous === undefined && !binding) return
  if (!binding || previous === undefined) throw new Error('Course narration retakes require the same explicit saved-lesson source')
  const parsed = courseNarrationSourceSchema.parse(previous)
  const source = courseNarrationSourceSchema.parse({ schemaVersion: binding.schemaVersion, projectId: binding.projectId, course: binding.course })
  if (JSON.stringify(parsed) !== JSON.stringify(source) || asset.metadata.sourceText !== binding.script) throw new Error('Retake belongs to a different or earlier lesson script; create a new take instead')
}

/** Registers real successful audio only. No placement, caption timing, grading or translation. */
export function registerCourseNarration(project: KinaouProject, job: SpeechJobRecord, text: string, value: CourseNarrationBinding, retake?: SpeechRetakeContext): KinaouProject {
  const binding = assertCourseNarrationBinding(project, value, text)
  if (retake) {
    const previous = project.assets.find(asset => asset.id === retake.replacesAssetId)
    if (!previous) throw new Error('Course narration retake source is missing')
    assertCourseNarrationRetake(previous, binding)
  }
  if (job.audioPath && job.audioPath !== `KINAOU/Assets/GeneratedVoice/${job.id}.wav`) throw new Error('Course narration output does not match its completed job')
  if (project.assets.some(asset => asset.metadata.speechJobId === job.id && asset.uri !== job.audioPath)) throw new Error('Conflicting narration job registration')
  if (job.language !== undefined && job.language.split('-')[0] !== binding.course.language) throw new Error('Speech result language conflicts with its saved lesson source')
  const source = courseNarrationSourceSchema.parse({ schemaVersion: binding.schemaVersion, projectId: binding.projectId, course: binding.course })
  const existing = project.assets.find(asset => asset.uri === job.audioPath)
  if (existing) {
    // Registration validates job completion before an existing asset can satisfy idempotency.
    registerGeneratedVoice(project, job, text, retake)
    assertCourseNarrationRetake(existing, binding)
    if (existing.metadata.speechJobId !== job.id || existing.metadata.adapterId !== job.adapterId || existing.metadata.voiceId !== job.voiceId) throw new Error('Existing narration asset does not match the completed job')
    return project
  }
  const next = registerGeneratedVoice(project, job, text, retake)
  return parseProject({ ...next, assets: next.assets.map(asset => asset.uri === job.audioPath && asset.metadata.speechJobId === job.id
    ? { ...asset, metadata: { ...asset.metadata, courseNarrationSource: source } } : asset) })
}
