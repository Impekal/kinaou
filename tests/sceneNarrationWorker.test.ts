import { expect, it } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WorkerClient } from '../src/core/workerClient'
import { createProject, parseProject } from '../src/core/project'
import { SceneNarrationSession, type NarrationFeedback } from '../src/core/sceneNarrationSession'
import { AudioStudioSession, type AudioFeedback } from '../src/core/audioStudioSession'
import { PersistentVersionHistory } from '../src/core/versioning'
import { ProjectRepository } from '../src/core/persistence'

it('executes the narration session through the authenticated real worker using a clearly synthetic tone CLI fixture', async () => {
  // Contract/execution evidence only: this is not Piper inference or a speech-quality test.
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'kinaou-narration-contract-'))
  const root = path.join(temporary, 'KINAOU')
  await mkdir(path.join(root, 'Models'), { recursive: true })
  await writeFile(path.join(root, 'Models', 'fixture.onnx'), 'TEST ONLY - NO MODEL')
  await writeFile(path.join(root, 'Models', 'fixture.onnx.json'), '{"language":{"code":"de_DE"}}')
  const cli = path.join(temporary, 'tone-fixture.mjs')
  await writeFile(cli, `#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
const output=args[args.indexOf('-f')+1], text=args[args.indexOf('--input-file')+1];
writeFileSync(output+'.text', readFileSync(text));
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','pcm_s16le',output]);
`)
  await chmod(cli, 0o700)
  const worker = spawn(process.execPath, ['worker/mac-worker.mjs'], { env: { ...process.env, KINAOU_MANAGED_ROOT: root, KINAOU_WORKER_PORT: '43941', KINAOU_WORKER_TOKEN: 'narration-contract', KINAOU_PIPER_CLI: cli }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  worker.stdout.on('data', chunk => { logs += chunk })
  worker.stderr.on('data', chunk => { logs += chunk })
  try {
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43941')) {
      if (worker.exitCode !== null || Date.now() > deadline) throw new Error(logs)
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43941', token: 'narration-contract' })
    expect(await client.listTtsVoiceDetails()).toEqual([{ path: 'KINAOU/Models/fixture.onnx', locale: 'de-DE' }])
    let project = parseProject({ ...createProject('Contract fixture'), assets: [{ id: 'image', kind: 'image', uri: 'KINAOU/Assets/not-rendered.png', managed: true }],
      storyboard: [{ id: 'scene', title: 'Original', description: 'Not spoken', narration: 'Guten Tag. Bonjour. Hello.', durationMs: 1000, assetId: 'image' }],
      tracks: [{ id: 'visual', name: 'Visual', type: 'video', clips: [{ id: 'clip', assetId: 'image', sceneId: 'scene', startMs: 3000, durationMs: 1000 }] }, { id: 'voice', name: 'Voice', type: 'voice', clips: [] }] })
    const states: NarrationFeedback[] = []
    let snapshots = 0
    const session = new SceneNarrationSession(project, 'visual', 'voice', 'KINAOU/Models/fixture.onnx', { client, current: expected => expected === project, snapshot: () => { snapshots++ }, persist: next => { project = next }, publish: state => states.push(state), wait: () => new Promise(resolve => setTimeout(resolve, 30)) })
    await session.run()
    expect(states.at(-1)).toMatchObject({ phase: 'complete', done: [{ narrationMs: 2000, overrunMs: 1000 }] })
    expect(snapshots).toBe(1)
    const audio = project.assets.find(asset => asset.kind === 'audio')!
    const absolute = path.join(temporary, audio.uri)
    expect(await readFile(absolute + '.text', 'utf8')).toBe('Guten Tag. Bonjour. Hello.')
    expect(project.tracks[1].clips[0]).toMatchObject({ startMs: 3000, durationMs: 2000 })
    const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', absolute], { encoding: 'utf8' }))
    expect(duration).toBe(2)
    const original = await readFile(absolute)
    const repeated: NarrationFeedback[] = []
    await new SceneNarrationSession(project, 'visual', 'voice', 'KINAOU/Models/fixture.onnx', { client, current: expected => expected === project, snapshot: () => { snapshots++ }, persist: next => { project = next }, publish: state => repeated.push(state) }).run()
    expect(repeated.at(-1)).toMatchObject({ phase: 'complete', done: [], skipped: [{ code: 'existing' }] })
    expect(snapshots).toBe(1); expect(await readFile(absolute)).toEqual(original)

    // Exercise Audio Studio against the same real worker/CLI contract, including save-only recovery.
    const data = new Map<string, string>()
    const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
    const repository = new ProjectRepository(store), history = new PersistentVersionHistory(store)
    let standalone = repository.save(createProject('Audio Studio contract')), starts = 0, failSave = true
    const audioStates: AudioFeedback[] = []
    const audioSession = new AudioStudioSession(standalone, 'test', 'Original standalone narration.', 'KINAOU/Models/fixture.onnx', {
      client: { startTts: async (text, voice) => { starts++; return client.startTts(text, voice) }, ttsStatus: id => client.ttsStatus(id), cancelTts: id => client.cancelTts(id) },
      environment: () => ({ project: standalone, connection: 'test' }),
      snapshot: value => { history.snapshot(value, 'Before saving voice', 'system') },
      persist: value => { if (failSave) throw Error('Explicit test-only project write failure'); standalone = repository.save(value) },
      publish: value => audioStates.push(value), wait: () => new Promise(resolve => setTimeout(resolve, 30))
    })
    await audioSession.run()
    expect(audioStates.at(-1)?.phase).toBe('saveFailed')
    expect(standalone.assets).toHaveLength(0)
    const generatedPath = path.join(temporary, audioStates.at(-1)!.job!.audioPath!)
    const generatedBytes = await readFile(generatedPath)
    expect(await readFile(generatedPath + '.text', 'utf8')).toBe('Original standalone narration.')
    failSave = false; await audioSession.run(); await audioSession.run()
    expect(starts).toBe(1); expect(audioStates.at(-1)?.phase).toBe('succeeded')
    expect(repository.load(standalone.id)?.assets[0].metadata).toMatchObject({ durationMs: 2000, sourceText: 'Original standalone narration.', adapterId: 'piper' })
    expect(history.list(standalone.id)).toHaveLength(1)
    expect(history.restoreReversibly(standalone, history.list(standalone.id)[0].id).project.assets).toHaveLength(0)
    expect(await readFile(generatedPath)).toEqual(generatedBytes); expect(await readFile(absolute)).toEqual(original)
  } finally {
    worker.kill('SIGTERM')
    await new Promise<void>(resolve => { if (worker.exitCode !== null) resolve(); else worker.once('close', () => resolve()) })
    await rm(temporary, { recursive: true, force: true })
  }
}, 30000)
