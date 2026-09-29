# Manual Facebook and Threads handoff

Implemented in #353 for the personal-tool workflow. No social account configuration or provider API is required. This does not publish anything.

## Workflow

1. In Publish, create a **generic** package from an actual retained MP4 using the existing preflight/package flow.
2. In “Facebook and Threads: manual handoff”, select the destination and explicitly load generic packages.
3. Choose a package and explicitly recheck the video file. Only available, project-matching V3 generic packages are eligible.
4. Review the historical title/description, separate unchanged keywords and managed-relative video path. Open the path under the storage folder configured for the worker. It is not a download link.
5. Deliberately copy the text/path if needed and open the external site separately. Select/upload the video manually; check the actual platform's current media/text requirements, content rights, synthetic-content disclosure and visibility there. No automatic text shortening, hashtag conversion, account selection or acceptance claim.

The Facebook/Threads destinations are manual UI choices, not new publisher API capabilities. Existing TikTok, YouTube and Instagram flows are unchanged. The plain links contain no project fields and use `noopener noreferrer`; opening them contacts the selected site but does not transfer video/caption data.

## Evidence and isolation

The handoff reader exposes only local package listing and integrity verification. It binds project, generic platform/placement, available-source flag, package/source paths, expected and actual SHA-256, and size to the loaded package snapshot. It rejects missing/modified/mismatched/legacy packages and ambiguous duplicate paths. Authored metadata is historical: checking the MP4 does not authenticate the package text, compare it with current project edits, or validate its meaning.

Copies of metadata prevent caller mutation from silently rewriting the session snapshot. Destination/project/connection/capability changes recreate the session. Selection/refresh invalidate evidence; delayed successes and failures cannot restore it. Clipboard completion feedback is scoped too. Refresh failure clears the prior library, with no automatic retry. Reload has no automatic network, account or file action. Missing clipboard access exposes selectable read-only text as the alternative.

The hash is a point-in-time byte check, not an immutable snapshot, signature, media-rights decision or platform approval. Recheck immediately before upload; external file changes afterward remain possible. No publication status/receipt, platform scheduling, analytics, cloud inference, model download or project/history mutation is introduced.

## Executed acceptance

- 20 unit/static-render tests: exact text/keyword preservation, both destinations, mismatched file evidence, cross-project/platform/unavailable/legacy rejection, independent snapshots, duplicates, delayed success/error invalidation, refresh failure/retry, endpoint allowlist, inert DE/EN/FR and offline/credential/capability gating.
- One real-worker/FFmpeg integration: actual 1920×1080 H.264 MP4 → generic V3 package → actual file hash → Facebook/Threads handoff. Same-size mutation and missing source fail; restoring original bytes permits an explicit recheck. Package and project stay unchanged. All handoff requests are library/hash operations; no real platform account is contacted.
- Real browser with isolated actual worker data: DE/EN/FR, historical literal text (including HTML-like text safely displayed), explicit copy success feedback and injected clipboard failure fallback, delayed verification after destination A→B→A, project A→B→A, fresh load with zero requests, actual missing-file refusal and explicit recovery, clean fresh-console check. Clipboard success feedback is not evidence that a destination received the text.
- Full local gate: 1,906 app tests / 199 files, 343 supported worker tests, production build. Full PR CI includes supported Linux FFmpeg caption/render smoke. No local libass acceptance is newly claimed.

No real account upload or provider approval was performed. Temporary test files, harness, processes and tabs were removed; foreign untracked files and stash were preserved.
