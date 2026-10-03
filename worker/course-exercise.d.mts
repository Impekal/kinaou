import type { ZodType } from 'zod'
export interface CourseExerciseContext { schemaVersion: 1; courseId: string; lessonId: string; revision: number; language: 'de' | 'en' | 'fr'; courseTitle: string; lessonTitle: string; audience: string; objective: string; script: string; count: number }
export interface CourseExerciseProposal { exercises: Array<{ title: string; prompt: string; hint: string; solution: string; criteria: string; sourceQuote: string }> }
export const courseExerciseContextSchema: ZodType<CourseExerciseContext>
export const courseExerciseProposalSchema: ZodType<CourseExerciseProposal>
export function validateCourseExerciseProposal(context: unknown, input: unknown): CourseExerciseProposal
export function generateCourseExercises(baseUrl: string, model: string, context: unknown, fetchImpl?: typeof fetch): Promise<{ proposal: CourseExerciseProposal; modelId: string; adapterId: 'ollama' }>
