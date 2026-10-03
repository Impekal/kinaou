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
  let partial = false
  const local = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk
    const body = text ? JSON.parse(text) : null; requests.push({ url: request.url, body, authorization: request.headers.authorization })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/tags') return response.end(JSON.stringify({ models: [{ model: 'fixture-only', size: 1 }] }))
    if (request.url === '/api/show') return response.end(JSON.stringify({ model_info: { 'general.architecture': 'llama', 'llama.context_length': 32768 } }))
    if (request.url !== '/api/generate') { response.statusCode = 404; return response.end('{}') }
    if (body.prompt.includes('INPUT_JSON:\n')) {
      const input = JSON.parse(body.prompt.split('INPUT_JSON:\n')[1])
      for (const item of input.items) item.title = 'Revised language fixture'
      return response.end(JSON.stringify({ model: body.model, done: !partial, done_reason: partial ? 'length' : 'stop', prompt_eval_count: 100, eval_count: 50, response: JSON.stringify(input) }))
    }
    const context = JSON.parse(body.prompt.split('CONTEXT_JSON:\n')[1])
    response.end(JSON.stringify({ model: body.model, done: !partial, done_reason: partial ? 'length' : 'stop', prompt_eval_count: 100, eval_count: 50, response: JSON.stringify({ schemaVersion: 1, items: context.exports.map((entry: { jobId: string }) => ({ jobId: entry.jobId, title: 'Le triangle expliqué', description: 'Un exemple pédagogique.', tags: ['Football'], rationale: 'Expliquer le jeu.', sourceQuote: 'Ein Dreieck schafft drei Passwege.' })) }) }))
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
    const countBefore = requests.length
    const oversized = await fetch('http://127.0.0.1:43976/publication/editorial/generate',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer editorial-fixture-only'},body:JSON.stringify({model:'fixture-only',context:{...context,sourceText:'界'.repeat(5000)}})})
    expect(oversized.ok).toBe(false);expect(await oversized.text()).toContain('12,000');expect(requests).toHaveLength(countBefore)
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
    expect(generated[0].body.options).toMatchObject({num_ctx:32768,num_predict:4096});expect(generated[0].body.prompt).not.toContain(project.id)
    await expect(new WorkerClient({ baseUrl: 'http://127.0.0.1:43976', token: 'wrong' }).translatePublicationEditorial('fixture-only', context, result.proposal)).rejects.toThrow()
    await expect(client.translatePublicationEditorial('not-installed', context, result.proposal)).rejects.toThrow()
    const translated = await client.translatePublicationEditorial('fixture-only', context, result.proposal) as { proposal: { items: Array<{ title: string; sourceQuote: string }> }; outputLanguage: string; modelId: string; adapterId: 'ollama' }
    expect(translated.outputLanguage).toBe(context.outputLanguage); expect(translated.modelId).toBe('fixture-only')
    expect(translated.proposal.items[0].title).toBe('Revised language fixture'); expect(translated.proposal.items[0].sourceQuote).toBe(project.script)
    const languageRequest = requests.filter(request => request.url === '/api/generate')[1]
    expect(languageRequest.authorization).toBeUndefined(); expect(languageRequest.body.prompt).not.toContain(project.script)
    const revised = applyPublicationEditorial(next, reviewPublicationEditorial(next, context, translated.proposal, { kind: 'local-model', modelId: result.modelId, adapterId: 'ollama', edited: true, languagePass: { modelId: translated.modelId, adapterId: 'ollama', outputLanguage: context.outputLanguage } }), true)
    expect(projectPublicationEditorial(parseProject(JSON.parse(JSON.stringify(revised))))!.provenance.languagePass!.modelId).toBe('fixture-only')
    expect(JSON.stringify(project)).toBe(before)
    partial=true
    await expect(client.generatePublicationEditorial('fixture-only',context)).rejects.toThrow('complete normally')
    await expect(client.translatePublicationEditorial('fixture-only',context,result.proposal)).rejects.toThrow('complete normally')
  } finally {
    worker?.kill('SIGKILL'); if (worker && worker.exitCode === null && worker.signalCode === null) await new Promise<void>(done => { worker!.once('close', () => done()); setTimeout(done, 3000).unref() })
    local.closeAllConnections(); await new Promise<void>(done => local.close(() => done())); await rm(temp, { recursive: true, force: true })
  }
}, 30000)
