# Production formats — declaration and text-bound checks

Added in #455 (2026-11-22). Part of completion point 7; the whole point remains open.

## What it is

A project can declare what kind of production it is. The declaration lives in `project.metadata.productionFormat` (schema 1) and has three parts:

- **Format** — general, cartoon, children's format, learning content, sports.
- **Declared viewer age** — not declared, under 6, 6–9, 10–13, 14–17, adults, all ages.
- **What the viewer should take away** — free text, required for every format except general.

A children's format needs a declared age below 18. Both rules are enforced when saving; the Save button is disabled and names the missing part.

## Which checks a declaration calls for

| Check | Due when |
|---|---|
| Suitable for the declared age | children's format, or any format declared for under 6 / 6–9 / 10–13 |
| Factually accurate | learning content, children's format |
| Characters stay the same | cartoon |
| Sports material cleared | sports |

A general production calls for none, and the panel says so.

## What a confirmation covers

Each check is a self-report: who checked, and what they checked against. It is bound to a SHA-256 over the declaration and every word the production says or shows as text — the script, and each scene's title, description and narration. Scope name: `production-format-script-v1`.

- Change any of that text and the confirmation shows **TEXT CHANGED** until it is confirmed again.
- Change the declaration and the confirmations are discarded: a check made for ten-year-olds says nothing about under-sixes.
- Retiming a scene, attaching media or renaming the project does not affect it, because the check never covered those.

Both saving a declaration and confirming a check write an automatic version first.

## What reaches the local Director

The declaration is added to the Director brief as a block of constraints, after the language profile and before the creative brief: the format, the declared age, the purpose, and the rules for that format (for children: short sentences, nothing frightening, no pressure to buy or keep watching, no requests for personal data; for learning: only facts from the brief; for sports: only original or explicitly authorized material, no invented scores; for cartoons: recurring characters described identically in every scene). A young declared audience brings the children's rules with it whatever the format is called. A general production with nothing declared adds nothing.

## Boundaries

- The age is the author's declaration. It is not an age rating, and KINAOU does not know who watches.
- KINAOU verifies neither suitability, nor facts, nor rights. A confirmation records that a named person says they checked.
- The confirmation covers text only. Generated pictures, voices, music and the rendered video are not part of it.
- The Director constraints shape a draft. They do not make a draft suitable; that is what the checks are for.
- No dedicated cartoon engine, character system or animation workflow is implied.

## Acceptance (2026-11-22)

2,947 app tests / 260 files, 494 worker tests, build and worker syntax check passed on the exact merged head. A real Chromium session against the development server, in German: general production shows no check; a children's format without an age cannot be saved and says why; the saved declaration persists; two checks are listed as open; confirmation needs reviewer and note; one confirmed check shows as confirmed and is stored; editing one narration sentence turns it into TEXT CHANGED after reload; declaring a younger age leaves zero stored confirmations; both history entries appear in German; the panel renders correctly after switching to French; console clean. This was run in a Linux development container, not on the Mac.
