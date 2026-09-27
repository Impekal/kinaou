import { useEffect, useRef, useState } from 'react'
import { projectCourseOutputIndex, type ExportReceipt } from '../core/exportHistory'
import { courseOutputState } from '../core/courseOutputState'
import { CourseOutputPreflight, type CourseOutputCheckFeedback } from '../core/courseOutputPreflight'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
import { CourseOutputPlaybackControl } from './CourseOutputPlaybackControl'

export interface CourseOutputWorkerProps { workerUrl?: string; workerToken?: string; workerConnected?: boolean; workerCapabilities?: string[] }
export function CourseOutputFileCheckPanel({ project, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; dirty: boolean }) {
  const { t, language } = useUiLanguage()
  let receipts: ExportReceipt[] = [], invalid = ''
  try { receipts = projectCourseOutputIndex(project) } catch (cause) { invalid = String(cause) }
  const [selected, setSelected] = useState(''), [feedback, setFeedback] = useState<CourseOutputCheckFeedback | null>(null)
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('publish-preflight')
  const connection = JSON.stringify([workerUrl, workerToken, available])
  const scope = { project, dirty, jobId: selected, connection }, environment = useRef(scope), session = useRef<CourseOutputPreflight | null>(null), mounted = useRef(true)
  environment.current = scope; session.current?.observe(scope)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  const receipt = receipts.find(entry => entry.jobId === selected), busy = !!session.current?.busy
  const shown = feedback && session.current?.wasDetached ? { phase: 'detached' as const } : feedback
  let outline: ReturnType<typeof courseOutputState> | null = null
  if (receipt) { try { outline = courseOutputState(project, receipt) } catch { /* File facts do not establish outline agreement. */ } }
  async function inspect() {
    if (!available || dirty || invalid || !receipt || busy) return
    session.current?.detach()
    const task = new CourseOutputPreflight(environment.current, { environment: () => environment.current,
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task; await task.check()
  }
  const result = shown && 'result' in shown ? shown.result : undefined
  return <section className="card stack">
    <h3>{t('course.fileCheck.heading')}</h3><p>{t('course.fileCheck.help')}</p><p>{t('course.fileCheck.boundary')}</p>
    {!available && <p>{t('course.fileCheck.unavailable')}</p>}{dirty && <p>{t('course.fileCheck.saveFirst')}</p>}
    {invalid && <div role="alert">{t('course.outputs.invalid')}<details><summary>{t('common.details')}</summary>{invalid}</details></div>}
    {!invalid && !receipts.length && <p>{t('course.fileCheck.empty')}</p>}
    <label>{t('course.fileCheck.select')}<select value={receipt ? selected : ''} disabled={dirty || !!invalid} onChange={event => setSelected(event.target.value)}>
      <option value="">{t('course.fileCheck.choose')}</option>{receipts.map(entry => <option key={entry.jobId} value={entry.jobId}>{entry.courseLesson!.courseTitle} / {entry.courseLesson!.moduleTitle} / {entry.courseLesson!.lessonTitle} · {t(`export.${entry.format}`)} · {new Date(entry.completedAt).toLocaleString(language)} · {entry.jobId}</option>)}
    </select></label>
    {receipt && <><code>{receipt.outputRelativePath}</code><p>{t(outline ? `course.outputs.state.${outline}` : 'course.fileCheck.outlineUnknown')}</p></>}
    <button disabled={!available || dirty || !!invalid || !receipt || busy} onClick={inspect}>{t(busy ? 'course.fileCheck.checking' : 'course.fileCheck.check')}</button>
    {shown && <div role={shown.phase === 'failed' || shown.phase === 'mismatch' ? 'alert' : 'status'}>{t(`course.fileCheck.${shown.phase}`)}{'detail' in shown && shown.detail && <details><summary>{t('common.details')}</summary>{shown.detail}</details>}</div>}
    {result && <div>
      <p>{t('publish.preflight.summary', { expectedWidth: result.expected.width, expectedHeight: result.expected.height, expectedDuration: result.expected.durationMs / 1000, actualDimensions: result.actual.width && result.actual.height ? `${result.actual.width}×${result.actual.height}` : t('publish.preflight.noDimensions'), actualDuration: result.actual.durationMs === undefined ? t('publish.preflight.unknownDuration') : `${(result.actual.durationMs / 1000).toLocaleString(language)} s`, videoCodec: result.actual.videoCodec ?? t('publish.preflight.noVideo'), audioCodec: result.actual.audioCodec ?? '—' })}</p>
      <ul>{(['size', 'videoStream', 'dimensions', 'duration'] as const).map(key => <li key={key}>{t(result.checks[key] ? 'publish.preflight.pass' : 'publish.preflight.fail')} · {t(key === 'size' && result.expected.sizeBytes === undefined ? 'course.fileCheck.nonempty' : key === 'duration' ? 'publish.preflight.check.duration' : key === 'videoStream' ? 'publish.preflight.check.video' : `publish.preflight.check.${key}`, { tolerance: result.durationToleranceMs })}</li>)}</ul>
      <p>{t('course.fileCheck.checked', { date: new Date(result.checkedAt).toLocaleString(language), bytes: result.actual.sizeBytes.toLocaleString(language) })}</p>
      {result.expected.sizeBytes === undefined && <p>{t('course.fileCheck.noSize')}</p>}
      <p>{t(result.actual.audioCodec ? 'course.fileCheck.audio' : 'course.fileCheck.noAudio', { codec: result.actual.audioCodec ?? '' })}</p>
    </div>}
    {shown && <button onClick={() => { session.current?.detach(); session.current = null; setFeedback(null) }}>{t('course.fileCheck.forget')}</button>}
    <CourseOutputPlaybackControl project={project} jobId={receipt?.jobId ?? ''} dirty={dirty} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} workerCapabilities={workerCapabilities}/>
  </section>
}
