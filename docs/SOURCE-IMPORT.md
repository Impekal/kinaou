# Planned online-video acquisition and reuse review

User requirement, 2026-09-20: KINAOU should obtain videos from YouTube or other sources and integrate suitable excerpts into original productions, for example football tactics analysis or a player portrait, when download and subsequent publication are permitted. **This workflow is not implemented yet.** Existing local file import/rendering is not an online downloader or legal clearance engine.

## Keep three questions separate

1. **May this acquisition method download the file?** Verify provider terms and the allowed download mechanism. A copyright license or an available player does not by itself establish platform authorization for automated downloading. Prefer user-owned originals, authorized direct downloads or documented provider-supported routes. No DRM, login/access restriction or paywall circumvention; no silent browser-cookie/credential harvesting or downloader installation.
2. **May this specific material be used in this particular production?** Keep owner/license/permission evidence and scope, attribution requirements, access/check time, intended territory/platform/commercial use, and any claimed exception with its case-specific review. Third-party music, broadcast footage and incorporated material may need separate treatment. A public URL, creator credit or a short duration is not a rights grant. Legitimate exceptions must not be replaced by a fabricated universal threshold or an automatic legal verdict.
3. **Does the finished video meet platform publication/monetization criteria?** A copyright basis does not guarantee platform approval or monetization; monetization examples do not grant download or copyright permission. Preserve the distinction in UI and handoff metadata.

## Official references checked 2026-09-20

- [YouTube Terms — Permissions and Restrictions](https://www.youtube.com/static?template=terms) distinguish service-enabled use from separately permitted download/access and limit automated access. Check the applicable regional terms before implementing a provider adapter; do not treat a general YouTube URL as a supported download endpoint.
- [YouTube license types](https://support.google.com/youtube/answer/2797468?hl=en) explains standard and Creative Commons licensing. A displayed label is evidence to inspect, not proof that an uploader owns all included footage/music or that every acquisition method is authorized.
- [YouTube fair-use guidance](https://support.google.com/youtube/answer/9783148?hl=en) describes case-specific factors, including purpose, amount/significance and market effect, and notes jurisdiction differences. There is no automatic “no single source is most of my video” clearance. Even a short extract can be important to the source work and attract a claim. The app cannot guarantee fair use or decide it like a court.
- [YouTube monetization rules — reused content](https://support.google.com/youtube/answer/1311392?hl=en) includes explanatory sports replays and critical review among examples of meaningful reuse, while expressly keeping copyright separate. This supports the original-analysis product goal, not a blanket right to obtain/reupload any broadcast footage.

## Implementation acceptance targets

- Source review → explicit supported acquisition → managed asset with provenance → exact excerpt selection → original analysis/annotations → reviewed export. Do not start a job from merely pasting a URL.
- Store source page/download URL, creator, evidence references, checked dates, authorization scope and clip source timecodes independently from generated claims. Carry necessary attribution into a reviewable description/materials draft; never fabricate the attribution or legal status.
- Preserve source-byte hashes and the relationship between the original asset and each selected excerpt. Keep prior sources, edits and outputs non-destructive.
- Display reviewed/needs-review/unsupported as workflow states, not “YouTube-approved”. Unclear rights or access remain unresolved until supported; amount-per-source statistics can assist editorial review but must never become a legal permission score.
- Bound file size/duration and concurrency; validate scheme, redirects, public-host resolution, media type and managed destination; protect localhost/private networks and never log credentials. Support cancellation and cleanup of incomplete files without overwriting original or unrelated data. Design and test these controls before enabling network acquisition.
- No mandatory paid/cloud service or subscription. Missing allowed provider access is an honest limitation; user-supplied authorized original files remain a useful fallback.
