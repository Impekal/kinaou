import { parseProject, type KinaouProject } from './project'

type PersistProject = (project: KinaouProject) => void

function cloneProject(project: KinaouProject): KinaouProject {
  return structuredClone(parseProject(project))
}

function signature(project: KinaouProject): string {
  return JSON.stringify(project)
}

export class TimelineUndoSession {
  private past: KinaouProject[] = []
  private future: KinaouProject[] = []
  private current: KinaouProject

  constructor(
    project: KinaouProject,
    private readonly maxEntries = 100,
    private readonly now: () => Date = () => new Date()
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error('Timeline undo size must be positive')
    }

    this.current = cloneProject(project)
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  get undoDepth(): number {
    return this.past.length
  }

  get redoDepth(): number {
    return this.future.length
  }

  observe(project: KinaouProject): boolean {
    const parsed = parseProject(project)

    if (signature(parsed) === signature(this.current)) return false

    this.past = []
    this.future = []
    this.current = cloneProject(parsed)
    return true
  }

  record(before: KinaouProject, after: KinaouProject): void {
    const previous = parseProject(before)
    const next = parseProject(after)

    if (previous.id !== next.id) {
      throw new Error('Timeline undo cannot cross projects')
    }

    if (signature(previous) === signature(next)) {
      this.current = cloneProject(next)
      return
    }

    if (signature(previous) !== signature(this.current)) {
      this.past = []
      this.future = []
      this.current = cloneProject(previous)
    }

    this.past.push(cloneProject(previous))
    if (this.past.length > this.maxEntries) this.past.shift()

    this.future = []
    this.current = cloneProject(next)
  }

  undo(current: KinaouProject, persist: PersistProject): KinaouProject | null {
    const parsed = parseProject(current)

    if (this.observe(parsed)) return null

    const target = this.past.at(-1)
    if (!target) return null

    const restored = parseProject({
      ...cloneProject(target),
      updatedAt: this.now().toISOString()
    })

    persist(restored)

    this.past.pop()
    this.future.push(cloneProject(parsed))
    if (this.future.length > this.maxEntries) this.future.shift()
    this.current = cloneProject(restored)

    return restored
  }

  redo(current: KinaouProject, persist: PersistProject): KinaouProject | null {
    const parsed = parseProject(current)

    if (this.observe(parsed)) return null

    const target = this.future.at(-1)
    if (!target) return null

    const restored = parseProject({
      ...cloneProject(target),
      updatedAt: this.now().toISOString()
    })

    persist(restored)

    this.future.pop()
    this.past.push(cloneProject(parsed))
    if (this.past.length > this.maxEntries) this.past.shift()
    this.current = cloneProject(restored)

    return restored
  }
}
