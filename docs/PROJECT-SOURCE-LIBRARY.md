# Private project/media archive library

Implemented by #359. This read-only Settings panel works without an open project or retained browser archive ticket. It requires an authenticated connected worker advertising `project-source-library`.

## Explicit workflow

1. List existing archives in the connected managed root.
2. Select one historical project/archive. List title hints and completion-file presence are unverified metadata.
3. Explicitly check integrity. The existing archive status route verifies the actual project SHA, registered media inventory and hashes, plus archive information files. Only this result supplies a verified historical title.

Nothing automatically restores, copies, repairs, resumes, switches the active root or fetches on reload. Connection/root/capability changes discard results and late replies, including observed A→B→A changes. A missing/disconnected root fails rather than displaying an empty library. Missing archive subdirectories on an existing valid root can legitimately be empty.

## Bounds and safety

The authenticated `POST /projects/source-archive/list` accepts only an optional UUID cursor. It reads existing `KINAOU/Archive/ProjectSources`, with at most 10,000 directory entries inspected and 20 candidate IDs per page, ordered by ID, not date. Unsafe/unreadable candidate records count as skipped. It never creates missing folders or modifies invalid entries.

Each retained request is a bounded 4 KiB regular, non-symlink stable read with strict UTF-8/JSON and matching ID/project/hash/language/acknowledgement. Completion presence checks only a regular non-symlink manifest size (up to 2 MiB); it does not parse or verify that manifest. Optional project-title hints use a bounded 5 MiB stable project-document read; an invalid/missing title does not hide a valid request. Listing does not read/hash media.

Explicit integrity checking is point-in-time consistency evidence, not a signed authenticity guarantee, comparison with the current project, media-rights approval, or teaching-quality certification. Project documents can contain scripts, exercises, private answers and provenance. Only registered managed media and the saved project document are archived; models, browser state, credential stores, unregistered outputs and arbitrary external references are not separately backed up.

Do not use the only backup as an active production root: later jobs could modify it. The separate explicit [isolated restoration workflow](PROJECT-SOURCE-RESTORE.md) added by #361 can create a new independent working copy. Listing/checking alone still does not restore anything or change storage configuration.

## Executed evidence

- 1,952 app tests across 202 files; 360 supported local worker tests; production build and unchanged full Linux CI including render smoke. The local FFmpeg lacks libass, so local supported-worker totals exclude only the existing caption/render smoke suite.
- Real worker/FFmpeg integration: MP4/WAV archive rediscovery after a fresh client, exact verified title, authorization failures, independent re-rendering while originals are unavailable, same-size media corruption refusal and explicit recovery after restoring disposable fixture bytes.
- Worker cases: pagination, malformed/oversized/invalid-UTF-8 requests, symlink refusal, incomplete/missing files, unverified modified title versus failed actual integrity, disconnected root error and no creation for empty reads.
- Actual browser: DE/EN/FR, no-project discovery, real hash/title result, same-size mutation failure, incomplete second project, delayed root A→B→A result rejection and zero-request reload. A harness-only hot-reload root warning was fixed; fresh-tab final console was empty.

All own fixture files, browser data and test processes were removed. No user SSD/project/media, foreign files/stash, production deployment, model download or external provider API was involved. Whole course/product completion is not claimed.
