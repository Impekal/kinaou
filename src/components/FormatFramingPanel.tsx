import { useState } from 'react'
import type { KinaouProject } from '../core/project'
import { defaultFormatReframing, formatProfiles, projectFormatReframing, setProjectFormatReframing, type FormatReframing, type TargetFormat } from '../core/render'
import { useUiLanguage } from './UiLanguageProvider'

export function FormatFramingPanel({ project, busy, workerBlocked, onProjectChange }: {
  project: KinaouProject; busy: boolean; workerBlocked: boolean; onProjectChange: (project: KinaouProject) => void
}) {
  const { t } = useUiLanguage()
  const [error, setError] = useState<{ project: KinaouProject; detail: string } | null>(null)
  function save(format: TargetFormat, value: FormatReframing) {
    setError(null)
    try { onProjectChange(setProjectFormatReframing(project, format, value)) }
    catch (cause) { setError({ project, detail: String(cause) }) }
  }
  return <section className="renderJob" aria-label={t('frame.heading')}>
    <div className="renderJobHead"><strong>{t('frame.heading')}</strong><span>{t('frame.saved')}</span></div>
    <p className="cardBody">{t('frame.help')}</p>
    <div className="reframingGrid">{(Object.keys(formatProfiles) as TargetFormat[]).map(id => {
      const value = projectFormatReframing(project, id), defaults = defaultFormatReframing(id)
      const isDefault = value.fit === defaults.fit && value.focusX === defaults.focusX && value.focusY === defaults.focusY
      return <div className="reframingOption" key={id} role="group" aria-label={t(`export.${id}`)}>
        <div className="renderJobHead"><strong>{t(`export.${id}`)}</strong><span>{formatProfiles[id].aspect}</span></div>
        <label>{t('frame.fit')}<select value={value.fit} disabled={busy} onChange={event => save(id, { ...value, fit: event.target.value as 'contain' | 'cover' })}><option value="cover">{t('frame.cover')}</option><option value="contain">{t('frame.contain')}</option></select></label>
        <label>{t('frame.x', { percent: Math.round(value.focusX * 100) })}<input type="range" min="0" max="100" step="1" value={value.focusX * 100} disabled={busy || value.fit !== 'cover'} onChange={event => save(id, { ...value, focusX: Number(event.target.value) / 100 })} /></label>
        <small>{t('frame.xHelp')}</small>
        <label>{t('frame.y', { percent: Math.round(value.focusY * 100) })}<input type="range" min="0" max="100" step="1" value={value.focusY * 100} disabled={busy || value.fit !== 'cover'} onChange={event => save(id, { ...value, focusY: Number(event.target.value) / 100 })} /></label>
        <small>{t('frame.yHelp')}</small>
        <button disabled={busy || isDefault} onClick={() => save(id, defaults)}>{t('frame.reset', { format: t(`export.${id}`) })}</button>
      </div>
    })}</div>
    {workerBlocked && <div className="warning">{t('frame.worker')}</div>}
    {error?.project === project && <div className="errorBox" role="alert">{t('frame.failed')}<details><summary>{t('common.details')}</summary>{error.detail}</details></div>}
  </section>
}
