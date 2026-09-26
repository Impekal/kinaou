# TikTok FILE_UPLOAD — isolated Phase 5.7E

Status: implemented on `build/explicit-tiktok-publishing`, not wired to live worker publishing endpoints or UI. Earlier 5.7A–D commits remain on the same branch. No real TikTok upload, credential access or account change was performed by these tests.

## Official protocol references checked 2026-09-27

- [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post): video init, post fields, FILE_UPLOAD, upload URL lifetime and explicit consent.
- [Media Transfer Guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide): floor-based chunk count, merged trailing bytes, sequential PUT, exact Content-Length/Content-Range and 206/201 responses.
- [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines): intended audience, unaudited restrictions and required review UX.

## Accepted product decision: private app, manual TikTok handoff

KINAOU is explicitly private. TikTok's current Direct Post intended-use guidance excludes private/internal upload utilities and expects an application intended for a broad audience. Unaudited clients additionally require private accounts and SELF_ONLY posts; a functioning protocol is not an audit approval or authorization for public posts. Do not change KINAOU's audience, account privacy or selected post visibility silently, or treat a private-mode test as proof of public-post eligibility.

The user explicitly chose the manual handoff on 2026-09-27. KINAOU remains a personal tool regardless of whether the destination TikTok account/posts are public or private. Planned 5.7F–I live Direct Post integration is superseded by the manual path, not declared implemented. The isolated protocol is retained as unconnected groundwork; no worker publish route or direct-post UI calls it.

The DE/EN/FR manual panel loads only this project's available V3 TikTok packages on an explicit click. A separate click verifies the local MP4 against the package path, source path, size and SHA-256. It then shows the exact managed file path, original caption draft and unchanged tag suggestions with explicit clipboard controls. Users select that MP4 from their configured storage in TikTok's own upload interface. KINAOU does not duplicate/download the MP4, send content to TikTok, access TikTok credentials, change visibility, poll publication status or create a success receipt. The external link carries no media, metadata or credentials.

Project, worker URL/token or supported-connection changes reset the panel. Selection/refresh invalidates previous evidence; stale list/hash responses cannot restore it. File verification is explicitly a point-in-time check, not platform approval. The user reviews the caption, hashtags, rights, visibility and applicable disclosures in TikTok. Multi-word tags are not silently rewritten into hashtags.

## Implementation boundaries

`worker/tiktok-file-upload.mjs` accepts only `tiktok-video`, a strict explicit review and local `KINAOU/Renders/*.mp4` evidence. Creator privacy/interaction/duration and commercial/music consent are revalidated. A ten-minute review age is a conservative KINAOU policy, not a TikTok-specified expiry. It does not prove server-issued creator identity or inspect the V3 package; those remain obligations of 5.7F.

The actual open file is checked for exact size and SHA-256 before the credential resolver. After credential resolution the same chunks are revalidated before init, then checked immediately before each PUT. This catches file mutation without sending changed bytes. No shell transfer, public URL staging, source modification or whole-file memory allocation is used. Default chunks are 8 MiB; the conservative file ceiling is 4,000,000,000 bytes. Final bytes are merged into the last chunk rather than adding an undersized extra chunk.

The upload capability stays inside the worker invocation. Only the documented `open-upload.tiktokapis.com` and `upload.us.tiktokapis.com` hosts, `/video/` or `/upload/` paths and the two upload query parameters are accepted; unfamiliar endpoints fail closed until verified. Redirects are rejected. Access tokens occur only in the init Authorization header, not binary PUT headers. Provider/network error bodies and causes are not propagated to logs/UI. No automatic retry, status polling or follow-up publish call exists.

Finishing FILE_UPLOAD starts TikTok processing/posting under Direct Post; it is not a harmless draft upload. Future UI must obtain explicit posting consent before calling this protocol. A final 201 yields only worker-internal `processing` plus a publish ID, never a published receipt. Status-only continuation must be implemented separately and must never reinitialize/reupload as a status check. Unknown acceptance after a network error needs account/status inspection, not an inferred failure followed by automatic retry.

## Verification

- 22 new Node tests: chunk edges and exact ranges, review rejection, allowlisted upload capabilities, serial exact bytes, source/hash/path/symlink rejection before credentials, source changes during credential resolution, redacted errors, no retries, abort/parallel guard and immutable review.
- One fixture is an actual locally generated 360×640 H.264 MP4. All TikTok HTTP responses are explicit test doubles; no live platform acceptance or publication is claimed.
- 1,328 application tests and production TypeScript/build passed, including 17 manual-handoff tests: exact package/source/hash/size bindings, legacy/cross-project rejection, stale requests, refresh failure, immutable text/tags and DE/EN/FR rendering without requests or credentials.
- Browser acceptance used an isolated synthetic package/worker-response fixture, not a real TikTok account or user video. Explicit load → select → verify → copy succeeded; DE → FR → EN preserved authored text and added no requests. A modified-source response removed handoff controls. Switching project during a delayed verification discarded the late result. The temporary fixture and browser tab were removed afterward.
- 224 local versioned Worker tests passed with only `worker/render-smoke.node-test.mjs` excluded for the known local missing libass filter. Foreign untracked duplicates were not test inputs.
- Worker/protocol Node syntax and `swiftc -frontend -parse worker/keychain-helper.swift` passed.
- GitHub's complete Ubuntu gate, including render smoke, is required before merge.
