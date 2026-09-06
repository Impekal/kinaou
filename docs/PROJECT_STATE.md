# KINAOU — PROJECT STATE & HANDOFF

Last updated: 2026-09-06

## Purpose

This is the durable project-memory / handoff file for KINAOU. Update it after every meaningful slice so work can continue safely after a chat/session limit without relying on conversation memory.

## Product identity

**KINAOU** is a local-first AI Creative Studio / Creative Operating System.

Core promise: **AI does the work. You stay in control.**

Long-term workflow:

Discover → Research → Understand → Script → Direct → Generate → Edit → Adapt → Publish → Measure → Learn

## Non-negotiable architecture principles

1. Local-first; cloud/API providers are optional adapters, never mandatory.
2. No paid API, cloud GPU, subscription, or production deployment without explicit user approval.
3. Non-destructive project/timeline/EDL is the source of truth. MP4 is output, not the project.
4. AI edits must be structured and reversible.
5. Models and compute workers are swappable, capability-based adapters.
6. External SSD support is fundamental.
7. KINAOU must never require formatting or clearing the SSD.
8. Existing user folders/files on the SSD must never be touched.
9. Automatic storage operations are restricted to KINAOU-managed directories.
10. Models, Projects, Assets, Cache, Temp, Renders and Archive remain independently relocatable.
11. Missing/disconnected external storage must not corrupt projects; assets can become offline.
12. Start hardware: MacBook Pro M2 Pro, 16 GB unified memory, 512 GB internal SSD. Heavy tasks may be slow, but new hardware is not a prerequisite.
13. Long-form video is composed from scenes/assets; individual scenes can be regenerated.
14. PWA/web UI is preferred; trusted local filesystem/FFmpeg/model execution is delegated to a local worker/desktop bridge.

## Storage concept

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

Safety rule: only files inside configured KINAOU-managed directories may be automatically created, moved or deleted.

## Repository

Repository: `Impekal/kinaou`

Default branch: `main`

Current main SHA after PR #8: `7d2cc05b975d77057dc6a95b79fe30e0f0ef376e`

## Merged slices

### PR #1 — Foundation
Main SHA: `0230448aad6ee49e98118ab196b91f2b20e8ca8a`
Established React/Vite/TypeScript shell, structured project schema, asset/track/clip schemas, non-destructive timeline operations, storage safety boundary, version history, cancellable jobs, model registry, tests and CI.
Gate after correction: 6/6 tests + production build green.

### PR #2 — Product core
Main SHA: `581cd2a18a7d963f6bf0c630d797716ef3a8d6dd`
Established persistent project repository/storage contract, Create flow, standard initial tracks, usable timeline operations with persistence, storage profiles and browser-vs-worker boundary.
Gate: tests + production build green.

### PR #3 — Media core
Main SHA: `bb93d8d0374ee1a32f2e1d76346d9b2ae91918a4`
Established asset registration/offline state, worker capability scheduler, deterministic render-plan compilation, safe render-output boundary, missing/offline asset blocking and tests.
Gate: tests + production build green.

### PR #4 — Local worker contract
Main SHA: `c53c720936624b0e208aaa339d63f55d489a7e6f`
Established worker RPC, health/probe/render protocol, managed-root mapping, ffprobe planning/parsing, Mac capability handshake and first ffmpeg command compiler.
Gate: tests + production build green.

### PR #5 — Startable Mac worker runtime
Main SHA: `3677d3994a143da9f88442eb004fe278dd31dfe7`
Established startable localhost-only authenticated worker, exact KINAOU root, real ffprobe, narrow real ffmpeg execution, safe output restriction and shell-free process spawning.
Gate: tests + production build + worker syntax check green.

### PR #6 — PWA worker bridge and probed media import
Main SHA: `c71efbc1eb7d176abdd08b264ecd39acdde0e82d`
Established localhost-only `WorkerClient`, in-memory token, health/probe methods, worker error propagation, managed media import and tests.
Gate: tests + production build + worker syntax check green.

### PR #7 — Visible worker UI + managed assets
Main SHA: `92e6069547a79e9d62e220edb0e2794ad8fb360c`
Established visible worker connection controls, Test Connection, capability state, Assets screen, real managed media probe/import and project asset inventory.
Final gate: 28/28 tests + production build + worker syntax check green.

### PR #8 — Async render jobs + basic multi-track compositor
Main SHA: `7d2cc05b975d77057dc6a95b79fe30e0f0ef376e`
Established:
- asynchronous render jobs with `queued/running/succeeded/failed/cancelled`
- worker-side job registry
- status endpoint and exact-job cancel endpoint
- FFmpeg progress parsing and SIGTERM cancellation
- PWA WorkerClient start/status/cancel render methods
- loopback CORS for localhost PWA origins
- black master canvas and timed visual layering for video/B-roll/image/avatar/overlay tracks
- delayed/gain-controlled mixing for voice/dialog/music/SFX tracks
- output remains restricted to `KINAOU/Renders`
- image inputs loop for their clip duration
- speed values other than 1 are explicitly rejected until exact retiming is implemented
- tests for render lifecycle and deterministic compositor planning

