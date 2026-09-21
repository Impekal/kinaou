# KINAOU — Real Mac Execution Test

This is the ordered checklist for the first run on real hardware (MacBook Pro M2 Pro, external SSD). Each stage is independently valuable — stop at any point and report what you saw. Nothing here downloads models or software silently: every install is an explicit step you run yourself, and every optional runtime simply shows as "not available" until you add it.

Pre-flight status: the complete worker job pipeline (authentication, honest capability errors, browser discovery, a full web-capture job with managed output, cancellation with temp cleanup) was already executed end-to-end against the real worker in the development sandbox and passed. What only your Mac can verify is everything touching macOS itself: screencapture, TCC permissions, FFmpeg rendering on your files, and the optional AI runtimes.

> Paste tip: run the code blocks exactly as written. They intentionally contain no `#` comments — the default macOS zsh does not accept interactive comments and errors on pasted `#` lines.

## Stage 0 — Prerequisites

Check Node.js (22+ required) and git:

```bash
node --version
git --version
```

Install FFmpeg if missing (free, open source):

```bash
brew install ffmpeg
ffmpeg -version && ffprobe -version
```

Also check the build's filters before testing burned-in captions:

```bash
ffmpeg -hide_banner -filters
```

The list must contain `subtitles` (libass support). A successful version check or the worker's general `ffmpeg` capability does not guarantee this filter. On 2026-09-20, the local Homebrew 9.0.1 binary at `/opt/homebrew/opt/ffmpeg/bin/ffmpeg` lacked it; `ffmpeg@9` resolved to the same binary. The full local native run therefore passed 81 tests but failed the caption subtest and its parent. The independent Linux CI with its supported FFmpeg build passed all 83 native tests.

Before local caption acceptance, explicitly install/select a libass-enabled FFmpeg build and start the worker with that binary on its PATH; then rerun the caption smoke test. Do not silently replace the existing global binary or claim local captions passed. No installation was performed during that audit. This hardware/runtime action does not block independent repository work or require the SSD.

Plug in the external SSD and create the dedicated KINAOU directory (KINAOU never touches anything else on the SSD):

```bash
mkdir -p /Volumes/<YOUR_SSD>/KINAOU
```

## Stage 1 — Start PWA and worker

The PWA and the worker are two long-running processes: each needs its own terminal window (⌘N), and both must stay running the whole time.

Terminal A (PWA) — first run:

```bash
git clone https://github.com/Impekal/kinaou && cd kinaou
npm ci
npm run dev
```

(Existing clone instead: `cd kinaou && git pull && npm ci && npm run dev`.)

The dev server serves the PWA at **http://localhost:4173**. Leave this terminal running.

Terminal B (worker) — a separate window:

```bash
cd kinaou
export KINAOU_MANAGED_ROOT="/Volumes/<YOUR_SSD>/KINAOU"
node worker/mac-worker.mjs
```

The worker prints a one-time token (or set `KINAOU_WORKER_TOKEN` yourself). In the PWA: **Settings → Local worker** → URL `http://127.0.0.1:43117`, paste the token, **Test connection**.

**Expect:** capability chips `filesystem, publish-package, publish-package-library, publish-package-integrity, publish-preflight, format-reframing, ffmpeg, media-probe, asset-upload, media-proxy, media-thumbnail, media-waveform`, plus `screen-capture` (macOS) and `web-capture` if Chrome/Chromium/Firefox is installed. AI chips (`local-llm`, `speech-to-text`, `text-to-speech`, `image-generation`, `video-generation`) appear only when their runtime is installed — their absence is correct, not a bug.

## Stage 2 — Core media path (no AI needed)

