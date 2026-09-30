# Original local tactics motion

The tactics workspace can turn two compatible authored boards into an actual video. This is independent of avatars or generative models and does not complete the whole sports/format requirement.

## Workflow
1. Save an original board, reopen it as a new draft, move players/ball and save a second board. The language, team names, player IDs/numbers/labels must match. At least one player or the ball must change position.
2. Choose the two saved boards, an optional video title and a whole duration of 2–10 seconds. Review start/mid/end source previews and explicitly acknowledge creation.
3. Local WebCodecs encodes each drawn frame at an explicit timestamp into VP8/IVF: 1920×1080, 25 fps, without sound. Existing source PNGs remain unchanged. No wall-clock recording, camera, microphone, screen capture or network inference is used.
4. Authenticated import probes the actual accepted copy. Codec, dimensions, frame rate and exact duration must match before project registration. A failed project save offers save-only retry, retaining the file/probe/history state rather than encoding/uploading again.
5. Place the saved video on a compatible existing track, or explicitly create a new video track. Standard timeline edits, narration/captions, preview/proxies and final MP4 export remain separate. IVF is a source intermediate, not a claimed native browser-playback or platform-upload format.

The authored path is straight-line interpolation, with approximately half-second opening/closing holds quantized to the 25 fps grid. Arrows are explicitly omitted. The video title is independently chosen; consistent team/player labels and the compulsory localized schematic notice remain baked into every frame. It is not match footage, measured tracking, authentic trajectory, physical simulation or automatic tactical advice.

## Runtime and recovery
- Browser WebCodecs/VP8 support is checked on explicit generation. Unsupported browsers report a limitation and retain the static explanation-sequence alternative. No automatic installation, model download or cloud fallback.
- Exactly 50–250 encoded frames with ordered 40,000-microsecond timestamps and an initial keyframe; bounded 32 MiB container, four-frame back-pressure batches, 90-second overall preparation bound and 15-second individual asynchronous waits. Frames, encoder and temporary SVG URLs are disposed. No intentionally dropped frames.
- Cancellation during preparation stops locally and creates no new import. After upload starts, monitoring detachment is separate and does not promise deletion/cancellation; an unregistered copy can remain.
- Observed project/draft/connection/root changes invalidate review and abort preparation; import-session scope also rejects late responses across A→B→A. Reload never resumes or re-encodes automatically.
- Saved metadata retains both complete authored boards, original asset IDs, selected title/duration, linear interpolation, omitted-arrow policy, renderer identity and illustration provenance. The video remains independently usable if the source PNGs are unavailable; its source metadata is not proof that a real match occurred.

## Acceptance
PR #367: 2,042 app tests / 208 files, 373 supported local worker tests, build/syntax and full unchanged Linux CI including render smoke. Real browser outputs were measured as 2 seconds / 50 frames and 10 seconds / 250 frames, 1920×1080, VP8, 25 fps. Actual import, failed-save retry with unchanged upload counts, new-track placement and H.264 MP4 export passed. DE/EN/FR, explicit cancellation without import, a held genuine probe reply rejected after root A→B→A, zero-request reload and fresh clean console also passed.

The retained fixture is the genuine browser-encoded two-second IVF plus its complete input, not an FFmpeg-generated substitute. The executing authenticated-worker test imports it, retries only persistence, exports MP4 and checks blue-player/white-ball pixels at start, midpoint and end, including absence at old player positions and exactly 50 decoded output frames. Browser UI cancellation and 10-second generation are actual local acceptance, not CI-browser coverage. Own temporary files/processes/browser data were removed; no user SSD/media or foreign files were touched.

## Implementation references
WebCodecs consumes timestamped frames and exposes explicit support checks, flush and disposal; browser support is not universal. See [Chrome WebCodecs guide](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) and [VideoEncoder documentation](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder). The small project-authored container writer follows the [WebM project's IVF binary layout](https://github.com/webmproject/libvpx/blob/main/ivfenc.c); no third-party source implementation or package was copied into the app.
