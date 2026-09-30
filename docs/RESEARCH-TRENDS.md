# Public search-trend research

## Local retained-evidence filters — #371, 2026-09-30

The historical library has view-only DE/EN/FR text, country, date-basis, inclusive UTC-day and chronological-order filters. Text is limited to 200 characters and matches every whitespace-separated literal term across query/report titles/source names, ignoring case and combining accents. This is substring matching, not regex, translation or inferred topic/language classification. URLs and provider figures are not text-search fields. Country means recorded source market, not query language.

Dates explicitly refer either to feed publication or own retrieval, including sort order. Empty bounds are open; complete Gregorian dates are checked without host-timezone interpretation, leap errors/rollovers and reversed ranges are rejected, end-day midnight of the following day is excluded. Equal timestamps retain original ledger order. Invalid filters show no results rather than falling back to all records. The ledger is still validated/bounded before filtering; corrupt data is not silently repaired.

These controls affect only the historical list, not current feed retrieval or briefing source selection. Reset, sort, typing and language changes never modify sources, briefs, provider figures or timestamps, and never fetch. Filters are not persisted and reset when the panel remounts/reloads. Counts mean matching saved observations, not topic demand, popularity, market coverage or complete weekly/monthly statistics. Zero matches do not prove absent demand. Original attribution and evidence remain visible.

Acceptance: 23 new pure regressions and expanded DE/EN/FR rendering checks; 2,071 total app tests, 373 supported local worker tests, build and full CI including render smoke. Isolated localhost:43983 used explicitly synthetic DE/FR/CA observations, not live trend evidence. Browser checks covered combined accent/case/source-name/country filters, real date input at UTC midnight, reversed bounds, publication versus retrieval, stable sort/reset/empty results, DE/FR/EN retention, unchanged dirty brief, reload and zero application fetch/project writes. Native keyboard date entry was used after automation-only fill failed to emit the normal change event. Final console clean; owned fixture files/server/tab/preference removed.

## Implemented 2026-09-27 — #347

Research is a dedicated DE/EN/FR app section. Connect an updated local worker, open a project, select a country and explicitly retrieve the public feed. There is no on-mount request, background poll, model inference or download of linked news/media. A selected observation can be retained in project metadata with a prior-project version snapshot. Saving failures preserve the displayed result for an explicit retry. Retained observations survive standard project serialization and stay visibly historical; reloading does not refresh them.

Supported initial markets: Germany, France, United Kingdom, United States, Canada, Austria and Switzerland. This is intentionally not a complete worldwide catalogue. Market selection and UI language are independent; the feed does not certify the query/article language.

### Source contract and limits

The authenticated POST `/research/search-trends` accepts only `{country}` (4 KiB request maximum). Capability: `public-search-trends`, independent of FFmpeg/models. The worker sends an unauthenticated, credential-free GET to exactly `https://trends.google.com/trending/rss?geo=<country>`; no arbitrary URL, custom query, private project text, account or local worker token is forwarded. Google still sees the request's network IP address. Redirects are rejected.

Only XML MIME types and fatal-valid UTF-8 are accepted. The stream is capped at 2 MiB with a 15-second abort deadline, even without content-length. Parser bounds: 20,000 elements, depth below 12, 200 items and five news references per item; overflows fail, not truncate silently. DTD/entity declarations, undeclared entities, malformed XML, duplicate required fields, nested text markup, mismatched feed-country links and invalid timestamps fail. No DTD, linked page, thumbnail or image is fetched.

SAX parser dependency is exact `saxes@6.0.0` (ISC), with `xmlchars@2.2.0` (MIT); no pre-existing dependency versions changed. Saxes upstream was archived in December 2025. It is not described as actively maintained: the restricted bounded use, no DTD/custom entity resolution and adversarial regression tests are part of this adapter's boundary. Reassess dependency/security advisories during upgrades. The parser is worker-only and absent from the browser bundle. Production dependency audit on 2026-09-27 reported zero vulnerabilities; not a future guarantee.

Concurrent same-country requests share one fetch. Successful responses may be cached for 60 seconds with their original retrieval time; failed fetches also have a 60-second explicit-retry cooldown. There is no timer-driven retry or stale-success fallback. UI sessions detach permanently on country/project identity/worker scope changes and unmount, preventing late replies from appearing in a different scope.

### Evidence, not a quality or demand guarantee

Each snapshot carries provider, country, exact feed URL, UTC retrieval time, raw-feed SHA-256, parsed items, feed publication times, literal traffic labels and attributed news links. The digest identifies the fetched bytes, not a signed Google attestation; raw XML is not retained. Editing local project JSON can alter records. Article links accept bounded public HTTP(S) URLs without credentials/ports/local or IP literals and use noreferrer/noopener. Their content remains unverified.

