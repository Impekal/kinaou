export const courseCollectionLimits = { lessons: 20, videoBytes: 32 * 1024 ** 3, sourceMetadataBytes: 8 * 1024 ** 2, requestBytes: 64 * 1024 }
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const hashPattern = /^[a-f0-9]{64}$/
function text(value, limit, multiline = false) { if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > limit || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value)) throw Error('Invalid collection text'); return value }
function uuid(value) { if (typeof value !== 'string' || !uuidPattern.test(value)) throw Error('Invalid collection ID'); return value }
function hash(value) { if (typeof value !== 'string' || !hashPattern.test(value)) throw Error('Invalid collection source fingerprint'); return value }
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value)) throw Error('Invalid course identity'); return value }
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) throw Error('Invalid collection numeric bound'); return value }
export function collectionDirectory(requestId) { return `KINAOU/Renders/CourseCollections/${uuid(requestId)}` }
export function validateCourseCollectionRequest(value) {
  if (value?.schemaVersion !== 1 || value.acknowledgePrivateMetadata !== true || !value.course || !['de','en','fr'].includes(value.course.language)) throw Error('Explicit private collection acknowledgement is required')
  if (!Array.isArray(value.lessons) || !value.lessons.length || value.lessons.length > courseCollectionLimits.lessons) throw Error('Select between 1 and 20 lessons')
  const course = { courseId: id(value.course.courseId), title: text(value.course.title, 120, true), language: value.course.language,
    outlineRevision: integer(value.course.outlineRevision, 1, Number.MAX_SAFE_INTEGER), lessonCount: integer(value.course.lessonCount, 1, 200) }
  const sourceIds = new Set(), lessonIds = new Set()
  const lessons = value.lessons.map(item => {
    const lesson = { sourceRequestId: uuid(item?.sourceRequestId), sourceFingerprint: hash(item?.sourceFingerprint), moduleId: id(item?.moduleId), lessonId: id(item?.lessonId),
      moduleTitle: text(item?.moduleTitle, 120, true), lessonTitle: text(item?.lessonTitle, 120, true), range: { inMs: integer(item?.range?.inMs, 0, 86400000), outMs: integer(item?.range?.outMs, 1, 86400000) } }
    if (lesson.range.outMs <= lesson.range.inMs || sourceIds.has(lesson.sourceRequestId) || lessonIds.has(lesson.lessonId)) throw Error('Invalid range or duplicate collection source/lesson')
    sourceIds.add(lesson.sourceRequestId); lessonIds.add(lesson.lessonId); return lesson
  })
  const normalized = { schemaVersion: 1, requestId: uuid(value.requestId), projectId: text(value.projectId, 200), acknowledgePrivateMetadata: true, course, lessons }
  if (lessons.length > course.lessonCount || new TextEncoder().encode(JSON.stringify(normalized)).length > courseCollectionLimits.requestBytes) throw Error('Collection request exceeds bounds')
  return normalized
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  return value
}
/** Metadata/content binding, not a digital signature. Call only with a validated ready job. */
export function collectionSourceText(job) {
  if (job?.state !== 'ready' || !job.request || !job.result) throw Error('Collection source must be a verified ready package')
  const { integrityCheckedAt, ...stableResult } = job.result
  return JSON.stringify(sorted({ request: job.request, result: stableResult }))
}
export function validateCourseCollectionJob(value, rawRequest) {
  const request = validateCourseCollectionRequest(rawRequest)
  if (value?.schemaVersion !== 1 || JSON.stringify(validateCourseCollectionRequest(value.request)) !== JSON.stringify(request)
    || !['unknown','queued','checking','copying','ready','failed','interrupted','integrityFailed'].includes(value.state)) throw Error('Collection response does not match request')
  const job = { schemaVersion: 1, request, state: value.state }
  if (['checking','copying'].includes(value.state)) job.completedLessons = integer(value.completedLessons, 0, request.lessons.length)
  else if (value.completedLessons !== undefined) throw Error('Unexpected collection progress')
  if (['failed','interrupted','integrityFailed'].includes(value.state)) job.error = text(value.error, 4000, true)
  else if (value.error !== undefined) throw Error('Unexpected collection error')
  if (value.state !== 'ready') { if (value.result !== undefined) throw Error('Incomplete collection cannot have a ready result'); return job }
  const result = value.result, base = collectionDirectory(request.requestId)
  if (!result || result.directory !== base || result.manifestPath !== `${base}/manifest.json` || result.indexPath !== `${base}/COURSE.json` || result.checksumPath !== `${base}/SHA256SUMS`
    || !Array.isArray(result.lessons) || result.lessons.length !== request.lessons.length) throw Error('Invalid collection result')
  for (const key of ['createdAt','integrityCheckedAt']) if (typeof result[key] !== 'string' || !Number.isFinite(Date.parse(result[key])) || new Date(result[key]).toISOString() !== result[key]) throw Error('Invalid collection date')
  const lessons = result.lessons.map((item, index) => {
    const selected = request.lessons[index], childBase = `${base}/lessons/${selected.sourceRequestId}`
    if (item?.sourceRequestId !== selected.sourceRequestId || item.directory !== childBase || item.mediaPath !== `${childBase}/lesson.mp4`) throw Error('Invalid collection lesson output identity')
    return { sourceRequestId: selected.sourceRequestId, childFingerprint: hash(item.childFingerprint), directory: childBase, mediaPath: item.mediaPath,
      sha256: hash(item.sha256), sizeBytes: integer(item.sizeBytes, 1, 8 * 1024 ** 3), materialFiles: integer(item.materialFiles, 0, 15) }
  })
  const totalMediaBytes = lessons.reduce((sum, lesson) => sum + lesson.sizeBytes, 0)
  if (result.totalMediaBytes !== totalMediaBytes || totalMediaBytes > courseCollectionLimits.videoBytes) throw Error('Invalid collection total size')
  job.result = { directory: base, manifestPath: result.manifestPath, indexPath: result.indexPath, checksumPath: result.checksumPath, createdAt: result.createdAt, integrityCheckedAt: result.integrityCheckedAt, totalMediaBytes, lessons }
  return job
}
