import { useId, useRef, useState, type ComponentProps } from 'react'
import { ImageStudioPanel } from './ImageStudioPanel'
import { ExplainerCardPanel } from './ExplainerCardPanel'
import { useUiLanguage } from './UiLanguageProvider'
export function ImagesWorkspacePanel(props:ComponentProps<typeof ImageStudioPanel>&{managedRoots:string[]}) {
  const {t}=useUiLanguage(),id=useId(),[view,setView]=useState<'model'|'cards'>('model'),buttons=useRef<Partial<Record<'model'|'cards',HTMLButtonElement|null>>>({})
  return <section className="stack"><div className="card"><h2>{t('nav.Images')}</h2><p>{t('explainer.tabsHelp')}</p><div role="tablist" aria-label={t('explainer.views')} className="sportsTabs">{(['model','cards'] as const).map(item=><button type="button" key={item} role="tab" id={`${id}-${item}-tab`} aria-controls={`${id}-${item}-panel`} aria-selected={view===item} tabIndex={view===item?0:-1} ref={node=>{buttons.current[item]=node}} onClick={()=>setView(item)} onKeyDown={event=>{const next=event.key==='Home'?'model':event.key==='End'?'cards':['ArrowLeft','ArrowRight'].includes(event.key)?item==='model'?'cards':'model':null;if(next){event.preventDefault();setView(next);buttons.current[next]?.focus()}}}>{t(`explainer.${item}`)}</button>)}</div></div>
    <div id={`${id}-model-panel`} role="tabpanel" aria-labelledby={`${id}-model-tab`} tabIndex={0} hidden={view!=='model'} className="sportsView"><ImageStudioPanel {...props}/></div>
    <div id={`${id}-cards-panel`} role="tabpanel" aria-labelledby={`${id}-cards-tab`} tabIndex={0} hidden={view!=='cards'} className="sportsView"><ExplainerCardPanel {...props}/></div>
  </section>
}
