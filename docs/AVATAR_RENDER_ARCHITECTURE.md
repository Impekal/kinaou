# KINAOU Avatar Render Architecture

## Product quality target

The final KINAOU Avatar output must look like filmed
human footage.

A technically animated portrait is not sufficient if it
retains an obvious warped-photo, CGI, game-character or
synthetic-rig appearance.

## Local-first rule

KINAOU does not depend on platform-paid inference.

The default architecture is:

1. Local Preview
2. Local Generative Final Render
3. Optional Cloud BYOK fallback

Cloud rendering is never silently selected.

Any cloud provider must use credentials supplied by the
user and its inference cost belongs to that user.

## Preview engine

The current LivePortrait + MediaPipe path is retained as
a fast local preview system.

Accepted pilot capabilities:

- identity-preserving moderate head pose
- yaw / pitch / roll
- source-canvas compositing
- blink / eye retargeting
- lip retargeting
- temporal combination at 24 fps

It is not accepted as KINAOU final photoreal output.

## Final engine

Final Avatar rendering requires a generative video engine.

The engine implementation must remain replaceable.

Candidate families may change over time and must not be
hard-wired into project documents or the UI.

Requirements:

- local inference supported
- image/reference identity conditioning
- photoreal human output
- temporal identity stability
- coherent face, hair, beard, neck and shoulders
- expression and lip-sync support or composability
- reproducible provenance
- commercial-output rights verified before activation

## Current Mac development machine

The current Apple Silicon machine is used for:

- application development
- Preview engine
- runtime contracts
- model/provider abstraction
- quality gates
- test fixtures
- provenance and rights controls

It is not the reference machine for final photoreal
Avatar quality.

## Future Windows reference machine

The high-quality local runtime will target NVIDIA CUDA.

Target class:

- NVIDIA GPU
- at least 24 GB VRAM
- 32 GB VRAM preferred
- at least 64 GB system RAM
- 96–128 GB desirable for heavier workflows
- at least 2 TB fast NVMe storage
- 4 TB preferred for multiple video models and caches

The exact GPU/model will be selected from the current
market immediately before purchase.

## Engine policy

Preview:
local only.

Final:
local generative engine whenever available.

Cloud:
optional BYOK fallback only.

KINAOU-owned recurring inference cost:
none.
