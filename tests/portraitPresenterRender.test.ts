import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assetSchema, createProject } from '../src/core/project'
import { appendPortraitPresenter } from '../src/core/portraitPresenter'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'

const exec = promisify(execFile)
const run = async (program: string, args: string[]) => (await exec(program, args, { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout

it('renders a voiced still through the real worker in export and portrait preview, with audible full-length audio', async (context) => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) }
  catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required for real-media verification'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-presenter-render-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true })
  const child = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], {
    env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managedRoot, KINAOU_WORKER_TOKEN: 'presenter-test', KINAOU_WORKER_PORT: '43934' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (data) => { output += data }); child.stderr.on('data', (data) => { output += data })
  try {
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=160x240', '-frames:v', '1', '-threads', '1', path.join(managedRoot, 'Assets', 'portrait.png')])
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', path.join(managedRoot, 'Assets', 'voice.wav')])
    const deadline = Date.now() + 15000
    while (!output.includes('listening on http://127.0.0.1:43934')) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Worker start failed: ${output}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const project = appendPortraitPresenter({ ...createProject('Presenter fixture'), assets: [
      assetSchema.parse({ id: 'portrait', kind: 'image', uri: 'KINAOU/Assets/portrait.png', managed: true }),
      assetSchema.parse({ id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, metadata: { durationMs: 1200 } })
    ] }, { name: 'Fixture', portraitAssetId: 'portrait', narrationAssetId: 'voice' })
    for (const [relative, width, height] of [['KINAOU/Renders/presenter.mp4', 320, 180], ['KINAOU/Cache/Previews/presenter.mp4', 180, 320]] as const) {
      const plan = createRenderPlan(project, { ...preview1080pPreset, width, height, fit: 'contain' }, relative)
      const started = await fetch('http://127.0.0.1:43934/render', { method: 'POST', headers: { authorization: 'Bearer presenter-test', 'content-type': 'application/json' }, body: JSON.stringify({ plan }) })
      const payload = await started.json()
      expect(payload.ok).toBe(true)
      let job = payload.job
      for (let attempt = 0; attempt < 200 && ['queued', 'running'].includes(job.state); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        job = (await (await fetch(`http://127.0.0.1:43934/render/jobs/${job.id}`, { headers: { authorization: 'Bearer presenter-test' } })).json()).job
      }
      expect(job.state, job.error).toBe('succeeded')
      const rendered = path.join(root, relative)
      const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', rendered])).toString())
      expect(Math.abs(Number(probe.format.duration) - 1.2)).toBeLessThan(0.08)
      expect(probe.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video')).toMatchObject({ width, height })
      const rgb = await run('ffmpeg', ['-v', 'error', '-ss', '1', '-i', rendered, '-vf', 'crop=2:2,scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
      expect(rgb[0]).toBeGreaterThan(200); expect(rgb[1]).toBeLessThan(30); expect(rgb[2]).toBeLessThan(30)
      const pcm = await run('ffmpeg', ['-v', 'error', '-ss', '0.9', '-i', rendered, '-t', '0.2', '-vn', '-ac', '1', '-f', 's16le', '-'])
      let peak = 0
      for (let index = 0; index + 1 < pcm.length; index += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(index)))
      expect(peak).toBeGreaterThan(1000)
    }
  } finally {
    child.kill('SIGKILL')
    await new Promise<void>((resolve) => { child.on('close', () => resolve()); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
