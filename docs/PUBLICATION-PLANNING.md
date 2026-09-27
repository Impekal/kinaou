# Local main-video and companion-Short plans

## Implemented 2026-09-27 — #351

Publish contains a DE/EN/FR local planning card, separate from actual package/upload controls. Select a retained main-video export and 1–3 distinct companion Short exports. Enter the main video's future local time, IANA time zone, target market and your reason for testing these times. Short offsets initially suggest 24, 72 and 168 elapsed hours, but can be changed to increasing whole-hour values from 1–720.

These defaults are **authored experiments**, not audience measurements, guaranteed optimal times or a statistical recommendation. There is no account query, inference, scheduler, timer, background polling or automatic upload/post. Country/market does not infer a time zone. The displayed browser zone is editable and the selected zone is explicit in review and saved output.

### Review and persistence

Review displays local and UTC instants, chosen zone/market, historical file references and your rationale. A separate acknowledgement permits saving the local plan with a prior-project history snapshot. Mutated/copied/forged reviews, changed whole-project context or a main time that passed before saving are rejected. Observed UI scope changes permanently hide the obsolete review; a failed project save retains it for an explicit save-only retry. A pre-save history snapshot may already exist after failed persistence.

The plan stores exact export-receipt snapshots, stable plan identity, revision, timestamps, rationale, market, zone and explicit `author-experiment` basis. It survives project serialization; a separate action explicitly replaces the form with the saved plan for further editing. Loading/saving never changes script, timeline or exports. Corrupt existing plans are not silently overwritten.

Limits: 32,000 bytes, one main plus one to three Shorts, distinct job IDs and file paths, Short references vertical/square and ≤180 seconds, positive increasing whole-hour offsets ≤720, rationale ≤2,000 characters. These are conservative local selection rules, not an assertion that any platform currently accepts a file.

### Time-zone behavior

Complete valid local minute precision is supported for years 2020–2100. Conversion uses the installed JavaScript Intl/IANA rules and enumerates modern minute offsets within ±14 hours. Nonexistent spring times and repeated autumn times are both rejected; the app does not silently select one occurrence. Error messages are actionable in DE/EN/FR. Valid IANA aliases from earlier runtime databases are accepted.

Companion offsets mean elapsed hours, not “same wall-clock time on another date”. For example, Berlin 2026-10-24 18:00 plus 24 hours is 2026-10-25 17:00. Both local and UTC values are reviewed and preserved. Time-zone rule changes in a later runtime can require re-review; this is not an external scheduling service.

### Local calendar download

Explicit download creates a UTF-8 `.ics` with one 15-minute tentative/private, transparent event per planned publication check. It uses UTC date-times, stable plan/index IDs and revision sequence, safely escaped text, CRLF and folded content lines. No organizer, attendee, attachment, URL, alarm or scheduling method is emitted.

The file contains private titles, managed paths and authored rationale. Import only into an appropriate calendar intentionally; KINAOU neither imports it nor accesses calendar accounts. Reimport behavior depends on the receiving calendar and may produce duplicates; stable IDs do not guarantee synchronization. Importing a calendar event does not schedule a social-platform post. No actual Calendar application import was performed during acceptance.

Saved historical references can outlive the recent export ledger. Missing/changed current references are labelled; no automatic file check is implied. Past planned dates never become “published” automatically. File presence, current integrity, content/rights, platform acceptance and final audience/visibility choices still require separate review at actual publication.

### Acceptance

- 41 unit/UI tests: complete dates and supported bounds; IANA validity; Europe/US/Lord Howe half-hour DST gaps/folds; Kathmandu and UTC+14; elapsed offsets; source/duplicate/sequence guards; forged/mutated/stale review; save-only retry; serialization/revisions/missing-history; ICS text injection and UTF-8 line bounds; DE/EN/FR no-side-effect rendering.
- One executable real-worker integration test on isolated port 43973: actual FFmpeg landscape and vertical MP4 exports, probed dimensions and exact sizes, registered receipts, saved/reloaded plan, actual filesystem ICS and unchanged source project.
- Browser DE/EN/FR: native datetime entry, translated repeated-time rejection, correct 18:00→17:00 DST display, failed save without false success, retry after language switch, reload with zero requests, explicit saved-form editing, obsolete review removed after project change, historical warnings after dropping fixture receipts. Console clean.
- Real browser download: 1,320 bytes, two UTC events at 2026-10-24/25 16:00Z, valid folded lines, no invitation/active fields. Synthetic test download, prefixed project/history, fixture files and test server removed after verification.
- 1,885 total app tests, production build and complete GitHub CI including worker/render smoke passed. No real account, user media or SSD was changed.

Primary format references checked 2026-09-27: [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) for iCalendar text/content lines and UTC events; [ECMA-402 Intl.DateTimeFormat](https://tc39.es/ecma402/#sec-intl-datetimeformat-constructor) for runtime time-zone formatting.

Still open: actual attributable audience feedback, evidence-based timing comparisons, full main-video/Short editorial titles/descriptions/hashtags and real publication integration/acceptance. Whole completion points 6 and 9 are not complete.
