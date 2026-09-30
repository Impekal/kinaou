import { z } from 'zod'
import { parseProject, type KinaouProject } from './project'
import { applyTimelineOperation } from './timeline'
import { placeAssetOnTrack } from './timelinePlacement'

const plain = (max: number) => z.string().max(max).refine(value => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) && new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) === value, 'Use valid plain text without control characters')
const schema = z.object({ schemaVersion: z.literal(1), language: z.enum(['de','en','fr']), format: z.enum(['landscape','portrait','square']), theme: z.enum(['indigo','paper']), label: plain(40), title: plain(90).refine(value => !!value.trim()), points: z.array(plain(240).refine(value => !!value.trim())).min(1).max(4), source: plain(160) }).strict()
export type ExplainerCard = z.infer<typeof schema>
export const explainerDimensions = { landscape: [1920,1080], portrait: [1080,1920], square: [1080,1080] } as const
export const explainerText = {
  de: { label:'Kurz erklärt', title:'Deine klare Kernaussage', points:['Erster Gedanke: einfach und präzise.','Ein anschauliches Beispiel ergänzen.','Mit einer hilfreichen Erkenntnis abschließen.'], notice:'Eigene Erklärgrafik · keine Bildschirmaufnahme' },
  en: { label:'Simply explained', title:'Your clear key message', points:['First idea: simple and precise.','Add a concrete example.','End with a useful takeaway.'], notice:'Authored explainer graphic · not a screen capture' },
  fr: { label:'En bref', title:'Votre idée essentielle', points:['Première idée : simple et précise.','Ajouter un exemple concret.','Terminer par un enseignement utile.'], notice:'Illustration explicative · pas une capture d’écran' }
}
export const parseExplainerCard = (value: unknown): ExplainerCard => schema.parse(value)
export function createExplainerCard(language: ExplainerCard['language']): ExplainerCard {
  const sample = explainerText[language]
  return parseExplainerCard({ schemaVersion:1, language, format:'landscape', theme:'indigo', label:sample.label, title:sample.title, points:[...sample.points], source:'' })
}
type Measure = (text: string, size: number, bold: boolean) => number
export interface ExplainerTextRun { text: string; x: number; y: number; size: number; bold: boolean; color: string }
export interface ExplainerRect { x: number; y: number; width: number; height: number; color: string }
export interface ExplainerLayout { width: number; height: number; background: string; rects: ExplainerRect[]; text: ExplainerTextRun[] }

/** Word wrapping with grapheme fallback. Refuses overflow; never truncates or scales text to unreadability. */
export function wrapExplainerText(value: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  if (!(width > 0) || !(size > 0)) throw Error('Invalid text bounds')
  const fits = (text: string) => { const measured = measure(text,size,bold); if (!Number.isFinite(measured) || measured < 0) throw Error('Invalid font measurement'); return measured <= width }
  const segmenter = new Intl.Segmenter(undefined, { granularity:'grapheme' }), lines: string[] = []
  for (const paragraph of value.replace(/\t/g,'    ').split('\n')) {
    let line = ''
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (fits(line ? line+' '+word : word)) { line = line ? line+' '+word : word; continue }
      if (line) { lines.push(line); line = '' }
      if (fits(word)) { line = word; continue }
      for (const { segment } of segmenter.segment(word)) {
        if (!fits(segment)) throw Error('A character does not fit the graphic')
        if (line && !fits(line+segment)) { lines.push(line); line = '' }
        line += segment
      }
    }
    lines.push(line)
  }
  return lines
}

