# Hashtag lists with their origin

Added in #460 (2026-11-22). Part of completion point 6; the whole point remains open.

## What it is

Publish holds a hashtag list for the main video and a separate one for the Short (`project.metadata.hashtagSets`, schema 1). The author enters keywords; KINAOU writes them as hashtags and shows, for each one, what this project holds in support of it.

## Rewriting rules

- A single word is kept exactly as written. A leading `#` is removed.
- Several words are joined into one, with each later word capitalised (`fußball taktik` → `#fußballTaktik`). The row shows what it was rewritten from.
- A keyword that leaves no letter, consists only of punctuation or exceeds 100 characters cannot become a hashtag. It is named and blocks saving.
- A keyword that produces the same tag as an earlier one (ignoring capitalisation) is named and blocks saving.
- The only limit is one the author sets (1–60, default 5). Exceeding it blocks saving and says by how many.

## Evidence shown per tag

| Label | Meaning |
|---|---|
| SCRIPT + TREND | written in the script and matched by a retained search-trend observation |
| IN SCRIPT | the keyword is written in at least one scene, or in the script text |
| TREND OBSERVATION | a retained observation has exactly this term; the script does not mention it |
| OWN CHOICE | neither — allowed, and simply the author's decision |

Script evidence counts the scenes whose title, description or narration contain the keyword as written, with word boundaries (`Abseits` is not found inside `Abseitsregel`). Trend evidence cites each retained observation whose term equals the keyword exactly: market, retrieval date and the provider's literal figure if it gave one.

Evidence is recomputed from the current project every time it is shown. The saved list stores only the tags and their keywords, so the evidence cannot describe an older script.

## Boundaries

- Search interest is not video demand and not a reach forecast. A match with a trend term predicts nothing.
- KINAOU does not know any platform's hashtag rules or limits and states none.
- No popularity score, ranking or "best hashtags". No lookup of how often a hashtag is used.
- Nothing is sent anywhere. The list is copied by hand into a platform's own field; packages, preflight and upload paths are unchanged.
- Literal matching misses inflected forms, synonyms and anything said only in the picture.

## Acceptance (2026-11-22)

2,984 app tests / 262 files, build and worker syntax check passed on the exact merged head; worker code untouched. Container Chromium, German, with one retained DE observation for "Abseitsregel": blocked keywords named and blocking; four rows with the correct evidence labels and citation; over-limit blocking with the count; saved line `#Abseitsregel #fußballTaktik #Pressing #Elfmeter` equal to the clipboard content; independent empty Short list; persistence across reload; German history entry; clean console. Not run on the Mac.
