import { useId, useRef, useState, type ComponentProps } from 'react'
import { sportsViews, sportsViewForKey, type SportsView } from '../core/sportsWorkspace'
import { FootballTacticsPanel } from './FootballTacticsPanel'
import { FootballSequencePanel } from './FootballSequencePanel'
import { FootballMotionPanel } from './FootballMotionPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function SportsWorkspacePanel(props: ComponentProps<typeof FootballTacticsPanel> & { onOpenStudio: () => void }) {
  const { t } = useUiLanguage(), id = useId()
  const [view, setView] = useState<SportsView>('board')
  const [visited, setVisited] = useState<SportsView[]>(['board'])
  const buttons = useRef<Partial<Record<SportsView, HTMLButtonElement | null>>>({})
  function select(next: SportsView) {
    setVisited(current => current.includes(next) ? current : [...current, next])
    setView(next)
  }
  return <section className="stack sportsWorkspace">
    <div className="card sportsLead">
      <div className="sectionLead"><div><div className="eyebrow">{t('nav.Sports')}</div><h2>{t('sports.heading')}</h2></div><button className="secondaryButton" onClick={props.onOpenStudio}>{t('sports.studio')}</button></div>
      <p>{t('sports.help')}</p><p className="note">{t('sports.drafts')}</p>
      <div role="tablist" aria-label={t('sports.views')} className="sportsTabs">
        {sportsViews.map(item => <button key={item} type="button" role="tab" id={`${id}-${item}-tab`} aria-controls={`${id}-${item}-panel`} aria-selected={view === item} tabIndex={view === item ? 0 : -1} ref={node => { buttons.current[item] = node }} onClick={() => select(item)} onKeyDown={event => {
          const next = sportsViewForKey(item, event.key)
          if (next) { event.preventDefault(); select(next); buttons.current[next]?.focus() }
        }}><strong>{t(`sports.${item}`)}</strong><span>{t(`sports.${item}Help`)}</span></button>)}
      </div>
    </div>
    {sportsViews.map(item => <div key={item} id={`${id}-${item}-panel`} role="tabpanel" aria-labelledby={`${id}-${item}-tab`} tabIndex={0} hidden={view !== item} className="sportsView">
      {visited.includes(item) && (item === 'board' ? <FootballTacticsPanel {...props} /> : item === 'sequence' ? <FootballSequencePanel {...props} /> : <FootballMotionPanel {...props} />)}
    </div>)}
  </section>
}
