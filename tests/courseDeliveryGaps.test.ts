import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CourseDeliveryGapsPanel } from '../src/components/CourseDeliveryGapsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { courseDeliveryItems, lessonDeliveryStatus, summarizeCourseDelivery } from '../src/core/courseDeliveryGaps'
import type { CourseProductionRow } from '../src/core/courseProductionOverview'
import { createProject } from '../src/core/project'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const covered = { durationMs: 4000, coveredMs: 4000, intervals: [{ startMs: 0, endMs: 4000 }], gaps: [] }

/** A lesson with nothing countable left open. */
function finished(overrides: Partial<CourseProductionRow> = {}): CourseProductionRow {
  return {
    lessonId: 'l1', moduleId: 'm1', label: '1.1 · Modul / Lektion', range: { inMs: 0, outMs: 4000 }, scriptPresent: true,
    visuals: covered, voice: covered, captionClips: 2, excludedClips: 0,
    demonstrations: 1, linkedDemonstrations: 1, exercises: 2, completeExercises: 2, materials: 1,
    exports: 1, matchingOutlineExports: 1, ...overrides
  }
}

describe('what is open in one lesson', () => {
  it('finds nothing open in a finished, currently reviewed lesson', () => {
    expect(lessonDeliveryStatus(finished(), 'current')).toEqual({ lessonId: 'l1', moduleId: 'm1', label: '1.1 · Modul / Lektion', gaps: [], next: null })
  })

  it('lists every open item in production order and names the first as the next step', () => {
    const row = finished({
      scriptPresent: false,
      visuals: { ...covered, gaps: [{ startMs: 0, endMs: 500 }, { startMs: 1000, endMs: 1500 }] },
      voice: { ...covered, gaps: [{ startMs: 0, endMs: 4000 }] },
      captionClips: 0, excludedClips: 3, exercises: 4, completeExercises: 1, demonstrations: 2, linkedDemonstrations: 0, matchingOutlineExports: 0
    })
    const status = lessonDeliveryStatus(row, 'none')
    expect(status.gaps).toEqual([
      { item: 'script', count: 1 }, { item: 'visuals', count: 2 }, { item: 'voice', count: 1 }, { item: 'captions', count: 1 }, { item: 'media', count: 3 },
      { item: 'exercises', count: 3 }, { item: 'demonstrations', count: 2 }, { item: 'export', count: 1 }, { item: 'review', count: 1 }
    ])
    expect(status.gaps.map(gap => gap.item)).toEqual([...courseDeliveryItems])
    expect(status.next).toBe('script')
  })

  it('does not count exercises or demonstrations that were never started', () => {
    const status = lessonDeliveryStatus(finished({ exercises: 0, completeExercises: 0, demonstrations: 0, linkedDemonstrations: 0 }), 'current')
    expect(status.gaps).toEqual([])
  })

  it('treats an older export as missing when none matches the current outline', () => {
    expect(lessonDeliveryStatus(finished({ exports: 3, matchingOutlineExports: 0 }), 'current').gaps).toEqual([{ item: 'export', count: 1 }])
  })

  it('never reads an outdated or unknown review as reviewed', () => {
    for (const state of ['none', 'stale', 'unknown'] as const) expect(lessonDeliveryStatus(finished(), state).next).toBe('review')
  })

  it('moves the next step forward as earlier items are closed', () => {
    const open = finished({ scriptPresent: false, captionClips: 0 })
    expect(lessonDeliveryStatus(open, 'current').next).toBe('script')
    expect(lessonDeliveryStatus({ ...open, scriptPresent: true }, 'current').next).toBe('captions')
  })
})

describe('course summary', () => {
  it('counts lessons with nothing open and, per item, how many lessons still need it', () => {
    const statuses = [
      lessonDeliveryStatus(finished(), 'current'),
      lessonDeliveryStatus(finished({ lessonId: 'l2', captionClips: 0 }), 'current'),
      lessonDeliveryStatus(finished({ lessonId: 'l3', captionClips: 0, scriptPresent: false }), 'stale')
    ]
    expect(summarizeCourseDelivery(statuses)).toEqual({
      lessons: 3, clear: 1, open: 2,
      byItem: [{ item: 'script', lessons: 1 }, { item: 'captions', lessons: 2 }, { item: 'review', lessons: 1 }]
    })
    expect(summarizeCourseDelivery([])).toEqual({ lessons: 0, clear: 0, open: 0, byItem: [] })
  })
})

describe('delivery gaps panel', () => {
  function course() {
    const project = createProject('Kurs')
    return saveCourseOutline(project, { ...newCourseOutline(project), modules: [{ id: 'm1', title: 'Grundlagen', lessons: [
      { id: 'l1', title: 'Einstieg', objective: 'x', script: 'Hallo.', range: { inMs: 0, outMs: 4000 } },
      { id: 'l2', title: 'Vertiefung', objective: 'x', script: '', range: { inMs: 4000, outMs: 8000 } }
    ] }] } as never)
  }

  it('lists each saved lesson with its next step and the honest boundary in every language', () => {
    const project = course()
    for (const language of uiLanguages) {
      const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseDeliveryGapsPanel, { project, dirty: false, onEditLesson: () => {} }) }))
      expect(html).toContain(translateUi(language, 'course.gaps.heading'))
      expect(html).toContain(translateUi(language, 'course.gaps.boundary').slice(0, 30))
      expect(html).toContain(translateUi(language, 'course.gaps.summary', { clear: 0, lessons: 2, open: 2 }))
      // Lesson one has a script, so its next step is the picture; lesson two still needs its script.
      expect(html).toContain(translateUi(language, 'course.gaps.next', { item: translateUi(language, 'course.gaps.item.visuals') }))
      expect(html).toContain(translateUi(language, 'course.gaps.next', { item: translateUi(language, 'course.gaps.item.script') }))
      expect(html).not.toContain(translateUi(language, 'course.gaps.badge.clear'))
    }
  })

  it('says there is no course rather than showing an empty success', () => {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'en', children: createElement(CourseDeliveryGapsPanel, { project: createProject('Leer'), dirty: false, onEditLesson: () => {} }) }))
    expect(html).toContain('No saved course with lessons yet.')
    expect(html).not.toContain('NOTHING OPEN')
  })

  it('reports invalid saved course data as an error, never as done', () => {
    const broken = { ...createProject('Kaputt'), metadata: { courseOutline: { schemaVersion: 1, modules: 'nope' } } }
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'en', children: createElement(CourseDeliveryGapsPanel, { project: broken, dirty: false, onEditLesson: () => {} }) }))
    expect(html).toContain('This is not “all done”.')
  })
})
