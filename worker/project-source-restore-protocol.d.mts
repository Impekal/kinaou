import type { SourceArchiveQuery, SourceArchiveJob, SourceArchiveFile } from './project-source-protocol.mjs'
export interface SourceRestoreQuery { schemaVersion: 1; restoreId: string; source: SourceArchiveQuery; evidenceSha256: string }
export interface SourceRestoreRequest extends SourceRestoreQuery { acknowledgeIsolatedCopy: true; language: 'de' | 'en' | 'fr' }
export interface SourceRestoreResult { directory: string; managedRoot: string; projectPath: string; projectTitle: string; createdAt: string; integrityCheckedAt: string; totalBytes: number; files: SourceArchiveFile[] }
export interface SourceRestoreJob { schemaVersion: 1; query: SourceRestoreQuery; state: 'unknown' | 'queued' | 'copying' | 'ready' | 'failed' | 'interrupted' | 'integrityFailed'; copiedFiles?: number; error?: string; result?: SourceRestoreResult }
export function restoreDirectory(id: string): string
export function sourceRestoreEvidence(value: SourceArchiveJob): string
export function validateSourceRestoreQuery(value: unknown): SourceRestoreQuery
export function validateSourceRestoreRequest(value: unknown): SourceRestoreRequest
export function validateSourceRestoreJob(value: unknown, lookup: SourceRestoreQuery): SourceRestoreJob
