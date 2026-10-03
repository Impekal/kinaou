import type { ZodType } from 'zod'
export interface CourseScriptContext { schemaVersion: 1; courseId: string; lessonId: string; revision: number; language: 'de' | 'en' | 'fr'; courseTitle: string; lessonTitle: string; audience: string; objective: string; sourceNotes: string }
export interface CourseScriptProposal { paragraphs: Array<{ text: string; sourceQuote: string }> }
export const courseScriptContextSchema: ZodType<CourseScriptContext>
export const courseScriptProposalSchema: ZodType<CourseScriptProposal>
export function validateCourseScriptProposal(context: unknown, input: unknown): CourseScriptProposal
export function generateCourseScript(baseUrl: string, model: string, context: unknown, fetchImpl?: typeof fetch): Promise<{ proposal: CourseScriptProposal; modelId: string; adapterId: 'ollama' }>
