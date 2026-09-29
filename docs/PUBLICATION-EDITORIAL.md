# Source-bound publication editorial copy

Implemented in #355, 2026-09-30. This is a private local drafting/review workflow, not automatic publication or a verified marketing engine.

## Workflow

1. Save a main-video/companion-Short timing plan using retained exports, and provide authored script/storyboard material.
2. In Publish, explicitly prepare a new copy draft. Output language, audience, objective and tone come from the Director content profile; market comes from the plan. Preparing a draft replaces unsaved editorial fields but does not save or call a model.
3. Write the fields yourself, or explicitly discover/select an installed local Ollama model and generate. No model is selected or downloaded automatically. A generation failure retains the previous draft; retry is explicit.
4. Review title, description, separate plain keywords, editorial rationale and an exact source quotation for each export. The quotation must occur in the retained authored source. This is structural validation, not fact checking or proof that the source matches an older rendered video.
5. Confirm that language, claims, quotes and export attribution were checked against the actual videos. Save takes a prior-project history snapshot and persists a revisioned record. Failed persistence retains review for save-only retry without rerunning inference.
6. In the existing package form, explicitly acknowledge replacing its text with saved copy for the selected export. Only title/description/tags change; preflight/package creation/upload remain separate. No hashtag conversion or silent truncation.

Saved copy can be explicitly loaded for further edits. Changes to source text, content profile, retained receipt or timing-plan revision make the old copy historical. Malformed saved records are not silently replaced. Leaving the area discards late replies, not the already-running inference. Project/connection/draft epochs prevent A→B→A resurrection of obsolete reviews/results.

## Local boundary

The worker advertises the `publication-editorial` route capability independently of model availability. An updated worker is required for generation, but manual drafting needs no model. Authenticated POST `/publication/editorial/generate` accepts at most 128,000 request bytes. Only the configured loopback Ollama origin is used, redirects are refused, and no worker token is forwarded to inference.

The selected model must be listed as installed. Before sending source text, `/api/show` receives only its model name: remote-host/model markers or missing local architecture metadata block the request. Remote response markers also cause refusal; shared model discovery omits explicitly remote aliases. This assumes a trusted local runtime and is not attestation against a malicious server or a concurrently replaced model. For the actual test, `OLLAMA_NO_CLOUD=1` was set and startup confirmed cloud disabled; no global configuration was changed. See [Ollama local-only configuration](https://docs.ollama.com/faq) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

The generation prompt contains authored source/profile/market plus export IDs/kinds. Historical receipt paths and labels are retained for local review bindings but not sent to the model. Output uses a JSON schema, explicit target-language instructions and temperature zero. The model has no tools. A ten-minute request timeout, bounded 1,000,000-byte UTF-8 JSON response and strict post-validation apply; there is no automatic inference retry. The metadata probe has a 15-second deadline.

Context: 2–4 exports, exactly one main followed by 1–3 distinct Shorts; 40,000 source characters and 100,000 UTF-8 context bytes maximum. Output: exactly matching ordered IDs, title ≤200 characters, description ≤5,000, ≤30 unique plain keywords of ≤80 characters, rationale ≤1,500 and exact quote ≤500; total proposal ≤32,000 UTF-8 bytes. Persisted record ≤140,000 bytes; revisions 1–10,000. These are application bounds, not promises about a model's token/context capacity. The runtime may use a smaller context window; no complete-source comprehension claim is made.

## Acceptance and limitations

- 1,933 application tests / 201 files, 349 supported local worker tests, production build and full unchanged CI (including Linux FFmpeg render smoke). Local full-app verification used two workers under heavy host load; no timeouts/assertions were relaxed. Local FFmpeg still lacks libass, as separately recorded in MAC-TEST.md.
- The executable integration test runs the real authenticated worker against a clearly synthetic local model-protocol fixture, then reviews/persists/reloads copy. It checks unauthorized and uninstalled-model failures, quote/ID bindings and that credentials do not reach the model. This fixture is not language/model quality evidence.
- Browser acceptance used that real worker route and a synthetic model reply. DE/EN/FR controls, explicit generation, unchanged package fields before acknowledgement, failed-save recovery without another generation, source-quote rejection, reload with zero requests, historical/stale-source blocking and delayed A→B→A replies passed. Fresh console clean; temporary files, browser data and test servers removed.
- Real installed Llama 3.1 8B / Ollama 0.33.3, no downloads and cloud disabled: German and English examples passed structural checks and manual inspection (171/99 seconds under host load). French initially returned German; subsequent 39/63/83/54-second trials improved descriptions/keywords but left German titles or mixed terminology. This is an explicit **failed French quality acceptance**, not a claim that the three-language model goal is complete. Final adapter metadata preflight worked with the actual installed model. The isolated runtime was stopped afterward.
- Exact quotation is not semantic entailment; the model can choose a true source substring that does not substantiate its title. Language is prompted, not automatically certified. Manual correction and explicit human review are required.
- Nothing measures trends, competition, audience, best times, engagement or platform eligibility. No source URL/media download, generated factual authority, posting receipt, voice/avatar quality or views guarantee is introduced. Whole completion points 6 and 9 remain open.
