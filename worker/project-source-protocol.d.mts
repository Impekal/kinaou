export interface SourceArchiveQuery { schemaVersion: 1; requestId: string; projectId: string; projectSha256: string }
export interface SourceArchiveRequest extends SourceArchiveQuery { acknowledgePrivateArchive: true; language: 'de' | 'en' | 'fr'; projectText: string }
export interface SourceArchiveInventory { projectId: string; title: string; assetCount: number; inlineCaptions: number; paths: string[] }
export interface SourceArchiveFile { sourcePath: string; path: string; sizeBytes: number; sha256: string }
export interface SourceArchiveResult { scope: 'project-registered-assets-v1'; directory: string; projectPath: string; manifestPath: string; projectSha256: string; projectTitle?: string; createdAt: string; integrityCheckedAt: string; totalBytes: number; files: SourceArchiveFile[] }
export interface SourceArchiveJob { schemaVersion: 1; query: SourceArchiveQuery; state: 'unknown' | 'queued' | 'copying' | 'ready' | 'failed' | 'interrupted' | 'integrityFailed'; copiedFiles?: number; error?: string; result?: SourceArchiveResult }
export const projectSourceLimits: { projectBytes: number; requestBytes: number; assets: number; fileBytes: number; totalBytes: number; reserveBytes: number }
export function sourceArchiveDirectory(id: string): string
export function sourceAssetPath(value: unknown): string
export function sourceProjectInventory(projectText: string): SourceArchiveInventory
export function validateSourceArchiveQuery(value: unknown): SourceArchiveQuery
export function validateSourceArchiveRequest(value: unknown): SourceArchiveRequest
export function validateSourceArchiveJob(value: unknown, lookup: SourceArchiveQuery): SourceArchiveJob
