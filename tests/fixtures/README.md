# Authored football tactics fixture

`football-tactics.png` was created by KINAOU's actual browser SVG → canvas → PNG renderer during local acceptance, not by a mock or an external image service. The board contains fictional teams and manually positioned markers; it is not footage, measured tracking data, a real match reconstruction, or third-party artwork. The notice is baked into the image.

`football-tactics.json` is the exact retained editable asset source. `football-tactics.svg` is its canonical self-contained drawing. The render integration test checks canonical SVG equality and the captured PNG SHA-256, imports the actual image through the authenticated worker, exercises save-only recovery, and checks the resulting real FFmpeg video for field/team/arrow colors. Browser acceptance separately exercised rasterization, editing, undo/redo, DE/EN/FR controls, reload, timeline placement and root A→B→A late-response rejection.

PNG SHA-256: `fc8765b48d23aee5e70797d9e0eb21c4e373b7d7721e3a6bbbe00b8036eb7174`.

This fixture is project-authored and has no downloaded media or model dependencies. If the renderer changes intentionally, regenerate and visually inspect an actual browser PNG and update its source/hash together; do not substitute a test-generated blank image.
