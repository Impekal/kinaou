import { useEffect, useRef, useState } from 'react'
import { createCourseMaterialPackage, type CoursePackageAudience } from '../core/courseMaterialPackage'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'
export function CourseMaterialPackagePanel({ project, dirty }: { project: KinaouProject; dirty: boolean }) {
  const { t } = useUiLanguage()
  const [privateAck, setPrivateAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ kind: 'download'; filename: string } | { kind: 'changed' } | null>(null)
  const current = useRef({ project, dirty, generation: 0 })
  if (current.current.project !== project || current.current.dirty !== dirty) current.current = { project, dirty, generation: current.current.generation + 1 }
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current.generation++ } }, [])
  useEffect(() => { setPrivateAck(false); setResult(null) }, [project, dirty])
  async function download(audience: CoursePackageAudience) {
    if (dirty || busy || (audience === 'instructor' && !privateAck)) return
    const generation = ++current.current.generation
    setBusy(true); setError(''); setResult(null)
    try {
      const file = await createCourseMaterialPackage(project, audience)
      if (!mounted.current) return
      if (generation !== current.current.generation || current.current.dirty || current.current.project !== project) { setResult({ kind: 'changed' }); return }
      const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType }))
      const link = document.createElement('a')
      try { link.href = url; link.download = file.filename; document.body.appendChild(link); link.click() }
      finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
      setResult({ kind: 'download', filename: file.filename })
    } catch (cause) {
      if (mounted.current) {
        if (generation === current.current.generation) setError(String(cause))
        else setResult({ kind: 'changed' })
      }
    }
    finally { if (mounted.current) setBusy(false) }
  }
  return <section className="card stack">
    <h3>{t('course.package.heading')}</h3><p>{t('course.package.help')}</p>
    {dirty && <small>{t('course.saveFirst')}</small>}
    <label><input type="checkbox" checked={privateAck} disabled={busy || dirty} onChange={event => setPrivateAck(event.target.checked)} />{t('course.package.privateAck')}</label>
    <div className="directorActions">
      <button disabled={dirty || busy} onClick={() => void download('learner')}>{t('course.package.learner')}</button>
      <button disabled={dirty || busy || !privateAck} onClick={() => void download('instructor')}>{t('course.package.instructor')}</button>
    </div>
    {busy && <p role="status">{t('course.package.busy')}</p>}
    {error && <div className="errorBox" role="alert">{t('course.package.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {result && <p role="status">{result.kind === 'changed' ? t('course.package.changed') : t('course.package.requested', { filename: result.filename })}</p>}
  </section>
}
