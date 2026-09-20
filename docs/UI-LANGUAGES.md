# Application languages

PR #187 adds a real, partial application-language layer in German, English and French. It does not claim that every panel has already been translated.

## Current behavior

- The sidebar selector always uses native names: Deutsch, English, Français.
- A valid saved preference wins; otherwise the first supported browser language is used, with English as the fallback. Regional browser locales such as fr-CA and de-DE resolve to their base language.
- Preference storage is a separate `kinaou.ui-language.v1` localStorage key, scoped to the current browser origin. The document's `lang` follows the selection. No server, worker or model is required.
- Switching language does not navigate, remount the app/course form, rewrite projects, translate user text, change course/content language or start/cancel media jobs. Unsaved creation/course edits remain in the current form. Course drafts still require explicit save before leaving that page or reloading.
- A failed preference write keeps the selected language for the session and displays a translated warning. This preference handling does not bypass the existing app-level recovery path for unavailable project storage.
- Course success/error summaries follow the current language. Original technical error details remain available under a translated disclosure heading.

Translated now: navigation, common project-required states, shell labels, project creation, library summary/date labels, reserved-feature explanation, the course-authoring form, Settings (#189), Version History (#191), project backups and global error recovery (#193). Specialist production/editing/export panels are not yet localized; original technical diagnostics remain untranslated. An explicit notice states the partial coverage in all three languages. Render directions in course help lead into a currently English specialist panel.

Settings preserves parent-owned drafts/credentials, disables credential edits while testing a connection, translates connection failures and storage-save results, and keeps raw capability IDs/paths intact. It explicitly distinguishes the saved browser profile from the worker's actual startup root: saving a path does not mount an SSD, create/move files or reconfigure the worker. A failed save keeps the old saved profile and current inputs. The token remains in memory only.

## Extension rules

Use `useUiLanguage().t(...)` and the typed de/en/fr catalog. All entries must have three nonempty values and matching interpolation placeholders. Do not construct user-visible sentences by concatenating untranslated fragments or use labels as internal section/job identities. Keep errors/statuses as message keys plus values when they should update during a language change.

Translate interface text, not stored scripts, course names, narration, filenames, source evidence or consent/provenance data. Newly added editable default lesson/module titles use the UI language at creation; later switching does not rename them. Content-language selection remains explicit. Never key a panel by UI language: that would silently discard its draft or interrupt its state.

## Verification

The feature gate passed 301 application tests, 82 native worker tests, TypeScript/production build and worker syntax checks. Twelve new tests cover saved/browser/default selection, invalid/blocked storage, isolated preference writes, translation/placeholder parity, real App and Course component rendering in all three languages, unchanged course content and corrupt-outline recovery.

An isolated browser at `127.0.0.1:5180` verified project draft retention DE → FR; course title/module/lesson retention FR → EN → DE/FR; separate French course language; translated invalid-title feedback; save/discard; and saved language/course persistence after reload. No regular user-origin projects, worker processes, SSD files or models were changed. The test server/tab were closed afterwards.

Settings gate (#189): 311 application tests + 82 native tests + build/syntax passed. Ten additional regressions cover each language, exact drafts/paths/capabilities, disabled pending credentials, escaped errors and blocked storage writes. The isolated localhost:5181 browser test verified DE→FR→EN draft retention, invalid-URL rejection, translated error/success messages, saved profile persistence and cleared token on reload. No live user worker or SSD was used.

Version History gate (#191): 319 application tests + 82 native tests + build/syntax passed. Eight additional tests cover three-language labels/source/date summaries, preserved original names, escaping, blocked history reads, failed safety writes and reversible snapshots. Isolated localhost:5182 browser verification created a named version, preserved its name draft across DE/FR/EN, restored an earlier project without its later course, then restored the safety version and confirmed the later course after reload. No media files were involved. Action errors clear success messages; technical details remain original. A failure may still leave a safety snapshot, which the UI states explicitly. The pre-existing 100-entry default retention and English stored system-version labels are not silently rewritten.

Backup/recovery gate (#193): 335 application tests + 82 native tests + build/syntax passed. Sixteen additional regressions cover three-language backup/recovery rendering, escaped diagnostics, blocked localStorage access, save/list/restore failure distinctions, actual callback ordering and invalidated late successes/failures. The outer boundary still handles provider failures; the inner one uses the current session language. Recovery never clears storage and warns that unsaved drafts can be lost on retry/reload rather than promising that an arbitrary error did not change data.

Isolated localhost:5183 browser verification used a dedicated temporary worker root (not the SSD): save a real JSON backup, change the UI DE→FR→EN without changing the saved title/path, save a later course outline, restore the original backup, verify the course was removed and the safety version exists, then stop the test worker and verify translated list failure. Both local test processes and the browser tab were closed. Project backups copy metadata only; media/models are not included. Re-saving the same project replaces its JSON backup. Scope invalidation suppresses stale UI results/restores, but does not cancel an already accepted worker disk write; reconnect and list backups to inspect uncertain outcomes. Stored system-snapshot labels remain unchanged.

Next coverage: Studio caption authoring/feedback (substep 1.5) → remaining Studio/manual editing → render/Short/course exports → Director and local generation → assets/capture/publishing. Add interaction coverage for each migrated panel, especially pending jobs, errors and drafts. Completion numbering: COMPLETION_CHECKLIST.md.
