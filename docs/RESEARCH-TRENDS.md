# Public search-trend research

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

Next: authored source-bound briefs and explicit Director transfer, honest evidence review and research scope/filtering. Broader markets, language/subject evidence, longitudinal observations and legitimate competition/audience measurements remain open. No fabricated substitute when live access is unavailable.
