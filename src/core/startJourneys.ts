import type { KinaouProject } from './project'

/** The handful of things an author sets out to make. Each one only decides where they land. */
export const startJourneys = ['video', 'research', 'course', 'sports', 'shorts'] as const
export type StartJourney = typeof startJourneys[number]

/** Where a new project opens for each journey — the area whose first step makes sense there. */
export const startJourneyDestination = {
  video: 'Director',
  research: 'Research',
  course: 'Course',
  sports: 'Sports',
  shorts: 'Assets'
} as const satisfies Record<StartJourney, string>

export function isStartJourney(value: unknown): value is StartJourney {
  return typeof value === 'string' && (startJourneys as readonly string[]).includes(value)
}

/** Remembers what the author set out to make. It changes nothing else about the project. */
export function withStartJourney(project: KinaouProject, journey: StartJourney): KinaouProject {
  return { ...project, metadata: { ...project.metadata, startJourney: journey } }
}

export function projectStartJourney(project: KinaouProject): StartJourney | null {
  return isStartJourney(project.metadata.startJourney) ? project.metadata.startJourney : null
}

/** The sidebar in the order work normally flows, instead of one flat list of sixteen. */
export const navGroups = [
  { id: 'start', items: ['Projects', 'Create'] },
  { id: 'plan', items: ['Research', 'Director'] },
  { id: 'make', items: ['Studio', 'Assets', 'Audio', 'Images', 'Video', 'Capture', 'Avatar'] },
  { id: 'formats', items: ['Course', 'Sports'] },
  { id: 'release', items: ['Publish', 'Analytics'] },
  { id: 'system', items: ['Settings'] }
] as const
export type NavGroupId = typeof navGroups[number]['id']
