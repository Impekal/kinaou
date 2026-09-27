import { z } from 'zod'
import { courseExportContextSchema } from './course'
export const courseDeliveryMaterialLimits = { files: 14, bytes: 512 * 1024, requestBytes: 1536 * 1024 } as const
export function isDeliveryMaterialPath(value: string) {
  return /^(?:learner\/(?:worksheet|material-[a-zA-Z0-9-]{1,100})\.txt|instructor\/(?:script|answer-key|material-[a-zA-Z0-9-]{1,100})\.txt|instructor\/lesson\.json)$/.test(value)
}
const fileSchema = z.object({ path: z.string().refine(isDeliveryMaterialPath, 'Unsafe or wrong-audience material path'), text: z.string().min(1).max(courseDeliveryMaterialLimits.bytes), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const lessonDeliveryMaterialsSchema = z.object({
  acknowledgeTextVideoMatch: z.literal(true),
  source: z.object({ context: courseExportContextSchema, range: z.object({ inMs: z.number().int().nonnegative(), outMs: z.number().int().positive() }).strict(), projectMetadataSha256: z.string().regex(/^[a-f0-9]{64}$/), preparedAt: z.string().datetime() }).strict(),
  files: z.array(fileSchema).min(1).max(courseDeliveryMaterialLimits.files)
}).strict().superRefine((value, ctx) => {
  if (value.source.range.outMs <= value.source.range.inMs) ctx.addIssue({ code: 'custom', message: 'Invalid material lesson range' })
  let size = 0; const names = new Set<string>(), encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  for (const file of value.files) {
    const bytes = encoder.encode(file.text); size += bytes.length
    if (decoder.decode(bytes) !== file.text || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(file.text)) ctx.addIssue({ code: 'custom', message: 'Materials must preserve valid plain UTF-8 text' })
    const folded = file.path.toLowerCase(); if (names.has(folded)) ctx.addIssue({ code: 'custom', message: 'Duplicate material path' }); names.add(folded)
  }
  if (size > courseDeliveryMaterialLimits.bytes) ctx.addIssue({ code: 'custom', message: 'Lesson materials exceed 512 KiB' })
})
export type LessonDeliveryMaterials = z.infer<typeof lessonDeliveryMaterialsSchema>
