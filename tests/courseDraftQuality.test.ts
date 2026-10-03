import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { courseExerciseAnswerOverlap, courseScriptMissingQuotedNumbers, courseScriptAddedQuotedNumbers } from '../src/core/courseDraftQuality'
import { CourseExerciseQualityHints, CourseScriptQualityHints } from '../src/components/CourseDraftQualityHints'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiCourseDraftQualityMessages } from '../src/core/uiCourseDraftQualityMessages'
import { translateUi } from '../src/core/uiMessages'
const exercise={title:'Practice',prompt:'How many sides does a triangle have?',hint:'Think of the shape.',solution:'Three'}
it('surfaces additional numeric references from actual model expansion without claiming they are false',()=>{
 const paragraph={text:'Each corner of a square is a 90-degree angle.',sourceQuote:'and four right angles.'}
 expect(courseScriptAddedQuotedNumbers(paragraph)).toEqual(['90']);expect(courseScriptMissingQuotedNumbers(paragraph)).toEqual(['4'])
 expect(courseScriptAddedQuotedNumbers({text:'Three sides',sourceQuote:'Drei Seiten'})).toEqual([])
 const html=renderToStaticMarkup(createElement(CourseScriptQualityHints,{paragraph}));expect(html).toContain('90');expect(html).toContain('4');expect(html).toContain('does not prove those numbers are wrong')
})
it('finds the actual observed German answer disclosed before the question without changing text',()=>{
 const value={...exercise,prompt:'Ein Quadrat hat vier Seiten. Wie viele Seiten hat ein Quadrat?',solution:'Vier'},before=JSON.stringify(value)
 expect(courseExerciseAnswerOverlap(value)).toEqual(['prompt']);expect(JSON.stringify(value)).toBe(before)
})
it('finds the actual observed complete French answer in the public task',()=>{
 const answer='Un carré a quatre côtés de même longueur et quatre angles droits.'
 expect(courseExerciseAnswerOverlap({...exercise,prompt:answer+' Quels sont les caractéristiques d’un carré ?',solution:answer})).toEqual(['prompt'])
})
it('checks all learner fields including titles/hints but never incomplete substrings',()=>{
 expect(courseExerciseAnswerOverlap({...exercise,title:'Three sides',prompt:'  THREE! ',hint:'3',solution:'three'})).toEqual(['title','prompt','hint'])
 expect(courseExerciseAnswerOverlap({...exercise,title:'Threefold',prompt:'Threesome',hint:'Twenty-three',solution:'three'})).toEqual([])
 expect(courseExerciseAnswerOverlap({...exercise,prompt:'A triangle',solution:'A triangle has three sides.'})).toEqual([])
})
it.each(['',' ','\n\t','…'])('does not flag an empty/non-word answer %j',solution=>expect(courseExerciseAnswerOverlap({...exercise,solution})).toEqual([]))
it('normalizes Unicode width, case, punctuation, whitespace and basic DE/EN/FR count words',()=>{
 expect(courseExerciseAnswerOverlap({...exercise,prompt:'３',solution:'DREI'})).toEqual(['prompt'])
 expect(courseExerciseAnswerOverlap({...exercise,prompt:'Un carré : QUATRE côtés !',solution:'un carré, quatre côtés.'})).toEqual(['prompt'])
 expect(courseScriptMissingQuotedNumbers({text:'Trois côtés et quatre angles.',sourceQuote:'Three sides, 4 angles.'})).toEqual([])
 expect(courseScriptMissingQuotedNumbers({text:'17',sourceQuote:'Dix-sept.'})).toEqual([])
})
it('treats ambiguous articles and unsupported compound words conservatively, without fabricated counts',()=>{
 expect(courseScriptMissingQuotedNumbers({text:'Shape',sourceQuote:'Ein Quadrat. Un triangle. Une forme. Twenty-one.'})).toEqual([])
 expect(courseScriptMissingQuotedNumbers({text:'A shape.',sourceQuote:'A triangle has three sides. Four sides, four corners.'})).toEqual(['3','4'])
})
it('flags the actual too-generic English model paragraph missing its quoted numeric fact',()=>{
 expect(courseScriptMissingQuotedNumbers({text:"When we talk about basic shapes, we need to understand their characteristics. Let's start with a triangle.",sourceQuote:'A triangle has three sides.'})).toEqual(['3'])
 expect(courseScriptMissingQuotedNumbers({text:'A triangle has three sides.',sourceQuote:'A triangle has three sides.'})).toEqual([])
})
it('keeps decimal literals intact and comparison is not semantic approval',()=>{
 expect(courseScriptMissingQuotedNumbers({text:'Exactly 3.14.',sourceQuote:'3.14, 3.14 and 2,5.'})).toEqual(['2,5'])
 // All numbers being present does not make the statement true: this intentionally returns no hint.
 expect(courseScriptMissingQuotedNumbers({text:'A triangle does NOT have three sides.',sourceQuote:'A triangle has three sides.'})).toEqual([])
 // Multiple choice can legitimately repeat an answer: the hint must not claim definite leakage.
 expect(courseExerciseAnswerOverlap({...exercise,prompt:'Choose: three or four.',solution:'three'})).toEqual(['prompt'])
})
it('handles prototype-like authored words as ordinary literal text',()=>{
 expect(courseExerciseAnswerOverlap({...exercise,prompt:'constructor prototype',solution:'constructor'})).toEqual(['prompt'])
 expect(courseScriptMissingQuotedNumbers({text:'constructor',sourceQuote:'constructor three'})).toEqual(['3'])
})
it.each(['de','en','fr'] as const)('renders honest %s review hints with exact affected fields and paragraph number, without requests',language=>{
 const fetch=vi.spyOn(globalThis,'fetch'),value={...exercise,prompt:'Three',hint:'Three'},before=JSON.stringify(value)
 try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement('div',{},createElement(CourseExerciseQualityHints,{exercise:value}),createElement(CourseScriptQualityHints,{paragraph:{text:'Generic introduction',sourceQuote:'Three sides'},number:2}))}));expect(html).toContain(translateUi(language,'course.quality.heading'));expect(html).toContain(translateUi(language,'course.exerciseDraft.prompt'));expect(html).toContain(translateUi(language,'course.exerciseDraft.hint'));expect(html).toContain(translateUi(language,'course.scriptDraft.paragraph',{number:2}));expect(html).toContain('3');for(const key of Object.keys(uiCourseDraftQualityMessages) as Array<keyof typeof uiCourseDraftQualityMessages>)expect(translateUi(language,key)).not.toBe(key);expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(value)).toBe(before)}finally{fetch.mockRestore()}
})
it('renders no success badge or implied approval when simple comparisons find nothing',()=>{
 expect(renderToStaticMarkup(createElement(CourseExerciseQualityHints,{exercise}))).toBe('')
 expect(renderToStaticMarkup(createElement(CourseScriptQualityHints,{paragraph:{text:'Three sides',sourceQuote:'Three sides'}}))).toBe('')
})
