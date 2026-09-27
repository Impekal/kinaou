import { validateCollectionCourse, validateCourseCollectionRequest, validateCourseCollectionJob } from './course-collection-protocol.mjs'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
function projectId(value) { if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) throw Error('Invalid collection library project'); return value }
function requestId(value) { if (typeof value !== 'string' || !uuid.test(value)) throw Error('Invalid collection library ID/cursor'); return value }
export function validateCollectionLibraryQuery(value) { return { projectId: projectId(value?.projectId), ...(value?.after === undefined ? {} : { after: requestId(value.after) }) } }
export function validateCollectionLibraryLookup(value) { return { projectId: projectId(value?.projectId), requestId: requestId(value?.requestId) } }
export function validateCollectionLibraryPage(value, query) {
  const input = validateCollectionLibraryQuery(query)
  if (value?.schemaVersion !== 1 || value.projectId !== input.projectId || value.after !== input.after || !Array.isArray(value.entries) || value.entries.length > 20
    || !Number.isSafeInteger(value.scanned) || value.scanned < 0 || value.scanned > 20 || !Number.isSafeInteger(value.skipped) || value.skipped < 0 || value.skipped > value.scanned
    || value.entries.length + value.skipped > value.scanned) throw Error('Invalid collection library page scope/counts')
  if (value.nextCursor !== undefined && (requestId(value.nextCursor) <= (input.after ?? '') || value.scanned !== 20)) throw Error('Invalid collection library next page')
  let previous = input.after ?? ''
  const entries = value.entries.map(item => {
    const id = requestId(item?.requestId), course = validateCollectionCourse(item?.course)
    if (item.projectId !== input.projectId || id <= previous || (value.nextCursor && id > value.nextCursor) || typeof item.hasCompletionRecord !== 'boolean'
      || !Number.isSafeInteger(item.selectedLessons) || item.selectedLessons < 1 || item.selectedLessons > Math.min(20, course.lessonCount)) throw Error('Invalid collection library entry')
    previous = id; return { requestId: id, projectId: input.projectId, course, selectedLessons: item.selectedLessons, hasCompletionRecord: item.hasCompletionRecord }
  })
  return { schemaVersion: 1, ...input, entries, scanned: value.scanned, skipped: value.skipped, ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }) }
}
export function validateCollectionLibraryInspection(value, lookup) {
  const input = validateCollectionLibraryLookup(lookup), request = validateCourseCollectionRequest(value?.request)
  if (request.projectId !== input.projectId || request.requestId !== input.requestId) throw Error('Collection inspection belongs to another project or ID')
  return validateCourseCollectionJob(value, request)
}
