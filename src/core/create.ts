import { createProject, type KinaouProject, type TimelineTrack } from './project'

export type CreationInputKind = 'idea' | 'document' | 'url' | 'image' | 'audio' | 'video'

export interface CreationInput {
  title: string
  kind: CreationInputKind
  content: string
}

function track(type: TimelineTrack['type'], name: string): TimelineTrack {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    muted: false,
    locked: false,
    clips: []
  }
}

export function createProjectFromInput(input: CreationInput, now = new Date()): KinaouProject {
  const title = input.title.trim() || 'Untitled project'
  const content = input.content.trim()
  const project = createProject(title, now)

  return {
    ...project,
    storyboard: content ? [{
      id: crypto.randomUUID(),
      title: 'Opening scene',
      description: content,
      durationMs: 8000
    }] : [],
    tracks: [
      track('video', 'Main Video'),
      track('voice', 'Voice'),
      track('music', 'Music'),
      track('caption', 'Captions')
    ],
    metadata: {
      sourceInput: {
        kind: input.kind,
        content
      }
    }
  }
}
