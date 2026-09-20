# Course production — current vertical slice

PR #185 adds persistent course outlines and independent lesson MP4 exports. It is **not a complete course generator, an academic-review system or a platform approval claim**.

## What works

1. Open/create a project, then **Course**. Enter a course title, German/English/French language, intended learners, prerequisites and learning outcomes.
2. Add modules and lessons. Each lesson has its own stable identity, title, objective and explicit In/Out range in this project's timeline.
3. **Save course outline** validates the draft and creates a Version History safety snapshot before changing project data. Save before navigating away: draft edits are not autosaved. A malformed saved outline is reported and never silently replaced; recover through Version History.
4. **Open Studio to export lessons**, then find **Render → Course lesson export**. Select a saved lesson. This only fills the range for review; it does not start a render.
5. Choose output format/framing and sound settings, review In/Out, and explicitly **Start render**. The existing authenticated worker renders only the selected lesson into a separate, uniquely named MP4. Progress, cancellation, successful receipt recording and the existing file-presence checks apply.
6. Repeat for a different lesson or rerender one changed lesson. Existing clips, original media and prior MP4s remain untouched. Successful receipts retain the submitted course/module/lesson IDs, titles, language and outline revision even if the outline is later edited or a lesson removed.

Saved outlines travel with ordinary project serialization, drive backups and Version History. Restoring a version restores the outline with the rest of that project. Course revisions protect against saving an outdated in-memory draft over a newer saved outline.

## Boundaries to review

- One course outline currently belongs to **one project/timeline**. Cross-project lesson libraries and separate lesson-project authoring are future work.
- Lesson bounds are absolute timeline milliseconds. Moving/inserting clips does not update them automatically. Review after editing; selecting a lesson outside the active timeline is blocked. Empty modules and future ranges may be saved for planning. Overlaps are allowed for deliberately shared content.
- The existing range renderer determines clipping, source offsets, retiming, captions, transitions and fades. This slice does not introduce a new compositor or promise sample-identical full-timeline motion/fade continuation across arbitrary range cuts. Existing managed-media readiness applies to the full source project.
- Course language is metadata, not a translator or a change to the Director/voice language profile. Keep scripts, recordings and the project content profile consistent yourself until explicit language reconciliation exists.
- Course outline limits: 50 modules, 100 lessons per module and 200 lessons total. The existing project export history remains bounded to its newest **50 receipts**; older MP4s are not deleted, but a permanent per-lesson archive is still needed for very large courses.
- Course identities are retained in the **project export receipt**. Generic Publish can handle the MP4, but its current sidecar is not a dedicated course/material bundle and does not preserve the new structured course context. Do not claim a ready-to-upload course package.
- Lesson objectives are authored planning text. They do not become narration, automatically verified learning outcomes or a proof that a demonstration works. No exercise, solution, materials bundle, instructor sign-off or automatic publication is implemented here.

## Verification

The full PR gate passed 289 app tests, 82 native worker tests, production build and worker syntax checks. Coverage includes project persistence, reversible Version History, stale/corrupt outlines, unique IDs, bounded data, supported languages, range eligibility, legacy export receipts and frozen course identities. A real-worker FFmpeg test exports two independent lessons from a retimed red/blue video plus narration: it checks the selected pixels, measured duration, audible late audio, both receipts and unchanged bytes of the first MP4 after rendering the second. Tests use synthetic temporary fixtures, not private teaching material, and require no production SSD or AI model.

The local browser displayed the new Course entry/form and language options on a separate test origin. The full save/reload/export behavior is covered by automated tests; the optional manual checklist is in MAC-TEST.md. No real teaching course has been reviewed or approved.

## Next course slices

Build lesson-level scripts/source references, actual demonstration evidence, exercises with solutions, downloadable resources, review status invalidation after edits, and a durable per-lesson output/resource manifest. Preserve instructor expertise and human verification rather than making an unattended-generation approval claim.

Udemy's [official AI-use policy](https://support.udemy.com/hc/en-us/articles/30999984483607-Course-Quality-Checklist-Use-of-AI), rechecked 2026-09-20, permits quality AI assistance but not entirely AI-generated courses; instructor expertise and AI-use disclosure remain required. This outline/export tool does not establish compliance. See CREATIVE_QUALITY.md for the broader requirements.
