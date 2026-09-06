# KINAOU — PROJECT STATE & HANDOFF

Last updated: 2026-09-06

## Purpose of this file

This file is the durable handoff / project-memory document for KINAOU. Update it after every meaningful architectural or product slice so that work can continue safely after a chat/session limit without relying on conversation memory.

## Product identity

**KINAOU** is a local-first AI Creative Studio / Creative Operating System.

Core promise: **AI does the work. You stay in control.**

Long-term workflow:

Discover → Research → Understand → Script → Direct → Generate → Edit → Adapt → Publish → Measure → Learn

The user must always retain manual, reversible control over AI-created or AI-edited work.

## Non-negotiable architecture principles

1. Local-first; cloud/API providers are optional adapters, never mandatory.
2. No paid API, cloud GPU, subscription, or production deployment without explicit user approval.
3. Non-destructive project/timeline/EDL is the source of truth. MP4 is an output, not the project.
4. AI edits must be structured and reversible.
5. Models are swappable adapters with capability discovery.
6. Compute workers are swappable and capability-based; future Mac/Windows/Linux workers must not require a project rewrite.
7. External SSD support is fundamental.
8. KINAOU must never require formatting or clearing the external SSD.
9. Existing folders/files on the SSD are never touched. Automatic storage operations are restricted to KINAOU-managed directories.
10. Models, Projects, Assets, Cache, Temp, Renders and Archive must remain independently relocatable.
11. Missing/disconnected external storage must not crash the app or corrupt a project; assets can become offline.
12. Start hardware is a MacBook Pro M2 Pro, 16 GB unified memory, 512 GB internal SSD. Heavy tasks may be slow, but new hardware is not a prerequisite.
13. Long-form video is composed from scenes/assets; regenerate one scene without regenerating the entire film.
14. PWA/web UI is preferred, but real local filesystem/FFmpeg/model execution is delegated to a trusted local worker/desktop bridge.

## Storage concept

Typical external SSD layout:

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

Safety rule: only files inside configured KINAOU-managed directories may be automatically created, moved or deleted by KINAOU.

Browser/PWA persistence and real filesystem persistence are separate backends behind shared contracts. The browser UI must never pretend that unrestricted SSD access exists when it does not.

## Current repository

Repository: `Impekal/kinaou`

Default branch: `main`

Current main SHA after PR #4: `c53c720936624b0e208aaa339d63f55d489a7e6f`

### Merged slices

#### PR #1 — Foundation: local-first project, storage, timeline and model architecture
Merged main SHA: `0230448aad6ee49e98118ab196b91f2b20e8ca8a`

Established:
- React/Vite/TypeScript application shell
- structured project schema
- asset and track schemas
- non-destructive timeline operations
- managed-storage safety boundary
- version-history foundation
- cancellable job queue
- swappable model adapter registry
- initial tests and GitHub Actions CI

Gate after correction: 6/6 unit tests + production build green.

#### PR #2 — Product core: persistence, create flow, storage profile and usable timeline
Merged main SHA: `581cd2a18a7d963f6bf0c630d797716ef3a8d6dd`

Established:
- persistent project repository/storage contract
- Create flow for idea/document/URL/image/audio/video starting points
- standard initial timeline tracks
- usable Studio timeline operations with autosave/persistence
- persistent storage profiles
- explicit browser-vs-desktop-worker backend boundary
- tests for persistence/create/storage behavior

Gate: tests + production build green.

#### PR #3 — Media core: asset registry, worker scheduler and render plans
Merged main SHA: `bb93d8d0374ee1a32f2e1d76346d9b2ae91918a4`

Established:
- managed/external asset registration
- asset offline/availability state
- worker descriptors and capability-based scheduling
- deterministic render-plan compilation from project/timeline state
- render output safety boundary under `KINAOU/Renders`
- render blocking for missing/offline referenced assets
- tests for asset availability, worker selection and render planning

Gate: tests + production build green.

#### PR #4 — Local worker: safe SSD paths, ffprobe and first ffmpeg render contract
Merged main SHA: `c53c720936624b0e208aaa339d63f55d489a7e6f`

Established:
- durable worker RPC request/response types for health, media probe and render
- worker handshake with managed roots and capabilities
- strict mapping from managed `KINAOU/...` paths to an explicitly authorized absolute SSD root
- deterministic `ffprobe` command builder
- parser for duration/size/video/audio metadata from ffprobe JSON
- Mac worker handshake advertising filesystem/ffmpeg/media-probe capabilities
- first executable ffmpeg command compiler for one linear clip starting at time 0
- explicit refusal of complex render plans until real compositor support exists
- tests for path safety, probe parsing, handshake and render command planning

