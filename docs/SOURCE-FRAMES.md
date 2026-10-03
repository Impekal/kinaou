# Actual video still frames

PR #441 adds explicit frame extraction from an available managed MP4 in the media library. It is a local read of video pixels, not AI synthesis, screen capture, tactical analysis or permission verification.

## Workflow

1. Expand **Still frame from video**, choose source seconds with up to three decimals, and explicitly read.
2. Inspect the actual PNG, requested time, dimensions, size and provenance limitations. Reading creates no persistent file, asset, history or timeline clip.
3. Acknowledge content/source/use rights, then separately import the exact reviewed PNG. Actual copy/probe must match its format, dimensions and size. One safety snapshot and prepared project survive save-only retries; unknown upload acceptance never automatically uploads again.
4. Place the saved image separately using normal media/timeline controls. The original video remains unchanged. Restoring project history changes references, not physical files.

Project/source/input/interface-language/connection changes invalidate reviews and late replies, including observed A→B→A. Leaving stops acceptance/monitoring; a read already running may finish within its bound. Reload performs no automatic extraction/import and does not recover unsaved reviews. Saved images retain their portable source asset snapshot and extraction record.

## Bounds and provenance

- Updated worker capability `source-video-frame`, FFmpeg/FFprobe, import and probing are required. No installation, cloud API or model download occurs.
- Managed regular MP4 only, at most 2 GiB/six hours, square pixels, one concurrent extraction and 30 seconds total subprocess time. Symlinks, traversal, non-MP4 headers, source identity/metadata changes and out-of-duration requests refuse. The worker pins a read-only descriptor; libav receives local-only protocols and disabled MOV data references, never an arbitrary URL.
- PNG at most 1920×1080 and 16 MiB, retaining aspect/orientation without encoded upscaling. Smaller originals stay smaller; displayed browser size is not source resolution. Non-square-pixel sources currently refuse rather than silently distort.
- Retained time is the **requested, frame-quantized source time**, not a proven exact frame timestamp or recording date. A request too near the physical end may have no decodable frame and must be moved earlier explicitly.
- PNG SHA-256 is checked against actual returned bytes. This is not a full-source hash verification; the source path/size/duration and original retained declarations remain separate. A changed retained duration refuses pending fresh source inspection.
- Complete source asset metadata up to a 48,000-byte bound is retained privately, including synthetic-generation or online-acquisition provenance. Extracting a frame from generated video does not make it authentic footage. No legal or factual approval is inferred.

## Acceptance

### Authored annotations — #443

Before saving a reviewed frame, optionally choose **Add arrows, boxes or text**. Up to 16 authored elements have yellow/red/white colors and normalized coordinates. Select the start/end point, then click the canvas, enter coordinates or use arrow keys (1%; Shift 0.1%). Labels stay inside image edges; labels too large to fit, empty text and degenerate shapes refuse. Undo/redo is limited to the current unsaved draft and 100 states. Reload or source/project/language changes do not recover an unsaved draft.

**Create and review annotated PNG** rasterizes the actual original PNG and the displayed marks locally. The original PNG hash, size and decoded dimensions are checked first. Encoding/decoding is bounded and failed/late results cannot become accepted media. Inspect the final PNG before acknowledging and saving; any edit removes that prepared PNG and acknowledgement. Discarding annotations explicitly returns to the untouched source frame. Small originals are not magically higher resolution: inspect final delivery-size legibility.

Saved image metadata uses `sourceKind: annotated-video-frame-v1`, `extractionOnly: false`, `modified: true`, both PNG SHA-256 values and exact authored marks. The extraction record still describes the base PNG. Synthetic source provenance remains synthetic. The original video is never overwritten. This is not measured tracking, automatic tactical analysis, legal clearance or an unaltered original frame. Saved marks are retained as provenance, not yet a reopenable editing project.

2,827 application tests / 254 files and full unchanged CI passed. Actual browser generated and imported a 2,253-byte PNG, tested edit/acknowledgement invalidation, undo/redo, DE/EN/FR, scope changes, reload and two mutating save failures followed by an identical successful save (one upload/snapshot/image, no clip). Real PNG fixtures and hashes are retained; an executing authenticated-worker/FFmpeg test checks import/probe, video export, marked/background pixels and unchanged original bytes. Existing motion-test cleanup was repaired after CI exposed a cancelled pending cleanup promise; the full gate was rerun, not bypassed.

### Base extraction — #441

2,805 app tests / 253 files, 21 new worker tests, production build and unchanged full CI passed. Actual FFmpeg extraction, PNG copy/probe, save-only retry and H.264 image export checked pixels and original bytes. Large and rotated inputs preserve bounded dimensions/orientation; actual non-square-pixel input refused. Browser against the real worker checked review, source overrun, two mutating persistence failures followed by an identical successful payload, one import/snapshot/image, zero timeline clips, reload without requests, scoped late-response rejection, DE/EN/FR and old-worker blocking. Fresh final image decoded with a clean console. These synthetic fixtures verify behavior, not the content or rights of production footage.