1. Create a project.
2. **Assets** → import a video file through the browser chooser → it should land in `KINAOU/Assets`, get probed and registered automatically.
3. Place it on a compatible track, trim/move it, adjust gain/speed/fades.
4. **Studio** → render an export → check the MP4 in `KINAOU/Renders`; generate the composed preview and scrub it.
5. Generate proxy, thumbnail and waveform for the asset.
6. Create a version snapshot, change something, restore the snapshot.
7. Drive resilience: eject/unplug the SSD → **Assets → Check media availability** → managed assets show OFFLINE and are blocked from rendering/placement with honest reasons. Replug the SSD, run the check again → AVAILABLE. Nothing is deleted or modified either way.

## Stage 3 — Real screen capture (macOS permissions)

1. **Capture** → Screenshot, Entire display, 3 s delay → on the first capture macOS asks for **Screen Recording** permission for the terminal app running the worker. Grant it, then **quit and restart the worker** (macOS applies this permission only to newly started processes) and capture again.
2. Screenshot with **Pick window or area on screen** (crosshair; Space selects a window; Escape cancels — expect the honest "cancelled on screen" error when you escape).
3. Screenshot with **App window by name** (e.g. `Safari`): first use triggers **Automation** (and possibly **Accessibility**) prompts — grant, restart the worker if it still fails, retry.
4. Screen recording with a 60 s maximum → **Stop & keep** after a few seconds → the recording should register with its real duration.

**Expect:** files in `KINAOU/Assets/Captures`, assets labelled REAL CAPTURE, honest error messages naming the System Settings pane whenever a permission is missing.

## Stage 4 — Website capture

Needs any installed Chrome, Chromium or Firefox (or point `KINAOU_CHROMIUM`/`KINAOU_FIREFOX` at a binary).

**Capture → Website capture** → Detect browsers → capture `https://example.org` → expect a real PNG in `KINAOU/Assets/WebCaptures` with URL/browser/version provenance on the asset.

## Stage 5 — Optional local AI runtimes (each independent)

