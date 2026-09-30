export const researchViews = ['discover', 'library', 'assess', 'brief'] as const
export type ResearchView = typeof researchViews[number]

/** Automatic activation for local views only; never starts retrieval or persistence. */
export function researchViewForKey(current: ResearchView, key: string): ResearchView | null {
  const index = researchViews.indexOf(current)
  if (key === 'Home') return researchViews[0]
  if (key === 'End') return researchViews[researchViews.length - 1]
  if (key === 'ArrowRight') return researchViews[(index + 1) % researchViews.length]
  if (key === 'ArrowLeft') return researchViews[(index + researchViews.length - 1) % researchViews.length]
  return null
}
