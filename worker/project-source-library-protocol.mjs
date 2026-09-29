import { validateSourceArchiveQuery } from './project-source-protocol.mjs'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
function id(value) { if (typeof value !== 'string' || !uuid.test(value)) throw Error('Invalid source archive cursor'); return value }
export function validateSourceLibraryQuery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'after')) throw Error('Invalid source library query')
  return value.after === undefined ? {} : { after: id(value.after) }
}
export function validateSourceLibraryPage(value, query) {
  const input = validateSourceLibraryQuery(query)
  if (value?.schemaVersion !== 1 || value.after !== input.after || !Array.isArray(value.entries) || value.entries.length > 20
    || !Number.isSafeInteger(value.scanned) || value.scanned < 0 || value.scanned > 20 || !Number.isSafeInteger(value.skipped) || value.skipped < 0
    || value.entries.length + value.skipped !== value.scanned) throw Error('Invalid source library page scope/counts')
  if (value.nextCursor !== undefined && (id(value.nextCursor) <= (input.after ?? '') || value.scanned !== 20)) throw Error('Invalid source library next cursor')
  let previous = input.after ?? ''
  const entries = value.entries.map(item => {
    const lookup = validateSourceArchiveQuery(item?.query)
    if (lookup.requestId <= previous || (value.nextCursor && lookup.requestId > value.nextCursor) || typeof item.hasCompletionRecord !== 'boolean') throw Error('Invalid source library entry order/metadata')
    previous = lookup.requestId
    if (item.titleHint !== undefined && (typeof item.titleHint !== 'string' || !item.titleHint.trim() || item.titleHint.length > 1000 || /[\x00-\x1f\x7f]/.test(item.titleHint))) throw Error('Invalid source archive title hint')
    return { query: lookup, hasCompletionRecord: item.hasCompletionRecord, ...(item.titleHint === undefined ? {} : { titleHint: item.titleHint }) }
  })
  if (value.nextCursor && value.skipped === 0 && entries.at(-1)?.query.requestId !== value.nextCursor) throw Error('Source library cursor skips readable entries')
  return { schemaVersion: 1, ...input, entries, scanned: value.scanned, skipped: value.skipped, ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }) }
}
