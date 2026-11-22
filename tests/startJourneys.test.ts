import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProjectFromInput } from '../src/core/create'
import { parseProject } from '../src/core/project'
import { isStartJourney, navGroups, projectStartJourney, startJourneyDestination, startJourneys, withStartJourney } from '../src/core/startJourneys'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const allAreas = ['Projects', 'Create', 'Director', 'Research', 'Studio', 'Course', 'Sports', 'Assets', 'Avatar', 'Audio', 'Images', 'Video', 'Capture', 'Publish', 'Analytics', 'Settings']

describe('start journeys', () => {
  it('opens each journey in an area that exists', () => {
    for (const journey of startJourneys) expect(allAreas).toContain(startJourneyDestination[journey])
    expect(startJourneyDestination).toEqual({ video: 'Director', research: 'Research', course: 'Course', sports: 'Sports', shorts: 'Assets' })
  })

  it('remembers the journey on the project without changing anything else, and survives parsing', () => {
    const project = createProjectFromInput({ title: 'Kurs', kind: 'idea', content: 'x' })
    const marked = withStartJourney(project, 'course')
    expect(projectStartJourney(marked)).toBe('course')
    expect({ ...marked, metadata: { ...marked.metadata, startJourney: undefined } }).toEqual({ ...project, metadata: { ...project.metadata, startJourney: undefined } })
    expect(projectStartJourney(parseProject(marked))).toBe('course')
  })

  it('treats a missing or unknown journey as none', () => {
    const project = createProjectFromInput({ title: 'x', kind: 'idea', content: '' })
    expect(projectStartJourney(project)).toBeNull()
    expect(projectStartJourney({ ...project, metadata: { startJourney: 'podcast' } })).toBeNull()
    expect(isStartJourney('video')).toBe(true)
    expect(isStartJourney(3)).toBe(false)
  })
})

describe('grouped navigation', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('contains every area exactly once', () => {
    const grouped = navGroups.flatMap(group => [...group.items])
    expect([...grouped].sort()).toEqual([...allAreas].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  it('renders the groups, every area and the start choices in every language', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } } })
    for (const language of uiLanguages) {
      const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(App) }))
      for (const group of navGroups) expect(html).toContain(translateUi(language, `nav.group.${group.id}`))
      for (const area of allAreas) expect(html).toContain(translateUi(language, `nav.${area}` as never))
      // With no saved project the app opens on Create, which now asks what to make.
      expect(html).toContain(translateUi(language, 'create.heading'))
      expect(html).toContain(translateUi(language, 'start.help').slice(0, 30))
      for (const journey of startJourneys) expect(html).toContain(translateUi(language, `start.journey.${journey}`))
      expect(html).toContain(translateUi(language, 'start.titleRequired'))
      expect(html).toContain('aria-current="page"')
    }
  })
})

describe('the first step follows the chosen journey', () => {
  it('points to the journey\'s own area only while there is no plan yet', async () => {
    const { journeyEntry, projectJourney } = await import('../src/core/projectJourney')
    const fresh = createProjectFromInput({ title: 'x', kind: 'idea', content: 'Ein Thema.' })
    const next = projectJourney(fresh).next
    expect(journeyEntry('course', next)).toBe('Course')
    expect(journeyEntry('sports', next)).toBe('Sports')
    expect(journeyEntry('research', next)).toBe('Research')
    expect(journeyEntry('shorts', next)).toBe('Assets')
    // "A video from an idea" and projects without a recorded journey start in Director as before.
    expect(journeyEntry('video', next)).toBeNull()
    expect(journeyEntry(null, next)).toBeNull()
    // Once a plan exists the ordinary stages take over, whatever the journey was.
    const planned = projectJourney({ ...fresh, metadata: { ...fresh.metadata, directorPlan: {} } }).next
    expect(planned?.stage).toBe('visuals')
    expect(journeyEntry('course', planned)).toBeNull()
  })

  it('shows the journey\'s first step in the bar', async () => {
    const { ProjectJourneyBar } = await import('../src/components/ProjectJourneyBar')
    const project = withStartJourney(createProjectFromInput({ title: 'Kurs', kind: 'idea', content: 'Ein Thema.' }), 'course')
    const html = (section: string) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'de', children: createElement(ProjectJourneyBar, { project, section, onGo: () => {} }) }))
    expect(html('Studio')).toContain('Den Kurs planen')
    expect(html('Studio')).toContain('Zum Kurs')
    expect(html('Studio')).not.toContain('Zur Regie')
    expect(html('Course')).toContain('Du bist schon im richtigen Bereich')
  })
})
