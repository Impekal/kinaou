import type { ZodType } from 'zod'
export interface PublicSourceRequest { url: string }
export interface PublicSourceResult { schemaVersion: 1; requestedUrl: string; finalUrl: string; redirectUrls: string[]; retrievedAt: string; htmlSha256: string; htmlBytes: number; title: string; declaredLanguage: string | null; extraction: 'article' | 'main' | 'body'; text: string; truncated: boolean; verified: false }
export const publicSourceLimits: Readonly<{ htmlBytes: number; textCharacters: number; redirects: number; timeoutMs: number }>
export const publicSourceRequestSchema: ZodType<PublicSourceRequest>
export const publicSourceResultSchema: ZodType<PublicSourceResult>
export function publicSourceUrl(value: unknown): string
export function validatePublicSourceResult(value: unknown, request: PublicSourceRequest): PublicSourceResult
