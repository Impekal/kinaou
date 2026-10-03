/** Review aids only. No inference, rewriting, correctness score or automatic approval. */
const numberWords: Record<string, string> = Object.create(null)
for (const [number, words] of ['zero null zéro', 'one eins', 'two zwei deux', 'three drei trois', 'four vier quatre', 'five fünf cinq', 'six sechs', 'seven sieben sept', 'eight acht huit', 'nine neun neuf', 'ten zehn dix', 'eleven elf onze', 'twelve zwölf douze', 'thirteen dreizehn treize', 'fourteen vierzehn quatorze', 'fifteen fünfzehn quinze', 'sixteen sechzehn seize', 'seventeen siebzehn dix-sept', 'eighteen achtzehn dix-huit', 'nineteen neunzehn dix-neuf', 'twenty zwanzig vingt'].entries()) for (const word of words.split(' ')) numberWords[word] = String(number)
// Deliberately omit articles such as German ein/eine and French un/une: they are ambiguous.
function tokens(text: string): string[] { return (text.normalize('NFKC').toLocaleLowerCase('en').replace(/[\u2010\u2011]/g, '-').match(/\p{N}+(?:[.,]\p{N}+)*|\p{L}+(?:-\p{L}+)*/gu) ?? []).map(token => numberWords[token] ?? token) }
function containsSequence(haystack: string[], needle: string[]): boolean {
  return needle.length > 0 && haystack.some((_, at) => needle.every((token, index) => haystack[at + index] === token))
}
export type LearnerExerciseField = 'title' | 'prompt' | 'hint'
/** Complete normalized answer phrase occurs in a learner field. Choices/intentional repetition may be legitimate. */
export function courseExerciseAnswerOverlap(exercise: { title: string; prompt: string; hint: string; solution: string }): LearnerExerciseField[] {
  const answer = tokens(exercise.solution)
  return (['title', 'prompt', 'hint'] as const).filter(field => containsSequence(tokens(exercise[field]), answer))
}
/** Literal numeric references absent from spoken text. Paraphrases, omitted details and other languages may be legitimate. */
export function courseScriptMissingQuotedNumbers(paragraph: { text: string; sourceQuote: string }): string[] {
  const spoken = new Set(tokens(paragraph.text))
  return [...new Set(tokens(paragraph.sourceQuote).filter(token => /^\p{N}+(?:[.,]\p{N}+)*$/u.test(token)))].filter(number => !spoken.has(number))
}
/** Additional numeric references beyond the quoted passage may be valid derivations; ask for review, never label false. */
export function courseScriptAddedQuotedNumbers(paragraph: { text: string; sourceQuote: string }): string[] {
  const quoted = new Set(tokens(paragraph.sourceQuote))
  return [...new Set(tokens(paragraph.text).filter(token => /^\p{N}+(?:[.,]\p{N}+)*$/u.test(token)))].filter(number => !quoted.has(number))
}
