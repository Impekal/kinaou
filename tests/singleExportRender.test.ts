import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, projectFormatPreset } from '../src/core/render'
import { recordSuccessfulExport, projectExportHistory, forgetExportReceipt } from '../src/core/exportHistory'
import { ExportFileCheckSession, type ExportCheckFeedback } from '../src/core/exportFileCheck'
import { SingleExportSession, type ExportFeedback } from '../src/core/singleExportSession'
import { WorkerClient } from '../src/core/workerClient'

const exec = promisify(execFile)
const run = async (program: string, args: string[]) => (await exec(program, args, { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout

it('executes independent single export sessions with real full-resolution frames and receipts while retaining later edits', async (context) => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) }
  catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required for preview verification'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-single-export-'))
  const managed = path.join(root, 'KINAOU')
  await mkdir(path.join(managed, 'Assets'), { recursive: true })
  const child = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managed, KINAOU_WORKER_TOKEN: 'single-export-test', KINAOU_WORKER_PORT: '43943' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (data) => { logs += data }); child.stderr.on('data', (data) => { logs += data })
  try {
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=160x90:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=blue:size=160x90:rate=30:duration=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', path.join(managed, 'Assets/source.mp4')])
    const source = await readFile(path.join(managed, 'Assets/source.mp4'))
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43943')) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(logs)
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    const project = parseProject({ ...createProject('Preview session fixture'), assets: [{ id: 'video', kind: 'video', uri: 'KINAOU/Assets/source.mp4', managed: true, metadata: { durationMs: 2000 } }], tracks: [{ id: 'main', type: 'video', name: 'Original video', clips: [{ id: 'clip', assetId: 'video', startMs: 0, durationMs: 1000 }] }] })
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43943', token: 'single-export-test' })
    const paths = ['KINAOU/Renders/first.mp4', 'KINAOU/Renders/second.mp4']
    const plans = [createRenderPlan(project, projectFormatPreset(project, 'landscape', 'export'), paths[0])]
    project.tracks[0].clips[0].sourceOffsetMs = 1000
    plans.push(createRenderPlan(project, projectFormatPreset(project, 'landscape', 'export'), paths[1]))
    let latest = { ...project, title: 'Later title', script: 'Preserve later editing' }
    const states: ExportFeedback[][] = [[], []]
    await Promise.all(plans.map((plan, index) => new SingleExportSession(plan, {
      label: index === 0 ? 'Original red' : 'Original blue', outputRelativePath: paths[index], format: 'landscape', range: { inMs: 0, outMs: 1000 }, sceneIds: [], durationMs: 1000
    }, { client, current: () => Date.now() < deadline + 30000, record: receipt => { latest = recordSuccessfulExport(latest, receipt) }, publish: state => states[index].push(state), wait: () => new Promise(resolve => setTimeout(resolve, 50)) }).run()))
    expect(latest.title).toBe('Later title'); expect(latest.script).toBe('Preserve later editing')
    expect(projectExportHistory(latest)).toHaveLength(2)
    for (const [index, channel] of [[0, 0], [1, 2]]) {
      expect(states[index].at(-1)?.phase, JSON.stringify(states[index])).toBe('succeeded')
      const file = path.join(root, paths[index])
      const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).toString())
      expect(Math.abs(Number(probe.format.duration) - 1)).toBeLessThan(0.08)
      expect(probe.streams[0].width).toBe(1920); expect(probe.streams[0].height).toBe(1080)
      const rgb = await run('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', file, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
      expect(rgb[channel]).toBeGreaterThan(200)
      expect(rgb[channel === 0 ? 2 : 0]).toBeLessThan(30)
      expect(projectExportHistory(latest).find(receipt => receipt.outputRelativePath === paths[index])?.label).toBe(index === 0 ? 'Original red' : 'Original blue')
    }
    expect(await readFile(path.join(managed, 'Assets/source.mp4'))).toEqual(source)
    const before = await Promise.all(paths.map(file => readFile(path.join(root, file))))
    const checks: ExportCheckFeedback[] = []
    await new ExportFileCheckSession([...paths, paths[0], 'KINAOU/Renders/absent.mp4'], { client, current: () => true, publish: state => checks.push(state) }).run()
    expect(checks.at(-1)).toMatchObject({ phase: 'checked', result: { available: 2, missing: 1, byPath: { [paths[0]]: true, [paths[1]]: true, 'KINAOU/Renders/absent.mp4': false } } })
    latest = forgetExportReceipt(latest, projectExportHistory(latest)[0].jobId)
    expect(projectExportHistory(latest)).toHaveLength(1)
    expect(await Promise.all(paths.map(file => readFile(path.join(root, file))))).toEqual(before)
  } finally {
    child.kill('SIGKILL')
    await new Promise<void>((resolve) => { child.on('close', () => resolve()); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
