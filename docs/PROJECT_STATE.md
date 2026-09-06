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

Current main SHA after PR #7: `92e6069547a79e9d62e220edb0e2794ad8fb360c`

## Merged slices

### PR #1 — Foundation
Main SHA: `0230448aad6ee49e98118ab196b91f2b20e8ca8a`
Established React/Vite/TypeScript shell, structured project schema, asset/track/clip schemas, non-destructive timeline operations, storage safety boundary, version history, cancellable jobs, model registry, tests and CI.
Gate after correction: 6/6 tests + production build green.

### PR #2 — Product core
Main SHA: `581cd2a18a7d963f6bf0c630d797716ef3a8d6dd`
Established persistent project repository/storage contract, Create flow for idea/document/URL/image/audio/video inputs, standard initial tracks, usable timeline operations with persistence, storage profiles and browser-vs-worker boundary.
Gate: tests + production build green.

### PR #3 — Media core
Main SHA: `bb93d8d0374ee1a32f2e1d76346d9b2ae91918a4`
Established asset registration/offline state, worker capability scheduler, deterministic render-plan compilation, safe render-output boundary, missing/offline asset blocking and related tests.
Gate: tests + production build green.

### PR #4 — Local worker contract
Main SHA: `c53c720936624b0e208aaa339d63f55d489a7e6f`
Established worker RPC types, health/probe/render protocol, managed-root path mapping, ffprobe command builder/parser, Mac capability handshake, first one-clip ffmpeg command compiler and explicit refusal of unsupported complex render plans.
Gate: tests + production build green.

### PR #5 — Startable Mac worker runtime
Main SHA: `3677d3994a143da9f88442eb004fe278dd31dfe7`
Established startable `worker/mac-worker.mjs`, localhost-only binding, Bearer-token auth, exact KINAOU managed root, real ffprobe execution, narrow one-clip ffmpeg execution, render-output restriction and `shell:false` process spawning.
Gate: tests + production build + worker syntax check green.

### PR #6 — PWA worker bridge and probed media import
Main SHA: `c71efbc1eb7d176abdd08b264ecd39acdde0e82d`
Established localhost-only `WorkerClient`, in-memory bearer token, health/probe/render methods, worker error propagation, `importProbedMedia`, managed-asset validation and mocked-fetch tests.
Gate: tests + production build + worker syntax check green.

### PR #7 — Visible worker UI + managed assets
Main SHA: `92e6069547a79e9d62e220edb0e2794ad8fb360c`
Established:
- visible Settings controls for localhost worker URL and session token
- token remains in memory only
- real Test Connection action using worker health handshake
- online/capability display
- visible Assets screen
- probe of real managed `KINAOU/Assets/...` paths through the worker
- display of duration, size, dimensions and sample rate from probe results
- import of probed media into persistent project assets
- project asset inventory with managed/offline state
- timeline labels now resolve real asset names when available

One intermediate build failed because the UI expected nested `video`/`audio` probe objects; the canonical `MediaProbeResult` is flat. This was corrected before merge.

Final gate: **28/28 tests + production build + worker syntax check green.**

## Important modules

`src/core/project.ts` — project schema, assets, tracks, clips, storyboard, create/parse/touch.
`src/core/timeline.ts` — immutable add/remove/move/trim timeline operations.
`src/core/storage.ts` — storage areas, safe managed-path validation, StorageAdapter contract.
`src/core/persistence.ts` — persistent project repository/storage behavior.
`src/core/create.ts` — project creation from supported starting-point types.
`src/core/versioning.ts` — version snapshot/restore foundation.
`src/core/jobs.ts` — cancellable job queue.
`src/core/models.ts` — model registry/capability filtering.
`src/core/assets.ts` — asset registration and online/offline state.
`src/core/workers.ts` — WorkerDescriptor, capabilities, load-aware selection.
`src/core/render.ts` — deterministic RenderPlan with output/asset safety checks.
`src/core/workerProtocol.ts` — health/probe/render RPC contracts and errors.
`src/core/localWorker.ts` — safe path mapping, ffprobe planning/parsing, initial ffmpeg command planning, Mac handshake.
`src/core/workerClient.ts` — localhost-only authenticated PWA worker client.
`src/core/mediaImport.ts` — conversion of probed worker media into managed project assets.
`worker/mac-worker.mjs` — actual local Node worker runtime.
`worker/README.md` — local prerequisites, security model and launch instructions.
`src/App.tsx` — visible worker connection, managed asset probing/import, project/timeline UI.

## Current real capabilities

KINAOU can currently:
- create structured projects
- persist/reload projects in browser-side repository
- create project starting points from multiple input categories
- create/manipulate non-destructive timeline state
- persist storage profiles
- register assets and mark them offline
- model external-SSD-backed assets safely
- choose workers by capability/load
- compile render plans
- refuse unsafe outputs and missing/offline inputs
- start a real local Mac worker process
- authenticate local worker requests with a token
- restrict worker filesystem access to an explicitly selected `<disk>/KINAOU` root
- run real ffprobe against managed assets
- run a real one-clip ffmpeg render into `KINAOU/Renders`
- connect visibly to the worker from Settings
- show worker online/capability state
- probe managed media from the Assets UI
- import probe results into persistent project assets

KINAOU does **not yet** genuinely:
- copy arbitrary source media from outside KINAOU into `KINAOU/Assets`
- render multi-track/composited timelines
- report/cancel/retry render jobs from UI
- generate proxies/thumbnails/waveforms
- execute local AI models
- generate script/storyboard/media through real AI providers

Unsupported capabilities must not be faked in UI.

## Current next milestone

Build **multi-track render execution + render-job lifecycle** before broadening import privileges.

Immediate scope:
1. extend render protocol with asynchronous render job id/state/progress
2. worker-side in-memory job registry
3. GET render status endpoint
4. cancel endpoint that terminates the exact child process
5. retry-safe result/error state
6. expand local ffmpeg compositor beyond the one-clip case
7. support basic video/image visual layering and voice/music audio mix
8. keep output inside `KINAOU/Renders`
9. add PWA Render controls/status/cancel once worker protocol is green
10. only after that design an explicit, auditable source-file import authorization flow; never silently grant arbitrary filesystem read access

## Roadmap after render lifecycle

### Basic media I/O
- explicit source-file chooser / copy policy
- thumbnails/waveforms/proxies
- disconnected SSD recovery and re-probe

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

The first major KINAOU core milestone is reached when a user can:
1. open KINAOU,
2. create a project,
3. provide an input,
4. obtain script/storyboard/scenes,
5. import or generate media/voice/captions,
6. edit everything on a real timeline,
7. select a region and edit it through AI,
8. undo/restore versions,
9. render/export a real video,
10. close and reopen the project safely,
11. store models/projects/assets on external SSD,
12. disconnect/reconnect SSD without corruption.

## Working discipline

For every meaningful slice:
1. verify actual `main` SHA and repo state,
2. work on a feature branch,
3. implement real behavior rather than mock functionality,
4. add/update tests,
5. open PR,
6. wait for CI gate,
7. fix failures,
8. merge only when green,
9. update this file with PR, SHA, decisions, capabilities and next step.

## USER ACTIONS AT END

No user action blocks independent repository work right now.

A later real Mac-worker execution test requires the user to:
- have Node.js 22+
- have FFmpeg/ffprobe in PATH
- create/select the external SSD's `KINAOU` directory
- launch the worker with `KINAOU_MANAGED_ROOT` and a token

Do not block independent repository work on this local test; prepare everything else first.
