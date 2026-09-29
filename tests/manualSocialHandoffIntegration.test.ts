import { it, expect } from 'vitest'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, stat, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { createProject } from '../src/core/project'
import { exportReceiptSchema } from '../src/core/exportHistory'
import { buildPublishPackageRequest } from '../src/core/publishPackage'
import { WorkerClient } from '../src/core/workerClient'
import { ManualSocialHandoffSession } from '../src/core/manualSocialHandoff'

const exec = promisify(execFile)
it('hands off an actual generic MP4 package locally, detects modified/missing bytes and never publishes', async context => {
  try { await exec('ffmpeg', ['-version']); await exec('ffprobe', ['-version']) }
  catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required'); return }
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-social-handoff-')), root = path.join(temp, 'KINAOU')
  let worker: ChildProcess | undefined
  try {
    await mkdir(path.join(root, 'Renders'), { recursive: true })
    const sourcePath = 'KINAOU/Renders/social.mp4', file = path.join(temp, sourcePath)
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:size=1920x1080:rate=25:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file])
    const original = await readFile(file), sha = createHash('sha256').update(original).digest('hex')
    const project = createProject('Synthetic manual social handoff'), before = JSON.stringify(project)
    const receipt = exportReceiptSchema.parse({ schemaVersion: 1, jobId: 'social-fixture', label: 'Synthetic blue video',
      outputRelativePath: sourcePath, format: 'landscape', range: { inMs: 0, outMs: 1000 }, sceneIds: [],
      durationMs: 1000, sizeBytes: (await stat(file)).size, completedAt: new Date().toISOString() })
    worker = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH,
      KINAOU_MANAGED_ROOT: root, KINAOU_WORKER_TOKEN: 'social-test-only', KINAOU_WORKER_PORT: '43974' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''; worker.stdout!.on('data', value => { logs += value }); worker.stderr!.on('data', value => { logs += value })
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43974')) {
      if (worker.exitCode !== null || Date.now() > deadline) throw Error(logs)
      await new Promise(done => setTimeout(done, 30))
    }
    const calls: string[] = []
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43974', token: 'social-test-only', fetchImpl: async (url, options) => {
      calls.push(`${options?.method ?? 'GET'} ${String(url)}`)
      return fetch(url, options)
    } })
    const created = await client.createPublishPackage(buildPublishPackageRequest(project, receipt,
      { platform: 'generic', title: 'Bonjour — Hallo', description: 'Historical caption 🌍', tags: 'Local AI, Fußball' }))
    expect(created.schemaVersion).toBe(3); expect(created.sourceSha256).toBe(sha)
    const packageBytes = await readFile(path.join(temp, created.path))
    calls.length = 0
    for (const destination of ['facebook', 'threads'] as const) {
      const session = new ManualSocialHandoffSession(project.id, destination, client)
      expect(await session.list()).toHaveLength(1)
      expect(await session.verify(created.path)).toMatchObject({ destination, sourcePath, sha256: sha, caption: 'Bonjour — Hallo\n\nHistorical caption 🌍', tags: ['Local AI', 'Fußball'] })
    }
    const session = new ManualSocialHandoffSession(project.id, 'threads', client)
    await session.list()
    const changed = Buffer.from(original); changed[changed.length - 1] ^= 1
    await writeFile(file, changed)
    await expect(session.verify(created.path)).rejects.toThrow('evidence mismatch')
    await writeFile(file, original)
    expect((await session.verify(created.path))?.sha256).toBe(sha)
    await rm(file)
    await expect(session.verify(created.path)).rejects.toThrow('evidence mismatch')
    expect(await session.list()).toHaveLength(0)
    expect(calls.every(call => call.startsWith('GET http://127.0.0.1:43974/publish/packages?') || call === 'POST http://127.0.0.1:43974/publish/packages/integrity')).toBe(true)
    expect(await readFile(path.join(temp, created.path))).toEqual(packageBytes)
    expect(JSON.stringify(project)).toBe(before)
  } finally {
    worker?.kill('SIGKILL')
    if (worker && worker.exitCode === null && worker.signalCode === null) await new Promise<void>(done => { worker!.once('close', () => done()); setTimeout(done, 3000).unref() })
    await rm(temp, { recursive: true, force: true })
  }
}, 60000)
