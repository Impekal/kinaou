# Original authored explainer cards

## Delivered scope (#391)

Images offers separate **Local image model** and **Explainer cards** views. Both stay mounted, preserving drafts and observing context changes even while hidden. Keyboard arrows/Home/End switch the two linked tabs. No tab navigation triggers saving, inference or retrieval.

Cards use local Canvas and installed Arial/sans-serif, without models, remote fonts, downloaded artwork or service fees. Landscape (1920×1080), portrait (1080×1920) and square (1080×1080), indigo/paper themes and independent German/English/French content language are supported. Authors supply a label, title, one to four points and an optional source line. The burned-in notice identifies an authored graphic, not a screen capture. Source text is a claim by the author, not evidence of reading or licensing.

Schema limits, valid plain Unicode, grapheme-aware wrapping and actual font measurement protect readable layouts. Unfittable text fails with an actionable explanation instead of truncating or silently shrinking. Markup is painted literally, never executed. Browser PNG encoding is bounded; empty, wrong-type and oversized results fail.

## Review, storage and use

1. Edit the card and explicitly prepare its PNG. No worker is needed for this preview.
2. Inspect the exact prepared bytes and acknowledge before import. Changing the definition, project, connection or UI language invalidates the review, including observed A→B→A changes.
3. A connected upload-capable worker copies the actual PNG and probes its codec/dimensions before registration. The normal asset-import session takes one safety snapshot; persistence failure retries only saving, using the current persistence callback, not copying/probing again.
4. Saved source metadata can be loaded as a new draft without overwriting the old file. Place the registered card with existing asset-placement controls or on a new five-second image track. Normal timeline tools and FFmpeg export handle duration and video output.

Metadata records `authored-explainer-card-v1`, the definition and `canvas-explainer-png-v1`. This is original graphic authorship, not AI generation or capture evidence. No facts, teaching effectiveness, child suitability or originality of entered text are automatically certified. There is no narration or animated reveal in this first slice.

## Acceptance evidence

- 35 new regressions; all 2,270 app tests / 219 files, build/syntax and full CI passed. [CI 36667847576](https://github.com/Impekal/kinaou/actions/runs/36667847576) includes the unchanged Linux render-smoke gate.
- Actual browser-generated PNGs for all three formats are retained in `tests/fixtures/explainer-*` with exact authored definitions/hashes. The executing integration test uploads to an isolated authenticated worker, probes, injects a save failure, retries without a second copy/snapshot, renders H.264, compares decoded background/text pixels and confirms unchanged source hashes.
- Actual browser checks covered DE/FR/EN controls without translating authored content, overflow rejection, offline preparation/blocked import, invalidated reviews, tab draft/keyboard behavior, source reuse and persisted reload. A stale persistence callback found during fault injection was fixed and retested.
- Actual UI-created five-second timeline rendered H.264 at 384×216, exactly 5.000 seconds (7,773 bytes). Its media and three registered cards remain in the parent workspace's `acceptance/explainer-391` directory; the UI screenshot is `acceptance/explainer-card-ui.png`. All owned temporary source fixtures, servers, tabs and browser test records were removed. No user SSD, models or media were touched.

## Optional personal acceptance

In a disposable project, create your own short card, inspect the preview at the intended delivery size, save and place it, then render through the normal export path. Check spelling, factual accuracy, attribution and reading time yourself. Restoring history removes project references, not stored files. No immediate hardware/model/SSD action is required for this feature; whole learning/cartoon/children/sports point 7 remains open.