export function layoutExplainerCard(input: ExplainerCard, measure: Measure): ExplainerLayout {
  const card = parseExplainerCard(input), [width,height] = explainerDimensions[card.format]
  const portrait = card.format === 'portrait', wide = card.format === 'landscape', margin = wide ? 96 : 72
  const colors = card.theme === 'indigo' ? { background:'#11152a', panel:'#202840', text:'#f4f6ff', muted:'#c7d1e7', accent:'#99b5ff' } : { background:'#f6f2e9', panel:'#ffffff', text:'#192a35', muted:'#405661', accent:'#265d69' }
  const layout: ExplainerLayout = { width,height,background:colors.background,rects:[{x:margin,y:54,width:84,height:8,color:colors.accent}],text:[] }
  const text = (value: string,x: number,top: number,maxWidth: number,size: number,bold: boolean,color: string,maxHeight: number) => {
    const lines = wrapExplainerText(value,maxWidth,size,bold,measure), lineHeight = size*1.28
    if (lines.length*lineHeight > maxHeight) throw Error('Text does not fit. Shorten it, use fewer points or choose a taller format.')
    lines.forEach((line,index) => layout.text.push({text:line,x,y:top+size+index*lineHeight,size,bold,color}))
  }
  text(card.label,margin,82,width-margin*2,24,true,colors.accent,62)
  text(card.title,margin,150,width-margin*2,wide?64:54,true,colors.text,portrait?280:170)
  const bodyTop = portrait ? 470 : 355, bottom = height-190, gap = 18, rowHeight = (bottom-bodyTop-gap*(card.points.length-1))/card.points.length
  const size = portrait ? 44 : wide ? 36 : 32
  card.points.forEach((point,index) => {
    const top=bodyTop+index*(rowHeight+gap)
    layout.rects.push({x:margin,y:top,width:width-margin*2,height:rowHeight,color:colors.panel})
    text(String(index+1).padStart(2,'0'),margin+24,top+20,70,26,true,colors.accent,rowHeight-32)
    text(point,margin+110,top+20,width-margin*2-142,size,false,colors.text,rowHeight-40)
  })
  text(card.source,margin,height-147,width-margin*2,22,false,colors.muted,70)
  text(explainerText[card.language].notice,margin,height-56,width-margin*2,18,false,colors.muted,30)
  return layout
}

/** Local Canvas only: no HTML interpretation, source images, remote fonts, model or network. */
export async function rasterizeExplainerCard(input: ExplainerCard): Promise<File> {
  const card=parseExplainerCard(input), canvas=document.createElement('canvas'), context=canvas.getContext('2d')
  if (!context) throw Error('Canvas image export unavailable')
  const font=(size:number,bold:boolean)=>`${bold?700:400} ${size}px Arial, sans-serif`
  const layout=layoutExplainerCard(card,(text,size,bold)=>{context.font=font(size,bold);return context.measureText(text).width})
  canvas.width=layout.width;canvas.height=layout.height
  context.fillStyle=layout.background;context.fillRect(0,0,layout.width,layout.height)
  for(const rect of layout.rects){context.fillStyle=rect.color;context.fillRect(rect.x,rect.y,rect.width,rect.height)}
  context.textBaseline='alphabetic'
  for(const run of layout.text){context.font=font(run.size,run.bold);context.fillStyle=run.color;context.fillText(run.text,run.x,run.y)}
  const blob=await new Promise<Blob>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('PNG export timed out')),15000)
    try{canvas.toBlob(value=>{clearTimeout(timer);value?resolve(value):reject(Error('PNG export failed'))},'image/png')}
    catch(cause){clearTimeout(timer);reject(cause)}
  })
  if(blob.type!=='image/png'||!blob.size||blob.size>20*1024**2)throw Error('Invalid explainer PNG')
  return new File([blob],'explainer-card-'+crypto.randomUUID()+'.png',{type:'image/png'})
}
export function validateExplainerProbe<T extends {width?:number;height?:number;videoCodec?:string}>(probe:T,card:ExplainerCard):T {
  const [width,height]=explainerDimensions[parseExplainerCard(card).format]
  if(probe.width!==width||probe.height!==height||probe.videoCodec!=='png')throw Error('Imported PNG does not match the reviewed explainer format')
  return probe
}
export function placeExplainerOnNewTrack(project:KinaouProject,assetId:string,name:string):KinaouProject {
  const asset=project.assets.find(item=>item.id===assetId)
  if(!asset||asset.kind!=='image'||asset.metadata.sourceKind!=='authored-explainer-card-v1'||!name.trim()||name.length>200)throw Error('A saved explainer image and track name are required')
  parseExplainerCard(asset.metadata.card)
  const id=crypto.randomUUID(),next=applyTimelineOperation(project,{type:'add-track',track:{id,name,type:'image',muted:false,locked:false,clips:[]}})
  return parseProject(placeAssetOnTrack(next,assetId,id))
}
