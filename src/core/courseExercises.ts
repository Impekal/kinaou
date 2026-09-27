import { z } from 'zod'
import type { CourseOutline } from './course'

export const courseExerciseLimits = { perLesson: 20, field: 4000, courseCharacters: 200000 } as const
export const courseExerciseSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
  title: z.string().trim().min(1).max(120),
  prompt: z.string().max(courseExerciseLimits.field),
  hint: z.string().max(courseExerciseLimits.field),
  solution: z.string().max(courseExerciseLimits.field),
  criteria: z.string().max(courseExerciseLimits.field)
}).strict()
export type CourseExercise = z.infer<typeof courseExerciseSchema>
export type CourseExerciseDocument = 'worksheet' | 'answer-key'

export function canExportCourseExercises(exercises: readonly CourseExercise[], kind: CourseExerciseDocument): boolean {
  return exercises.length > 0 && exercises.every(exercise => Boolean(exercise.prompt.trim()) && (kind === 'worksheet' || Boolean(exercise.solution.trim())))
}

const labels = {
  de: { worksheet: 'Arbeitsblatt', 'answer-key': 'Lösungsschlüssel', draft: 'ENTWURF – keine fachliche Freigabe durch KINAOU. Vor Weitergabe prüfen.', revision: 'Kursrevision', hint: 'Hinweis', solution: 'Musterlösung', criteria: 'Bewertungskriterien' },
  en: { worksheet: 'Worksheet', 'answer-key': 'Answer key', draft: 'DRAFT – no expert approval by KINAOU. Review before sharing.', revision: 'Course revision', hint: 'Hint', solution: 'Model answer', criteria: 'Assessment criteria' },
  fr: { worksheet: 'Fiche d’exercices', 'answer-key': 'Corrigé', draft: 'BROUILLON – aucune validation experte par KINAOU. Vérifier avant diffusion.', revision: 'Révision du cours', hint: 'Indice', solution: 'Réponse modèle', criteria: 'Critères d’évaluation' }
} as const

/** Plain text only. Call with the parsed saved outline; never exports hidden answers in a worksheet. */
export function formatCourseExercises(course: CourseOutline, lessonId: string, kind: CourseExerciseDocument) {
  if (kind !== 'worksheet' && kind !== 'answer-key') throw new Error('Unknown exercise document type')
  const module = course.modules.find(module => module.lessons.some(lesson => lesson.id === lessonId))
  const lesson = module?.lessons.find(lesson => lesson.id === lessonId)
  const exercises = lesson?.exercises ?? []
  if (!module || !lesson || !canExportCourseExercises(exercises, kind)) throw new Error('Save exercises with a prompt for every item and a solution for every answer-key item')
  const text = labels[course.language]
  const blocks = exercises.map((exercise, index) => {
    const lines = [`${index + 1}. ${exercise.title}`, exercise.prompt]
    if (exercise.hint.trim()) lines.push(`${text.hint}:\n${exercise.hint}`)
    if (kind === 'answer-key') {
      lines.push(`${text.solution}:\n${exercise.solution}`)
      if (exercise.criteria.trim()) lines.push(`${text.criteria}:\n${exercise.criteria}`)
    }
    return lines.join('\n\n')
  })
  return {
    filename: `lesson-${lesson.id}-${kind}-r${course.revision}.txt`,
    mimeType: 'text/plain;charset=utf-8',
    text: [text[kind], text.draft, `${course.title} / ${module.title} / ${lesson.title}`, `${text.revision}: ${course.revision}`, ...blocks].join('\n\n') + '\n'
  }
}
