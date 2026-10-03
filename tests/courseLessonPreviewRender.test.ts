import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { createCourseLessonPreview } from '../src/core/courseLessonPreview'
import { freshPreviewPlan } from '../src/core/previewSession'
import { ShortPreviewSession, type ShortPreviewFeedback } from '../src/core/shortPreviewSession'
import { WorkerClient } from '../src/core/workerClient'
import { projectCourseOutputIndex, projectExportHistory } from '../src/core/exportHistory'
import { defaultAudioDucking } from '../src/core/audioDucking'
import { defaultLoudnessNormalization } from '../src/core/audioLoudness'

const exec = promisify(execFile)
const run = async (program: string, args: string[]) => (await exec(program, args, { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout
it('renders distinct exact lesson previews through the real worker with retimed frames/audio and no export receipts', async context => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) }
  catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required for lesson preview verification'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-lesson-preview-')), managed = path.join(root, 'KINAOU')
  await mkdir(path.join(managed, 'Assets'), { recursive: true })
  const child = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managed, KINAOU_WORKER_TOKEN: 'lesson-preview-test', KINAOU_WORKER_PORT: '43990' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''; child.stdout.on('data', data => { logs += data }); child.stderr.on('data', data => { logs += data })
  try {
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=160x90:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=blue:size=160x90:rate=30:duration=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', path.join(managed, 'Assets/video.mp4')])
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(managed, 'Assets/voice.wav')])
    const originals = await Promise.all(['video.mp4', 'voice.wav'].map(name => readFile(path.join(managed, 'Assets', name))))
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43990')) { if (child.exitCode !== null || Date.now() > deadline) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 30)) }
    const source = parseProject({ ...createProject('SYNTHETIC lesson preview'), assets: [{ id: 'video', kind: 'video', uri: 'KINAOU/Assets/video.mp4', managed: true, metadata: { durationMs: 2000 } }, { id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, metadata: { durationMs: 1000 } }], tracks: [{ id: 'v', type: 'video', name: 'Video', clips: [{ id: 'videoClip', assetId: 'video', startMs: 0, durationMs: 1000, speed: 2 }] }, { id: 'a', type: 'voice', name: 'Voice', clips: [{ id: 'voiceClip', assetId: 'voice', startMs: 0, durationMs: 1000, gain: 0.5 }] }] })
    const project = saveCourseOutline(source, { ...newCourseOutline(source), modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'red', title: 'Red lesson', objective: 'Observe red', range: { inMs: 0, outMs: 500 } }, { id: 'blue', title: 'Blue lesson', objective: 'Observe blue', range: { inMs: 500, outMs: 1000 } }] }] }), before = JSON.stringify(project)
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43990', token: 'lesson-preview-test' })
    const settings = { audioDucking: { ...defaultAudioDucking, reductionDb: 8 }, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: true } }
    const plans = ['red', 'blue'].map(id => freshPreviewPlan(createCourseLessonPreview(project, id, 'landscape', settings).plan)), states: ShortPreviewFeedback[][] = [[], []], blobs: Blob[] = []
    await Promise.all(plans.map((plan, index) => new ShortPreviewSession(plan, { client, publish: state => states[index].push(state), accept: blob => { blobs[index] = blob }, wait: () => new Promise(resolve => setTimeout(resolve, 30)) }).run()))
    expect(plans[0].outputRelativePath).not.toBe(plans[1].outputRelativePath)
    for (const [index, channel] of [[0, 0], [1, 2]]) {
      expect(states[index].at(-1)?.phase, JSON.stringify(states[index])).toBe('ready')
      const file = path.join(root, plans[index].outputRelativePath)
      expect(Buffer.from(await blobs[index].arrayBuffer())).toEqual(await readFile(file))
      const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).toString())
      expect(Math.abs(Number(probe.format.duration) - 0.5)).toBeLessThan(0.08)
      const video = probe.streams.find((stream: any) => stream.codec_type === 'video')
      expect(video.width).toBe(960); expect(video.height).toBe(540)
      expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true)
      const rgb = await run('ffmpeg', ['-v', 'error', '-ss', '0.25', '-i', file, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
      expect(rgb[channel]).toBeGreaterThan(200); expect(rgb[channel === 0 ? 2 : 0]).toBeLessThan(30)
      const pcm = await run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'])
      let squares = 0; for (let offset = 0; offset + 4 <= pcm.length; offset += 4) squares += pcm.readFloatLE(offset) ** 2
      expect(Math.sqrt(squares / (pcm.length / 4))).toBeGreaterThan(0.01)
    }
    expect(JSON.stringify(project)).toBe(before); expect(projectExportHistory(project)).toEqual([]); expect(projectCourseOutputIndex(project)).toEqual([])
    expect(await readFile(path.join(managed, 'Assets/video.mp4'))).toEqual(originals[0]); expect(await readFile(path.join(managed, 'Assets/voice.wav'))).toEqual(originals[1])
  } finally {
    child.kill('SIGKILL'); await new Promise<void>(resolve => { child.on('close', () => resolve()); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
