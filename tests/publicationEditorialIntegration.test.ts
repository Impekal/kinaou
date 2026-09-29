import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WorkerClient } from '../src/core/workerClient'
import { createProject, parseProject } from '../src/core/project'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { applyPublicationPlan, reviewPublicationPlan } from '../src/core/publicationPlan'
import { applyPublicationEditorial, projectPublicationEditorial, publicationEditorialContext, reviewPublicationEditorial } from '../src/core/publicationEditorial'
it('executes authenticated worker → local structured-model protocol → bound review → persisted editorial copy without publishing', async () => {
  const requests: Array<{ url?: string; body: any; authorization?: string }> = []
  const local = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk
    const body = text ? JSON.parse(text) : null; requests.push({ url: request.url, body, authorization: request.headers.authorization })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/tags') return response.end(JSON.stringify({ models: [{ model: 'fixture-only', size: 1 }] }))
    if (request.url === '/api/show') return response.end(JSON.stringify({ model_info: { 'general.architecture': 'llama' } }))
    if (request.url !== '/api/generate') { response.statusCode = 404; return response.end('{}') }
    const context = JSON.parse(body.prompt.split('CONTEXT_JSON:\n')[1])
    response.end(JSON.stringify({ response: JSON.stringify({ schemaVersion: 1, items: context.exports.map((entry: { jobId: string }) => ({ jobId: entry.jobId, title: 'Le triangle expliqué', description: 'Un exemple pédagogique.', tags: ['Football'], rationale: 'Expliquer le jeu.', sourceQuote: 'Ein Dreieck schafft drei Passwege.' })) }) }))
  })
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-editorial-route-')); let worker: ChildProcess | undefined
  try {
    await mkdir(path.join(temp, 'KINAOU'))
    await new Promise<void>(done => local.listen(43975, '127.0.0.1', done))
    worker = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: path.join(temp, 'KINAOU'), KINAOU_WORKER_TOKEN: 'editorial-fixture-only', KINAOU_WORKER_PORT: '43976', KINAOU_OLLAMA_URL: 'http://127.0.0.1:43975' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''; worker.stdout!.on('data', value => { logs += value }); worker.stderr!.on('data', value => { logs += value }); const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43976')) { if (worker.exitCode !== null || Date.now() > deadline) throw Error(logs); await new Promise(done => setTimeout(done, 30)) }
    let project = createProject('Editorial fixture'); project.script = 'Ein Dreieck schafft drei Passwege.'
    const now = new Date('2026-09-29T00:00:00Z')
    for (const [jobId, format] of [['main', 'landscape'], ['short', 'vertical']] as const) project = recordSuccessfulExport(project, { jobId, label: jobId, format, outputRelativePath: 'KINAOU/Renders/' + jobId + '.mp4', range: { inMs: 0, outMs: 1000 }, durationMs: 1000, sceneIds: [], completedAt: now.toISOString() })
    project = applyPublicationPlan(project, reviewPublicationPlan(project, { mainJobId: 'main', shorts: [{ jobId: 'short', offsetHours: 24 }], mainLocal: '2026-10-24T18:00', timeZone: 'Europe/Paris', targetMarket: 'FR', rationale: 'Authored test' }, now), true, now)
    const context = publicationEditorialContext(project), before = JSON.stringify(project)
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43976', token: 'editorial-fixture-only' })
    await expect(new WorkerClient({ baseUrl: 'http://127.0.0.1:43976', token: 'wrong' }).generatePublicationEditorial('fixture-only', context)).rejects.toThrow()
    await expect(client.generatePublicationEditorial('not-installed', context)).rejects.toThrow()
    const result = await client.generatePublicationEditorial('fixture-only', context) as { proposal: unknown; modelId: string; adapterId: 'ollama' }
    expect(result.modelId).toBe('fixture-only')
    const next = applyPublicationEditorial(project, reviewPublicationEditorial(project, context, result.proposal, { kind: 'local-model', modelId: result.modelId, adapterId: result.adapterId, edited: false }), true)
    expect(projectPublicationEditorial(parseProject(JSON.parse(JSON.stringify(next))))!.proposal.items).toHaveLength(2)
    expect(JSON.stringify(project)).toBe(before)
    const generated = requests.filter(request => request.url === '/api/generate'); expect(generated).toHaveLength(1)
    expect(requests.every(request => ['/api/tags', '/api/show', '/api/generate'].includes(request.url!))).toBe(true)
    expect(requests.find(request => request.url === '/api/show')?.body).toEqual({ model: 'fixture-only', verbose: false })
    expect(generated[0].authorization).toBeUndefined(); expect(generated[0].body.prompt).not.toContain('editorial-fixture-only')
    expect(generated[0].body.prompt).toContain('not a transcript proven to belong to each export')
  } finally {
    worker?.kill('SIGKILL'); if (worker && worker.exitCode === null && worker.signalCode === null) await new Promise<void>(done => { worker!.once('close', () => done()); setTimeout(done, 3000).unref() })
    local.closeAllConnections(); await new Promise<void>(done => local.close(() => done())); await rm(temp, { recursive: true, force: true })
  }
}, 30000)
