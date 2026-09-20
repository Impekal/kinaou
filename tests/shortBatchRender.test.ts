import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { WorkerClient } from '../src/core/workerClient'
import { ShortBatchJobMonitor } from '../src/core/shortBatchJobMonitor'
import { persistShortBatchReceipts } from '../src/core/shortBatchReceipts'
import { forgetExportReceipt, projectExportHistory } from '../src/core/exportHistory'
import { acceptShortBatchJob, archiveProjectShortBatch, createPersistedShortBatch, projectPersistedShortBatch, projectShortBatchArchive, rebuildPersistedShortBatchPlans, replacePersistedShortBatchItems, storeProjectShortBatch } from '../src/core/shortExportBatch'

const exec = promisify(execFile)
it('persists a real worker absolute-path result as a portable terminal Short receipt across reload and archive', async context => {
  try { await exec('ffmpeg', ['-version']); await exec('ffprobe', ['-version']) }
  catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-short-receipt-'))
  const managed = path.join(root, 'KINAOU')
  await mkdir(path.join(managed, 'Assets'), { recursive: true })
  const child = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managed, KINAOU_WORKER_TOKEN: 'short-receipt-test', KINAOU_WORKER_PORT: '43945' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', data => { logs += data }); child.stderr.on('data', data => { logs += data })
  try {
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:size=160x90:rate=30:duration=1', '-pix_fmt', 'yuv420p', path.join(managed, 'Assets/source.mp4')])
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43945')) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(logs)
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    const project = parseProject({ ...createProject('Short receipt'), assets: [{ id: 'v', kind: 'video', uri: 'KINAOU/Assets/source.mp4', managed: true }], tracks: [{ id: 'v', type: 'video', name: 'Video', clips: [{ id: 'c', assetId: 'v', startMs: 0, durationMs: 1000 }] }] })
    const outputPath = 'KINAOU/Renders/short.mp4'
    const plan = createRenderPlan(project, formatProfiles.landscape.export, outputPath)
    const batch = createPersistedShortBatch([{ id: 'short:landscape', title: 'Original', sceneIds: [], format: 'landscape', inMs: 0, outMs: 1000, durationMs: 1000, outputPath, state: 'queued', progress: 0 }], new Map([['short:landscape', plan]]))
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43945', token: 'short-receipt-test' })
    let job = await client.startRender(plan)
    let item = acceptShortBatchJob(batch.items[0], job)
    const errors: string[] = [], renderDeadline = Date.now() + 15000
    const monitor = new ShortBatchJobMonitor(item, {
      client: {
        renderStatus: async id => { job = await client.renderStatus(id); return job },
        cancelRender: id => client.cancelRender(id),
        exportAvailability: paths => client.exportAvailability(paths)
      },
      publish: result => {
        item = result
        expect(projectPersistedShortBatch(storeProjectShortBatch(project, replacePersistedShortBatchItems(batch, [item])))?.items[0]).toEqual(item)
      },
      error: message => { errors.push(message) },
      notice: () => { throw new Error('A live real-worker job must not require missing-job recovery') },
      onCancelling: () => {},
      wait: async () => {
        if (Date.now() > renderDeadline) monitor.detach()
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    })
    await monitor.run()
    expect(errors).toEqual([])
    expect(job.state, job.error).toBe('succeeded')
    expect(path.isAbsolute(job.outputPath!)).toBe(true)
    expect(item.renderedPath).toBe(outputPath)
    const reloaded = parseProject(JSON.parse(JSON.stringify(storeProjectShortBatch(project, replacePersistedShortBatchItems(batch, [item])))))
    const terminal = projectPersistedShortBatch(reloaded)!
    expect(terminal.items[0].state).toBe('succeeded')
    expect(rebuildPersistedShortBatchPlans(reloaded, terminal).size).toBe(0)
    expect(projectShortBatchArchive(archiveProjectShortBatch(reloaded, terminal))[0].items[0].outputPath).toBe(outputPath)
    const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(root, outputPath)])).stdout)
    expect(Number(probe.format.duration)).toBeCloseTo(1, 1)
    expect(probe.streams[0].width).toBe(1920)
    const bytes = await readFile(path.join(root, outputPath))
    let withReceipts = reloaded
    persistShortBatchReceipts(withReceipts, terminal.id, terminal.items, project => { withReceipts = project })
    expect(projectExportHistory(withReceipts)[0].outputRelativePath).toBe(outputPath)
    withReceipts = parseProject(JSON.parse(JSON.stringify(forgetExportReceipt(withReceipts, job.id))))
    persistShortBatchReceipts(withReceipts, terminal.id, terminal.items, () => { throw new Error('A forgotten acknowledged receipt must not be reinserted') })
    expect(projectExportHistory(withReceipts)).toEqual([])
    expect(await readFile(path.join(root, outputPath))).toEqual(bytes)
  } finally {
    child.kill('SIGKILL')
    await new Promise<void>(resolve => { child.on('close', () => resolve()); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