- **Ollama** (Director, AI Editor, Media Plan): install Ollama, pull a model that fits 16 GB (e.g. `ollama pull llama3.1:8b`). Director → detect models → generate a plan → review → apply.
- **Scene Media Plan** (needs Ollama + storyboard): try both modes — "Plan and acquire immediately" and "Propose a plan for review" (edit an item, add one, remove one, then "Validate and run plan"; labels follow the app language). Check the automatic "Before media acquisition run" version afterwards. A failed step stops later entries, and stopping UI monitoring does not cancel accepted worker jobs.
- **whisper.cpp** (STT): set `KINAOU_WHISPER_CLI=/absolute/path/to/whisper-cli` and put a `ggml-*.bin` model into `KINAOU/Models`. Assets → transcribe → transcript asset → Captions from segments.
- **Piper** (TTS): set `KINAOU_PIPER_CLI=/absolute/path/to/piper` and put a voice (`*.onnx` + `*.onnx.json`) into `KINAOU/Models`. Audio → detect voices → generate → place on timeline.
- **ComfyUI** (image/video generation): run ComfyUI on `http://127.0.0.1:8188` with your models, and put at least one API-format template wrapper into `KINAOU/Models/ComfyUI/Workflows` (JSON with `schemaVersion: 1`, `id`, `label`, optional `"mediaType": "video"`, `workflow` in ComfyUI API format, and `bindings` naming which node inputs KINAOU may set — `positivePrompt` required; `negativePrompt`/`seed`/`width`/`height` optional). Images/Video → Check availability → generate → asset with prompt/seed provenance.
- **Optional portrait/own-recording video inputs (#183):** only after installing a trusted local video workflow, add its explicit LoadImage/LoadAudio reference bindings as documented in [VIDEO-REFERENCES.md](VIDEO-REFERENCES.md). Import a permitted portrait and your own/authorized recording, each up to 32 MiB. Video → Check availability → select template → select and authorize every displayed reference → Generate locally. Expect original files unchanged, unique copies in ComfyUI's input directory, and generated video metadata retaining reference IDs/paths/hashes. Changing an asset must clear its authorization; missing permission must disable generation. Cancel during an upload and verify no subsequent workflow submission; received ComfyUI copies may remain, as disclosed. Review actual audio, duration, lip sync, identity and motion; a green job alone is not a pass for avatar quality. No requirement to run this optional model test before independent repository work can continue.

## Stage 6 — The full loop

Project "How to use X" → Director **Language & Audience** profile → Director plan → Media plan (either mode) → storyboard fulfillment check → **Studio → Assemble the fulfilled scenes** → **Narrate the scenes** (needs Piper) → **Write captions from the script** → pick the output format → **Start render** → **Publish → Create local publish package**. That is the complete Discover → Direct → Generate → Edit → Adapt → Export → local handoff path on real hardware, without placing a single asset by hand or uploading anything. Set the output language to German, English or French and confirm the generated Director plan uses that language throughout; market, audience, objective and tone must survive a reload. The local model must not present invented live trend/search-volume claims as facts.

What to check along the way:

1. **Assemble** places the scenes in storyboard order, back to back, on the chosen visual track. Running it again must skip everything ("already on …") instead of duplicating clips. Replace a scene's visual after assembling and the panel offers to **update the replaced scenes**: the new media appears inside the clip that is already there, at the same start instead of being appended at the end. Shorter replacement footage may shorten the clip; review gaps, transitions, audio and captions.
2. **Captions** appear on the caption track, split at sentence boundaries and aligned to the clips — not to the storyboard's planned durations. Each one stays editable in the Caption Studio; a second run must skip captioned scenes. Change a scene's length afterwards (by fitting it to its narration, or by replacing its visual with shorter footage) and the panel offers to **realign the captions**: they stretch back across the scene in the same order, with the words untouched.
3. **Format** (Landscape / Vertical / Square) belongs to the project: switching it also switches the composed preview, and the choice survives a reload. Under **Framing by output format**, leave Vertical on **Fill frame and crop**, move its horizontal focus clearly left, render/preview it, then move clearly right and refresh. Confirm the chosen source side changes and survives a reload while Landscape and Square keep their own settings. **Show whole image** should letterbox instead of crop. If the worker was already running before this feature was pulled, restart it once so the `format-reframing` capability appears.
4. **Narration** (only with Piper installed) speaks each scene narration (legacy scenes without that field use their description; an explicit empty narration stays silent) and places it under that scene on the voice track. A voice that runs longer than its scene is flagged as an overrun rather than cut, and **Fit the scenes to the narration** then lengthens exactly those visuals until each covers its own voice, moving everything after them by the same amount so the cross-dissolves keep their width. Footage with no frames left to give is extended as far as it goes and says why it stopped. A second run skips narrated scenes.
5. Each of these actions writes an automatic version first, so restoring "Before assembling scenes on the timeline", "Before generating scene narration" or "Before writing captions from the script" undoes that whole batch.
6. **Persistent Short batch, selective recovery and archive**: select at least two Short × output-format variants and start the sequential batch. While one is active, reload the PWA; test the worker connection again if the session connection is no longer shown. Expect `SHORT EXPORT BATCH · SAVED WITH PROJECT`, completed variants still terminal and only unfinished work continuing one at a time. Do not edit the timeline during this check: if the timeline/media/settings differ after reload, KINAOU must block resume instead of rendering changed content. Restarting the worker too may make it forget the active job; KINAOU requeues that item only when its output path is absent and never overwrites an existing file. Cancel a later variant, let the batch become fully terminal, select that cancelled attempt and click **Retry selected variants**. Expect a new `attempt 2` row and a new filename containing `retry2`; the earlier row and every successful MP4 must remain untouched. Reload during the retry and confirm only that new queued/running attempt resumes. Once terminal again, click **Archive and clear current batch** (or prepare a new reviewed batch). Expect an expandable entry under **PAST SHORT BATCHES** with the same attempt states and paths; reload and confirm it remains. Click **Review current selections**: it must only preselect the current matching ranges and formats for inspection; it must not submit a job, change an archived path or create a file. Review the highlighted current ranges, then use the normal explicit **Export selected variants** action only if you actually want fresh outputs. Click **Check recorded files** for that entry: successful outputs still on the SSD should show `FILE PRESENT`, while a cancelled/failed path with no completed MP4 should show `FILE MISSING`; the batch header shows the same totals and a check time. Disconnecting the SSD should make a fresh check report the paths missing, and reconnecting then checking again should restore the present results. The check must not hash or modify any file or archive metadata. Finally use **Forget summary (keep every file)** and verify only the entry disappears while the rendered MP4 still exists.
   - **Saved cancellation (#225)**: request cancellation while a batch is active, then reload and reconnect to the original worker. The DE/EN/FR saved-request note must remain; known accepted work is asked to cancel and later variants must not start. Actual worker success wins a completion/cancellation race. If the request was saved while the initial submission had no known job ID, resume must be blocked: inspect the worker/output before deliberately clearing the old batch, never infer that the job was cancelled. Initial POSTs now retain a write-ahead marker (#227): interruption without a saved acknowledgement blocks automatic re-submission even without cancellation. The UI must display acceptance as unconfirmed, not failed/cancelled; deliberate clearing does not stop an unknown worker job. Legacy unmarked submissions cannot retroactively gain this guarantee. A failed project save must not activate cancellation; explicit selective retry resets intent only with fresh validated outputs.
7. **Publish** lists only recorded successful exports. Choose the new MP4 and click **Check export file** first. Expect four green checks for file size, video stream, output dimensions and duration plus the actual video/audio codecs; **Create local publish package** remains disabled until they pass. Enter destination/title/description/tags and click **Save as project defaults**; change the form, then **Use saved defaults**, and reopen the project once to confirm the saved values return automatically. **Clear saved defaults** must remove only the stored copy and keep the current form. Create the local package. Expect a new uniquely named version-2 `*.publish.json` beside the MP4 in `KINAOU/Renders`; its media path/range/format, probed media facts and SHA-256 fingerprint must describe the export while the MP4 remains unchanged. Click **Refresh packages**: the new handoff appears with `MP4 AVAILABLE` and `NOT VERIFIED`; click **Verify integrity** and expect `UNCHANGED` after the selected MP4 has been streamed once. **Open metadata** restores its destination/title/description/tags and selects the matching recorded export. If the MP4 is later changed, explicit verification reports `MODIFIED`; if it is absent, refresh reports `MP4 MISSING` and verification reports `MISSING`, without deleting or changing anything. Older version-1 sidecars remain visible as `NO DIGEST · LEGACY`. Nothing is sent to the selected platform.

The complete loop was rehearsed in the development sandbox against the real worker: two captures → assembly with alternating zoom and a 0.5s cross-dissolve → narration per scene → captions → vertical format → a rendered 1080×1920 MP4 of 13.5s with an audio track. Your Mac run verifies the same path on real hardware with a real Piper voice.

## Optional course outline and lesson export check (PR #185)

Use a separate test project with a working timeline of at least two distinct video sections plus audio. Course → add a module and two named lessons → set non-overlapping In/Out ranges within that timeline, objectives and course language → Save course outline. Reload and reopen Course: all fields must remain. Studio → Version History should contain the pre-save safety version. A later saved outline change can be restored without changing any media file.

In Studio → Render → Course lesson export, choose the first lesson. The exact saved range must appear, but no render starts until **Start render**. Export, then select/export the second lesson. Both MP4s must exist independently; inspect their actual first/last frames, duration and audio. Successful receipts show the correct course/module/lesson and outline revision. Rename the course or remove a lesson from the saved outline: earlier receipts must keep the submitted identities and both MP4s must remain. An Out point beyond the active timeline must disable that lesson in the selector. Manually editing the Render In/Out controls must clear the course selection so a custom range is not falsely attributed to a saved lesson.

No AI runtime is needed for this optional test. Save before leaving Course; unsaved form edits are drafts. Course language is not an automatic translation or voice-profile change. These checks do not verify pedagogical quality or Udemy approval; see COURSE-PRODUCTION.md.

## Optional application-language check (PR #187, no worker/SSD needed)

Director interaction (#233): in a disposable project, enter an original audience/brief and select a different content language. Review a valid manual DirectorPlan JSON containing separate visual directions, narration and a silent scene. Change DE→FR→EN: drafts and content language must remain, while the full-script disclosure and speech/media labels translate. Save a changed content profile: the earlier plan review must become stale. Re-review before applying; save success requires history and project persistence. Reload to check accepted plan/profile, then restore its pre-apply safety version. Timeline/media remain untouched; review their associations after changing storyboard. With an explicitly installed local model, changing project/connection/source during generation must discard the late reply without claiming the model call was cancelled. The neighboring Media Plan has its own scoped run (#235).

Media Plan interaction (#235): with a disposable project and explicitly installed local runtimes, propose a reviewed plan; edit original URLs/app names/positive and negative prompts and switch DE→FR→EN. Original data must stay unchanged. An unsupported negative prompt must stop before submission. Run a valid plan: verify the pre-run safety version, saved media/empty-scene assignments and preservation of fulfilled scenes. A failed step stops later entries; earlier saved assets and actual worker files remain. While a request is pending, save a profile/project edit or stop monitoring: no late plan/status may overwrite that edit or start the next item. UI detach does not cancel accepted work. Inspect worker outputs before a deliberate retry; reloading does not promise automatic recovery or draft persistence. These runtime checks remain distinct from the synthetic fault-only browser verification.

Audio Studio interaction (#237): using a disposable project and an explicitly installed Piper voice, detect/select the voice and enter original narration. Start, edit the next text draft and switch DE→FR→EN: submitted text, selected voice and current job must remain, with translated status. Only persisted media may show saved success. Audition real speech separately; the automated tone fixture is not speech-quality evidence. Try an independent cancellation and inspect its actual confirmed result. Add a previously generated asset to the timeline while another job runs: monitoring must detach and late results must not overwrite the edit. Reload should retain saved assets/clips but not credentials, draft or unfinished monitoring. Restore the pre-save history and verify files remain. Known status/save failures offer same-job checks or save-only retry, never a second synthesis. Unknown initial acceptance needs worker/file inspection before deliberate restart. Storage-failure behavior is covered by deterministic tests; do not fill your disk to simulate it.

AI Editor interaction (#231): in a disposable project, review a valid proposal against existing clip IDs and select one change. DE→FR→EN must retain the JSON, instruction and checkbox while translating controls and numeric comparisons. Manually move a clip: the review must become stale and saving disabled. Re-review against the new baseline, select and save; success appears only after safety/project persistence. Reload and verify the new timing, then restore the pre-edit history. No local model is needed for manual JSON. With an already installed local model, changing the project/connection or source while generation is pending must discard the late reply, not apply it. Leaving ends this UI lifetime, not model execution. Drafts are not autosaved; do not exhaust disk/browser storage to simulate failures.

Voiced-portrait interaction (#229): in a disposable project with an authorized managed image and a recording with measured duration, open Avatar. Choose both sources and type an original presenter name; DE→FR→EN must keep all three draft values while translating controls, validation and the no-lip-sync boundary. Add the pair: only a successful safety/project save may show success and clear source selection. Switch language again to verify the saved-result message changes without renaming content. Studio must show two ordinary editable tracks covering the full recording; reload must retain them, and restoring the pre-add safety version must remove the addition without deleting media. An actual export must include the whole audio and a still visual. This does not test animation, voice cloning or speech quality; storage-write failures are covered by deterministic tests, not by intentionally exhausting your disk.

In a separate test project, change **App language / App-Sprache / Langue de l’application** between Deutsch, English and Français. Navigation and Create/Course labels should switch immediately, while the notice explains that other specialist panels remain English. Type a project title/brief before switching: both must remain unchanged. In Course, type a draft title, add a module/lesson and choose a different content language; switching app language must preserve that entire unsaved draft and the content-language selection.

Try saving a whitespace-only course title. The save must be rejected with a translated summary and original technical details; switch app language while the error is shown to check it changes too. Correct/save or explicitly discard the test draft. Reload: the app language and saved course must remain, with the original names/content language and no unintended revision. Unsaved edits are not promised to survive reload or leaving Course. Use the normal origin for your own projects; an isolated test origin intentionally has separate browser storage.

Image Studio interaction (#239): with a disposable project and explicitly installed image workflow, detect the template and enter original positive/negative prompts, seed and supported dimensions. Blank seeds, invalid dimensions and unsupported negative prompts must block submission. Switch DE→FR→EN while a job runs and edit the next draft: submitted provenance must remain original. Success requires saved project metadata, not merely a finished worker file. Test known status/save recovery without a second generation. Assign then clear a scene visual, including a scene with narration or explicit silence; speech, assets and timeline must remain intact, and history must restore the prior assignment. Reload retains saved assets but not credentials, drafts or unfinished monitoring. Automated tests use an explicit PNG fixture plus actual worker/FFmpeg, not model-quality evidence. Inspect real image quality separately; no model installation is implied.

Video Studio interaction (#241): with a disposable project and explicitly installed trusted local video workflow, detect the template, enter original prompt/seed/dimensions and select/authorize every declared reference. Own recordings are accepted references, not voice cloning. Missing/offline/oversized references and unconfirmed permission must block generation. Switch DE→FR→EN during a run; submitted parameters and permission must remain unchanged. Editing the next draft must not rewrite the job. Only persisted video shows saved success; known failures retry the same job/save, not generation. Reuse starts nothing and clears references/permissions. A timeline edit during generation must detach late replies without overwriting the edit; output files may remain. Reload retains saved assets but not credentials, draft or unfinished monitoring. Verify actual animation/lip sync/audio quality separately; explicit MP4/tone fixtures used by tests are not evidence of model quality.

Explicit file import interaction (#243): in a disposable project choose a small local image/audio/video file through the file picker. Switch DE→FR→EN before and during upload and verify the selected filename remains original. Saved success must follow actual copy inspection and project persistence. Reload retains the asset, not the file selection or unfinished recovery. Restore the pre-import version and confirm source/copy remain. A project edit or leaving during transfer must suppress late registration without claiming transfer cancellation; inspect files before a new import. Deterministic tests cover probe/save-only retry and unknown acceptance; do not fill the disk to simulate failure. The automated browser picker session was interrupted, so selected-file/pending-upload interaction still needs this local check; actual authenticated upload/probe/save is covered by an executing WAV integration test.

Media availability interaction (#245): in a disposable project with disposable copied media, check availability and switch DE→FR→EN; summaries include check time and do not rename assets. Temporarily move only that test copy aside, recheck and confirm offline marking blocks timeline insertion; return the copy and recheck to restore availability. Reload retains flags, not the transient check summary. Project/connection changes during a slow check must discard its late result. History restores flags only, never files; run a fresh check afterwards. These checks do not certify file contents/integrity/quality. Do not disconnect or move active production storage to exercise this test.

Existing-media registration (#247): in a disposable project, inspect a known test file already under KINAOU/Assets. Set its actual media kind and an original display name. Review must not register anything yet; DE→FR→EN preserves the draft and measured result. Changing path, kind or name removes the save action until a new inspection succeeds. A mismatched stream kind must fail, not register misleading metadata. Explicit registration creates a safety version and saves the portable file reference; reload retains the asset. Reinspecting the same registered path is rejected rather than duplicating it. Restore the pre-registration version and verify the file remains unchanged. Project/connection changes or leaving discard late replies; draft/review is not promised across reload. Measurements describe inspection time, not quality or integrity; no SSD or model is required for this optional check.

## Optional scene narration interaction check (#205)

Use a disposable project and an explicitly installed Piper voice; no automatic model download. Detect/select the voice in Studio, start scene narration and switch DE→FR→EN while it runs. Selection and job must stay the same; saved/skipped results must follow the UI language while speech and scene names remain original. Include one deliberately empty narration: it stays silent. A repeated run skips existing narration assets.

In a separate run, move a timeline clip before synthesis finishes. Expect the run-detached message; the later result must not overwrite that edit or insert a voice clip. Leaving Studio or changing connection has the same monitoring boundary. Accepted worker work may finish and keep its file; detach is not cancellation. If status or saving fails, use the same-job retry, not a new synthesis. Unknown submission acceptance requires checking the worker before deliberately starting again.

Fit an overrun, verify the shifted later clips and restore its safety version. Review absolute lesson/export ranges, captions and transitions manually. Listen to actual speech separately for quality: passing this interaction test is not evidence of natural emotion or voice cloning.

## Troubleshooting

### Spoken-text regression check (after PR #181)

In a separate test project, review a Director plan containing a visual description such as "Pan across the classroom" but a different `narration` such as "Welcome to this lesson". Review must show both separately. Apply, save/reopen, assign/assemble a visual and generate scene narration/captions. Both must use "Welcome to this lesson", not the camera direction. An explicit empty `narration` must skip speech and script captions with a silent-scene explanation. A legacy scene with the field absent retains its previous description-based behavior. Existing recordings and captions are skipped, not overwritten; use fresh test scenes to test this change. Caption timings are still estimates distributed over the scene, not forced alignment.

| Symptom | Fix |
|---|---|
| Worker exits at start: managed root error | `KINAOU_MANAGED_ROOT` must exist and the directory must be named exactly `KINAOU` |
| Screenshots show only the wallpaper / "Capture produced no file" | Grant Screen Recording to the terminal running the worker, then restart the worker |
| App capture fails with an authorization message | System Settings → Privacy & Security → Automation + Accessibility for the worker's terminal; restart the worker |
| "No supported local browser" for web capture | Install Chrome/Chromium/Firefox or set `KINAOU_CHROMIUM`/`KINAOU_FIREFOX` |
| Worker exits with `EADDRINUSE: address already in use 127.0.0.1:43117` | An earlier worker is still running (often in another terminal window). Kill it with `kill $(lsof -ti :43117)`, verify `lsof -ti :43117` prints nothing, then start the worker again. Alternatively set `KINAOU_WORKER_PORT` and use that URL in Settings |
| Lost the token | Restart the worker (a new one-time token is printed) or set `KINAOU_WORKER_TOKEN`. Every restart invalidates the previous token — paste the new one in Settings |
| "Invalid worker health response" after Test connection | The Settings URL points at the wrong server (e.g. the Vite dev server). The worker URL is `http://127.0.0.1:43117`, not `http://localhost:4173` |
| `http://localhost:4173` shows a different app | A previously installed PWA/service worker from another project is hijacking the port. Clear the site data / cache for `localhost:4173` in the browser and reload |
| `npm run dev` fails with "Port 4173 is already in use" | An earlier dev server is still running in another terminal window and would serve stale code. Stop it with `kill $(lsof -ti :4173)`, then start the dev server again. Never run the app on a fallback port — projects are stored per browser origin and only exist under `localhost:4173` |
| Unsure whether the browser runs the current code | The sidebar shows `build <commit> · served since <time>`. After `git pull`, restart the dev server and hard-reload (⌘⇧R) until the commit matches `git -C ~/kinaou log --oneline -1` |

## What to report back

1. The capability chips shown after Test connection.
2. Which stages were green.
3. For anything red: the exact error text shown in the PWA and the worker's terminal output.
