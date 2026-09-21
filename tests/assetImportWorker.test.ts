import { expect, it } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AssetImportSession, type AssetImportFeedback } from '../src/core/assetImportSession'
import { AssetAvailabilitySession, type AvailabilityFeedback } from '../src/core/assetAvailabilitySession'
import { WorkerClient } from '../src/core/workerClient'
import { createProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30))
it('imports a real explicit WAV through the authenticated worker and retries only the project save', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-import-contract-')), source = path.join(root, 'original.wav')
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<void> | undefined
  try {
    // Synthetic signal, not a real voice, user media or speech-quality sample.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', source])
    const bytes = await readFile(source), file = new File([bytes], 'Original recording.wav', { type: 'audio/wav' })
    await mkdir(path.join(root, 'KINAOU'))
    child = spawn(process.execPath, ['worker/mac-worker.mjs'], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: path.join(root, 'KINAOU'), KINAOU_WORKER_PORT: '43959', KINAOU_WORKER_TOKEN: 'import-contract' }, stdio: ['ignore', 'pipe', 'pipe'] })
    closed = new Promise(resolve => child!.once('close', () => resolve()))
    let logs = ''; child.stdout!.on('data', chunk => { logs += chunk }); child.stderr!.on('data', chunk => { logs += chunk })
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43959')) { if (child.exitCode !== null || Date.now() > deadline) throw Error(logs); await pause() }
    let uploads = 0, probes = 0
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43959', token: 'import-contract', fetchImpl: async (input, init) => {
      if (String(input).endsWith('/assets/import')) uploads++
      if (String(input).endsWith('/probe')) probes++
      return fetch(input, init)
    } })
    const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
    const repository = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
    let project = repository.save(createProject('Import execution')), fail = true
    const states: AssetImportFeedback[] = []
    const session = new AssetImportSession(project, 'test', file, 'audio', { client, environment: () => ({ project, connection: 'test' }), snapshot: value => { history.snapshot(value, 'Before import', 'system') }, persist: value => { if (fail) throw Error('Explicit storage failure'); project = repository.save(value) }, publish: value => states.push(value) })
    await session.run(); expect(states.at(-1)?.phase, JSON.stringify(states)).toBe('saveFailed'); expect(project.assets).toHaveLength(0)
    const copy = path.join(root, states.at(-1)!.path!)
    expect(await readFile(copy)).toEqual(bytes)
    fail = false; await session.run(); await session.run()
    expect(states.at(-1)?.phase).toBe('succeeded'); expect(uploads).toBe(1); expect(probes).toBe(1)
    expect(repository.load(project.id)?.assets[0].metadata).toMatchObject({ name: file.name, durationMs: 1000, sizeBytes: bytes.length, mimeType: file.type })
    const checks: AvailabilityFeedback[] = []
    const check = () => new AssetAvailabilitySession(project, 'test', { client, environment: () => ({ project, connection: 'test' }), snapshot: value => { history.snapshot(value, 'Before file check', 'system') }, persist: value => { project = repository.save(value) }, publish: value => checks.push(value) }).run()
    await rename(copy, copy + '.temporarily-away')
    await check(); expect(checks.at(-1)?.summary?.wentOffline).toBe(1); expect(repository.load(project.id)?.assets[0].offline).toBe(true)
    await rename(copy + '.temporarily-away', copy)
    await check(); expect(checks.at(-1)?.summary?.cameOnline).toBe(1); expect(repository.load(project.id)?.assets[0].offline).toBe(false)
    expect(history.restoreReversibly(project, history.list(project.id)[0].id).project.assets).toHaveLength(0)
    expect(await readFile(source)).toEqual(bytes); expect(await readFile(copy)).toEqual(bytes)
  } finally {
    if (child) { child.kill('SIGTERM'); await closed }
    await rm(root, { recursive: true, force: true })
  }
}, 30000)
