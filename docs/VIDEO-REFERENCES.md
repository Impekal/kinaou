# Local video workflow references

Implemented in PR #183. This is a real input transport/selection/provenance path, **not a bundled avatar model, voice-cloning engine or proof of lip-sync quality**. Existing text-only video templates still work. No model or runtime is downloaded.

## User flow

1. Import the authorized portrait and/or speech recording in Assets. A recording of your own voice is a valid speech input; no TTS step is required. These must be online managed assets.
2. Open Video → Check availability. Select a trusted installed local-only video workflow. Its declared references appear below Prompt; templates without reference declarations show no reference controls.
3. Select each required asset and confirm permission to use that likeness/recording. Changing a selection or template clears the corresponding authorization. Both are mandatory before generation; an unused asset is never sent merely because it exists in the project.
4. Generate locally. The worker copies selected files to ComfyUI before submitting the workflow, then follows its existing real video job/output/probe/asset-registration path. Originals are untouched.
5. Review the actual output: speech present where intended, full duration, mouth/audio alignment, identity, expression and motion. A successfully saved video does not establish these qualities. Place/review it using the existing Video/Studio controls.

The original source asset ID, managed path, explicit authorization and SHA-256 of the bytes sent are retained in generated video metadata. Reusing prompt settings does **not** silently reselect or reauthorize reference assets. It is not a complete one-click reproduction of a reference-conditioned run.

## Template contract

Add optional `referenceInputs` to an existing, tested `schemaVersion: 1`, `mediaType: "video"` wrapper. This fragment is only a binding example, **not a runnable model workflow**:

```json
{
  "referenceInputs": {
    "portrait": { "nodeId": "20", "input": "image" },
    "speech": { "nodeId": "21", "input": "audio" }
  }
}
```

In that workflow, node 20 must be a core `LoadImage` with a string `inputs.image`, and node 21 a core `LoadAudio` with a string `inputs.audio`. Wire those outputs into the actual locally installed video/performance model. The worker replaces filenames, not graph connections or model settings. Existing `bindings.positivePrompt` is still required. A reference binding cannot overlap a prompt/seed/dimension binding.

Declare only the roles the workflow uses. Either or both roles are supported and every declared role is required. `portrait` is PNG/JPG/JPEG/WebP; `speech` is WAV/MP3/FLAC/OGG/M4A. Video-reference conditioning is not implemented by this contract. A portrait made from a video frame is still a portrait input, not video-driven performance conditioning.

The authenticated template response advertises `referenceRoles`. Video job requests add a `references` map, for example:

```json
{
  "references": {
    "speech": {
      "assetId": "the-selected-project-asset-id",
      "path": "KINAOU/Assets/own-recording.wav",
      "authorized": true
    }
  }
}
```

Requests with missing authorization, undeclared roles or unsafe paths fail rather than ignoring them. Missing/bad files make the job fail without submitting the workflow. The worker accepts only nonempty regular files up to 32 MiB each, rejects symbolic links and traversal, and uses bounded checked file reads. Cancellation aborts a pending upload and prevents subsequent submission.

## Privacy, copies and trust

- KINAOU sends reference bytes only to its configured localhost HTTP ComfyUI endpoint; upload redirects are rejected. Use trusted workflows/custom nodes which run locally: KINAOU does not audit every installed ComfyUI node for its own network behavior.
- Files are copied to ComfyUI's input root under unique `kinaou-<job-id>-portrait.<ext>` / `kinaou-<job-id>-speech.<ext>` names with overwrite disabled. KINAOU's project originals and other ComfyUI files remain unchanged.
- **ComfyUI copies remain after success, failure or cancellation**, including a copy received just before cancellation. The UI discloses this before starting. KINAOU has no remote delete endpoint and does not guess ComfyUI's filesystem location; review/remove these exact job files yourself when no longer required. Preserve them if the workflow needs to be rerun outside KINAOU.
- Models, custom nodes and actual animation remain explicitly installed/configured by the user. No cloud API, paid service or silent download is introduced.

The transport follows ComfyUI's official [file-upload handler](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py) and [LoadAudio implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_audio.py), inspected 2026-09-20. Despite its historical `/upload/image` name, the handler stores file bytes; the receiving core loader determines their use.

## Verification boundary

Automated coverage exercises declarations, permissions, unsafe/missing/linked/oversized files, returned-name validation, exact bytes/hash, project persistence and conditional UI. A real worker + localhost HTTP fixture test transfers actual PNG/WAV fixtures, checks the submitted workflow inputs, saves/probes an FFmpeg-created MP4 and cancels during upload. **The HTTP fixture is not ComfyUI inference and does not test model quality.** A real installed model still needs the checks in CREATIVE_QUALITY.md. Independent repository work is not blocked by that optional hardware validation.
