import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HashtagSetPanel, hashtagEvidenceBadge } from '../src/components/HashtagSetPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { clearHashtagSet, hashtagCandidates, hashtagEvidence, hashtagForm, hashtagLine, projectHashtagSet, reviewHashtagInput, saveHashtagSet } from '../src/core/hashtagSet'
import { createProject, type KinaouProject } from '../src/core/project'
import { retainSearchTrend } from '../src/core/searchTrends'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { displaySystemHistoryLabel } from '../src/core/uiSystemLabels'
import { PersistentVersionHistory } from '../src/core/versioning'
import { searchTrendFeedUrl } from '../worker/search-trends-protocol.mjs'

function history(): PersistentVersionHistory {
  const data = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } })
}

function project(): KinaouProject {
  return {
    ...createProject('Abseits', new Date('2026-11-22T10:00:00.000Z')),
    script: 'Heute geht es um die Abseitsregel und um Pressing.',
    storyboard: [
      { id: 's1', title: 'Die Abseitsregel', description: 'Taktiktafel.', narration: 'Die Abseitsregel einfach erklärt.', durationMs: 4000 },
      { id: 's2', title: 'Beispiel', description: 'Zweite Tafel zur Abseitsregel.', narration: 'Ein Beispiel.', durationMs: 4000 }
    ]
  }
}

function withTrend(base: KinaouProject, query: string, reportedTraffic: string | null = '200+'): KinaouProject {
  return retainSearchTrend(base, {
    schemaVersion: 1, provider: 'google-trends-rss', country: 'DE', sourceUrl: searchTrendFeedUrl('DE'), retrievedAt: '2026-11-21T08:00:00.000Z',
    feedSha256: 'a'.repeat(64), items: [{ query, reportedTraffic, publishedAt: '2026-11-21T06:00:00.000Z', articles: [] }]
  } as never, 0)
}

describe('writing a keyword as a hashtag', () => {
  it('leaves a single word exactly as written', () => {
    expect(hashtagForm('Abseits')).toBe('Abseits')
    expect(hashtagForm('#Abseits')).toBe('Abseits')
    expect(hashtagForm('fußball_2026')).toBe('fußball_2026')
  })

  it('joins several words and capitalises each later one so they stay readable', () => {
    expect(hashtagForm('abseits regel')).toBe('abseitsRegel')
    expect(hashtagForm('Champions-League Finale')).toBe('ChampionsLeagueFinale')
    expect(hashtagForm('  l’équipe de france ')).toBe('lÉquipeDeFrance')
    expect(hashtagForm('été')).toBe('été')
  })

  it('refuses what cannot be a hashtag instead of inventing one', () => {
    expect(hashtagForm('2026')).toBeNull()
    expect(hashtagForm('!!!')).toBeNull()
    expect(hashtagForm('   ')).toBeNull()
    expect(hashtagForm('a'.repeat(101))).toBeNull()
  })
})

describe('reviewing a keyword list', () => {
  it('keeps every entered keyword visible, in order, and marks what was rewritten', () => {
    expect(hashtagCandidates('Abseits, abseits regel\n2026, ABSEITS')).toEqual([
      { keyword: 'Abseits', tag: 'Abseits', rewritten: false, issue: null },
      { keyword: 'abseits regel', tag: 'abseitsRegel', rewritten: true, issue: null },
      { keyword: '2026', tag: null, rewritten: false, issue: 'unusable' },
      { keyword: 'ABSEITS', tag: 'ABSEITS', rewritten: false, issue: 'duplicate' }
    ])
  })

  it('counts how far a list is over the author\'s own limit', () => {
    expect(reviewHashtagInput('a, b, c', 2).overLimit).toBe(1)
    expect(reviewHashtagInput('a, b, c', 3).overLimit).toBe(0)
    // Blocked keywords do not count toward the limit; they have to be fixed first anyway.
    expect(reviewHashtagInput('a, 2026, b', 2)).toMatchObject({ overLimit: 0 })
  })
})

