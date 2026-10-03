import type { ZodType } from 'zod'
export interface CourseCurriculumContext { schemaVersion: 1; courseId: string; revision: number; language: 'de' | 'en' | 'fr'; courseTitle: string; audience: string; prerequisites: string; learningOutcomes: string; lessonCount: number; sourceNotes: string }
export interface CourseCurriculumProposal { modules: Array<{ title: string; lessons: Array<{ title: string; objective: string; sourceQuote: string }> }> }
export const courseCurriculumContextSchema: ZodType<CourseCurriculumContext>
export const courseCurriculumProposalSchema: ZodType<CourseCurriculumProposal>
export function validateCourseCurriculumContext(input: unknown): CourseCurriculumContext
export function validateCourseCurriculumProposal(context: unknown, input: unknown): CourseCurriculumProposal
export function generateCourseCurriculum(baseUrl: string, model: string, context: unknown, fetchImpl?: typeof fetch): Promise<{ proposal: CourseCurriculumProposal; modelId: string; adapterId: 'ollama' }>
