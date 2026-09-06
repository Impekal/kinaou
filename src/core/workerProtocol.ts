import { z } from 'zod'
import type { RenderPlan } from './render'
import type { WorkerCapability } from './workers'

export const workerHandshakeSchema = z.object({
  workerId: z.string().min(1),
  name: z.string().min(1),
  platform: z.string().min(1),
  version: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  managedRoots: z.array(z.string().min(1)),
  ffmpegVersion: z.string().optional(),
  ffprobeVersion: z.string().optional()
})

export type WorkerHandshake = z.infer<typeof workerHandshakeSchema>

export type WorkerRequest =
  | { id: string; type: 'health' }
  | { id: string; type: 'probe-media'; path: string }
  | { id: string; type: 'render'; plan: RenderPlan }

export type WorkerResponse =
  | { id: string; ok: true; type: 'health'; handshake: WorkerHandshake }
  | { id: string; ok: true; type: 'probe-media'; result: MediaProbeResult }
  | { id: string; ok: true; type: 'render'; result: RenderExecutionResult }
  | { id: string; ok: false; error: WorkerError }

export interface MediaProbeResult {
  path: string
  durationMs?: number
  width?: number
  height?: number
  fps?: number
  videoCodec?: string
  audioCodec?: string
  sampleRate?: number
  channels?: number
  sizeBytes?: number
  mimeType?: string
}

export interface RenderExecutionResult {
  outputPath: string
  durationMs: number
  sizeBytes?: number
}

export interface WorkerError {
  code: 'INVALID_REQUEST' | 'UNAUTHORIZED_PATH' | 'CAPABILITY_UNAVAILABLE' | 'PROCESS_FAILED' | 'ASSET_OFFLINE' | 'UNKNOWN'
  message: string
  details?: Record<string, unknown>
}

export function requireWorkerCapabilities(handshake: WorkerHandshake, required: WorkerCapability[]): void {
  const capabilities = new Set(handshake.capabilities)
  const missing = required.filter((capability) => !capabilities.has(capability))
  if (missing.length) throw new Error(`Worker missing capabilities: ${missing.join(', ')}`)
}
