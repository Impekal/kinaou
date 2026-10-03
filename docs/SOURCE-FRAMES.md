# Actual video still frames

PR #441 adds explicit frame extraction from an available managed MP4 in the media library. It is a local read of video pixels, not AI synthesis, screen capture, tactical analysis or permission verification.

## Workflow

1. Expand **Still frame from video**, choose source seconds with up to three decimals, and explicitly read.
2. Inspect the actual PNG, requested time, dimensions, size and provenance limitations. Reading creates no persistent file, asset, history or timeline clip.
3. Acknowledge content/source/use rights, then separately import the exact reviewed PNG. Actual copy/probe must match its format, dimensions and size. One safety snapshot and prepared project survive save-only retries; unknown upload acceptance never automatically uploads again.
4. Place the saved image separately using normal media/timeline controls. Optional **Place image at an exact time** (#449) reviews a chosen start, positive duration and compatible unlocked/unmuted track (millisecond precision, end at most 24 hours). Occupied target intervals refuse instead of overwriting or shifting clips. Other visual layers warn; inspect actual framing/visibility in the project preview afterwards. Explicit acknowledgement inserts one stable clip with a safety snapshot and save-only retry. Project/form/language changes invalidate the review. No new file/content/rights verification occurs. The original video remains unchanged. Restoring project history changes references, not physical files.

Project/source/input/interface-language/connection changes invalidate reviews and late replies, including observed A→B→A. Leaving stops acceptance/monitoring; a read already running may finish within its bound. Reload performs no automatic extraction/import and does not recover unsaved reviews. Saved images retain their portable source asset snapshot and extraction record.

## Bounds and provenance

- Updated worker capability `source-video-frame`, FFmpeg/FFprobe, import and probing are required. No installation, cloud API or model download occurs.
- Managed regular MP4 only, at most 2 GiB/six hours, square pixels, one concurrent extraction and 30 seconds total subprocess time. Symlinks, traversal, non-MP4 headers, source identity/metadata changes and out-of-duration requests refuse. The worker pins a read-only descriptor; libav receives local-only protocols and disabled MOV data references, never an arbitrary URL.
- PNG at most 1920×1080 and 16 MiB, retaining aspect/orientation without encoded upscaling. Smaller originals stay smaller; displayed browser size is not source resolution. Non-square-pixel sources currently refuse rather than silently distort.
- Retained time is the **requested, frame-quantized source time**, not a proven exact frame timestamp or recording date. A request too near the physical end may have no decodable frame and must be moved earlier explicitly.
- PNG SHA-256 is checked against actual returned bytes. This is not a full-source hash verification; the source path/size/duration and original retained declarations remain separate. A changed retained duration refuses pending fresh source inspection.
- Complete source asset metadata up to a 48,000-byte bound is retained privately, including synthetic-generation or online-acquisition provenance. Extracting a frame from generated video does not make it authentic footage. No legal or factual approval is inferred.

## Acceptance

### Reopen as a new image version — #447

Saved extracted/annotated images now offer **Edit annotations as a new image version**. Loading the template alone performs no request. The original source record must still be available and match its retained snapshot. Explicitly read the original frame at the fixed retained time; actual returned PNG bytes/hash and all relevant extraction measurements must match the saved base before marks load. A changed source, unavailable source, incompatible extraction or changed decoder output refuses. Restore the original source record or deliberately create a new frame instead; never silently apply old marks to different pixels.

Edit, create/review the actual new PNG, acknowledge and save as a separate asset. Old image, source and timeline stay untouched. `frameRevision` retains previous image ID/output PNG hash; reports display this as historical lineage, not a fresh check of that previous file. The complete source video is not rehashed either. Existing save-only recovery, scoped late-reply rejection and draft-only undo remain. Reopening requires the original video; an old annotated PNG alone cannot reconstruct erased background pixels. New source times must start a separate extraction.

2,883 tests / 256 files, build and unchanged full CI passed. Actual re-extraction matching was added to executing FFmpeg acceptance. Actual browser/worker rejected a wrong base hash and a held A/B/A reply; “Press” → “Press 2” produced a separate 2,418-byte PNG with parent lineage. Old PNG hash remained unchanged on disk. Two mutating save failures followed by success retained one import/snapshot/payload and no clips. Reload preserved both assets. Fresh final DE/EN/FR browser recreation passed with clean console after temporary fixture HMR invalidation.

### Historical source and annotation reports — #445

Saved extracted/annotated images offer **Still frame: source and annotations** in the media library. Explicitly prepare the report, inspect all TXT/JSON content, acknowledge private information, then download either exact representation. No file read/request, hash recomputation, project change or publication occurs. Reports retain original source/time, base/output stored hashes, marks, complete historical source metadata and current timeline references. An absent or changed source record has a separate notice; matching records do not prove matching physical bytes. Offline flags are retained declarations, not fresh availability checks.

Invalid metadata, contradictory original/modified flags, mismatched source/base hash binding, empty/invalid mark lists and corrupt nested acquisition provenance refuse instead of producing a plausible report. Observed project/asset/language changes and report mutation invalidate approval. An unrelated legacy image does not acquire invented provenance. Current references are not finished-export inspection or rights clearance; effects, stacking, cropping and render ranges can change actual visibility. Full source metadata may be private. These reports are not public attribution automatically attached to videos.

2,859 tests / 255 files, build and full CI passed. Actual browser using #443's real retained source/annotation record and a synthetic timeline checked DE/EN/FR, changed/missing sources, corrupt flags, scoped reviews and exact downloaded TXT/JSON bytes with zero requests/writes/snapshots and a clean console.

### Authored annotations — #443

Before saving a reviewed frame, optionally choose **Add arrows, boxes or text**. Up to 16 authored elements have yellow/red/white colors and normalized coordinates. Select the start/end point, then click the canvas, enter coordinates or use arrow keys (1%; Shift 0.1%). Labels stay inside image edges; labels too large to fit, empty text and degenerate shapes refuse. Undo/redo is limited to the current unsaved draft and 100 states. Reload or source/project/language changes do not recover an unsaved draft.

**Create and review annotated PNG** rasterizes the actual original PNG and the displayed marks locally. The original PNG hash, size and decoded dimensions are checked first. Encoding/decoding is bounded and failed/late results cannot become accepted media. Inspect the final PNG before acknowledging and saving; any edit removes that prepared PNG and acknowledgement. Discarding annotations explicitly returns to the untouched source frame. Small originals are not magically higher resolution: inspect final delivery-size legibility.

Saved image metadata uses `sourceKind: annotated-video-frame-v1`, `extractionOnly: false`, `modified: true`, both PNG SHA-256 values and exact authored marks. The extraction record still describes the base PNG. Synthetic source provenance remains synthetic. The original video is never overwritten. This is not measured tracking, automatic tactical analysis, legal clearance or an unaltered original frame. Saved marks were initially provenance-only; #447 adds verified reopening as described above.

2,827 application tests / 254 files and full unchanged CI passed. Actual browser generated and imported a 2,253-byte PNG, tested edit/acknowledgement invalidation, undo/redo, DE/EN/FR, scope changes, reload and two mutating save failures followed by an identical successful save (one upload/snapshot/image, no clip). Real PNG fixtures and hashes are retained; an executing authenticated-worker/FFmpeg test checks import/probe, video export, marked/background pixels and unchanged original bytes. Existing motion-test cleanup was repaired after CI exposed a cancelled pending cleanup promise; the full gate was rerun, not bypassed.

### Base extraction — #441

2,805 app tests / 253 files, 21 new worker tests, production build and unchanged full CI passed. Actual FFmpeg extraction, PNG copy/probe, save-only retry and H.264 image export checked pixels and original bytes. Large and rotated inputs preserve bounded dimensions/orientation; actual non-square-pixel input refused. Browser against the real worker checked review, source overrun, two mutating persistence failures followed by an identical successful payload, one import/snapshot/image, zero timeline clips, reload without requests, scoped late-response rejection, DE/EN/FR and old-worker blocking. Fresh final image decoded with a clean console. These synthetic fixtures verify behavior, not the content or rights of production footage.
