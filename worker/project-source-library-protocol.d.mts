import type { SourceArchiveQuery } from './project-source-protocol.mjs'
export interface SourceLibraryQuery { after?: string }
export interface SourceLibraryEntry { query: SourceArchiveQuery; hasCompletionRecord: boolean; titleHint?: string }
export interface SourceLibraryPage extends SourceLibraryQuery { schemaVersion: 1; entries: SourceLibraryEntry[]; scanned: number; skipped: number; nextCursor?: string }
export function validateSourceLibraryQuery(value: unknown): SourceLibraryQuery
export function validateSourceLibraryPage(value: unknown, query: SourceLibraryQuery): SourceLibraryPage
