import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImageStudioSession, type ImageFeedback, type ImagePhase } from '../src/core/imageStudioSession'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import type { ImageJobRecord } from '../src/core/imageJobs'
import { ImageStudioPanel } from '../src/components/ImageStudioPanel'
import { ImageJobStatus } from '../src/components/ImageJobStatus'
import { SceneFulfillmentControl } from '../src/components/SceneFulfillmentControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const parameters = { templatePath: 'KINAOU/Models/ComfyUI/Workflows/test.json', positivePrompt: 'Original <prompt>', negativePrompt: 'blur', seed: 42, width: 64, height: 64 }
const template = { path: parameters.templatePath, id: 'test', label: 'Original template', mediaType: 'image' as const, supportsNegativePrompt: true, supportsWidth: true, supportsHeight: true }
const job = (state: ImageJobRecord['state'] = 'succeeded'): ImageJobRecord => ({ id: 'job', state, progress: state === 'succeeded' ? 1 : 0.1, templatePath: parameters.templatePath, createdAt: '2026-09-21T00:00:00Z', updatedAt: '2026-09-21T00:00:01Z', provenance: { kind: 'local-model', adapterId: 'comfyui', templateId: 'test', seed: 42, positivePrompt: parameters.positivePrompt, negativePrompt: 'blur', width: 64, height: 64 }, ...(state === 'succeeded' ? { imagePath: 'KINAOU/Assets/GeneratedImages/job.png', sizeBytes: 1000 } : {}) })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  const data = new Map<string, string>()
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repository = new ProjectRepository(store), history = new PersistentVersionHistory(store)
  let project = repository.save(createProject('Original <title>')), connection = 'original'
  const states: ImageFeedback[] = []
  const client = { startImageJob: vi.fn(async (_parameters: typeof parameters) => job()), imageJobStatus: vi.fn(async (_id: string) => job()), cancelImageJob: vi.fn(async (_id: string) => job('cancelled')) }
  const snapshot = vi.fn((value: KinaouProject) => { history.snapshot(value, 'Before image', 'system') })
  const persist = vi.fn((value: KinaouProject) => { project = repository.save(value) })
  const session = new ImageStudioSession(project, connection, parameters, template.id, { client, environment: () => ({ project, connection }), snapshot, persist, publish: value => states.push(value), wait: async () => {} })
  return { session, states, client, snapshot, persist, history, repository, get project() { return project }, edit: (value: KinaouProject) => { project = value; session.observe(project, connection) }, connect: (value: string) => { connection = value; session.observe(project, connection) } }
}
it.each(uiLanguages)('translates scene assignment without rewriting original names in %s', language => {
  const f = fixture(), project = parseProject({ ...f.project, storyboard: [{ id: 'scene', title: 'Original <scene>', description: '', durationMs: 1000 }], assets: [{ id: 'image', kind: 'image', uri: 'KINAOU/Assets/image.png', managed: true, metadata: { name: 'Original <image>' } }] })
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(SceneFulfillmentControl, { project, asset: project.assets[0], history: f.history, onProjectChange: vi.fn(), onError: vi.fn() }) }))
  expect(html).toContain('Original &lt;scene&gt;'); expect(html).toContain('Original &lt;image&gt;'); expect(html).toContain(translateUi(language, 'fulfillment.assign')); expect(html).toContain('disabled=""')
})
it('saves original image parameters once with attribution, real repository reload and reversible safety history', async () => {
  const f = fixture(); await f.session.run(); await f.session.run()
  expect(f.client.startImageJob.mock.calls).toEqual([[parameters]])
  expect(f.states.map(s => s.phase)).toEqual(['starting', 'saving', 'succeeded'])
  expect(f.repository.load(f.project.id)?.assets[0].metadata).toMatchObject({ positivePrompt: parameters.positivePrompt, seed: 42, imageJobId: 'job' })
  expect(f.persist).toHaveBeenCalledTimes(1)
  expect(f.history.restoreReversibly(f.project, f.history.list(f.project.id)[0].id).project.assets).toHaveLength(0)
})
it.each(['snapshot', 'persist'] as const)('recovers a %s failure by saving only, never another generation', async part => {
  const f = fixture(); f[part].mockImplementationOnce(() => { throw Error('storage full') })
  await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('saveFailed'); expect(f.project.assets).toHaveLength(0)
  await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('succeeded'); expect(f.project.assets).toHaveLength(1)
  expect(f.client.startImageJob).toHaveBeenCalledTimes(1); expect(f.client.imageJobStatus).not.toHaveBeenCalled()
  expect(f.history.list(f.project.id)).toHaveLength(1)
})
it('retries serial status reads for the original job only', async () => {
  const f = fixture(); f.client.startImageJob.mockResolvedValue(job('queued')); f.client.imageJobStatus.mockRejectedValueOnce(Error('offline'))
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('pollFailed')
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('succeeded')
  expect(f.client.startImageJob).toHaveBeenCalledTimes(1); expect(f.client.imageJobStatus.mock.calls).toEqual([['job'], ['job']])
})
it('never resubmits an unknown initial acceptance', async () => {
  const f = fixture(); f.client.startImageJob.mockRejectedValue(Error('lost acknowledgement'))
  await f.session.run(); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('startFailed'); expect(f.session.unresolved).toBe(true)
  expect(f.client.startImageJob).toHaveBeenCalledTimes(1); expect(f.persist).not.toHaveBeenCalled()
})
it('guards concurrent initial submissions', async () => {
  const f = fixture(), pending = deferred<ImageJobRecord>(); f.client.startImageJob.mockReturnValue(pending.promise)
  const running = f.session.run(); await f.session.run(); pending.resolve(job()); await running
  expect(f.client.startImageJob).toHaveBeenCalledTimes(1)
})
it.each(['project', 'connection', 'detach'] as const)('suppresses late initial results after %s and scope round trips', async kind => {
  const f = fixture(), original = f.project, pending = deferred<ImageJobRecord>(); f.client.startImageJob.mockReturnValue(pending.promise)
  const running = f.session.run()
  if (kind === 'project') { f.edit({ ...original, script: 'New edit' }); f.edit(original) }
  if (kind === 'connection') { f.connect('different'); f.connect('original') }
  if (kind === 'detach') f.session.detach()
  pending.resolve(job()); await running
  expect(f.session.wasDetached).toBe(true); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
})
it('suppresses a late status response after a project edit', async () => {
  const f = fixture(), pending = deferred<ImageJobRecord>(); f.client.startImageJob.mockResolvedValue(job('running')); f.client.imageJobStatus.mockReturnValue(pending.promise)
  const running = f.session.run(); await vi.waitFor(() => expect(f.client.imageJobStatus).toHaveBeenCalled())
  f.edit({ ...f.project, script: 'Keep new words' }); pending.resolve(job()); await running
  expect(f.project.script).toBe('Keep new words'); expect(f.persist).not.toHaveBeenCalled()
})
it.each(['id', 'template', 'path', 'seed', 'prompt', 'negative', 'dimensions'] as const)('rejects mismatched %s before saving', async field => {
  const f = fixture(); f.client.startImageJob.mockResolvedValue(job('queued'))
  const next = job()
  if (field === 'id') next.id = 'other'
  if (field === 'template') next.templatePath = 'KINAOU/Models/ComfyUI/Workflows/other.json'
  if (field === 'path') next.imagePath = 'KINAOU/Assets/GeneratedImages/other.png'
  if (field === 'seed') next.provenance.seed = 43
  if (field === 'prompt') next.provenance.positivePrompt = 'Other'
  if (field === 'negative') next.provenance.negativePrompt = ''
  if (field === 'dimensions') next.provenance.width = 128
  f.client.imageJobStatus.mockResolvedValue(next)
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('pollFailed'); expect(f.persist).not.toHaveBeenCalled()
})
it.each(['failed', 'cancelled'] as const)('never saves a worker-confirmed %s job', async state => {
  const f = fixture(); f.client.startImageJob.mockResolvedValue(job(state)); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe(state); expect(f.session.unresolved).toBe(false); expect(f.persist).not.toHaveBeenCalled()
})
it.each(['cancelled', 'succeeded'] as const)('reports actual %s when cancellation races a late status reply', async state => {
  const f = fixture(), pending = deferred<ImageJobRecord>(); f.client.startImageJob.mockResolvedValue(job('running')); f.client.imageJobStatus.mockReturnValue(pending.promise); f.client.cancelImageJob.mockResolvedValue(job(state))
  const running = f.session.run(); await vi.waitFor(() => expect(f.client.imageJobStatus).toHaveBeenCalled())
  await f.session.cancel(); pending.resolve(job()); await running
  expect(f.states.at(-1)?.phase).toBe(state); expect(f.persist).toHaveBeenCalledTimes(state === 'succeeded' ? 1 : 0)
})
it('prevents repeated cancellation and suppresses its late response after detach', async () => {
  const f = fixture(), pending = deferred<ImageJobRecord>(); f.client.startImageJob.mockResolvedValue(job('running')); f.client.imageJobStatus.mockRejectedValue(Error('offline')); f.client.cancelImageJob.mockReturnValue(pending.promise)
  await f.session.run(); const cancel = f.session.cancel(); await f.session.cancel(); f.session.detach(); pending.resolve(job()); await cancel
  expect(f.client.cancelImageJob).toHaveBeenCalledTimes(1); expect(f.persist).not.toHaveBeenCalled()
})
it('recovers unconfirmed cancellation by checking the same accepted job', async () => {
  const f = fixture(); f.client.startImageJob.mockResolvedValue(job('queued')); f.client.imageJobStatus.mockRejectedValueOnce(Error('offline')); f.client.cancelImageJob.mockRejectedValueOnce(Error('lost cancellation'))
  await f.session.run(); await f.session.cancel(); expect(f.states.at(-1)?.phase).toBe('cancelFailed')
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('succeeded'); expect(f.client.startImageJob).toHaveBeenCalledTimes(1)
})

it.each(uiLanguages)('renders original content and all image job phases in %s', language => {
  const f = fixture()
  const render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const html = render(createElement(ImageStudioPanel, { project: f.project, history: f.history, workerUrl: 'http://127.0.0.1:1', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }))
  for (const key of ['image.help', 'image.detect', 'image.generate', 'image.negativeLabel'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('disabled=""')
  for (const phase of ['starting', 'queued', 'running', 'saving', 'succeeded', 'failed', 'cancelled', 'startFailed', 'pollFailed', 'saveFailed', 'cancelling', 'cancelFailed', 'detached'] as ImagePhase[]) {
    const status = render(createElement(ImageJobStatus, { feedback: { phase, job: job(), detail: '<script>diagnostic' }, submitted: parameters, onRetry: vi.fn(), onCancel: vi.fn(), onDetach: vi.fn() }))
    expect(status).toContain(translateUi(language, `image.${phase}`)); expect(status).toContain('Original &lt;prompt&gt;'); expect(status).toContain('&lt;script&gt;diagnostic')
    if (phase === 'saveFailed') expect(status).toContain(translateUi(language, 'audio.retrySave'))
    if (phase === 'startFailed') expect(status).not.toContain(translateUi(language, 'audio.retry'))
  }
})
