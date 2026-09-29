import type { ZodType } from 'zod'
export interface EditorialContext { schemaVersion: 1; projectId: string; planId: string; planRevision: number; outputLanguage: 'de'|'en'|'fr'; targetMarket: string; audience: string; objective: string; tone: string; sourceText: string; exports: Array<{jobId: string; kind: 'main'|'short'; label: string; receipt: string}> }
export interface EditorialItem { jobId: string; title: string; description: string; tags: string[]; rationale: string; sourceQuote: string }
export interface EditorialProposal { schemaVersion: 1; items: EditorialItem[] }
export const editorialContextSchema: ZodType<EditorialContext>
export const editorialProposalSchema: ZodType<EditorialProposal>
export function validateEditorialProposal(context: unknown, value: unknown): EditorialProposal
export function generatePublicationEditorial(baseUrl: string, model: string, context: unknown, fetchImpl?: typeof fetch): Promise<{proposal: EditorialProposal; modelId: string; adapterId: 'ollama'}>
