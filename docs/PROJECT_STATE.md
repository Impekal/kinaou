# KINAOU — PROJECT STATE & HANDOFF

Last updated: 2026-09-06

## Purpose
This is KINAOU's durable project-memory / handoff file. Update it after every meaningful merged slice so a new chat/session can continue without relying on conversation memory.

## Product identity
**KINAOU** is a local-first AI Creative Studio / Creative Operating System.
Core promise: **AI does the work. You stay in control.**
Long-term flow: Discover → Research → Understand → Script → Direct → Generate → Edit → Adapt → Publish → Measure → Learn.

## Non-negotiable decisions
1. Local-first; cloud/API providers are optional adapters, never mandatory.
2. No paid API, cloud GPU, subscription or production deployment without explicit user approval.
3. Non-destructive project/timeline/EDL is source of truth; MP4 is output only.
4. AI edits must be structured, reversible and manually overridable.
5. Models/workers are swappable capability-based adapters.
6. External SSD support is fundamental; never require formatting/clearing it.
7. Existing SSD files/folders are never touched. Automatic operations stay inside `<SSD>/KINAOU/`.
8. Models, Projects, Assets, Cache, Temp, Renders, Archive remain independently relocatable.
9. Missing storage must not corrupt projects; assets can become offline.
10. Start hardware: MacBook Pro M2 Pro, 16 GB unified memory, 512 GB SSD. New hardware is not a prerequisite.
11. Long videos are scene/asset compositions; individual scenes can be regenerated.
12. Preferred UI is web/PWA; trusted filesystem/FFmpeg/model execution is delegated to localhost worker/desktop bridge.

## Storage
```text
<external SSD>/
├── existing user folders (untouched)
└── KINAOU/
    ├── Models/
    ├── Projects/
    ├── Assets/
    ├── Cache/
    ├── Temp/
    ├── Renders/
    └── Archive/
```
Safety rule: only paths below the configured KINAOU root may be created/moved/deleted automatically.

## Repository
Repo: `Impekal/kinaou`
Default branch: `main`
Current main SHA after PR #10: `22589ca9ca6f9ed9ed53c8799e6865f075c41976`

## Merged slices
- **PR #1** — foundation. Main `0230448aad6ee49e98118ab196b91f2b20e8ca8a`. React/Vite/TS, project schema, non-destructive timeline, storage safety, versioning, jobs, model registry, CI.
- **PR #2** — product core. Main `581cd2a18a7d963f6bf0c630d797716ef3a8d6dd`. Persistent projects, Create flow, standard tracks, timeline persistence, storage profiles.
- **PR #3** — media core. Main `bb93d8d0374ee1a32f2e1d76346d9b2ae91918a4`. Asset registry/offline state, worker scheduling, deterministic safe render plans.
- **PR #4** — local worker contract. Main `c53c720936624b0e208aaa339d63f55d489a7e6f`. Worker RPC, managed-root mapping, ffprobe/ffmpeg planning.
- **PR #5** — startable Mac worker. Main `3677d3994a143da9f88442eb004fe278dd31dfe7`. Authenticated localhost Node worker, real ffprobe, first real ffmpeg, `shell:false`, KINAOU-only paths.
- **PR #6** — PWA worker bridge. Main `c71efbc1eb7d176abdd08b264ecd39acdde0e82d`. WorkerClient, in-memory token, managed media import.
- **PR #7** — visible worker + Assets UI. Main `92e6069547a79e9d62e220edb0e2794ad8fb360c`. Worker Test Connection/capabilities, real managed media probe/import. Final gate 28/28 + build + worker syntax green.
- **PR #8** — async render jobs + multi-track compositor. Main `7d2cc05b975d77057dc6a95b79fe30e0f0ef376e`. queued/running/succeeded/failed/cancelled jobs, progress, status, exact cancel, loopback CORS, visual layering, voice/dialog/music/SFX mixing. Speed != 1 explicitly blocked. Push + PR gates green.
- **PR #9** — visible Studio render lifecycle. Main `48bd07bd5b04125b7d7d98a26d680ec42fe5bea1`. Safe output naming, readiness, start/poll/cancel/result/retry UI. Unsupported caption tracks, planning/external/offline assets and speed changes blocked. Push + PR gates green.
- **PR #10** — real media placement + timeline controls. Main `22589ca9ca6f9ed9ed53c8799e6865f075c41976`. Managed assets can be placed on user-selected compatible tracks; video/audio duration from probe, still image defaults 5s, append-at-track-end; offline/unmanaged/incompatible media blocked. TimelineEditor adds mute/unmute, lock/unlock, move, trim, remove and bounded audio gain. Locked tracks enforce edit refusal. Push + PR gates fully green.

