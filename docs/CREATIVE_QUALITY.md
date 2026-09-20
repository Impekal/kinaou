# KINAOU creative quality targets

User clarification: 2026-09-20. These are acceptance targets, not a claim that the corresponding engines already exist.

## Photo-driven, video-driven and fully generated avatars

- Three explicit source modes are required: an authorized reference photo, an authorized reference video, or a fully generated fictional identity with no real-person reference. All three target identity-consistent, believable performance, expressions, motion and audio-driven lip sync.
- For video references, declare whether the runtime actually uses appearance, movement or performance conditioning; do not equate extracting one frame with genuine video-driven animation. Keep original video/audio and generated output attribution separate.
- For fully generated identities, preserve the approved identity reference and generation settings across scenes so the person does not change between lessons. No reference upload should be required when the installed runtime supports generation without one.
- Support fictional/generated identities and real people whose likeness the user has permission to use. Preserve reference, runtime, model and generation provenance. Do not erase synthetic provenance or misrepresent generated footage as a real recording.
- Higgsfield is a visual quality benchmark only; do not connect to its service, spend credits or assume its proprietary models can be reused.
- Current implementation: a still image paired with existing narration, editable and renderable. It is explicitly NOT animation, voice cloning or lip sync.
- Additional input path (#183): Video Studio can send individually authorized managed portrait and/or speech assets to declared local ComfyUI LoadImage/LoadAudio bindings, with content hashes retained. An own-voice recording needs no synthetic TTS conversion. This does not install or certify an avatar model; video-driven performance conditioning and own-voice synthesis still remain to implement. See VIDEO-REFERENCES.md for copy retention, supported files and quality-test boundaries.
- Validate real output at scene cuts and across longer speech: mouth/audio alignment, stable face/teeth/hands, eye motion, identity drift, flicker, resolution and duration. Review cannot be replaced by a green API response or a photorealism label.
- Keep scene-level regeneration, source preservation, cancellation, deterministic settings where supported and reversible placement. Never promise that synthesis will be indistinguishable from authentic footage in every case.

## Natural multilingual speech

- German, English and French need idiomatic pronunciation, natural pauses, emphasis, emotion and consistent voice identity across lessons/scenes.
- Explicit user request: avatars must also support the user's own voice. Distinguish an imported recording (already usable as audio for the voiced-still composition) from generating new speech in that voice (not yet implemented). Future lip-sync input must accept the actual authorized recording without requiring synthetic TTS first. Any voice-reproduction mode needs a compatible installed local model, reviewed authorized reference samples and honest quality tests; importing audio alone is not voice cloning.
- Piper remains a working baseline. Declared locale matching alone is not a quality assessment or an expressive-voice engine.
- Expose only controls actually supported by the selected installed model. An emotion prompt is guidance, not a guaranteed acoustic outcome; disable unsupported controls rather than silently ignoring them.
- Before accepting a voice, audition real speech containing questions, emphasis, numbers, dates, proper names, acronyms and longer paragraphs in the selected language. Listen for robotic cadence, clipping, unstable timbre, missing/repeated words and inconsistent levels.
- Keep retakes non-destructive and preserve model/voice/text/delivery settings. Reference-voice features require authorized samples and must never silently upload them to a remote service.
- Candidate for investigation, not yet installed/integrated/benchmarked: the official [Qwen3-TTS repository](https://github.com/QwenLM/Qwen3-TTS) documents German/English/French and instruction-based voice/emotion/prosody controls. Verify the exact model variant, weight license, runtime compatibility and measured Mac memory/performance before choosing it. Do not use its cloud API or silently download weights.

## Complete course production

Implemented foundation (#185): one project can persist a revisioned course/module/lesson outline with explicit timeline ranges and export each selected lesson through the actual worker. Receipts preserve submitted course identities. Lesson resources/exercises/solutions, verified demonstrations and instructor review remain future slices; see COURSE-PRODUCTION.md. This is not a complete course generator.

Course workflow target: audience/prerequisites → learning outcomes → modules → lectures → verified examples/demonstrations → scripts and narration → visuals/screen recordings → captions → practice and reviewed solutions → per-lecture media/resource exports → instructor review.

- Retain course/module/lecture relationships and individual project/source/export references; one lecture must be replaceable without rebuilding the entire course.
- Technical demonstrations must actually run or be recorded; generated UI images must not masquerade as evidence of working software.
- Track instructional accuracy, source dates, prerequisite coverage, duplicate content, exercise-answer consistency and pedagogical progression. Avoid fabricated expertise, certificates, learning outcomes or approval guarantees.
- Initial content languages: German, English and French. Translation needs a fresh terminology/pronunciation review, not just a changed language tag.
- No automatic publishing, account creation or instructor impersonation. Course packaging is local; publication is separately authorized.

## Manual editing usability

The user asked about conventional software such as MAGIX. KINAOU already applies real multi-track move/trim, gain, fades, dissolve, transform and speed operations, but these are still largely button-driven; its composed preview is rendered before playback. Do not equate a working compositor with a finished interactive editor. The usability roadmap includes direct clip dragging, trim handles, playhead splitting, precise timing/snapping, clear selection/undo behavior and a responsive preview. Keyframes and richer effect workflows remain later work, not implemented features or a promise to copy another product's entire catalogue.

### Udemy boundary (official sources checked 2026-09-20)

The [minimum course checklist](https://support.udemy.com/hc/en-us/articles/229604988-Udemy-course-quality-checklist) requires at least 30 minutes of video and five separate lectures for standard video courses, HD video, synchronized non-distracting audio from both channels, and a complete course landing page. These are minimums, not a guarantee of acceptance or educational excellence.

The [AI-use policy](https://support.udemy.com/hc/en-us/articles/30999984483607-Course-Quality-Checklist-Use-of-AI) permits quality AI/TTS assistance but rejects entirely AI-generated courses and requires meaningful instructor expertise plus AI-use disclosure in the course description. Build explicit human review/editing and disclosure into the handoff; do not market unattended generation as automatically Udemy-compliant. Recheck these rules when implementing platform-specific checks or preparing publication.

## Storage and real-hardware validation

Independent code/tests use temporary fixtures and do not require the SSD. Real model runs and end-to-end production use the user's configured managed storage. Notify the user when connecting the SSD, installing a runtime/model or granting Mac permissions is actually necessary. Do not silently download models or touch unrelated SSD files.

Passing automated tests proves contracts and measured media properties, not premium voice quality, avatar realism, instructor expertise or platform acceptance. Those need actual generated samples and review.
