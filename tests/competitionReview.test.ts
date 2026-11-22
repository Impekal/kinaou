import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CompetitionReviewPanel } from '../src/components/CompetitionReviewPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import {
  competitionDirectorGuidance, competitionReviewIssue, emptyCompetitionReview, projectCompetitionReview, saveCompetitionReview,
  summarizeCompetitionReview, type CompetitionEntry, type CompetitionReview
} from '../src/core/competitionReview'
import { defaultProjectContentProfile, localizedDirectorBrief } from '../src/core/contentProfile'
import { createProject } from '../src/core/project'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { displaySystemHistoryLabel } from '../src/core/uiSystemLabels'
import { PersistentVersionHistory } from '../src/core/versioning'

const today = '2026-11-22'

function entry(overrides: Partial<CompetitionEntry> = {}): CompetitionEntry {
  return { id: 'e1', url: 'https://example.org/video/1', title: 'Abseits in 3 Minuten', where: 'YouTube', observedOn: '2026-11-20', shownFigure: '12.345 Aufrufe', covers: 'Grundregel mit einer Spielszene.', leavesOut: 'Passives Abseits fehlt.', ...overrides }
}

const review: CompetitionReview = {
  schemaVersion: 1, topic: 'Abseitsregel', angle: 'Passives Abseits an drei eigenen Tafeln zeigen.',
  entries: [entry(), entry({ id: 'e2', url: 'https://example.org/blog/abseits', title: 'Die Abseitsregel erklärt', where: 'Blog', observedOn: '2026-10-01', shownFigure: '', leavesOut: '' })]
}

function history(): PersistentVersionHistory {
  const data = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } })
}

describe('competition notes storage', () => {
  it('is empty until saved, round-trips, and leaves the project alone when nothing changed', () => {
    const project = createProject('Abseits')
    expect(projectCompetitionReview(project)).toEqual(emptyCompetitionReview)
    const saved = saveCompetitionReview(project, review)
    expect(projectCompetitionReview(saved)).toEqual(review)
    expect(saveCompetitionReview(saved, structuredClone(review))).toBe(saved)
  })

  it('accepts only a complete web address without credentials', () => {
    const project = createProject('x')
    for (const url of ['example.org/video', 'ftp://example.org/x', 'javascript:alert(1)', 'https://user:pw@example.org/x', '   ']) {
      expect(() => saveCompetitionReview(project, { ...review, entries: [entry({ url })] })).toThrow()
      expect(competitionReviewIssue({ ...review, entries: [entry({ url })] }, today)).toEqual({ issue: 'url', index: 0 })
    }
    expect(competitionReviewIssue({ ...review, entries: [entry({ url: 'http://example.org/x' })] }, today)).toBeNull()
  })

  it('refuses an impossible or future day and the same address twice', () => {
    expect(competitionReviewIssue({ ...review, entries: [entry({ observedOn: '2026-02-30' })] }, today)).toEqual({ issue: 'date', index: 0 })
    expect(competitionReviewIssue({ ...review, entries: [entry({ observedOn: '2026-11-23' })] }, today)).toEqual({ issue: 'future', index: 0 })
    expect(competitionReviewIssue({ ...review, entries: [entry(), entry({ id: 'e2', url: 'HTTPS://EXAMPLE.ORG/video/1' })] }, today)).toEqual({ issue: 'duplicate', index: 1 })
    expect(() => saveCompetitionReview(createProject('x'), { ...review, entries: [entry(), entry({ id: 'e2' })] })).toThrow(/twice/)
  })

  it('names the missing part of the first incomplete entry', () => {
    expect(competitionReviewIssue({ ...review, entries: [entry(), entry({ id: 'e2', url: 'https://example.org/2', title: ' ' })] }, today)).toEqual({ issue: 'title', index: 1 })
    expect(competitionReviewIssue({ ...review, entries: [entry({ covers: '' })] }, today)).toEqual({ issue: 'covers', index: 0 })
    expect(competitionReviewIssue(review, today)).toBeNull()
  })

  it('keeps a shown figure as the text it was, never as a number', () => {
    const saved = saveCompetitionReview(createProject('x'), { ...review, entries: [entry({ shownFigure: '1,2 Mio. Aufrufe' })] })
    expect(projectCompetitionReview(saved).entries[0].shownFigure).toBe('1,2 Mio. Aufrufe')
  })

  it('reports a damaged saved record instead of dropping the notes', () => {
    expect(() => projectCompetitionReview({ ...createProject('x'), metadata: { competitionReview: { schemaVersion: 1, entries: [{ url: 'nope' }] } } })).toThrow(/invalid/)
  })
})

