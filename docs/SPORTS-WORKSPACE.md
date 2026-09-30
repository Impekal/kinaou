# Sports workspace — #369

Open a project and choose **Sport / Sports / Sport** in navigation. Football tools now have three focused views:

- **Board:** authored player/ball positions and arrows, reviewed managed PNG saving.
- **Sequence:** saved PNGs and authored durations, reviewed standard image-track placement.
- **Motion:** two compatible saved formations, reviewed local VP8 generation and separate video-track placement.

Existing generation, provenance, save-only recovery, cancellation and request-scope guards remain unchanged. See FOOTBALL-TACTICS.md and FOOTBALL-MOTION.md. Switching tabs invokes no production action. First visits lazily mount tools; visited tools remain mounted but hidden, preserving drafts and scope observation. Project changes still invalidate older reviewed proposals. Leaving Sports unmounts tools with normal cleanup; navigation does not promise cancellation of already accepted side effects.

Unsaved drafts remain within the workspace only. Leaving, changing project or reloading loses them; saved project media/tracks survive. Visible guidance explains this. The Studio button navigates; it does not save/export. Board content language is independent of UI language. Images no longer contains sports tools.

Accessible tablist/tab/tabpanel relationships provide one selected tab, roving focus, Left/Right wrap and Home/End. Hidden panels are not displayed or keyboard-accessible. Labels/help are DE/EN/FR. Research no longer receives a contradictory unavailable placeholder; Analytics retains its honest placeholder.

Acceptance: six new automated cases plus shell coverage; 2,048 app tests, 373 supported local worker tests, build and full unchanged CI including render smoke. Actual App at isolated localhost:43982 verified all three distinct drafts, DE→FR→EN retention, original German image language, keyboard controls, Studio navigation, Images separation, Research/Analytics labels, expected draft loss after leaving and saved project after reload. Final app console clean. Disposable empty project and temporary page/server/tab cleaned. No user media/SSD/model action required.

This is navigation improvement, not complete sports production, match footage, tracking, tactical correctness, rights permission, audience prediction or avatar quality.
