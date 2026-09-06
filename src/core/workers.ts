export type WorkerCapability = 'filesystem' | 'ffmpeg' | 'media-probe' | 'asset-upload' | 'media-proxy' | 'media-thumbnail' | 'llm' | 'image-generation' | 'video-generation' | 'speech-to-text' | 'text-to-speech' | 'avatar'

export interface WorkerDescriptor {
  id: string
  name: string
  platform: string
  online: boolean
  load: number
  capabilities: WorkerCapability[]
  memoryGb?: number
  gpu?: string
}

export class WorkerRegistry {
  private workers = new Map<string, WorkerDescriptor>()

  register(worker: WorkerDescriptor): void {
    if (worker.load < 0 || worker.load > 1) throw new Error('Worker load must be between 0 and 1')
    this.workers.set(worker.id, { ...worker, capabilities: [...worker.capabilities] })
  }

  remove(id: string): void {
    this.workers.delete(id)
  }

  list(capability?: WorkerCapability): WorkerDescriptor[] {
    return [...this.workers.values()]
      .filter((worker) => !capability || worker.capabilities.includes(capability))
      .map((worker) => ({ ...worker, capabilities: [...worker.capabilities] }))
  }

  choose(required: WorkerCapability[]): WorkerDescriptor | null {
    return this.list()
      .filter((worker) => worker.online && required.every((capability) => worker.capabilities.includes(capability)))
      .sort((a, b) => a.load - b.load)[0] ?? null
  }
}
