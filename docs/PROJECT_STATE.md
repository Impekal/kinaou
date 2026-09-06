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

Current main SHA after PR #9: `48bd07bd5b04125b7d7d98a26d680ec42fe5bea1`

## Merged slices

### PR #1 — Foundation
Main SHA: `0230448aad6ee49e98118ab196b91f2b20e8ca8a`
Structured project/timeline/storage/model foundations, tests and CI.

### PR #2 — Product core
Main SHA: `581cd2a18a7d963f6bf0c630d797716ef3a8d6dd`
Persistent projects, Create flow, standard tracks, editable timeline, storage profiles.

### PR #3 — Media core
Main SHA: `bb93d8d0374ee1a32f2e1d76346d9b2ae91918a4`
Asset registry/offline state, worker scheduling and safe render plans.

### PR #4 — Local worker contract
Main SHA: `c53c720936624b0e208aaa339d63f55d489a7e6f`
Worker protocol, managed-root mapping, ffprobe/ffmpeg planning.

### PR #5 — Startable Mac worker runtime
Main SHA: `3677d3994a143da9f88442eb004fe278dd31dfe7`
Local authenticated Node worker, real ffprobe and first real ffmpeg execution.

### PR #6 — PWA worker bridge and probed media import
Main SHA: `c71efbc1eb7d176abdd08b264ecd39acdde0e82d`
WorkerClient plus managed media import.

### PR #7 — Visible worker UI + managed assets
Main SHA: `92e6069547a79e9d62e220edb0e2794ad8fb360c`
Worker connection UI, capability state, Assets screen and real managed media probe/import.
Final gate: 28/28 tests + production build + worker syntax check green.

### PR #8 — Async render jobs + basic multi-track compositor
Main SHA: `7d2cc05b975d77057dc6a95b79fe30e0f0ef376e`
Asynchronous render jobs, status/cancel/progress, basic visual multi-track composition and voice/dialog/music/SFX mixing. Output remains inside `KINAOU/Renders`; unsupported speed retiming is explicitly blocked.
Gate: tests + production build + worker syntax check green on push and PR gates.

### PR #9 — Visible Studio render lifecycle
Main SHA: `48bd07bd5b04125b7d7d98a26d680ec42fe5bea1`
Established:
- safe deterministic output names under `KINAOU/Renders`
- render-readiness checks for active timeline content
- visible Studio render panel
- real RenderPlan submission to local worker
- automatic status polling with cleanup
- visible progress/state/output metadata
- exact render cancellation
- terminal-state retry as a new job
- duplicate submission prevention
- explicit blocking for planning/external/offline assets, unsupported caption tracks and speed changes

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
`src/core/renderJobs.ts` — render job lifecycle.
`src/core/renderUi.ts` — render readiness and safe output naming.
`src/core/workerProtocol.ts` — worker RPC data types.
`src/core/localWorker.ts` — safe path mapping, ffprobe, compositor command planning.
`src/core/workerClient.ts` — authenticated localhost client including render lifecycle.
`src/core/mediaImport.ts` — probed media → managed asset.
`src/components/RenderPanel.tsx` — real visible render start/progress/cancel/result UI.
`worker/mac-worker.mjs` — actual local worker with ffprobe, async ffmpeg jobs, basic compositor.
`src/App.tsx` — visible projects/timeline/worker/assets/render UI.

## Current real capabilities

KINAOU can currently:
- create/persist/reopen structured projects
- manipulate a non-destructive timeline
- model safe external-SSD storage
- connect visibly to a real localhost Mac worker
- probe/register managed media
- compile and execute safe asynchronous multi-track render jobs
- display render readiness, start, progress, cancellation, failure and result in Studio
- composite timed visual layers
- mix designated voice/dialog/music/SFX tracks
- keep worker filesystem activity inside the selected KINAOU root

KINAOU does **not yet** genuinely:
- place imported real assets onto the timeline from the Assets UI
- copy arbitrary outside media into KINAOU/Assets through an authorized chooser
- burn captions/subtitles into renders
- implement transitions/position/scale/keyframe controls beyond full-frame basic layering
- retime speed != 1 accurately
- generate proxies/thumbnails/waveforms
- execute local AI models
- generate script/storyboard/media through real AI providers

Unsupported capabilities must not be faked in UI.

## Current next milestone

Build **real asset → timeline placement and track-level editing** so the working render engine is usable end-to-end from the UI.

Immediate scope:
1. deterministic clip placement helper using asset metadata duration
2. choose target compatible timeline track
3. append at track end by default
4. prevent missing/offline asset placement
5. Assets UI action to place media on timeline
6. basic clip duration trim controls
7. track mute and lock controls
8. clip gain for audio tracks
9. then caption rendering and explicit source-file import authorization

## Roadmap

### Studio/render fidelity
- caption/subtitle burn-in
- track ordering/z-index semantics
- transitions
- speed/retiming
- volume fades/automation
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
- STT first
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
