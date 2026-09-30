# Original football tactics graphics

Images → Football tactics board creates authored schematic illustrations without a model, download, paid service or external artwork.

## Workflow
1. Choose a player, click inside the pitch or use the horizontal/vertical percentage fields. Set the ball separately. Add up to 12 anchored pass/run arrows and move their endpoints.
2. Edit optional title, team and player labels; choose DE/EN/FR for the baked image independently of the application language. The starting 22-player formation is only an editable example, not advice.
3. Review and acknowledge the illustration. Save graphic rasterizes the self-contained SVG locally to a real 1920×1080 PNG, imports it through the authenticated local worker, and requires an actual PNG/dimension probe before registering it.
4. Use explicit existing-track placement, or create a new five-second image track when no compatible track exists. Timeline editing, narration, captions and normal preview/export remain separate.
5. Reopen a saved graphic as a new editable draft. Every save creates a new file; previous graphics/clips remain unchanged.

Draft undo/redo retains up to 50 in-view edits; unsaved drafts do not survive leaving the view. A saved asset includes the validated board source under `authored-football-tactics-v1`, authored/illustration flags and renderer provenance. Historical PNGs do not re-render or change merely because their source is reopened.

## Recovery and scope
File import retains its accepted path and measured probe for save-only retries. A failed project save must use the offered retry, not regenerate/upload. Snapshot/registration are cached for that session. Ambiguous upload acknowledgement is not automatically retried. Leaving or changing project/connection/root detaches monitoring, including observed A→B→A changes; it does not delete or cancel an accepted file. Unregistered copies may remain and are reported honestly.

Labels and coordinates are bounded/validated; SVG text is escaped, and there are no external media/font/network references. The obligatory localized illustration notice is baked into the PNG. New metadata only decorates the new asset; measured/name metadata cannot be overridden. No existing asset/clip is overwritten.

## Acceptance
1,994 app tests in 205 files, 373 supported local worker tests, production build and full unmodified CI. The retained project-authored fixture is an actual browser SVG→canvas PNG. An executing authenticated-worker/FFmpeg test imports it, fails/retries persistence without a second upload, places it on a real track and verifies duration plus field/team/arrow pixels in the video. Canonical SVG and PNG digest bind the fixture.

Actual local browser acceptance verified editable player/ball/arrows, undo/redo, DE/EN/FR interface with unchanged content, persistent editable source after reload, save-only retry, new-track placement and an H.264 384×216 five-second output. A held genuine probe response was released after root A→B→A; it did not register the detached image. Fresh console clean; own temporary files, browser data and processes removed.

## Limits
This is a static schematic drawing tool, not animated player motion, measured tracking, authentic match footage, automatic tactical evaluation, live scores or factual verification. It has no third-party logos, highlight acquisition or reuse-rights claim. Authored labels/assertions still require review. A landscape pitch needs deliberate contain-fit treatment for portrait exports. It does not complete the full sports/cartoon/children/learning point or final hardware acceptance.