Gate: tests + production build green.

## Important modules already present

`src/core/project.ts`
- Zod project schema
- assets, tracks, clips, storyboard
- project creation/parsing/touch

`src/core/timeline.ts`
- add/remove tracks
- add/remove/move/trim clips
- immutable/non-destructive operations

`src/core/storage.ts`
- storage areas: models/projects/assets/cache/temp/renders/archive
- safe managed-path validation
- generic StorageAdapter contract

`src/core/versioning.ts`
- version snapshot/restore foundation

`src/core/jobs.ts`
- cancellable job queue abstraction

`src/core/models.ts`
- model registry and capability filtering

`src/core/assets.ts`
- asset registration and availability/offline state

`src/core/workers.ts`
- WorkerDescriptor
- capability list including filesystem, ffmpeg, media-probe, LLM/image/video/STT/TTS/avatar
- online/load-aware worker selection

`src/core/render.ts`
- deterministic RenderPlan
- output safety under KINAOU/Renders
- asset presence/offline checks

`src/core/workerProtocol.ts`
- health/probe/render RPC contracts
- worker errors
- worker handshake parsing/capability checks

`src/core/localWorker.ts`
- safe managed-to-absolute root resolution
- ffprobe command creation and output parsing
- initial ffmpeg command creation
- Mac worker handshake

## Current product capability

KINAOU can currently:
- create structured projects
- persist/reload projects in the browser-side repository
- create project starting points from several input categories
- create and manipulate non-destructive timeline state
- persist storage profiles
- register assets and mark them offline
- model external-SSD-backed assets safely
- describe/choose compute workers by capabilities
- compile a render plan from timeline state
- refuse unsafe render outputs and missing/offline inputs
- compile safe local ffprobe commands
- parse real ffprobe-compatible metadata JSON
- compile a real ffmpeg command for the first deliberately narrow one-clip render case
- define a local Mac-worker health/probe/render protocol

KINAOU cannot yet genuinely:
- start a local worker process from the repository/runtime
- execute `ffmpeg` / `ffprobe` from the PWA
- import/copy/probe real media through a running worker
- render complex/multi-track videos
- execute local AI models
- generate script/storyboard/media through real AI providers

These capabilities must not be faked in UI.

## Current next milestone

Build a **startable localhost Mac worker runtime**.

Immediate scope:
1. localhost-only server process, never public network by default
2. per-run authentication token
3. configured managed absolute root pointing only to the chosen `<SSD>/KINAOU` directory
4. health endpoint returning worker handshake/capabilities
5. probe endpoint executing ffprobe with argument arrays (no shell interpolation)
6. render endpoint executing only validated/supported render plans
7. output directories restricted to managed KINAOU/Renders
8. process progress/error/cancel foundation
9. CI syntax/security/unit coverage without requiring the user's SSD
10. local Mac execution test deferred to USER ACTIONS AT END while independent repo work continues

## Roadmap after local worker runtime

### Basic media I/O
- real media import
- ffprobe metadata extraction through worker
- thumbnails/waveforms/proxies
- managed asset copy/link policy
- disconnected SSD recovery
- render execution and progress/cancel/retry
- multi-track compositor

### Director / creation intelligence
- input understanding
- script
- storyboard
- scene model
- scene planning
- asset decisions
- timeline assembly

### AI Editor
- selected timeline range
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
- model install/remove/move via managed storage

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
- publishing planner using official APIs only
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
11. store models/projects/assets on the external SSD,
12. disconnect/reconnect the SSD without corruption.

## Working discipline

For each meaningful slice:
1. verify actual `main` SHA and repo state,
2. work on a feature branch,
3. implement real behavior rather than mock functionality,
4. add/update tests,
5. open PR,
6. wait for/test CI gate,
7. fix failures,
8. merge only when green,
9. update this file with the new PR, SHA, decisions, capabilities and next step.

## USER ACTIONS AT END

None currently required for repository-only work.

A future local Mac-worker execution test will require the user to run/install the worker locally, have FFmpeg available, and point the worker at the selected external SSD's `KINAOU` directory. Do not block independent repository work on that local test; prepare everything else first.
