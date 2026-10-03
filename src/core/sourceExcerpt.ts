import { z } from 'zod'
import { publicSourceAttributionSchema, validatePublicSourceAttribution, validatePublicSourceResult, type PublicSourceResult } from '../../worker/public-source-protocol.mjs'
import { isUiLanguage, type UiLanguage } from './uiLanguage'

const quote = z.string().min(1).max(600).refine(value => value === value.trim() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) && new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value)) === value, 'Use a short exact plain-text excerpt')
export const sourceExcerptSchema = z.object({
  originalUrl:z.string().max(2048), source:publicSourceAttributionSchema, quote,
  startCharacter:z.number().int().min(0).max(29999), endCharacter:z.number().int().min(1).max(30000), displayTruncated:z.boolean()
}).strict().superRefine((value,context) => {
  if(value.endCharacter - value.startCharacter !== value.quote.length) context.addIssue({code:'custom',message:'Excerpt offsets must match its literal character length'})
  try { validatePublicSourceAttribution(value.source,{url:value.originalUrl}) } catch { context.addIssue({code:'custom',message:'Excerpt provenance must match the original source link'}) }
})
export type SourceExcerpt = z.infer<typeof sourceExcerptSchema>
export function sourceExcerptFromRead(result: PublicSourceResult, originalUrl: string, selected: string): SourceExcerpt {
  const parsed = validatePublicSourceResult(result,{url:originalUrl}), exact = quote.parse(selected), startCharacter = parsed.text.indexOf(exact)
  if(startCharacter < 0) throw Error('The excerpt must occur exactly in the currently displayed source text')
  const {text: _text,truncated,...source} = parsed
  return sourceExcerptSchema.parse({originalUrl,source,quote:exact,startCharacter,endCharacter:startCharacter+exact.length,displayTruncated:truncated})
}
/** Separate explicit excerpt review; no fetch, project write or reading acknowledgement. */
export class SourceExcerptSession {
  private signature = ''; private generation = 0
  private bindings = new WeakMap<SourceExcerpt,{generation:number;bytes:string;complete:boolean}>()
  observe(scope:string,result:PublicSourceResult,originalUrl:string,selected:string,language:UiLanguage) {
    const signature = JSON.stringify([scope,result,originalUrl,selected,language])
    if(signature !== this.signature){this.signature=signature;this.generation++}
  }
  detach(){this.generation++}
  prepare(scope:string,result:PublicSourceResult,originalUrl:string,selected:string,language:UiLanguage) {
    if(!isUiLanguage(language))throw Error('Unsupported excerpt review language')
    this.observe(scope,result,originalUrl,selected,language)
    const review=sourceExcerptFromRead(result,originalUrl,selected)
    this.bindings.set(review,{generation:this.generation,bytes:JSON.stringify(review),complete:false})
    return review
  }
  current(review:SourceExcerpt){const bound=this.bindings.get(review);return !!bound&&!bound.complete&&bound.generation===this.generation&&bound.bytes===JSON.stringify(review)}
  commit(review:SourceExcerpt,ack:boolean,append:(excerpt:SourceExcerpt)=>void){if(ack!==true||!this.current(review))throw Error('Review and acknowledge the unchanged excerpt first');append(structuredClone(review));this.bindings.get(review)!.complete=true}
}
