import type { courseLessonChoices } from '../core/course'

interface Props { lessons: ReturnType<typeof courseLessonChoices>; selectedId: string; disabled: boolean; onSelect: (id: string) => void }
export function CourseLessonSelector({ lessons, selectedId, disabled, onSelect }: Props) {
  if (!lessons.length) return null
  return <div className="renderJob">
    <div className="renderJobHead"><strong>Course lesson export</strong><span>{lessons.length} saved lessons</span></div>
    <p>Choosing a lesson only prepares its range. Review the output format and use Start render below to create a separate MP4. Timeline edits do not automatically move saved lesson boundaries.</p>
    <label>Saved lesson<select value={selectedId} disabled={disabled} onChange={(event) => onSelect(event.target.value)}>
      <option value="">No course lesson selected</option>
      {lessons.map((lesson) => <option key={lesson.id} value={lesson.id} disabled={!lesson.check.valid}>{lesson.label} · {(lesson.range.inMs / 1000).toFixed(3)}–{(lesson.range.outMs / 1000).toFixed(3)} s{!lesson.check.valid ? ` · ${lesson.check.reason}` : ''}</option>)}
    </select></label>
    {selectedId && <small>The export receipt will retain this course/module/lesson identity and outline revision. This does not mark the lesson academically reviewed or approved by a platform.</small>}
  </div>
}
