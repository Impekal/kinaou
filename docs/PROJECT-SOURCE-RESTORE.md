# Verified isolated restoration

Implemented by #361, adjacent to the read-only archive library in Settings, in DE/EN/FR. Requires an authenticated updated worker advertising `project-source-restore`.

## Explicit workflow

1. Fully verify a private project/media archive. Review its historical title, media count and source identity.
2. Acknowledge an additional private copy, the required free space and excluded references/models.
3. Create one exclusive new directory: `KINAOU/Archive/RestoredProjects/<restore-id>/source/KINAOU`.
4. Explicitly check the retained job until complete. Reload/check never resubmits; an unknown ID can be explicitly resubmitted with the same source evidence.
5. To use the copy, separately start a worker on another port pointing at its new `source/KINAOU` root, connect intentionally, and use Projects → drive backup list/load to open `Projects/project.json`. The existing browser import snapshots an existing same-ID project before replacement; do not confuse opening an old version with importing a new independent project ID.

The app does not start another worker, replace the active storage root, import a project automatically or alter the original archive. Original project ID, asset URIs and exact project bytes remain intact. Actual reopened-project rendering was tested through the existing backup routes; opening is not a missing new adapter.

## Storage and recovery contract

- Source evidence hashes the canonical source query and ordered media path/size/hash records. A new integrity timestamp does not change the reviewed bytes. Start checks the source archive again before reserving a destination, and copies only if the evidence still matches.
- Requests/status are authenticated bounded 4 KiB bodies. Limits remain 500 registered assets, 5 MiB project JSON, 8 GiB/file, 32 GiB total media and a 64 MiB free-space reserve. One restoration job at a time per runtime; other worker workloads are not globally scheduled by this feature.
- Regular non-symlink files/directories, stable bounded reads, exclusive destination creation, 1 MiB streaming, source hashes, synced writes and destination readback hashes protect the copy. Copied files are independent, not hard links to the archive. A completion manifest is published only after the full copy and information files succeed.
- Same-ID replays inspect retained work rather than duplicate or resume it. Failed/interrupted partial copies stay on disk; nothing repairs, deletes or overwrites them automatically. Later deliberate editing of the working copy can legitimately make its original integrity check fail.
- Browser reminders are stored before submission, bound to worker URL and the single explicit managed root. Failed/mismatched storage blocks submission. Lost replies preserve the reminder for status-only recovery. Observed source/connection/root changes invalidate old review/results, including A→B→A.
- Explicit reminder removal deletes only that browser reminder, not files or jobs. Record the ID/path first. Restoration-copy rediscovery without the reminder and a guided separate-worker launch remain possible future improvements.
- Completed status verifies the copied project/media/information records independently of the original archive. This supports source/archive unavailability after restoration; no stronger power-loss durability guarantee or signed authenticity is claimed.

Private project documents may include scripts, solutions, identity/voice provenance and paths. Models, browser settings/history, credential stores, unregistered outputs and arbitrary external references are excluded. Neither restoration nor integrity checking certifies media rights, factual accuracy, teaching quality, current-project agreement or full product completion.

## Executed acceptance

1,968 app tests / 203 files; 373 supported local worker tests; production build, syntax and unchanged full Linux CI including render smoke. Local FFmpeg still lacks libass; the existing local supported-worker selection excludes that smoke suite only.

New unit/native tests cover source binding, strict result paths/bounds, durable scope-bound reminders, uncertain replies, explicit same-ID retry, no automatic requests, missing storage, concurrent duplicate starts, foreign/partial directories, mutation between verification/copy, restart without the source, symlink rejection and changed project/media/info files.

The actual authenticated worker integration restores real MP4/WAV media, reopens the copied project through normal backup routes, renders visible blue picture and nonzero audio samples while originals and archive are unavailable, and rejects changed copied bytes without changing the archive.

Actual browser acceptance: DE/EN/FR, lost genuine start response, retained ID and zero-request reload, status-only recovery, real same-size mutation and explicit recheck after fixture repair, delayed root A→B→A rejection, old-worker gating, scoped checkbox/path layout and reminder-only removal with copied files still present. Console clean. All owned temporary fixture data, browser reminders/preferences and server processes were removed; foreign files/stash and user SSD/media were untouched. No downloads, cloud APIs or deployments.
