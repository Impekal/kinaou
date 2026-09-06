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
Current main SHA after PR #13: `b31f4ce3b504707c26b483505fd6a7101f9d10cb`

## Merged slices
- **PR #1** — foundation. Main `0230448aad6ee49e98118ab196b91f2b20e8ca8a`. React/Vite/TS, project schema, non-destructive timeline, storage safety, versioning, jobs, model registry, CI.
- **PR #2** — product core. Main `581cd2a18a7d963f6bf0c630d797716ef3a8d6dd`. Persistent projects, Create flow, standard tracks, timeline persistence, storage profiles.
- **PR #3** — media core. Main `bb93d8d0374ee1a32f2e1d76346d9b2ae91918a4`. Asset registry/offline state, worker scheduling, deterministic safe render plans.
- **PR #4** — local worker contract. Main `c53c720936624b0e208aaa339d63f55d489a7e6f`. Worker RPC, managed-root mapping, ffprobe/ffmpeg planning.
- **PR #5** — startable Mac worker. Main `3677d3994a143da9f88442eb004fe278dd31dfe7`. Authenticated localhost Node worker, real ffprobe, first real ffmpeg, `shell:false`, KINAOU-only paths.
- **PR #6** — PWA worker bridge. Main `c71efbc1eb7d176abdd08b264ecd39acdde0e82d`. WorkerClient, in-memory token, managed media import.
- **PR #7** — visible worker + Assets UI. Main `92e6069547a79e9d62e220edb0e2794ad8fb360c`. Worker Test Connection/capabilities, real managed media probe/import. Final gate 28/28 + build + worker syntax green.
- **PR #8** — async render jobs + multi-track compositor. Main `7d2cc05b975d77057dc6a95b79fe30e0f0ef376e`. queued/running/succeeded/failed/cancelled jobs, progress/status/cancel, visual layering and voice/dialog/music/SFX mixing. Speed != 1 explicitly blocked. Push + PR gates green.
- **PR #9** — visible Studio render lifecycle. Main `48bd07bd5b04125b7d7d98a26d680ec42fe5bea1`. Safe output naming, readiness, start/poll/cancel/result/retry UI. Unsupported captions, planning/external/offline assets and speed changes blocked. Push + PR gates green.
- **PR #10** — real media placement + timeline controls. Main `22589ca9ca6f9ed9ed53c8799e6865f075c41976`. Managed asset → compatible selected track; probe duration/still defaults; mute/lock/move/trim/remove/audio gain. Locked-track enforcement. Push + PR gates green.
- **PR #11** — secure browser file import + deterministic visual z-order. Main `576dc633a5987bf819ccb79f0cc0754414587691`. Explicit browser File/Blob streaming to authenticated worker; worker receives bytes, never arbitrary source path. Upload writes `.part` under `KINAOU/Temp/Uploads`, enforces configurable size limit, sanitizes/collision-proofs destination, atomically renames to `KINAOU/Assets`, cleans failures, then PWA probes/registers asset. Worker advertises `asset-upload`. Native `node:test` worker security tests were separated from Vitest discovery. RenderPlan now carries `trackIndex`; higher visual track indexes composite later/on top independent of clip start order. Final push + PR gates: Vitest + native worker tests + production build + worker syntax all green.
- **PR #12** — CI notification noise + reproducible installs. Main `f13c9d349f478b1bbac0d90eae93461e0e0b4f31`. Feature work is gated once through `pull_request`; `push` CI now runs only on `main`, so intermediate work-in-progress commits no longer generate repeated failure notifications or duplicate PR checks. Superseded runs are cancelled, workflow permissions are read-only, `package-lock.json` is committed and CI uses `npm ci`. Final local gate: 40/40 Vitest + 2/2 native worker tests + production build + worker syntax. PR gate green.
- **PR #13** — supported GitHub Actions runtime. Main `b31f4ce3b504707c26b483505fd6a7101f9d10cb`. `actions/checkout` and `actions/setup-node` moved to v5, removing the deprecated Node 20 action-runtime warning while the application test matrix remains on Node.js 22. Local and PR gates green.

## CI incident record (2026-09-06)
The repeated GitHub “all jobs failed” emails did not indicate a broken `main`. CI was configured with `push.branches: ['**']`, so every intermediate commit on every feature branch immediately triggered a full run; opening a PR triggered another run for the same head. A PR #11 work-in-progress sequence produced 13 consecutive red push runs while native `node:test` coverage was temporarily being discovered by Vitest; the final feature head, PR gate, merge commit and documentation commit were green. Earlier isolated failures were normal pre-fix commits: the initial CSS side-effect import lacked Vite types, the Worker UI used nested probe fields not present in its type, and the compositor test still expected complex plans to be rejected after support was added. All were corrected before their PRs merged. There are no open PRs after PR #13.