## Important modules
- `src/core/project.ts` — project/assets/tracks/clips/storyboard schema.
- `src/core/timeline.ts` — immutable edit operations incl. track state and clip gain.
- `src/core/timelinePlacement.ts` — safe compatible real-asset placement.
- `src/core/storage.ts` / `persistence.ts` — storage safety + persistent project metadata.
- `src/core/render.ts` / `renderJobs.ts` / `renderUi.ts` — RenderPlan, job lifecycle, readiness/output helpers.
- `src/core/localWorker.ts` — safe path mapping, ffprobe parsing, compositor planning.
- `src/core/workerClient.ts` / `workerProtocol.ts` — authenticated localhost bridge.
- `src/core/mediaImport.ts` — probed media → managed project asset.
- `src/components/TimelineEditor.tsx` — real timeline controls.
- `src/components/AssetPlacementControl.tsx` — compatible track chooser + Add to timeline.
- `src/components/RenderPanel.tsx` — real render start/progress/cancel/result.
- `worker/mac-worker.mjs` — actual local ffprobe/FFmpeg runtime.
- `src/App.tsx` — Projects/Create/Studio/Assets/Settings shell; unfinished sections are not faked.

## Current real end-to-end path
1. Create/reopen persistent project.
2. Connect authenticated localhost worker.
3. Probe/register media already inside `KINAOU/Assets`.
4. Choose a compatible timeline track and place the real media.
5. Move/trim/mute/lock clips/tracks; adjust audio gain.
6. Render basic multi-track visual/audio composition to `KINAOU/Renders`.
7. Watch progress, cancel, see failure/result, retry as new job.

## Current limitations
- User still must manually put source files into `KINAOU/Assets`; no secure browser file upload/copy yet.
- Caption/subtitle tracks are not rendered yet.
- Visual z-order is not yet an explicit track-order contract.
- No transitions, crop/position/keyframes, fades/automation or exact speed retiming.
- No thumbnails/waveforms/proxies.
- No real local AI model execution yet; Director/AI Editor remain intentionally non-functional UI slots.

## Current next milestone
Build **secure explicit browser-file import into `KINAOU/Assets` + deterministic track z-order**.
Immediate plan:
1. explicit user-selected browser File only; never arbitrary filesystem path access,
2. localhost worker raw streaming upload endpoint,
3. sanitize/collision-proof destination names under `KINAOU/Assets`,
4. stream to temporary managed file then atomic rename; cleanup failed uploads,
5. return managed path, auto-probe and register asset,
6. visible Assets file chooser/import progress/error,
7. add track index/z-order to RenderPlan and deterministic compositor order,
8. then caption rendering.

## Later roadmap
Studio fidelity: captions → z-order/reorder → transitions → retiming → fades/automation → transform/keyframes → proxies.
AI creation: DirectorPlan schema → local LLM adapter → script/storyboard/scenes → STT/TTS → image/video adapters → AI Editor structured proposals/diffs/undo.
Advanced: Avatar, Audio Studio, browser/app capture, commentary/reaction/duo, long-to-short, content factory, trend/opportunity, platform adaptation, official-API publishing, analytics/learning loop.

## Definition of first major KINAOU core milestone
User can create a project, obtain script/storyboard/scenes, import/generate media/voice/captions, edit a real timeline, AI-edit selected ranges reversibly, render/export, reopen safely, and keep models/projects/assets on external SSD with disconnect/reconnect resilience.

## Working discipline
For every meaningful slice: verify main → feature branch → implement real behavior → tests → PR → green CI → merge → update this file.

## USER ACTIONS AT END
No user action blocks independent repository work now.
A later real Mac execution test requires Node.js 22+, FFmpeg/ffprobe in PATH, a selected external SSD `KINAOU` directory, and launching worker with `KINAOU_MANAGED_ROOT` plus token. Keep independent repo work moving until then.
