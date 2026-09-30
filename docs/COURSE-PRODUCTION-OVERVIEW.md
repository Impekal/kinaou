# Saved lesson production overview (#397)

Course → Production lists saved lessons, ten at a time, with filters for visual gaps, missing script text and missing retained export references. Open a specific lesson in the course plan using stable module/lesson identities. Unsaved outline changes are not analyzed or discarded: they are labelled, and edit jumps are disabled until save/discard.

Visual clips on video/broll/image/avatar/overlay tracks and audio assets on voice/dialog tracks contribute eligible half-open intervals within each lesson. The union counts overlap once. Exact unoccupied intervals use lesson-relative seconds, start at zero, and expand twenty at a time. Muted tracks, zero-gain voice, missing/offline/duplicate/unmanaged references and unsupported kinds/source durations are excluded; active excluded clips are counted. Locked tracks still count. Music, effects and video source sound are not voice tracks. Valid caption records are counted, not declared synchronized or readable.

Script, linked demonstration, complete prompt/solution and nonempty material counts describe existing records only. Private scripts, answers, materials and asset paths are not copied into the overview rows. Export counts are explicitly historical; same-outline counts compare recorded titles, language, revision and range, not current timeline or actual bytes. Corrupt export ledgers produce an error rather than a false empty result.

This is read-only saved metadata. It does not inspect files, measure visible pixels or audible speech, check effects/automation, generate content, fill gaps, approve teaching quality or certify platform acceptance. Silence can be intentional; complete occupancy is not a finished course. Review actual playback and instructional correctness separately.

## Evidence

- 2,386 application tests / 224 files, build/syntax and full unchanged [CI 36672423891](https://github.com/Impekal/kinaou/actions/runs/36672423891) passed. Twenty-five new cases cover union partition/permutations, eligibility, privacy, historical/corrupt records, two hundred lessons, localization and bounded rendering.
- Executing FFmpeg lesson-placement test verifies three seconds of visual occupancy inside a five-second lesson, exact one-second gaps at both ends, five seconds of voice, decoded source frames and preserved narration/source hashes.
- Actual isolated browser used 25 explicitly synthetic lesson/media records: 40 gaps expanded correctly, filter counts were 13/12/25, page two opened lesson eleven, offline image records were excluded, DE/FR/EN preserved French course text and dirty drafts survived navigation. Zero app requests and project/history writes; console clean. No genuine media availability claim derives from this fixture.
- Temporary fixture/tab/server removed and prior UI preference restored; screenshot retained outside the repository. No worker endpoint, dependency, model download, user media or SSD changes. Whole course point 8 remains open.
