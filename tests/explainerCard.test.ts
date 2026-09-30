import { it,expect,vi } from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createExplainerCard,parseExplainerCard,layoutExplainerCard,wrapExplainerText,rasterizeExplainerCard,validateExplainerProbe,placeExplainerOnNewTrack,explainerDimensions,explainerText} from '../src/core/explainerCard'
import {createProject,parseProject} from '../src/core/project'
import {AssetImportSession,type AssetImportFeedback} from '../src/core/assetImportSession'
import {PersistentVersionHistory} from '../src/core/versioning'
import {ImagesWorkspacePanel} from '../src/components/ImagesWorkspacePanel'
import {UiLanguageProvider} from '../src/components/UiLanguageProvider'
import {translateUi} from '../src/core/uiMessages'
import {uiLanguages} from '../src/core/uiLanguage'

const measure=(text:string,size:number)=>[...text].length*size*.55
it.each(uiLanguages)('preserves original %s fields through schema serialization and source layout',language=>{
  const card=createExplainerCard(language),before=JSON.stringify(card)
  expect(parseExplainerCard(JSON.parse(before))).toEqual(card)
  for(const format of ['landscape','portrait','square'] as const)for(const theme of ['paper','indigo'] as const){
    const layout=layoutExplainerCard({...card,format,theme},measure)
    expect([layout.width,layout.height]).toEqual(explainerDimensions[format])
    expect(layout.text.some(run=>run.text===explainerText[language].notice)).toBe(true)
    for(const run of layout.text){expect(run.x).toBeGreaterThanOrEqual(0);expect(run.y).toBeGreaterThanOrEqual(run.size);expect(run.x+measure(run.text,run.size)).toBeLessThanOrEqual(layout.width);expect(run.y+run.size*.28).toBeLessThan(layout.height)}
    for(const rect of layout.rects){expect(rect.width).toBeGreaterThan(0);expect(rect.height).toBeGreaterThan(0);expect(rect.x+rect.width).toBeLessThanOrEqual(layout.width);expect(rect.y+rect.height).toBeLessThanOrEqual(layout.height)}
  }
  expect(JSON.stringify(card)).toBe(before)
})
it.each([{title:''},{title:'x'.repeat(91)},{label:'x'.repeat(41)},{source:'x'.repeat(161)},{points:[]},{points:['']},{points:Array(5).fill('point')},{points:['x'.repeat(241)]},{title:'bad\0text'},{title:String.fromCharCode(0xd800)},{language:'es'},{format:'custom'},{theme:'remote'},{extra:'unknown'}])('rejects invalid card before drawing: %j',patch=>{
  expect(()=>parseExplainerCard({...createExplainerCard('de'),...patch})).toThrow()
})
it('wraps words and explicit paragraphs without truncation and keeps complex graphemes intact',()=>{
  expect(wrapExplainerText('alpha beta\ngamma',60,10,false,measure)).toEqual(['alpha beta','gamma'])
  expect(wrapExplainerText('abcdefghij',22,10,false,measure)).toEqual(['abcd','efgh','ij'])
  const complex='👩‍👩‍👧‍👦',parts=wrapExplainerText(complex+' '+complex,10,10,false,text=>text===complex?10:text.length*10)
  expect(parts).toEqual([complex,complex])
  expect(()=>wrapExplainerText('a',1,10,false,measure)).toThrow(/character/)
  expect(()=>wrapExplainerText('a',20,10,false,()=>NaN)).toThrow(/measurement/)
})
it('refuses overfull content rather than clipping, truncating or reducing font size',()=>{
  const card={...createExplainerCard('en'),format:'square' as const,points:Array(4).fill('W'.repeat(240))}
  expect(()=>layoutExplainerCard(card,measure)).toThrow(/does not fit/)
  expect(()=>layoutExplainerCard({...createExplainerCard('en'),source:'a\n'.repeat(60)},measure)).toThrow(/does not fit/)
})
it('treats markup and source URLs as literal drawing text, never HTML or external requests',()=>{
  const fetch=vi.spyOn(globalThis,'fetch')
  try{const layout=layoutExplainerCard({...createExplainerCard('en'),title:'<script>alert(1)</script>',source:'https://example.org/source'},measure)
    expect(layout.text.map(run=>run.text).join(' ')).toContain('<script>alert(1)</script>');expect(fetch).not.toHaveBeenCalled()
  }finally{fetch.mockRestore()}
})
it.each(['success','noContext','noBlob','wrongType','empty','throws','timeout'] as const)('rasterizer %s follows exact measured layout without image/font/network dependencies',async outcome=>{
  const runs:string[]=[],fill=vi.fn(),ctx={font:'',fillStyle:'',textBaseline:'',measureText:(text:string)=>({width:measure(text,Number(ctx.font.split(' ')[1].slice(0,-2)))}),fillRect:fill,fillText:(text:string)=>runs.push(text)}
  const canvas={width:0,height:0,getContext:()=>outcome==='noContext'?null:ctx,toBlob:(done:(blob:Blob|null)=>void)=>{if(outcome==='throws')throw Error('encode error');if(outcome==='timeout')return;done(outcome==='noBlob'?null:new Blob(outcome==='empty'?[]:['synthetic-protocol-bytes'],{type:outcome==='wrongType'?'image/jpeg':'image/png'}))}}
  vi.stubGlobal('document',{createElement:()=>canvas});if(outcome==='timeout')vi.useFakeTimers()
  try{
    const task=rasterizeExplainerCard(createExplainerCard('en'))
    if(outcome==='success'){const file=await task;expect(file.type).toBe('image/png');expect([canvas.width,canvas.height]).toEqual([1920,1080]);expect(file.name).toMatch(/^explainer-card-.*\.png$/);expect(runs.join(' ')).toContain('Your clear key message');expect(fill).toHaveBeenCalled()}
    else{const rejection=expect(task).rejects.toThrow();if(outcome==='timeout')await vi.advanceTimersByTimeAsync(15000);await rejection}
  }finally{vi.unstubAllGlobals();vi.useRealTimers()}
})
it.each(['landscape','portrait','square'] as const)('requires actual PNG codec and exact %s dimensions',format=>{
  const card={...createExplainerCard('fr'),format},[width,height]=explainerDimensions[format],probe={width,height,videoCodec:'png'}
  expect(validateExplainerProbe(probe,card)).toBe(probe)
  for(const patch of [{width:1},{height:1},{videoCodec:'mjpeg'}])expect(()=>validateExplainerProbe({...probe,...patch},card)).toThrow()
})
it('keeps authored source immutable, persists only accepted PNG and retries save without copying/probing again',async()=>{
  let project=createProject('Explainer'),fail=true,snapshots=0;const card=createExplainerCard('fr'),file=new File(['synthetic PNG protocol'],'card.png',{type:'image/png'}),events:AssetImportFeedback[]=[]
  const client={importAsset:vi.fn(async()=>({managedPath:'KINAOU/Assets/id_card.png',name:'card.png',sizeBytes:file.size})),probe:vi.fn(async()=>({path:'KINAOU/Assets/id_card.png',sizeBytes:file.size,width:1920,height:1080,videoCodec:'png'}))}
  const session=new AssetImportSession(project,'scope',file,'image',{client,assetMetadata:{sourceKind:'authored-explainer-card-v1',card,authored:true,illustrationOnly:true},environment:()=>({project,connection:'scope'}),snapshot:()=>{snapshots++},persist:p=>{if(fail)throw Error('save');project=p},publish:e=>events.push(e)})
  card.title='Outside mutation';await session.run();expect(events.at(-1)?.phase).toBe('saveFailed');expect(project.assets).toHaveLength(0)
  fail=false;await session.run();await session.run();expect(events.at(-1)?.phase).toBe('succeeded');expect(snapshots).toBe(1);expect(client.importAsset).toHaveBeenCalledTimes(1);expect(client.probe).toHaveBeenCalledTimes(1)
  expect(parseExplainerCard(parseProject(JSON.parse(JSON.stringify(project))).assets[0].metadata.card).title).toBe(explainerText.fr.title)
  const next=placeExplainerOnNewTrack(project,project.assets[0].id,'Illustration');expect(next.tracks[0].clips[0]).toMatchObject({startMs:0,durationMs:5000,assetId:project.assets[0].id});expect(project.tracks).toEqual([]);expect(next.assets).toEqual(project.assets)
  expect(()=>placeExplainerOnNewTrack(project,'missing','Track')).toThrow();expect(()=>placeExplainerOnNewTrack({...project,assets:[{...project.assets[0],offline:true}]},project.assets[0].id,'Track')).toThrow()
})
it.each(uiLanguages)('mounts both %s image tools with explicit prepare/import and no automatic calls',language=>{
  const save=vi.fn(),fetch=vi.spyOn(globalThis,'fetch')
  try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(ImagesWorkspacePanel,{project:createProject('Cards'),history:new PersistentVersionHistory({getItem:()=>null,setItem:save,removeItem:save}),workerUrl:'http://127.0.0.1:43117',workerToken:'PRIVATE',workerConnected:true,workerCapabilities:['asset-upload'],managedRoots:[],onProjectChange:save})}))
    expect(html.match(/role="tab"/g)).toHaveLength(2);expect(html.match(/role="tabpanel"/g)).toHaveLength(2);expect(html.match(/hidden=""/g)).toHaveLength(1)
    for(const key of ['image.heading','explainer.heading','explainer.prepare','explainer.boundary'] as const)expect(html).toContain(translateUi(language,key))
    expect(html).not.toContain('PRIVATE');expect(html).not.toContain('blob:');expect(fetch).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled()
  }finally{fetch.mockRestore()}
})