describe('what a hashtag rests on', () => {
  it('counts the scenes in which the keyword is written', () => {
    expect(hashtagEvidence(project(), 'Abseitsregel')).toEqual({ scriptScenes: 2, inScript: true, trends: [] })
    expect(hashtagEvidenceBadge(hashtagEvidence(project(), 'Abseitsregel'))).toBe('script')
  })

  it('distinguishes a keyword that is only in the script text from one in a scene', () => {
    expect(hashtagEvidence(project(), 'Pressing')).toEqual({ scriptScenes: 0, inScript: true, trends: [] })
  })

  it('does not find a keyword inside a longer word', () => {
    expect(hashtagEvidence(project(), 'Abseits')).toMatchObject({ scriptScenes: 0, inScript: false })
    expect(hashtagEvidenceBadge(hashtagEvidence(project(), 'Abseits'))).toBe('none')
  })

  it('cites a retained search-trend observation only for exactly the same term', () => {
    const base = withTrend(project(), 'Abseitsregel')
    expect(hashtagEvidence(base, 'abseitsregel').trends).toEqual([{ country: 'DE', retrievedAt: '2026-11-21T08:00:00.000Z', reportedTraffic: '200+' }])
    expect(hashtagEvidenceBadge(hashtagEvidence(base, 'Abseitsregel'))).toBe('both')
    expect(hashtagEvidence(base, 'Abseits').trends).toEqual([])
    expect(hashtagEvidence(base, 'Abseitsregel einfach').trends).toEqual([])
  })

  it('reports a trend term the script never mentions as a trend observation only', () => {
    const base = withTrend(project(), 'Handelfmeter', null)
    const evidence = hashtagEvidence(base, 'Handelfmeter')
    expect(evidence).toEqual({ scriptScenes: 0, inScript: false, trends: [{ country: 'DE', retrievedAt: '2026-11-21T08:00:00.000Z', reportedTraffic: null }] })
    expect(hashtagEvidenceBadge(evidence)).toBe('trend')
  })

  it('always describes the script as it is now', () => {
    const edited: KinaouProject = { ...project(), storyboard: project().storyboard.slice(0, 1) }
    expect(hashtagEvidence(edited, 'Abseitsregel').scriptScenes).toBe(1)
  })
})

describe('saving a hashtag list', () => {
  it('saves separate lists for the main video and the Short and gives the line to paste', () => {
    const main = saveHashtagSet(project(), 'main', 'Abseitsregel, fußball taktik', 5, new Date('2026-11-22T11:00:00.000Z'))
    const both = saveHashtagSet(main, 'short', 'Abseits', 3)
    expect(projectHashtagSet(both, 'main')).toEqual({ variant: 'main', limit: 5, savedAt: '2026-11-22T11:00:00.000Z', tags: [{ tag: 'Abseitsregel', keyword: 'Abseitsregel' }, { tag: 'fußballTaktik', keyword: 'fußball taktik' }] })
    expect(hashtagLine(projectHashtagSet(both, 'main')!)).toBe('#Abseitsregel #fußballTaktik')
    expect(hashtagLine(projectHashtagSet(both, 'short')!)).toBe('#Abseits')
  })

  it('refuses a list with an unusable or duplicated keyword, or one over the limit', () => {
    expect(() => saveHashtagSet(project(), 'main', 'Abseits, 2026', 5)).toThrow(/cannot become hashtags/)
    expect(() => saveHashtagSet(project(), 'main', 'Abseits, abseits', 5)).toThrow(/cannot become hashtags/)
    expect(() => saveHashtagSet(project(), 'main', 'a, b, c', 2)).toThrow(/limit/)
    expect(() => saveHashtagSet(project(), 'main', '  ', 5)).toThrow()
  })

  it('leaves the project untouched when nothing changed, and removes a list on request', () => {
    const saved = saveHashtagSet(project(), 'main', 'Abseitsregel', 5)
    expect(saveHashtagSet(saved, 'main', 'Abseitsregel', 5)).toBe(saved)
    const cleared = clearHashtagSet(saved, 'main')
    expect(projectHashtagSet(cleared, 'main')).toBeNull()
    expect(clearHashtagSet(cleared, 'main')).toBe(cleared)
  })

  it('reports damaged saved lists instead of dropping them', () => {
    expect(() => projectHashtagSet({ ...project(), metadata: { hashtagSets: { schemaVersion: 1, sets: [{ variant: 'main', limit: 1, tags: [{ tag: 'a b', keyword: 'a b' }], savedAt: '2026-11-22T11:00:00.000Z' }] } } }, 'main')).toThrow(/invalid/)
  })
})

describe('hashtag panel', () => {
  it('shows a saved list with its evidence and the honest boundary in every language', () => {
    const saved = saveHashtagSet(withTrend(project(), 'Abseitsregel'), 'main', 'Abseitsregel\nfußball taktik', 5)
    for (const language of uiLanguages) {
      const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(HashtagSetPanel, { project: saved, history: history(), onProjectChange: () => {} }) }))
      expect(html).toContain(translateUi(language, 'hashtag.heading'))
      expect(html).toContain(translateUi(language, 'hashtag.boundary').slice(0, 30))
      expect(html).toContain('#Abseitsregel #fußballTaktik')
    }
  })

  it('localizes its history entry', () => {
    expect(displaySystemHistoryLabel({ label: 'Before changing the hashtag list', source: 'system' }, key => translateUi('en', key))).toBe('Before changing the hashtag list')
    expect(displaySystemHistoryLabel({ label: 'Before changing the hashtag list', source: 'system' }, key => translateUi('de', key))).toBe('Vor dem Ändern der Hashtag-Liste')
  })
})
