export type PublicationTimeIssue = 'invalidZone' | 'invalidDate' | 'skippedTime' | 'repeatedTime'
export class PublicationTimeError extends Error { constructor(readonly code: PublicationTimeIssue, message: string) { super(message) } }
function formatter(timeZone: string) {
  if (typeof timeZone !== 'string' || timeZone.length > 100 || !/^(UTC|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(timeZone)) throw new PublicationTimeError('invalidZone', 'Choose an IANA time zone such as Europe/Berlin')
  try { return new Intl.DateTimeFormat('en-GB', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) }
  catch { throw new PublicationTimeError('invalidZone', 'Unsupported IANA time zone') }
}
export function publicationTimeZone(value: string) { return formatter(value).resolvedOptions().timeZone }
function localValue(date: Date, format: Intl.DateTimeFormat) {
  const p = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
export function publicationLocalTime(instant: string, timeZone: string) {
  const date = new Date(instant)
  if (!Number.isFinite(date.getTime())) throw new PublicationTimeError('invalidDate', 'Invalid publication instant')
  return localValue(date, formatter(timeZone))
}
/** Enumerate all modern minute offsets, refusing both skipped and repeated wall times. No silent DST choice. */
export function publicationInstant(local: string, timeZone: string): string {
  if (typeof local !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) throw new PublicationTimeError('invalidDate', 'Choose a complete local date and time')
  const wall = new Date(local + ':00.000Z'), year = Number(local.slice(0, 4))
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 16) !== local || year < 2020 || year > 2100) throw new PublicationTimeError('invalidDate', 'Choose a valid date between 2020 and 2100')
  const format = formatter(timeZone), matches: string[] = []
  for (let offset = -14 * 60; offset <= 14 * 60; offset++) {
    const candidate = new Date(wall.getTime() - offset * 60000)
    if (localValue(candidate, format) === local) matches.push(candidate.toISOString())
  }
  if (!matches.length) throw new PublicationTimeError('skippedTime', 'This local time does not exist because of a clock change; choose another time')
  if (matches.length !== 1) throw new PublicationTimeError('repeatedTime', 'This local time occurs twice because of a clock change; choose an unambiguous time')
  return matches[0]
}
