# KINAOU Local Mac Worker

This worker is the trusted local bridge between the KINAOU web/PWA UI and macOS filesystem/media tools.

## Safety model

- Listens on `127.0.0.1` only.
- Requires a Bearer token for every request.
- Requires `KINAOU_MANAGED_ROOT` to point to a directory named exactly `KINAOU`.
- Resolves all media paths below that managed root.
- Render outputs are restricted to `KINAOU/Renders/...`.
- Uses `spawn(..., { shell: false })`; request content is never interpolated into a shell command.
- Existing folders/files outside the selected `KINAOU` directory are out of scope and must never be touched.
- Local model adapters accept loopback HTTP endpoints only; cloud URLs and credentials in adapter URLs are rejected.

## Endpoint overview

Core filesystem/media (advertised honestly per detected tool — `ffmpeg`/`media-probe` chips exist only when FFmpeg/ffprobe are actually in PATH):

- `GET /health` — capability/version handshake with honest chips.
- `POST /probe` — real ffprobe metadata extraction for an existing managed asset.
- `POST /assets/import` — browser-streamed upload into `KINAOU/Assets` (size-bounded `.part` + atomic rename; the worker never reads arbitrary source paths).
- `POST /assets/availability` — per-path real file presence for managed assets, so the PWA can mark media OFFLINE after a drive disconnect and back online after reconnect.
- `POST /assets/proxy` / `POST /assets/thumbnail` / `POST /assets/waveform` — deterministic managed derivatives under `KINAOU/Cache`.
- `GET /media?path=…` — authenticated streaming of managed originals and generated previews.
- `POST /render`, `GET /render/jobs/:id`, cancel — the real multi-track FFmpeg compositor: visual layering by track order, audio mixing, caption burn-in, transforms, dissolves, fades and 0.25–4× retiming, for full exports to `KINAOU/Renders` and 540p previews to `KINAOU/Cache/Previews`.
- `POST /projects/save` / `GET /projects/backups` / `POST /projects/restore` — durable project JSON backups under `KINAOU/Projects` (atomic writes, strict ids, size-bounded).

Local AI adapters (all loopback-only, nothing downloaded by KINAOU):

- `GET /models/local`, `POST /director/generate`, `POST /ai-editor/generate`, `POST /media-plan/generate` — Ollama discovery and schema-structured generation at temperature 0.
- `GET /stt/models`, `POST /stt/jobs` (+status/cancel) — whisper.cpp transcription of managed media.
- `GET /tts/voices`, `POST /tts/jobs` (+status/cancel) — Piper synthesis into `KINAOU/Assets/GeneratedVoice`.
- `GET /image/templates`, `POST /image/jobs`, `GET /video/templates`, `POST /video/jobs` (+status/cancel) — ComfyUI generation via managed workflow templates.
- `POST /capture/jobs` (+status/stop/cancel) and `GET /webcapture/browsers`, `POST /webcapture/jobs` (+status/cancel) — real screen and website captures, detailed below.

Local AI modules also define tested contracts for Ollama, whisper.cpp, Piper and ComfyUI. ComfyUI templates are API-format JSON wrappers stored below `KINAOU/Models/ComfyUI/Workflows`; they explicitly bind the prompt, seed and optional dimensions that KINAOU may replace. Execution endpoints are exposed only after their cancellable managed job lifecycle is complete.

Image generation runs against a locally installed ComfyUI instance on a loopback HTTP endpoint (`KINAOU_COMFYUI_URL`, default `http://127.0.0.1:8188`):

- `GET /image/templates` — honest availability (is ComfyUI reachable, which managed templates exist).
- `POST /image/jobs` — bind a managed template copy, submit it, poll history/queue.
- `GET /image/jobs/:id` / `POST /image/jobs/:id/cancel` — status polling and cancellation; pending prompts are deleted from the ComfyUI queue, a running own prompt is interrupted.

Finished images are downloaded from ComfyUI, written to a managed temp `.part` file and atomically renamed into `KINAOU/Assets/GeneratedImages`; failures and cancellations remove partial data. The worker never installs ComfyUI or downloads models itself.

Video generation is capability-based rather than engine-hard-wired: a managed workflow template that declares `"mediaType": "video"` is served through the mirrored `GET /video/templates` and `/video/jobs` endpoints, its `mp4`/`webm`/`mov` output is streamed size-bounded into `KINAOU/Assets/GeneratedVideo`, and each success is probed with ffprobe so the job result carries a real duration. All downloads (image and video) stream through a size limiter to a `.part` file before the atomic rename.

Real screen capture (`screen-capture` capability, macOS only) uses the built-in `/usr/sbin/screencapture` tool, spawned shell-free, and is strictly separated from generated visuals:

- `POST /capture/jobs` — an explicit user-initiated screenshot (optional 0–10s delay, display or bounded region) or screen recording (1–600s maximum, stoppable early). Captures are never started by AI flows.
- `GET /capture/jobs/:id`, `POST /capture/jobs/:id/stop` (finalize a recording early), `POST /capture/jobs/:id/cancel` (discard).
- Output is written to `KINAOU/Temp/Captures` and atomically renamed into `KINAOU/Assets/Captures`; recordings are ffprobe-probed for a real duration; failures and cancellations remove partial data.
- Every result carries `real-capture` provenance (method, display, region, delay, requested duration). macOS gates the content behind its Screen Recording permission (System Settings → Privacy & Security) for the process running this worker; the worker reports honestly when a capture produced no usable file.
- App-window capture by name: the worker activates the named app (launching it if needed) through `osascript` with the app name passed as `argv` — never interpolated into the AppleScript — reads the front window bounds via System Events, and captures exactly that region (screenshot or recording). Requires the macOS Automation/Accessibility permissions; denial and missing windows surface as honest dedicated errors, and the resolved window region is recorded in the provenance.

`POST /media-plan/generate` asks the local Ollama model to propose, per storyboard scene, how to obtain its visual (web-capture URL, app-capture name, or generate-image prompt) as a bounded structured plan. The worker only generates the proposal; every network fetch or app activation happens later, item by item, only after the user approved the reviewed plan in the PWA.

Website capture (`web-capture` capability) takes real, reproducible screenshots of web pages through an already-installed local browser — nothing is downloaded by KINAOU:

- Discovery checks the standard macOS install paths for Chrome, Chromium and Firefox plus `KINAOU_CHROMIUM`/`KINAOU_FIREFOX` overrides, and reports each browser's real version.
- `POST /webcapture/jobs` renders exactly the explicitly entered credential-free http(s) URL headless in an isolated temporary profile under `KINAOU/Temp/WebCaptures`, with a bounded viewport, a timeout, and cancellation; the browser fetches that page (and its own subresources) from the network — nothing else.
- The PNG is atomically renamed into `KINAOU/Assets/WebCaptures`, the temporary profile is always removed, and the result carries `real-capture` provenance with URL, browser, version and viewport, so a web capture stays distinct from both generated visuals and screen captures.


## Local prerequisites

- Node.js 22+
- FFmpeg/ffprobe available in PATH
- an existing dedicated `KINAOU` directory on the chosen internal/external disk

Example environment:

```bash
export KINAOU_MANAGED_ROOT="/Volumes/<YOUR_SSD>/KINAOU"
export KINAOU_WORKER_TOKEN="<a-long-random-token>"
node worker/mac-worker.mjs
```

If `KINAOU_WORKER_TOKEN` is omitted, the worker generates and prints a one-time token for that run.

Do not expose this process to the public internet. Remote/mobile access must later go through an explicitly authenticated KINAOU connection layer, not by changing the worker to listen on all interfaces.
