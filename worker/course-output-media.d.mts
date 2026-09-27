import type { FileHandle } from 'node:fs/promises'
export const MAX_COURSE_PLAYBACK_BYTES: number
export function openCourseOutputMedia(root: string, value: unknown): Promise<{ handle: FileHandle; sizeBytes: number }>
