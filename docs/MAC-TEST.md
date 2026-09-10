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

**Expect:** capability chips `filesystem, ffmpeg, media-probe, asset-upload, media-proxy, media-thumbnail, media-waveform`, plus `screen-capture` (macOS) and `web-capture` if Chrome/Chromium/Firefox is installed. AI chips (`local-llm`, `speech-to-text`, `text-to-speech`, `image-generation`, `video-generation`) appear only when their runtime is installed — their absence is correct, not a bug.

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
- **Scene Media Plan** (needs Ollama + storyboard): try both modes — "Plan & acquire automatically" and "Propose plan for review" (edit an item, add one, remove one, then Validate & run). Check the automatic "Before media acquisition run" version afterwards.
- **whisper.cpp** (STT): set `KINAOU_WHISPER_CLI=/absolute/path/to/whisper-cli` and put a `ggml-*.bin` model into `KINAOU/Models`. Assets → transcribe → transcript asset → Captions from segments.
- **Piper** (TTS): set `KINAOU_PIPER_CLI=/absolute/path/to/piper` and put a voice (`*.onnx` + `*.onnx.json`) into `KINAOU/Models`. Audio → detect voices → generate → place on timeline.
- **ComfyUI** (image/video generation): run ComfyUI on `http://127.0.0.1:8188` with your models, and put at least one API-format template wrapper into `KINAOU/Models/ComfyUI/Workflows` (JSON with `schemaVersion: 1`, `id`, `label`, optional `"mediaType": "video"`, `workflow` in ComfyUI API format, and `bindings` naming which node inputs KINAOU may set — `positivePrompt` required; `negativePrompt`/`seed`/`width`/`height` optional). Images/Video → Check availability → generate → asset with prompt/seed provenance.

## Stage 6 — The full loop

Project "How to use X" → Director plan → Media plan (either mode) → storyboard fulfillment check → **Studio → Assemble the fulfilled scenes** → **Narrate the scenes** (needs Piper) → **Write captions from the script** → pick the output format → **Start render**. That is the complete Discover → Direct → Generate → Edit → Adapt → Export path on real hardware, without placing a single asset by hand.

What to check along the way:

1. **Assemble** places the scenes in storyboard order, back to back, on the chosen visual track. Running it again must skip everything ("already on …") instead of duplicating clips.
2. **Captions** appear on the caption track, split at sentence boundaries and aligned to the clips — not to the storyboard's planned durations. Each one stays editable in the Caption Studio; a second run must skip captioned scenes.
3. **Format** (Landscape / Vertical / Square) belongs to the project: switching it also switches the composed preview, and the choice survives a reload. Render a vertical variant and confirm wide captures are centre-cropped to fill the 9:16 frame rather than letterboxed.
4. **Narration** (only with Piper installed) speaks each scene description and places it under that scene on the voice track. A voice that runs longer than its scene is flagged as an overrun rather than cut — extend the scene or shorten the text. A second run skips narrated scenes.
5. Each of these actions writes an automatic version first, so restoring "Before assembling scenes on the timeline", "Before generating scene narration" or "Before writing captions from the script" undoes that whole batch.

The complete loop was rehearsed in the development sandbox against the real worker: two captures → assembly with alternating zoom and a 0.5s cross-dissolve → narration per scene → captions → vertical format → a rendered 1080×1920 MP4 of 13.5s with an audio track. Your Mac run verifies the same path on real hardware with a real Piper voice.

## Troubleshooting

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
