import { it, expect, vi } from 'vitest'
import { createProject } from '../src/core/project'
import { newCourseOutline, type CourseOutline } from '../src/core/course'
import { createCourseLearnerWorkbook } from '../src/core/courseLearnerWorkbook'
import { uiLanguages } from '../src/core/uiLanguage'

function fixture(): CourseOutline {
  return { ...newCourseOutline(createProject('Learner workbook test')), modules: [{ id:'module',title:'Module A',lessons:[{
    id:'lesson',title:'Lesson A',objective:'PRIVATE_OBJECTIVE',script:'PRIVATE_SCRIPT',range:{inMs:0,outMs:1000},
    sources:[{id:'s',title:'PRIVATE_SOURCE',url:'https://example.org',notes:'PRIVATE_SOURCE_NOTES'}],
    demonstrations:[{id:'d',title:'PRIVATE_DEMO',steps:'PRIVATE_STEPS',expected:'PRIVATE_EXPECTED',observed:'PRIVATE_OBSERVED'}],
    materials:[{id:'public',title:'Public handout',body:'  Bonjour\nÜberblick 🌍  ',audience:'learner'},{id:'private',title:'PRIVATE_TITLE',body:'PRIVATE_BODY',audience:'instructor'}],
    exercises:[{id:'e',title:'Practice',prompt:'Explain your reasoning',hint:'Try a diagram',solution:'PRIVATE_SOLUTION',criteria:'PRIVATE_CRITERIA'}]
  }] }] }
}
it.each(uiLanguages)('creates semantic offline %s workbook from explicit learner fields only without mutation or requests', language => {
  const course=fixture();course.language=language;course.audience='PRIVATE_AUDIENCE';course.prerequisites='PRIVATE_PREREQUISITES';course.learningOutcomes='PRIVATE_OUTCOMES'
  const before=JSON.stringify(course), fetch=vi.spyOn(globalThis,'fetch')
  try {
    const html=createCourseLearnerWorkbook(course)
    expect(html).toContain(`<html lang="${language}">`);expect(html).toContain('<main>');expect(html).toContain('<nav id="contents"')
    expect(html).toContain('  Bonjour\nÜberblick 🌍  ');expect(html).toContain('Explain your reasoning');expect(html).toContain('Try a diagram');expect(html).toContain('class="answer-space"')
    expect(html).toContain({de:'ENTWURF',en:'DRAFT',fr:'BROUILLON'}[language]);expect(html).not.toContain('PRIVATE_')
    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");expect(html).toContain('@media print');expect(html).toContain('@page')
    expect(html).not.toMatch(/<(script|iframe|img|form|input|object|embed|link|base)\b/i)
    for(const match of html.matchAll(/href="([^"]+)"/g))expect(match[1]).toMatch(/^#(?:contents|lesson-\d+-\d+)$/)
    expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(course)).toBe(before)
  }finally{fetch.mockRestore()}
})
it.each(['</style><script>alert(1)</script>','<img src="https://example.org/x" onerror="alert(1)">','<a href="javascript:alert(1)">Click</a>','<iframe srcdoc="<script>1</script>"></iframe>','&lt;script&gt;','"\' & < >'])('renders hostile authored text %j literally, never as markup', text => {
  const course=fixture();course.title=text;course.modules[0].title=text;course.modules[0].lessons[0].title=text
  course.modules[0].lessons[0].materials![0].body=text;course.modules[0].lessons[0].exercises![0].prompt=text
  const html=createCourseLearnerWorkbook(course)
  expect(html).not.toMatch(/<(script|iframe|img)\b/i);expect(html).not.toMatch(/href="(?:https?:|javascript:)/)
  expect(html).toContain(text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!))
})
it('preserves curriculum order, skips non-learner lessons and keeps unique fragment anchors independent of titles', () => {
  const course=fixture(),lesson=course.modules[0].lessons[0]
  course.modules=[{id:'second',title:'Second module',lessons:[{...lesson,id:'two',title:'Same title'}]},{id:'first',title:'First module',lessons:[{...lesson,id:'one',title:'Same title'},{...lesson,id:'internal',title:'NOT_IN_WORKBOOK',materials:[lesson.materials![1]],exercises:[]}]}]
  const html=createCourseLearnerWorkbook(course)
  expect(html.indexOf('Second module')).toBeLessThan(html.indexOf('First module'));expect(html).not.toContain('NOT_IN_WORKBOOK')
  expect([...html.matchAll(/<article id="([^"]+)"/g)].map(match=>match[1])).toEqual(['lesson-0-0','lesson-1-0'])
  expect(html).toContain('href="#lesson-0-0"');expect(html).toContain('href="#lesson-1-0"')
})
it('supports exercise-only and material-only courses without inventing blank exercises or publicizing hidden answers',()=>{
  const course=fixture();course.modules[0].lessons[0].materials=[]
  expect(createCourseLearnerWorkbook(course)).toContain('Explain your reasoning')
  course.modules[0].lessons[0].exercises=[];expect(()=>createCourseLearnerWorkbook(course)).toThrow(/No saved learner/)
  course.modules[0].lessons[0].materials=fixture().modules[0].lessons[0].materials
  expect(createCourseLearnerWorkbook(course)).toContain('Public handout');expect(createCourseLearnerWorkbook(course)).not.toContain('class="answer-space"')
})
it('rejects blank selected materials/incomplete prompts, but excludes incomplete internal content',()=>{
  const course=fixture();course.modules[0].lessons[0].materials![1].body=''
  expect(()=>createCourseLearnerWorkbook(course)).not.toThrow()
  course.modules[0].lessons[0].materials![0].body=' ';expect(()=>createCourseLearnerWorkbook(course)).toThrow(/Empty/)
  const other=fixture();other.modules[0].lessons[0].exercises![0].prompt='';expect(()=>createCourseLearnerWorkbook(other)).toThrow(/Incomplete/)
  other.modules[0].lessons[0].exercises![0].prompt='Prompt';other.modules[0].lessons[0].exercises![0].solution='';expect(()=>createCourseLearnerWorkbook(other)).not.toThrow()
})
it.each(['\0',String.fromCharCode(0xd800)])('rejects unrepresentable selected text rather than silently replacing it', text=>{
  const course=fixture();course.modules[0].lessons[0].materials![0].body=text;expect(()=>createCourseLearnerWorkbook(course)).toThrow(/unrepresentable/)
})
it('rejects corrupted outlines and supports the maximum course lesson count without external fonts/assets',()=>{
  const course=fixture(),lesson=course.modules[0].lessons[0]
  course.modules=Array.from({length:50},(_,m)=>({id:'m'+m,title:'Module '+m,lessons:Array.from({length:4},(_,l)=>({...lesson,id:`l${m}-${l}`,materials:[{id:'handout',title:'Handout',body:'a'.repeat(1000),audience:'learner' as const}],exercises:[]}))}))
  const html=createCourseLearnerWorkbook(course);expect(html.match(/<article id=/g)).toHaveLength(200);expect(html.length).toBeLessThan(500000);expect(html).not.toContain('@import');expect(html).not.toContain('url(')
  course.language='invalid' as never;expect(()=>createCourseLearnerWorkbook(course)).toThrow()
})
