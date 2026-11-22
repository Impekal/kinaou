import { useMemo, useState } from 'react'
import { isJourneyActionStage, runJourneyAction, type JourneyActionOutcome } from '../core/journeyActions'
import type { PersistentVersionHistory } from '../core/versioning'
import { journeyEntry, projectJourney, type JourneyEntryTarget, type JourneyStage, type JourneyTarget, type ProjectJourney } from '../core/projectJourney'
import { projectStartJourney } from '../core/startJourneys'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

/** The heading of the panel where each stage is done, so the hint always uses the words on screen. */
const journeyPanels = {
  plan: 'director.heading', visuals: 'director.heading', assemble: 'assembly.heading', narration: 'narration.heading',
  fit: 'narration.heading', captions: 'scriptCaption.heading', align: 'scriptCaption.heading', export: 'nav.Studio'
} as const

interface Props {
  project: KinaouProject
  section: string
  onGo: (target: JourneyTarget | JourneyEntryTarget) => void
  /** With both of these the bar can do the model-free steps itself; without them it only navigates. */
  history?: Pick<PersistentVersionHistory, 'snapshot'>
  onProjectChange?: (project: KinaouProject) => void
}

/** Says where a video stands and what to do next. The four model-free steps can be done right here. */
export function ProjectJourneyBar({ project, section, onGo, history, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const journey = useMemo<ProjectJourney | null>(() => { try { return projectJourney(project) } catch { return null } }, [project])
  const [outcome, setOutcome] = useState<JourneyActionOutcome | null>(null)
  const [failure, setFailure] = useState<{ project: KinaouProject; stage: keyof typeof journeyPanels; detail: string } | null>(null)
  if (!journey) return null
  const did = outcome?.project === project ? outcome : null
  const failed = failure?.project === project ? failure : null
  const canAct = Boolean(history && onProjectChange)
  function act(stage: JourneyStage) {
    if (!history || !onProjectChange || !isJourneyActionStage(stage)) return
    setOutcome(null); setFailure(null)
    try { setOutcome(runJourneyAction(project, stage, history, onProjectChange)) }
    catch (cause) { setFailure({ project, stage, detail: cause instanceof Error ? cause.message : String(cause) }) }
  }
  const next = journey.next
  const entry = journeyEntry(projectStartJourney(project), next)
  const countable = (done: number, total: number) => total > 1 ? ` · ${t('journey.progress', { done, total })}` : ''
  return <section className="card journeyBar" aria-label={t('journey.label')}>
    {next && entry ? <div className="sectionLead">
      <div><div className="eyebrow">{t('journey.next')}</div><h3>{t(`journey.entry.${entry}`)}</h3><p>{t(`journey.entryWhy.${entry}`)}</p></div>
      {section === entry ? <small role="status">{t('journey.here')}</small> : <button className="primary" onClick={() => onGo(entry)}>{t(`journey.go.${entry}`)}</button>}
    </div> : next ? <div className="sectionLead">
      <div><div className="eyebrow">{t('journey.next')}</div><h3>{t(`journey.stage.${next.stage}`)}{countable(next.done, next.total)}</h3><p>{t(`journey.why.${next.stage}`, { panel: t(journeyPanels[next.stage]) })}</p></div>
      {canAct && isJourneyActionStage(next.stage) && !failed
        ? <div className="journeyAct"><button className="primary" onClick={() => act(next.stage)}>{t('journey.do')}</button>{section !== next.target && <button className="secondaryButton" onClick={() => onGo(next.target)}>{t(`journey.go.${next.target}`)}</button>}<small>{t('journey.doHelp')}</small></div>
        : section === next.target ? <small role="status">{t('journey.here')}</small> : <button className="primary" onClick={() => onGo(next.target)}>{t(`journey.go.${next.target}`)}</button>}
    </div> : <p role="status">{t('journey.allDone')}</p>}
    {did && <div className="journeyDid" role="status">
      {did.changed > 0 ? <>{t(`journey.did.${did.stage}`, { count: did.changed })} {t('journey.didUndo', { history: t('history.heading') })}</> : t('journey.didNothing')}
      {did.left > 0 && <> {t('journey.didLeft', { count: did.left, panel: t(journeyPanels[did.stage]) })}</>}
    </div>}
    {failed && <div className="errorBox" role="alert">{t('journey.doFailed', { panel: t(journeyPanels[failed.stage]) })}<details><summary>{t('common.details')}</summary>{failed.detail}</details></div>}
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
