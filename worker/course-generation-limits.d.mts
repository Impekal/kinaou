export const courseGenerationLimits: Readonly<{ sourceBytes: 12000; requestBytes: 24000; contextTokens: 32768; outputTokens: 4096 }>
export function assertCourseSourceBudget(context: unknown): void
export function assertCourseRequestBudget(body: unknown): void
