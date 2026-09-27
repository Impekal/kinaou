import type { CourseCollectionRequest, CourseCollectionJob } from './course-collection-protocol.mjs'
export interface CollectionLibraryQuery { projectId: string; after?: string }
export interface CollectionLibraryLookup { projectId: string; requestId: string }
export interface CollectionLibraryEntry { requestId: string; projectId: string; course: CourseCollectionRequest['course']; selectedLessons: number; hasCompletionRecord: boolean }
export interface CollectionLibraryPage { schemaVersion: 1; projectId: string; after?: string; entries: CollectionLibraryEntry[]; scanned: number; skipped: number; nextCursor?: string }
export function validateCollectionLibraryQuery(value: unknown): CollectionLibraryQuery
export function validateCollectionLibraryLookup(value: unknown): CollectionLibraryLookup
export function validateCollectionLibraryPage(value: unknown, query: CollectionLibraryQuery): CollectionLibraryPage
export function validateCollectionLibraryInspection(value: unknown, lookup: CollectionLibraryLookup): CourseCollectionJob
