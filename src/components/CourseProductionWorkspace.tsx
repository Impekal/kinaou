import { useId, useRef, useState, type ComponentProps } from 'react'
import { CourseProductionOverviewPanel } from './CourseProductionOverviewPanel'
import { CourseDemoPlacementPanel } from './CourseDemoPlacementPanel'
import { CourseOutputFileCheckPanel } from './CourseOutputFileCheckPanel'
import { CourseOutputIndexPanel } from './CourseOutputIndexPanel'
import { CourseSubtitleExportPanel } from './CourseSubtitleExportPanel'
import { useUiLanguage } from './UiLanguageProvider'

export const courseProductionViews = ['overview', 'demonstrations', 'exports', 'subtitles'] as const
export type CourseProductionView = typeof courseProductionViews[number]
export function courseProductionViewForKey(view: CourseProductionView, key: string): CourseProductionView | null {
  const index = courseProductionViews.indexOf(view)
  return key === 'Home' ? 'overview' : key === 'End' ? 'subtitles' : key === 'ArrowRight' ? courseProductionViews[(index + 1) % 4] : key === 'ArrowLeft' ? courseProductionViews[(index + 3) % 4] : null
}
type Props = ComponentProps<typeof CourseProductionOverviewPanel> & ComponentProps<typeof CourseDemoPlacementPanel> & ComponentProps<typeof CourseOutputFileCheckPanel> & { onOpenStudio: () => void; onOpenAudio?: () => void }

/** Internal views remain mounted: navigation does not discard drafts or restart explicit work. */
export function CourseProductionWorkspace(props: Props) {
  const { t } = useUiLanguage(), id = useId(), [view, setView] = useState<CourseProductionView>('overview')
  const tabs = useRef<Partial<Record<CourseProductionView, HTMLButtonElement | null>>>({})
  function select(next: CourseProductionView) { setView(next); tabs.current[next]?.focus() }
  const panel = (item: CourseProductionView) => ({ id: `${id}-${item}-panel`, role: 'tabpanel', 'aria-labelledby': `${id}-${item}-tab`, tabIndex: 0, hidden: view !== item, className: 'sportsView stack' })
  return <section className="stack">
    <div className="card stack"><div role="tablist" aria-label={t('course.productionViews.label')} className="sportsTabs">{courseProductionViews.map(item => <button type="button" key={item} role="tab" id={`${id}-${item}-tab`} aria-controls={`${id}-${item}-panel`} aria-selected={view === item} tabIndex={view === item ? 0 : -1} ref={node => { tabs.current[item] = node }} onClick={() => select(item)} onKeyDown={event => { const next = courseProductionViewForKey(item, event.key); if (next) { event.preventDefault(); select(next) } }}>{t(`course.productionViews.${item}`)}</button>)}</div><p>{t('course.productionViews.help')}</p></div>
    <div {...panel('overview')}><CourseProductionOverviewPanel {...props} onPrepareGap={value => { props.onPrepareGap?.(value); select('demonstrations') }} onOpenOutputs={value => { props.onOpenOutputs?.(value); select('exports') }} />
      <div className="directorActions"><button className="primary" disabled={props.dirty} onClick={props.onOpenStudio}>{t('course.studio')}</button>{props.onOpenAudio && <button className="secondaryButton" disabled={props.dirty} onClick={props.onOpenAudio}>{t('course.narration.open')}</button>}</div>
    </div>
    <div {...panel('demonstrations')}><CourseDemoPlacementPanel {...props} /></div>
    <div {...panel('exports')}><CourseOutputFileCheckPanel {...props} visible={view === 'exports'} /><CourseOutputIndexPanel {...props} /></div>
    <div {...panel('subtitles')}><CourseSubtitleExportPanel {...props} /></div>
    <p className="note">{t('course.productionViews.operations')}</p>
  </section>
}
