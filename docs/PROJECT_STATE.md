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

Render planning module added in PR #3 compiles project/timeline state into a deterministic render plan and enforces safe output paths.

## Current product capability

KINAOU can currently:
- create structured projects
- persist/reload projects in the browser-side repository
- create project starting points from several input categories
- create and manipulate non-destructive timeline state
- persist storage profiles
- register assets and mark them offline
- model future external-SSD-backed assets safely
- describe/choose compute workers by capabilities
- compile a render plan from timeline state
- refuse unsafe render outputs and missing/offline inputs

KINAOU cannot yet genuinely:
- read/write the external SSD from the PWA by itself
- run `ffmpeg` / `ffprobe`
- import/copy/probe real media through a native worker
- render an actual video file
- execute local AI models
- generate script/storyboard/media through real AI providers

These capabilities must not be faked in UI.

## Current next milestone

Build a trusted **local Mac worker / desktop bridge** foundation that can eventually execute real local work for the PWA.

Immediate scope:
1. Define worker RPC/request/response protocol.
2. Define filesystem capabilities with explicit managed-root authorization.
3. Define media probe contract (`ffprobe` semantics).
4. Define render execution contract (`ffmpeg` semantics) using existing render plans.
5. Add secure path/root validation so the worker cannot operate outside explicitly managed KINAOU roots.
6. Add health/capability handshake for Mac worker discovery.
7. Add deterministic command-building/planning layer that can be unit-tested without actually invoking processes in GitHub CI.
8. Only claim real ffmpeg/filesystem execution once a local runtime bridge is actually implemented and tested on the user's Mac.

## Roadmap after local worker foundation

### Basic media I/O
- real media import
- ffprobe metadata extraction
- thumbnails/waveforms/proxies
- managed asset copy/link policy
- disconnected SSD recovery
- render execution and progress/cancel/retry

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

A future local Mac-worker execution test will require the user to run/install the worker locally and point it at the selected external SSD. Do not block independent repository work on that local test; prepare everything else first.