Numbers such as `200+` are displayed unchanged. This adapter does **not** infer a unit or time window, reproduce the Trends web interface's chosen filter window, measure YouTube demand, establish factual truth, assess competing videos, guarantee views or grant rights to news text/footage. Feed publication is not labelled the precise start of a trend. Historical saved observations are not a complete time series or weekly/monthly aggregate.

The project ledger is capped at 200 individually selected observations and 1 MiB; it never silently evicts earlier evidence. Same country/feed digest/item is idempotent even if retrieved again later. A changed feed digest can form a distinct historical observation. A corrupt or full ledger blocks further additions without erasing it. Current UI has no delete/cleanup or complete editorial research workflow yet.

### Verification

- 19 worker regressions: XML/DTD/entity/markup/duplication/date/country limits; URL/query safety; fixed GET and credential absence; byte hash, concurrent cache, cloned outputs, cooldown; HTTP/MIME/header/stream/UTF-8 failures.
- Nine app tests including the executable real-worker route: authenticated requests, rejected arbitrary source before any fetch, cache, no private content/token in upstream request, metadata preservation/serialization, full/corrupt history, selected-index validation, duplicate handling, detached late results and DE/EN/FR safe rendering.
- CI uses an isolated process-local test preload serving a synthetic RSS response. Production has no configurable fake-data switch. Temporary files are deleted after testing.
- Browser with real worker: public DE and FR feeds, UI DE/EN/FR, saved observation survives reload without a fetch, reported save failure without success, delayed DE reply dropped after selecting FR, retained DE origin still visible in FR, no console warnings/errors. Only disposable project/history records and temporary servers were used and removed.
- Full CI including actual FFmpeg render smoke remains required. The live Google feed is deliberately not a CI dependency.

### Primary references checked 2026-09-27

- [Google Trends: Trending now, including RSS export](https://support.google.com/trends/answer/3076011?hl=en). Web-interface capabilities are not automatically feed capabilities.
- [Google Trends attribution guidance](https://support.google.com/trends/answer/4365538?hl=en). Preserve Google attribution; applicable Google terms still apply.
- [Saxes upstream implementation and strict XML behavior](https://github.com/lddubeau/saxes).

## Authored briefs and explicit Director transfer — #349

Select 1–5 retained observations in Research, then write a working title, question, editorial angle and outstanding source checks. Save explicitly. The project keeps exact selected source snapshots, an authored revision and timestamp; history saves the prior project before persistence. Identical saves are idempotent. Maximum 32,000 UTF-8 bytes, title 120 characters, question/angle 2,000 each, outstanding checks 4,000. No automatic fact-verification or inference occurs.

The edit baseline binds project identity, saved brief and retained ledger. A changed ledger/brief blocks stale saves, including reordered or removed source indices; unrelated script edits are preserved. A pristine form may refresh its source choices, but a dirty draft is retained and must be consciously discarded/reloaded if stale. Save failures retain the draft and never show success; a pre-save history snapshot may already exist. Leaving Research can lose an unsaved draft, so the ordinary Open Director action is disabled until saved.

Director displays the saved title/question/uncertainties, revision and source count. A separate explicit acknowledgement permits replacement of its creative-brief draft. Nothing is auto-loaded/generated on navigation or reload; script, timeline and project metadata are unchanged by loading. Changed observed brief identity invalidates the acknowledgement, including a return to an earlier identity. Existing output-language/market profile controls generation; a German observation does not force German output.

The actual local-model brief includes authored intent and bounded historical evidence JSON, with instructions to treat feed fields as data, preserve dates/attribution and avoid claiming verified facts, demand, competition, usage rights or best publishing times. Model outputs still require review. Saved sources are not a cryptographic generation receipt or proof that a model followed them; editing the creative draft can change its context. No model download or real inference was run for this integration.

Acceptance: 17 new app tests, 1,843 total; executable client request confirms source data and explicit French output profile coexist. DE/EN/FR browser test covers failed save preserving draft, language changes, saved reload, explicit replacement of existing Director text, unchanged original project script, zero network calls and blocked source change. Synthetic browser sources are labelled test examples; #347 separately tested genuine public DE/FR RSS retrieval. Full CI including worker/render smoke passed. Disposable fixture/history/server removed.

Next: honest evidence review and research scope/filtering. Broader markets, language/subject evidence, longitudinal observations and legitimate competition/audience measurements remain open. No fabricated substitute when live access is unavailable.
