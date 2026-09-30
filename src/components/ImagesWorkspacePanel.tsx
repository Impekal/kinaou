import { useId, useRef, useState, type ComponentProps } from 'react'
import { ImageStudioPanel } from './ImageStudioPanel'
import { ExplainerCardPanel } from './ExplainerCardPanel'
import { ExplainerRevealPanel } from './ExplainerRevealPanel'
import { useUiLanguage } from './UiLanguageProvider'
const views=['model','cards','reveal'] as const
type ImageView=typeof views[number]
export function nextImageView(view:ImageView,key:string):ImageView|null {const index=views.indexOf(view);return key==='Home'?views[0]:key==='End'?views[2]:key==='ArrowRight'?views[(index+1)%3]:key==='ArrowLeft'?views[(index+2)%3]:null}
export function ImagesWorkspacePanel(props:ComponentProps<typeof ImageStudioPanel>&{managedRoots:string[]}) {
  const {t}=useUiLanguage(),id=useId(),[view,setView]=useState<ImageView>('model'),buttons=useRef<Partial<Record<ImageView,HTMLButtonElement|null>>>({})
  return <section className="stack"><div className="card"><h2>{t('nav.Images')}</h2><p>{t('explainer.tabsHelp')}</p><div role="tablist" aria-label={t('explainer.views')} className="sportsTabs">{views.map(item=><button type="button" key={item} role="tab" id={`${id}-${item}-tab`} aria-controls={`${id}-${item}-panel`} aria-selected={view===item} tabIndex={view===item?0:-1} ref={node=>{buttons.current[item]=node}} onClick={()=>setView(item)} onKeyDown={event=>{const next=nextImageView(item,event.key);if(next){event.preventDefault();setView(next);buttons.current[next]?.focus()}}}>{t(item==='reveal'?'reveal.tab':`explainer.${item}`)}</button>)}</div></div>
    <div id={`${id}-model-panel`} role="tabpanel" aria-labelledby={`${id}-model-tab`} tabIndex={0} hidden={view!=='model'} className="sportsView"><ImageStudioPanel {...props}/></div>
    <div id={`${id}-cards-panel`} role="tabpanel" aria-labelledby={`${id}-cards-tab`} tabIndex={0} hidden={view!=='cards'} className="sportsView"><ExplainerCardPanel {...props}/></div>
    <div id={`${id}-reveal-panel`} role="tabpanel" aria-labelledby={`${id}-reveal-tab`} tabIndex={0} hidden={view!=='reveal'} className="sportsView"><ExplainerRevealPanel {...props}/></div>
  </section>
}
