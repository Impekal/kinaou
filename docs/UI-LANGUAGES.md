# Application languages

PR #187 adds a real, partial application-language layer in German, English and French. It does not claim that every panel has already been translated.

## Current behavior

- The sidebar selector always uses native names: Deutsch, English, Français.
- A valid saved preference wins; otherwise the first supported browser language is used, with English as the fallback. Regional browser locales such as fr-CA and de-DE resolve to their base language.
- Preference storage is a separate `kinaou.ui-language.v1` localStorage key, scoped to the current browser origin. The document's `lang` follows the selection. No server, worker or model is required.
- Switching language does not navigate, remount the app/course form, rewrite projects, translate user text, change course/content language or start/cancel media jobs. Unsaved creation/course edits remain in the current form. Course drafts still require explicit save before leaving that page or reloading.
- A failed preference write keeps the selected language for the session and displays a translated warning. This preference handling does not bypass the existing app-level recovery path for unavailable project storage.
- Course success/error summaries follow the current language. Original technical error details remain available under a translated disclosure heading.

Translated now: navigation, common project-required states, shell labels, project creation, library summary/date labels, reserved-feature explanation and the complete course-authoring form. Project backup controls, Settings, specialist production/editing/export panels and global/worker technical errors are not yet localized. An explicit notice states this in all three languages. Render directions in course help lead into a currently English specialist panel.

## Extension rules

Use `useUiLanguage().t(...)` and the typed de/en/fr catalog. All entries must have three nonempty values and matching interpolation placeholders. Do not construct user-visible sentences by concatenating untranslated fragments or use labels as internal section/job identities. Keep errors/statuses as message keys plus values when they should update during a language change.

Translate interface text, not stored scripts, course names, narration, filenames, source evidence or consent/provenance data. Newly added editable default lesson/module titles use the UI language at creation; later switching does not rename them. Content-language selection remains explicit. Never key a panel by UI language: that would silently discard its draft or interrupt its state.

## Verification

The feature gate passed 301 application tests, 82 native worker tests, TypeScript/production build and worker syntax checks. Twelve new tests cover saved/browser/default selection, invalid/blocked storage, isolated preference writes, translation/placeholder parity, real App and Course component rendering in all three languages, unchanged course content and corrupt-outline recovery.

An isolated browser at `127.0.0.1:5180` verified project draft retention DE → FR; course title/module/lesson retention FR → EN → DE/FR; separate French course language; translated invalid-title feedback; save/discard; and saved language/course persistence after reload. No regular user-origin projects, worker processes, SSD files or models were changed. The test server/tab were closed afterwards.

Next coverage: Settings/worker connection and storage → Studio/manual editing and history → render/Short/course exports → Director and local generation → assets/capture/publishing. Add interaction coverage for each migrated panel, especially pending jobs, errors and drafts.