describe('competition notes summary', () => {
  it('gives the count, the date span, the age of the oldest observation and how many gaps were noted', () => {
    expect(summarizeCompetitionReview(review, today)).toEqual({ entries: 2, oldest: '2026-10-01', newest: '2026-11-20', oldestAgeDays: 52, withGap: 1 })
    expect(summarizeCompetitionReview(emptyCompetitionReview, today)).toEqual({ entries: 0, oldest: null, newest: null, oldestAgeDays: null, withGap: 0 })
  })
})

describe('competition notes in the Director brief', () => {
  it('passes them as the author\'s unverified notes, with the instruction not to copy, and without addresses or figures', () => {
    const brief = localizedDirectorBrief(defaultProjectContentProfile, 'Erkläre Abseits.', competitionDirectorGuidance(review))
    expect(brief).toContain('the author\'s own notes, not verified facts')
    expect(brief).toContain('do not copy, quote or imitate these works')
    expect(brief).toContain('- "Abseits in 3 Minuten" — covers: Grundregel mit einer Spielszene. — leaves out: Passives Abseits fehlt.')
    expect(brief).toContain('- "Die Abseitsregel erklärt" — covers: Grundregel mit einer Spielszene.')
    expect(brief).toContain('What this production must do differently, in the author\'s words: Passives Abseits an drei eigenen Tafeln zeigen.')
    expect(brief).not.toContain('example.org')
    expect(brief).not.toContain('12.345')
    expect(brief.endsWith('Creative brief:\nErkläre Abseits.')).toBe(true)
  })

  it('sends at most twelve entries and says how many were left out', () => {
    const many = { ...review, entries: Array.from({ length: 15 }, (_, index) => entry({ id: `e${index}`, url: `https://example.org/${index}`, title: `Titel ${index}` })) }
    const lines = competitionDirectorGuidance(many)
    expect(lines.filter(line => line.startsWith('- "Titel'))).toHaveLength(12)
    expect(lines).toContain('- (3 further entries not listed here)')
  })

  it('adds nothing when there are no notes', () => {
    expect(competitionDirectorGuidance(emptyCompetitionReview)).toEqual([])
  })
})

describe('competition notes panel', () => {
  it('shows the saved notes, the summary and the boundary in every language', () => {
    const project = saveCompetitionReview(createProject('Abseits'), review)
    for (const language of uiLanguages) {
      const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CompetitionReviewPanel, { project, history: history(), onProjectChange: () => {}, today }) }))
      expect(html).toContain(translateUi(language, 'competition.heading'))
      expect(html).toContain(translateUi(language, 'competition.boundary').slice(0, 30))
      expect(html).toContain(translateUi(language, 'competition.summary', { entries: 2, oldest: '2026-10-01', newest: '2026-11-20', age: 52, gaps: 1 }))
      expect(html).toContain('Abseits in 3 Minuten')
      expect(html).not.toContain(translateUi(language, 'competition.noAngle'))
    }
  })

  it('points out entries without a stated difference', () => {
    const project = saveCompetitionReview(createProject('Abseits'), { ...review, angle: '' })
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'en', children: createElement(CompetitionReviewPanel, { project, history: history(), onProjectChange: () => {}, today }) }))
    expect(html).toContain('You have not yet noted what your video does differently.')
  })

  it('localizes its history entry', () => {
    expect(displaySystemHistoryLabel({ label: 'Before changing the competition notes', source: 'system' }, key => translateUi('fr', key))).toBe('Avant la modification des notes sur la concurrence')
  })
})