## Important modules
- `src/core/project.ts` — project/assets/tracks/clips/storyboard schema.
- `src/core/timeline.ts` — immutable edit operations incl. track state and clip gain.
- `src/core/timelinePlacement.ts` — safe compatible real-asset placement.
- `src/core/storage.ts` / `persistence.ts` — storage safety + persistent project metadata.
- `src/core/render.ts` / `renderJobs.ts` / `renderUi.ts` — RenderPlan, trackIndex, job lifecycle, readiness/output helpers.
- `src/core/localWorker.ts` — safe path mapping, ffprobe parsing, deterministic compositor planning.
- `src/core/workerClient.ts` / `workerProtocol.ts` — authenticated localhost bridge incl. asset upload/render lifecycle.
- `src/core/assetUpload.ts` — browser upload response validation.
- `src/core/mediaImport.ts` — probed media → managed project asset.
- `src/components/AssetUploadPanel.tsx` — explicit browser file chooser → upload → probe → register.
- `src/components/TimelineEditor.tsx` — real timeline controls.
- `src/components/AssetPlacementControl.tsx` — compatible track chooser + Add to timeline.
- `src/components/RenderPanel.tsx` — real render start/progress/cancel/result.
- `worker/asset-upload.mjs` — safe filename/temp/final upload paths.
- `worker/mac-worker.mjs` — actual local upload/ffprobe/FFmpeg runtime.
- `src/App.tsx` — Projects/Create/Studio/Assets/Settings shell; unfinished sections are not faked.

## Current real end-to-end path
1. Create/reopen persistent project.
2. Connect authenticated localhost worker.
3. Select video/audio/image explicitly in browser OR probe an existing managed asset.
4. Worker streams selected file safely into `KINAOU/Assets`; PWA auto-probes and registers it.
5. Choose compatible timeline track and place asset.
6. Move/trim/mute/lock; adjust audio gain.
7. Render deterministic multi-track visual/audio composition to `KINAOU/Renders` with explicit z-order.
8. Watch progress, cancel, see failure/result, retry as new job.

## Current limitations
- Caption/subtitle tracks are not rendered yet.
- No transitions, crop/position/keyframes, fades/automation or exact speed retiming.
- No thumbnails/waveforms/proxies.
- No real local AI model execution yet; Director/AI Editor remain intentionally non-functional UI slots.
- Local worker has not yet been run against the user's actual Mac/SSD; repository behavior is CI-tested, local hardware execution remains a later USER ACTION.

## Current next milestone
Build **real caption/subtitle creation + render support**.
Immediate plan:
1. structured caption assets stored as project metadata rather than arbitrary external files,
2. caption creation/edit UI on Caption track,
3. caption clips participate in RenderPlan without requiring `KINAOU/Assets` file URI,
4. worker generates temporary managed ASS subtitle file under `KINAOU/Temp`,
5. safe ASS escaping/timing,
6. FFmpeg burns captions after visual composition,
7. cleanup temp subtitle file on success/failure/cancel,
8. remove Caption-track render blocker,
9. tests for Unicode/punctuation/multiline captions and timing.

## Later roadmap
Studio fidelity: captions → transitions → retiming → fades/automation → transform/keyframes → proxies.
AI creation: DirectorPlan schema → local LLM adapter → script/storyboard/scenes → STT/TTS → image/video adapters → AI Editor structured proposals/diffs/undo.
Advanced: Avatar, Audio Studio, browser/app capture, commentary/reaction/duo, long-to-short, content factory, trend/opportunity, platform adaptation, official-API publishing, analytics/learning loop.

## Definition of first major KINAOU core milestone
User can create a project, obtain script/storyboard/scenes, import/generate media/voice/captions, edit a real timeline, AI-edit selected ranges reversibly, render/export, reopen safely, and keep models/projects/assets on external SSD with disconnect/reconnect resilience.

## Working discipline
For every meaningful slice: verify main → feature branch → implement real behavior → tests → PR → green CI → merge → update this file.

## USER ACTIONS AT END
No user action blocks independent repository work now.
A later real Mac execution test requires Node.js 22+, FFmpeg/ffprobe in PATH, a selected external SSD `KINAOU` directory, and launching worker with `KINAOU_MANAGED_ROOT` plus token. Keep independent repo work moving until then.
