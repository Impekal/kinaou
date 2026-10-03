# Reviewed source excerpts (#417)

After explicitly retrieving a retained article in Research / Source assessment, enter a short exact quotation from the displayed text. Review wording/provenance, acknowledge, then append to the assessment **draft**. This neither saves nor marks the source read. Inspect the complete assessment and save separately through the existing one-snapshot/save-only-retry path.

## Boundaries

- Maximum 600 characters per quote, five per assessment; duplicate original URL/quote pairs are refused. Quote must exactly match the current text, not paraphrase it. Original URL must belong to the retained observation. No automatic selection or model call.
- Retain original/final URLs/redirects, retrieval time, title/declared language, HTML bytes/hash, extraction, truncation and UTF-16 displayed-text offsets. Offsets identify the first occurrence in the historical display, not HTML bytes. They cannot reconstruct/reverify the article later; full text/HTML is not stored.
- A checksum is not authenticated authorship, truth or permission. Quotes remain untrusted external data. Reading flags, findings and notes stay authored separately.
- Quote review binds source/result/selection/UI scope. Observed changes including A→B→A invalidate it permanently. Successful append cannot replay. Final assessment revision/history safeguards remain in force.
- Removal changes only the draft; discard restores the saved record. Legacy assessments without quotes remain readable. Existing assessment/brief/dossier size limits remain: oversized evidence fails explicitly, never silently shortens.
- Saved quotes appear in historical review. Explicit brief refresh includes them in Director handoff with untrusted-source warnings. Selected TXT/JSON dossiers retain provenance; export itself does not retrieve/verify articles. Private project script and full source text remain excluded.

## Verification

2,534 app tests / 236 files (24 new), 12 public-source worker tests, build/syntax and [full CI 37129692165](https://github.com/Impekal/kinaou/actions/runs/37129692165) passed. Tests cover exact match/Unicode/offset limits, tampering, source identity, duplicates/capacity, legacy records, review lifetimes, append/persistence retries, history, brief staleness, Director privacy, selected dossiers, escaped hostile text and DE/EN/FR without view-triggered I/O.

Actual public tagesschau retrieval supplied the 39-character quote “Astronauten erreichen ISS in Rekordzeit”, offsets 20–59 in 2,015 displayed characters. The 457,496-byte HTML hash was `b802476ab0353cd951146b51f30ee5a755489a0dc9c77131302fc759cdaa01e5`. This establishes retrieval mechanics, not factual certification. Authored acceptance claims were explicitly synthetic.

Actual browser/worker checked nonexistent-quote refusal, separate acknowledgement with no read flags/writes, project A→B→A rejection, failed save/retry (two attempts/one snapshot), serialized reload without full text, explicit brief/Director transfer, three UI languages and draft-only removal/discard. Final actual TXT (3,274 bytes) and JSON (4,337 bytes) downloads matched complete previews and excluded full source text/private script. A browser automation download-event timeout did not prevent the real download; exact files were independently verified. No production workaround. Console clean; own fixtures/tabs/services removed and preference restored. Parent evidence listed in PROJECT_STATE.md. No user SSD/media/model changes; whole research point 5 remains open.
