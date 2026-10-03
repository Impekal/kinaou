import { useState } from 'react'
import type { MediaPreviewProps } from './MediaPreviewControl'
import { prepareFrameRevision, type FrameRevisionSeed } from '../core/frameRevision'
import { hasFrameProvenance } from '../core/frameProvenance'
import { SourceFrameControl } from './SourceFrameControl'
import { useUiLanguage } from './UiLanguageProvider'

export function FrameRevisionControl(props:MediaPreviewProps){
 const {t}=useUiLanguage(),[seed,setSeed]=useState<FrameRevisionSeed|null>(null),[error,setError]=useState('')
 if(props.asset.kind!=='image'||!hasFrameProvenance(props.asset))return null
 const source=seed&&props.project.assets.find(a=>a.id===seed.sourceId)
 return <details className="mediaExcerptPanel"><summary>{t('frameRevision.heading')}</summary><div className="stack"><p>{t('frameRevision.help')}</p>
  <button className="secondaryButton" onClick={()=>{setSeed(null);setError('');try{setSeed(prepareFrameRevision(props.project,props.asset.id))}catch(cause){setError(String(cause))}}}>{t('frameRevision.open')}</button>
  {seed&&source&&<SourceFrameControl key={JSON.stringify(seed)} {...props} asset={source} revision={seed}/>}
  {seed&&!source&&<p role="alert">{t('frameRevision.error')}</p>}
  {error&&<div role="alert">{t('frameRevision.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
 </div></details>
}
