import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCourseRequestBudget, assertCourseSourceBudget } from './course-generation-limits.mjs'
import { requestLocalCourseDraft } from './course-local-model.mjs'
import { courseScriptContextSchema, validateCourseScriptGenerationContext } from './course-script.mjs'
const body={prompt:'Only test data',system:'Return JSON',format:{type:'object'}}, valid={model:'local',done:true,done_reason:'stop',prompt_eval_count:100,eval_count:50,response:'{"ok":true}'}
const metadata={model_info:{'general.architecture':'llama','llama.context_length':131072}}
test('keeps complete input unchanged within conservative byte limits and rejects excess before metadata or generation',async()=>{
 const before=JSON.stringify(body),calls=[];const result=await requestLocalCourseDraft('http://127.0.0.1:11434','local',body,async(url,options)=>{calls.push(url);const sent=JSON.parse(options.body);if(url.endsWith('/api/show'))return new Response(JSON.stringify(metadata));assert.equal(sent.prompt,body.prompt);assert.equal(sent.system,body.system);assert.deepEqual(sent.format,body.format);assert.deepEqual(sent.options,{temperature:0,num_ctx:32768,num_predict:4096});return new Response(JSON.stringify(valid))});assert.deepEqual(result.proposal,{ok:true});assert.equal(calls.length,2);assert.equal(JSON.stringify(body),before)
 let requests=0;await assert.rejects(requestLocalCourseDraft('http://127.0.0.1:11434','local',{...body,prompt:'界'.repeat(8000)},async()=>{requests++;throw Error('unexpected')}),/budget/);assert.equal(requests,0)
})
test('source limits count UTF-8/JSON bytes, not characters; historical source schema remains compatible',()=>{
 assert.doesNotThrow(()=>assertCourseSourceBudget({source:'a'.repeat(11000)}));assert.throws(()=>assertCourseSourceBudget({source:'界'.repeat(5000)}));assert.throws(()=>assertCourseSourceBudget({source:'\u0000'.repeat(3000)}));assert.throws(()=>assertCourseRequestBudget({prompt:'x',system:'s'}))
 const context={schemaVersion:1,courseId:'course',lessonId:'lesson',revision:1,language:'en',courseTitle:'Title',lessonTitle:'Lesson',audience:'',objective:'',sourceNotes:'界'.repeat(5000)};assert.doesNotThrow(()=>courseScriptContextSchema.parse(context));assert.throws(()=>validateCourseScriptGenerationContext(context),/12,000/)
})
test('all course requests reject missing/small/invalid model context before authored text',async()=>{
 for(const maximum of [undefined,0,8192,32767,Infinity,'32768']){const calls=[];await assert.rejects(requestLocalCourseDraft('http://127.0.0.1:11434','local',body,async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({model_info:{'general.architecture':'llama','llama.context_length':maximum}}))}),/context window/);assert.deepEqual(calls,[{model:'local',verbose:false}])}
})
test('rejects parseable JSON from wrong, unfinished, exhausted or unaccounted model responses',async()=>{
 for(const patch of [{model:'other'},{done:false},{done:undefined},{done_reason:'length'},{done_reason:undefined},{prompt_eval_count:undefined},{eval_count:undefined},{eval_count:4096},{eval_count:-1},{prompt_eval_count:32768},{prompt_eval_count:1.5}])await assert.rejects(requestLocalCourseDraft('http://127.0.0.1:11434','local',body,async url=>new Response(JSON.stringify(url.endsWith('/api/show')?metadata:{...valid,...patch}))))
})
