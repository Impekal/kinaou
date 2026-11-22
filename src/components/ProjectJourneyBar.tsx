import { useMemo } from 'react'
import { projectJourney, type JourneyTarget, type ProjectJourney } from '../core/projectJourney'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

/** The heading of the panel where each stage is done, so the hint always uses the words on screen. */
const journeyPanels = {
  plan: 'director.heading', visuals: 'director.heading', assemble: 'assembly.heading', narration: 'narration.heading',
  fit: 'narration.heading', captions: 'scriptCaption.heading', align: 'scriptCaption.heading', export: 'nav.Studio'
} as const

interface Props { project: KinaouProject; section: string; onGo: (target: JourneyTarget) => void }

/** Says where a video stands and what to do next. It navigates; it never acts on the project. */
export function ProjectJourneyBar({ project, section, onGo }: Props) {
  const { t } = useUiLanguage()
  const journey = useMemo<ProjectJourney | null>(() => { try { return projectJourney(project) } catch { return null } }, [project])
  if (!journey) return null
  const next = journey.next
  const countable = (done: number, total: number) => total > 1 ? ` · ${t('journey.progress', { done, total })}` : ''
  return <section className="card journeyBar" aria-label={t('journey.label')}>
    {next ? <div className="sectionLead">
      <div><div className="eyebrow">{t('journey.next')}</div><h3>{t(`journey.stage.${next.stage}`)}{countable(next.done, next.total)}</h3><p>{t(`journey.why.${next.stage}`, { panel: t(journeyPanels[next.stage]) })}</p></div>
      {section === next.target ? <small role="status">{t('journey.here')}</small> : <button className="primary" onClick={() => onGo(next.target)}>{t(`journey.go.${next.target}`)}</button>}
    </div> : <p role="status">{t('journey.allDone')}</p>}
    <details>
      <summary>{t('journey.showAll')}</summary>
      <small>{t('journey.boundary')}</small>
      <ol>{journey.steps.map(step => <li key={step.stage} aria-current={next?.stage === step.stage ? 'step' : undefined}>
        <span className={step.state === 'done' ? 'badge' : 'badge offline'}>{t(`journey.state.${step.state}`)}</span> {t(`journey.stage.${step.stage}`)}{step.state !== 'waiting' && step.state !== 'unknown' ? countable(step.done, step.total) : ''}
        {step.state === 'unknown' && <small> — {t('journey.unknownHelp')}</small>}
      </li>)}</ol>
    </details>
  </section>
}
