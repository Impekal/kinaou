export interface CourseCollectionLesson { sourceRequestId: string; sourceFingerprint: string; moduleId: string; lessonId: string; moduleTitle: string; lessonTitle: string; range: { inMs: number; outMs: number } }
export interface CourseCollectionRequest { schemaVersion: 1; requestId: string; projectId: string; acknowledgePrivateMetadata: true; course: { courseId: string; title: string; language: 'de' | 'en' | 'fr'; outlineRevision: number; lessonCount: number }; lessons: CourseCollectionLesson[] }
export interface CourseCollectionResult { directory: string; manifestPath: string; indexPath: string; checksumPath: string; createdAt: string; integrityCheckedAt: string; totalMediaBytes: number; lessons: Array<{ sourceRequestId: string; childFingerprint: string; directory: string; mediaPath: string; sha256: string; sizeBytes: number; materialFiles: number }> }
export interface CourseCollectionJob { schemaVersion: 1; request: CourseCollectionRequest; state: 'unknown' | 'queued' | 'checking' | 'copying' | 'ready' | 'failed' | 'interrupted' | 'integrityFailed'; completedLessons?: number; error?: string; result?: CourseCollectionResult }
export const courseCollectionLimits: { lessons: number; videoBytes: number; sourceMetadataBytes: number; requestBytes: number }
export function collectionDirectory(requestId: string): string
export function validateCourseCollectionRequest(value: unknown): CourseCollectionRequest
export function validateCourseCollectionJob(value: unknown, request: CourseCollectionRequest): CourseCollectionJob
export function collectionSourceText(job: unknown): string
