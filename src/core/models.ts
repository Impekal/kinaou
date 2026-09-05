export type ModelCapability =
  | 'reasoning'
  | 'speech-to-text'
  | 'text-to-speech'
  | 'image-generation'
  | 'video-generation'
  | 'video-understanding'
  | 'voice-clone'
  | 'avatar'
  | 'lip-sync'
  | 'music'
  | 'upscaling'

export interface ModelDescriptor {
  id: string
  name: string
  provider: string
  local: boolean
  capabilities: ModelCapability[]
  estimatedBytes?: number
  hardware?: {
    minMemoryBytes?: number
    recommendedMemoryBytes?: number
    gpuPreferred?: boolean
  }
}

export interface ModelAdapter<TInput = unknown, TOutput = unknown> {
  descriptor: ModelDescriptor
  isAvailable(): Promise<boolean>
  run(input: TInput, signal: AbortSignal, onProgress?: (progress: number) => void): Promise<TOutput>
}

export class ModelRegistry {
  private readonly adapters = new Map<string, ModelAdapter>()

  register(adapter: ModelAdapter): void {
    this.adapters.set(adapter.descriptor.id, adapter)
  }

  get(id: string): ModelAdapter | undefined {
    return this.adapters.get(id)
  }

  list(capability?: ModelCapability): ModelDescriptor[] {
    return [...this.adapters.values()]
      .map((adapter) => adapter.descriptor)
      .filter((descriptor) => !capability || descriptor.capabilities.includes(capability))
  }
}
