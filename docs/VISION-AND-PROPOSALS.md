# KINAOU — the user's vision and the build agent's proposals

Recorded 2026-11-22 so that it survives a change of model or session. The first section is what the user asked for, in substance. The second is what already exists toward it. The third is proposals — **none of them is agreed work until the user says so.**

## What the user asked for (2026-11-22)

- Not one more tool but a single, unusually capable studio: all-round and powerful.
- **Intuitive and user-friendly above all.** A final pass makes the whole product easy to use; this is a first-rank requirement, not polish.
- Topics are searched and proposed from current research on the internet — what is current, what people expect — including a check against what already exists.
- The studio browses websites, takes screenshots, obtains videos from YouTube and similar sites, uses the relevant parts, and edits by itself.
- It analyses, and does things better than others do.
- It uses a narrating character or an avatar, or neither, depending on the case.

## What already exists toward it

| Wish | In the product today |
|---|---|
| Topics from current research | Public search-interest retrieval for 13 markets, retained with source and date; source reading; source assessment; video brief → Director |
| Check against what exists | Authored competition notes that reach the Director (#463) |
| Websites and screenshots | Headless website capture with URL provenance; real screen and window capture on macOS |
| Videos from the web | Authorized **direct MP4** acquisition with provenance (#433), reviewed excerpts with original audio, still extraction, frame annotation |
| Edits by itself | Scene media plan (automatic or reviewed), assembly with motion and dissolves, narration, fit to narration, captions, formats, Shorts from a long video |
| Narrator, avatar or neither | Local speech incl. authorized own voice; persistent avatar identities as stills; voiced-still presenter. **Animated avatars are not built.** |
| Analysis and learning | Local analytics import, calendar and weekday views, period comparison |

## The one boundary that does not move

Downloading from YouTube and similar platform players is against those platforms' terms of service, and usually the footage belongs to someone else. The project's own rule — no circumvention of licences or terms — has been in force since the first handoff, and SOURCE-IMPORT.md records the decision: platform-player acquisition is unsupported. What is possible instead, and covers most of the real need:

- the user's own videos, exported from the platform's own studio;
- footage whose owner gave permission, as a direct file (already supported);
- material under a licence that allows reuse — Creative Commons, public domain — from libraries with official interfaces;
- quoting a short excerpt for commentary or analysis where the law of the user's country allows it, with the source named: the tools for that (excerpt, provenance, attribution) exist, the legal judgement stays with the user;
- screenshots and screen recordings the user makes, with provenance.

## Proposals, in the order the build agent would do them

1. **One guided run from topic to rough cut ("Autopilot").** The parts exist; what is missing is the thread. One screen: a topic or brief goes in, and KINAOU runs research brief → Director plan → media plan → assembly → narration → fit → captions → preview, showing each stage's result and stopping only where a decision is really the author's. Every step stays reviewable and reversible, as now. This is the single change that would most make it feel like one studio rather than sixteen panels.
2. **A "next step" that follows the author everywhere.** The course view now says what to do next per lesson (#464). The same idea for a whole project — a persistent line that names the next sensible step and takes the author there — plus a start screen that asks "what do you want to make?" and offers five journeys instead of sixteen menu items. Expert panels stay, behind "more".
3. **Topic proposals with reasons.** From the retained observations and the author's own niche and past results, the local model proposes topics — each one citing the observations it rests on, each one labelled as a proposal and not a measured trend. More sources through official, free interfaces only: RSS feeds of sites the author chooses, Wikipedia page-view statistics, and (with the author's own key) the YouTube Data API for public metadata.
4. **A licensed-footage finder.** Search Wikimedia Commons, the Internet Archive and similar libraries through their official interfaces, show the licence and required attribution next to every result, and import with that provenance recorded.
5. **Picking the relevant part automatically.** Transcribe a source, let the local model match passages to scenes, and propose excerpts for review — instead of scrubbing by hand.
6. **A critique pass before export.** The local model reads the draft against the competition notes and a short checklist (does it open strongly, does every scene earn its place, is anything claimed that the brief does not support) and proposes concrete, reviewable edits.
7. **Presenter choice per production.** Director proposes narrator, avatar, voice only or none, with its reason; the author decides. This depends on animated avatars (completion point 4).
8. **A learning loop.** Imported results feed the next round of topic proposals: which formats and subjects did well for this author.
9. **Brand kit and series.** Fonts, colours, intro, outro and lower thirds defined once and applied to every production; one click to start the next episode of a series.

**Status (2026-11-22):** the user approved implementing these. Item 2 is merged (#466 next-step bar, #467 start screen with five journeys and grouped navigation; the "expert panels behind more" part is left for the final usability pass). Item 1 is next.

Items 1 and 2 are the usability work the user put first. Items 3–6 are what would make the research and editing genuinely better than doing it by hand. All of them run locally and none needs a paid service.
