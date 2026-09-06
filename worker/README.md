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

## Current capabilities

- `GET /health` — capability/version handshake.
- `POST /probe` — real ffprobe metadata extraction for an existing managed asset.
- `POST /render` — deliberately narrow first render execution: exactly one timeline clip starting at 0.

Complex/multi-track rendering is not claimed yet and is rejected until compositor support is implemented.

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
