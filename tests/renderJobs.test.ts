import { describe, expect, it } from 'vitest'
import { parseRenderJob } from '../src/core/renderJobs'
import { WorkerClient } from '../src/core/workerClient'
import { createProject } from '../src/core/project'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { registerAsset } from '../src/core/assets'
import { trackSchema, clipSchema } from '../src/core/project'
import { applyTimelineOperation } from '../src/core/timeline'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function samplePlan() {
  let project = createProject('Render jobs')
  project = registerAsset(project, { kind: 'video', uri: 'KINAOU/Assets/demo.mp4', name: 'demo', managed: true })
  const asset = project.assets[0]
  const track = trackSchema.parse({ id: 'v1', type: 'video', name: 'Main video', clips: [] })
  project = applyTimelineOperation(project, { type: 'add-track', track })
  project = applyTimelineOperation(project, {
    type: 'add-clip', trackId: track.id,
    clip: clipSchema.parse({ id: 'c1', assetId: asset.id, startMs: 0, durationMs: 5000 })
  })
  return createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/demo.mp4')
}

describe('render job model', () => {
  it('accepts valid lifecycle records and rejects invalid progress', () => {
    expect(parseRenderJob({ id: 'j1', state: 'running', progress: 0.5, createdAt: 'now', updatedAt: 'now' }).state).toBe('running')
    expect(() => parseRenderJob({ id: 'j1', state: 'running', progress: 2, createdAt: 'now', updatedAt: 'now' })).toThrow(/progress/)
  })
})

describe('worker render lifecycle client', () => {
  it('starts, polls and cancels one render job', async () => {
    const seen: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      seen.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/render')) return response({ ok: true, type: 'render-job', job: { id: 'j1', state: 'queued', progress: 0, createdAt: 'now', updatedAt: 'now' } }, 202)
      if (url.endsWith('/render/jobs/j1/cancel')) return response({ ok: true, type: 'render-job', job: { id: 'j1', state: 'cancelled', progress: 0.4, createdAt: 'now', updatedAt: 'later' } })
      return response({ ok: true, type: 'render-job', job: { id: 'j1', state: 'running', progress: 0.4, createdAt: 'now', updatedAt: 'later' } })
    }
    const client = new WorkerClient({ baseUrl: 'http://localhost:43117', token: 'secret', fetchImpl })
    const started = await client.startRender(samplePlan())
    const running = await client.renderStatus(started.id)
    const cancelled = await client.cancelRender(started.id)
    expect(started.state).toBe('queued')
    expect(running.progress).toBe(0.4)
    expect(cancelled.state).toBe('cancelled')
    expect(seen.some((item) => item.includes('/render/jobs/j1/cancel'))).toBe(true)
  })
})
