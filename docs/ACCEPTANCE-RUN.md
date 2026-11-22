# KINAOU — acceptance run sheet

One ordered list of what has to be done at the Mac to close the open completion points. It replaces hunting through the dated notes in [MAC-TEST.md](MAC-TEST.md), which stays as the detailed reference for each step.

How to use it: work through the sessions in order. Each one says what it needs, what to do, and what to report back. Report the exact words on screen for anything that looks wrong, plus the worker's terminal output. A session counts as passed only when a person has looked at the result — a green test is not a pass.

Everything built since 2026-11-22 (#455 onward) was checked in a Linux container browser only. Sessions A–C repeat those checks on the Mac; they need no AI model.

| Session | Closes | Needs | Roughly |
|---|---|---|---|
| A — Start and core path | 10 | Node, FFmpeg, SSD | 20 min |
| B — New planning tools | 5, 6, 7 (software half) | nothing extra | 30 min |
| C — Course gaps | 8 (software half) | nothing extra | 15 min |
| D — Local models end to end | 10 | Ollama, speech runtime, ComfyUI | 60 min |
| E — A cartoon and a children's production | 7 | as D | 60 min |
| F — Research on real sources | 5 | network | 30 min |
| G — Editorial drafts | 6 | Ollama | 30 min |
| H — A real course | 8 | as D | 90 min |
| I — Avatars in motion | 4 | an animation/lip-sync engine (to be chosen) | open |
| J — Real publication | 9 | your YouTube and Instagram accounts | 45 min |
| K — Endurance and recovery | 10 | SSD | 45 min |

## A — Start and core path

1. `git pull`, `npm ci`, start the PWA (`npm run dev`) and the worker as in MAC-TEST.md stage 1. Check the sidebar build line matches `git log --oneline -1`.
2. Stage 2 of MAC-TEST.md, all seven steps — including the two never confirmed: create a version, change something, restore it; and eject the SSD, check media availability (must read OFFLINE), replug, check again (AVAILABLE).

Report: the capability chips, and any step that did not behave as described.

## B — New planning tools (no AI needed)

In one disposable project with a short applied Director plan (or type a script and two scenes by hand):

1. **Production format** (Director): choose "Children's format" with no age — Save must stay disabled and say why. Set age and purpose, save, confirm one check. Edit one narrated sentence — the check must read TEXT CHANGED. Declare another age — both checks open again. Open **Publish**: the status line must name the open checks.
2. **Character sheet** (Director): two characters and a shared style; the cast list must match the script. In **Images**, insert one character into the prompt twice — the second time must be refused as already present.
3. **Hashtags** (Publish): enter a term from a retained search trend, a multi-word keyword and a made-up one. Check the three evidence labels, exceed your own limit (must refuse with the count), save, copy, paste into a text editor.
4. **Competition** (Research → Competition): add one entry with a real address you looked at, try saving without a coverage note (must refuse), then save with a statement of what you do differently.
5. **Views by weekday** (Analytics): import one real daily-views CSV of at least five weeks. Read the table against the file for two weekdays.

Report: anything worded confusingly. These screens are new and their wording has had no human reader yet.

## C — Course gaps

Open a project with a saved course, go to Course → Production. For two lessons, compare "What is still missing before delivery?" with what you know about them. Close the first open item of one lesson and confirm its next step moves on.

Report: any item listed as open that is not, or missing that is.

## D — Local models end to end

Stage 5 and stage 6 of MAC-TEST.md: Director plan from the installed language model, media plan in both modes, assemble, narrate, fit scenes to narration, captions, realign, pick a format, render. Watch the whole exported video with sound.

Report: where you had to stop and think, and anything in the finished video you would not publish.

## E — A cartoon and a children's production (closes point 7)

1. Declare "Cartoon", write a character sheet, generate a Director plan, and generate the same character in three scenes with ComfyUI. Judge by eye whether it reads as the same character. Assemble, narrate, render.
2. Declare "Children's format" for one age band, generate a plan, and read every sentence against that age before confirming the age check.

Report: the image template used, how consistent the character was, and whether the language model kept to the children's rules. Point 7 closes when you would show both results to someone.

## F — Research on real sources (closes point 5)

Retrieve public search trends for two markets, retain three observations, read one linked article with the public source reader, record a source assessment, add two competition entries, write a video brief and send it to Director.

Report: whether the brief that reaches Director contains what you intended, and anything that reads as a claim KINAOU cannot support.

## G — Editorial drafts (closes point 6)

For one finished main video with one Short: generate title, description and keywords in German, English and French with the installed model; run the language pass on the French one; build hashtag lists for both; make a timing plan and compare it with your weekday table.

Report: per language, whether you would publish the text unchanged, lightly edited, or not at all.

## H — A real course (closes point 8)

A course of at least two modules and four lessons: curriculum draft, scripts, narration, captions, one demonstration, one exercise with a private answer, instructor review, lesson exports, learner and instructor packages, a collection. Use "What is still missing before delivery?" as the guide and note every place where it sent you the wrong way.

Report: whether a learner could follow lesson one without you in the room.

## I — Avatars in motion (closes point 4)

Still images with a consistent identity are accepted (FLUX.2 Klein, Reference Pack). Movement, expression and lip sync are not built, because no engine has been chosen. This session starts with a decision, not a test: which locally runnable animation/lip-sync engine to evaluate on the M2 Pro with 16 GB. Nothing is downloaded without your say-so.

## J — Real publication (closes point 9)

One real upload to YouTube and one Reel to Instagram through the connection panels, with your own accounts, as private or unlisted where the platform allows. One manual handoff each for TikTok, Facebook and Threads. Then export the daily views a week later and import them into Analytics.

Report: every error message from a platform, verbatim.

## K — Endurance and recovery (closes point 10)

A timeline of at least ten minutes rendered in landscape and vertical; note time taken and peak memory. Pull the SSD during a render and confirm the failure is reported and nothing is half-written into the project. Restore a project from a private archive into a working copy and render it.

Report: times, and anything that needed a restart.
