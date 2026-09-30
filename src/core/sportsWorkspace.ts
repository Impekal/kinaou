export const sportsViews = ['board', 'sequence', 'motion'] as const
export type SportsView = typeof sportsViews[number]

/** Automatic-activation tabs; unrelated keys retain normal browser behavior. */
export function sportsViewForKey(current: SportsView, key: string): SportsView | null {
  const index = sportsViews.indexOf(current)
  if (key === 'Home') return sportsViews[0]
  if (key === 'End') return sportsViews[sportsViews.length - 1]
  if (key === 'ArrowRight') return sportsViews[(index + 1) % sportsViews.length]
  if (key === 'ArrowLeft') return sportsViews[(index + sportsViews.length - 1) % sportsViews.length]
  return null
}
