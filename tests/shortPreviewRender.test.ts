import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { createRangeRenderPlan } from '../src/core/renderRange'
import { freshPreviewPlan } from '../src/core/previewSession'
import { ShortPreviewSession, type ShortPreviewFeedback } from '../src/core/shortPreviewSession'
import { WorkerClient } from '../src/core/workerClient'

const exec = promisify(execFile)
const run = async (program: string, args: string[]) => (await exec(program, args, { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout

it('executes two isolated Short range previews with exact frames, authentic files and unchanged sources', async (context) => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) }
  catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required for preview verification'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-short-preview-'))
  const managed = path.join(root, 'KINAOU')
  await mkdir(path.join(managed, 'Assets'), { recursive: true })
  const child = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managed, KINAOU_WORKER_TOKEN: 'short-preview-test', KINAOU_WORKER_PORT: '43946' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (data) => { logs += data }); child.stderr.on('data', (data) => { logs += data })
  try {
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=160x90:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=blue:size=160x90:rate=30:duration=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', path.join(managed, 'Assets/source.mp4')])
    const source = await readFile(path.join(managed, 'Assets/source.mp4'))
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43946')) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(logs)
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    const project = parseProject({ ...createProject('Preview session fixture'), assets: [{ id: 'video', kind: 'video', uri: 'KINAOU/Assets/source.mp4', managed: true, metadata: { durationMs: 2000 } }], tracks: [{ id: 'main', type: 'video', name: 'Original video', clips: [{ id: 'clip', assetId: 'video', startMs: 0, durationMs: 2000 }] }] })
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43946', token: 'short-preview-test' })
    const full = createRenderPlan(project, formatProfiles.vertical.preview, 'KINAOU/Cache/Previews/short.mp4')
    const plans = [0, 1000].map(inMs => freshPreviewPlan(createRangeRenderPlan(full, { inMs, outMs: inMs + 1000 }, full.outputRelativePath)))
    const states: ShortPreviewFeedback[][] = [[], []], blobs: Blob[] = []
    await Promise.all(plans.map((plan, index) => new ShortPreviewSession(plan, { client, publish: state => states[index].push(state), accept: blob => { blobs[index] = blob }, wait: () => new Promise(resolve => setTimeout(resolve, 50)) }).run()))
    for (const [index, channel] of [[0, 0], [1, 2]]) {
      expect(states[index].at(-1)?.phase, JSON.stringify(states[index])).toBe('ready')
      const file = path.join(root, plans[index].outputRelativePath)
      expect(Buffer.from(await blobs[index].arrayBuffer())).toEqual(await readFile(file))
      const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).toString())
      expect(Math.abs(Number(probe.format.duration) - 1)).toBeLessThan(0.08)
      expect(probe.streams[0].width).toBe(540); expect(probe.streams[0].height).toBe(960)
      const rgb = await run('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', file, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
      expect(rgb[channel]).toBeGreaterThan(200)
      expect(rgb[channel === 0 ? 2 : 0]).toBeLessThan(30)
    }
    expect(await readFile(path.join(managed, 'Assets/source.mp4'))).toEqual(source)
  } finally {
    child.kill('SIGKILL')
    await new Promise<void>((resolve) => { child.on('close', () => resolve()); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
