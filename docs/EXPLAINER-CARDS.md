# Original authored explainer cards

## Delivered scope (#391)

Images offers separate **Local image model**, **Explainer cards** and (since #393) **Explainer videos** views. All stay mounted, preserving drafts and observing context changes even while hidden. Keyboard arrows/Home/End switch the linked tabs. No tab navigation triggers saving, inference or retrieval.

Cards use local Canvas and installed Arial/sans-serif, without models, remote fonts, downloaded artwork or service fees. Landscape (1920×1080), portrait (1080×1920) and square (1080×1080), indigo/paper themes and independent German/English/French content language are supported. Authors supply a label, title, one to four points and an optional source line. The burned-in notice identifies an authored graphic, not a screen capture. Source text is a claim by the author, not evidence of reading or licensing.

Schema limits, valid plain Unicode, grapheme-aware wrapping and actual font measurement protect readable layouts. Unfittable text fails with an actionable explanation instead of truncating or silently shrinking. Markup is painted literally, never executed. Browser PNG encoding is bounded; empty, wrong-type and oversized results fail.

## Review, storage and use

1. Edit the card and explicitly prepare its PNG. No worker is needed for this preview.
2. Inspect the exact prepared bytes and acknowledge before import. Changing the definition, project, connection or UI language invalidates the review, including observed A→B→A changes.
3. A connected upload-capable worker copies the actual PNG and probes its codec/dimensions before registration. The normal asset-import session takes one safety snapshot; persistence failure retries only saving, using the current persistence callback, not copying/probing again.
4. Saved source metadata can be loaded as a new draft without overwriting the old file. Place the registered card with existing asset-placement controls or on a new five-second image track. Normal timeline tools and FFmpeg export handle duration and video output.

Metadata records `authored-explainer-card-v1`, the definition and `canvas-explainer-png-v1`. This is original graphic authorship, not AI generation or capture evidence. No facts, teaching effectiveness, child suitability or originality of entered text are automatically certified. There is no narration or animated reveal in this first slice.

## Real point-reveal videos (#393)

Choose a saved card and one, two or three seconds per point. The retained authored definition is read, **not the original PNG**; a missing original image does not prevent definition-based drawing. Lineage retains the source asset ID and complete card definition. A one-second title hold is followed by cumulative 240 ms point fades. The complete card/source/provenance text stays in its original layout; overflow is still refused. Total duration is 2–13 seconds at 25 fps, with the original card dimensions and no audio. These authored times are not speech alignment or a reading-time recommendation.

Local Canvas/WebCodecs encodes every explicitly timestamped frame, with four-frame back-pressure, a 90-second overall deadline, bounded codec waits, 32 MiB file limit and resource cleanup. Cancel stops preparation before any upload; changing project/connection/selection/timing/UI language invalidates prepared work, including observed A→B→A. Unsupported browsers receive the static-card alternative, not a fake video. Technical references: [VideoEncoder](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder), [libvpx IVF writer](https://github.com/webmproject/libvpx/blob/main/ivfenc.c).

Opening/middle/final PNGs are clearly labeled **before compression**, not complete playback. Inspect those frames and every point's start time before acknowledging import. The exact prepared VP8/IVF file is uploaded and probed for codec, dimensions, 25 fps and exact duration. Failed persistence retries only saving with the same file/metadata and one safety snapshot. Saved `authored-explainer-reveal-v1` assets work with normal video tracks, editing and FFmpeg rendering. IVF is an intermediate, not a file claimed ready for platform upload; use normal H.264 export. Inspect complete playback/readability and add authorized narration separately. No model, network retrieval, recording, translation, dependency or worker change.

### Executed acceptance

- 39 new regressions; all 2,309 app tests / 221 files, build/syntax and [full CI 36669676275](https://github.com/Impekal/kinaou/actions/runs/36669676275) passed. Bounds include maximum 325-frame encoding, incomplete/reordered/oversized output, codec failure/wait timeout, abort/resource disposal and schema/source validation.
- Actual browser-produced landscape (4 s, 358,442 bytes), portrait (7 s, 716,140 bytes) and square (10 s, 422,709 bytes) fixtures are retained with definitions and SHA-256 in `tests/fixtures/explainer-reveals.json` and the existing card definitions. Real authenticated worker integration retries save without recopying, renders all three H.264 outputs, checks exact duration/25 fps/no audio, decodes pre-/half-/post-fade pixels for every point and compares final text/background pixels to the original real PNG. Source file hashes remain unchanged.
- Actual UI save fault/retry used one copy and one snapshot. Normal placement/export produced 384×216 H.264, exactly 4.000 s, 11,881 bytes. DE/FR/EN controls, offline encoding/blocked import, connection A→B→A, language-review invalidation, active-project cancellation, ordinary cancel and keyboard Home/End across three views passed. Existing saved media reloaded; no automatic inference/upload was introduced.
- A temporary test-harness render preset incorrectly read dimensions not retained by generic media import; fixed the harness to use the reviewed card definition. Its HMR-only duplicate-root warning disappeared in a fresh final tab (zero console warnings/errors); neither required a production workaround. Owned temporary source fixtures, tabs, browser records and servers were removed. Actual media remain in parent `acceptance/explainer-reveal-393`, with `explainer-reveal-ui.png` and `explainer-reveal-filmstrip.png` beside it. User media/SSD/models, foreign files and stash are unchanged.

This slice does not complete cartoon, children's, full educational or avatar animation production. Short authored fades do not establish teaching quality, suitable reading speed, factual truth or natural narration.

## Acceptance evidence

- 35 new regressions; all 2,270 app tests / 219 files, build/syntax and full CI passed. [CI 36667847576](https://github.com/Impekal/kinaou/actions/runs/36667847576) includes the unchanged Linux render-smoke gate.
- Actual browser-generated PNGs for all three formats are retained in `tests/fixtures/explainer-*` with exact authored definitions/hashes. The executing integration test uploads to an isolated authenticated worker, probes, injects a save failure, retries without a second copy/snapshot, renders H.264, compares decoded background/text pixels and confirms unchanged source hashes.
- Actual browser checks covered DE/FR/EN controls without translating authored content, overflow rejection, offline preparation/blocked import, invalidated reviews, tab draft/keyboard behavior, source reuse and persisted reload. A stale persistence callback found during fault injection was fixed and retested.
- Actual UI-created five-second timeline rendered H.264 at 384×216, exactly 5.000 seconds (7,773 bytes). Its media and three registered cards remain in the parent workspace's `acceptance/explainer-391` directory; the UI screenshot is `acceptance/explainer-card-ui.png`. All owned temporary source fixtures, servers, tabs and browser test records were removed. No user SSD, models or media were touched.

## Optional personal acceptance

In a disposable project, create your own short card, inspect the preview at the intended delivery size, save and place it, then render through the normal export path. Check spelling, factual accuracy, attribution and reading time yourself. Restoring history removes project references, not stored files. No immediate hardware/model/SSD action is required for this feature; whole learning/cartoon/children/sports point 7 remains open.