Gate: tests + production build + worker syntax check green on push and PR gates.

## Important modules

`src/core/project.ts` — project schema, assets, tracks, clips, storyboard.
`src/core/timeline.ts` — immutable timeline operations.
`src/core/storage.ts` — storage safety and adapter contract.
`src/core/persistence.ts` — persistent project repository.
`src/core/create.ts` — project creation from supported inputs.
`src/core/versioning.ts` — version snapshots/restoration foundation.
`src/core/jobs.ts` — cancellable generic job queue.
`src/core/models.ts` — model registry/capabilities.
`src/core/assets.ts` — asset registration/offline state.
`src/core/workers.ts` — worker descriptors/scheduling.
`src/core/render.ts` — deterministic RenderPlan.
`src/core/renderJobs.ts` — render job lifecycle record/parser.
`src/core/workerProtocol.ts` — worker RPC data types.
`src/core/localWorker.ts` — safe path mapping, ffprobe, compositor command planning.
`src/core/workerClient.ts` — authenticated localhost client including render lifecycle.
`src/core/mediaImport.ts` — probed media → managed asset.
`worker/mac-worker.mjs` — actual local worker with ffprobe, async ffmpeg jobs, basic compositor.
`worker/README.md` — local worker prerequisites and security model.
`src/App.tsx` — visible projects/timeline/worker/assets UI.

## Current real capabilities

KINAOU can currently:
- create/persist/reopen structured projects
- manipulate a non-destructive timeline
- model safe external-SSD storage
- connect visibly to a real localhost Mac worker
- probe and register managed media
- compile safe render plans
- submit asynchronous FFmpeg renders through the worker core
- query/cancel render jobs through WorkerClient core
- composite multiple timed visual layers
- mix designated voice/dialog/music/SFX tracks with delay and gain
- keep all worker filesystem activity inside the selected KINAOU root

KINAOU does **not yet** genuinely:
- expose render start/progress/cancel/result in the visible UI
- copy arbitrary outside media into KINAOU/Assets through an authorized chooser
- burn captions/subtitles into renders
- implement transitions/position/scale/keyframe controls beyond full-frame basic layering
- retime speed != 1 accurately
- generate proxies/thumbnails/waveforms
- execute local AI models
- generate script/storyboard/media through real AI providers

Unsupported capabilities must not be faked in UI.

## Current next milestone

Build **visible render controls and result lifecycle in Studio**.

Immediate scope:
1. safe deterministic output filename helper under `KINAOU/Renders`
2. start render from current project using real RenderPlan
3. require connected worker and renderable managed assets
4. visible queued/running progress
5. status polling with cleanup
6. cancel button
7. success output path/size/duration
8. failure state and retry via a new job
9. prevent concurrent accidental duplicate submissions from UI
10. then add caption rendering, track-level controls and explicit media import authorization

## Roadmap after visible render UI

### Studio/render fidelity
- caption/subtitle burn-in
- track ordering/z-index semantics
- transitions
- speed/retiming
- volume automation/fades
- position/scale/crop/keyframes
- preview proxies

### Basic media I/O
- explicit source-file chooser/copy policy
- thumbnails/waveforms/proxies
- disconnected SSD recovery/re-probe

### Director / creation intelligence
- input understanding
- script
- storyboard
- scene model/planning
- asset decisions
- timeline assembly

### AI Editor
- selected range
- natural-language edit request
- structured edit proposal
- preview/diff
- apply/undo/version restore

### Local model layer
- STT first (Whisper-compatible)
- TTS
- local LLM
- image generation
- video generation
- model install/remove/move through managed storage

### Advanced Studio
- Audio Studio
- Avatar Studio
- browser/app capture
- commentary/reaction/duo
- long-to-short
- content factory

### Intelligence & distribution
- trend/opportunity engine
- platform adaptation
- publishing planner via official APIs only
- analytics/learning loop

## Product-definition milestone

The first major KINAOU core milestone is reached when a user can create a project, get script/storyboard/scenes, import/generate media, fully edit a real timeline, AI-edit selected ranges reversibly, render/export, reopen safely, and use external SSD storage without corruption.

## Working discipline

For every meaningful slice: verify main, feature branch, real implementation, tests, PR, green CI, merge, then update this file.

## USER ACTIONS AT END

No user action blocks independent repository work right now.

A later real Mac execution test requires Node.js 22+, FFmpeg/ffprobe in PATH, the external SSD's `KINAOU` directory, and launching the worker with `KINAOU_MANAGED_ROOT` plus a token. Do not block independent repo work on this test.
