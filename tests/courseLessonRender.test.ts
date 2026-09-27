import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, planCourseLessonExport, saveCourseOutline } from '../src/core/course'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { WorkerClient } from '../src/core/workerClient'
import { forgetExportReceipt, projectCourseOutputIndex, projectExportHistory, recordSuccessfulExport } from '../src/core/exportHistory'
import { CourseOutputPreflight, type CourseOutputCheckFeedback } from '../src/core/courseOutputPreflight'

const exec = promisify(execFile)
const run = async (program: string, args: string[]) => (await exec(program, args, { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout

it('exports separate lessons through the real worker with correct retimed frames, full audio and retained earlier output', async (context) => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) }
  catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required for real lesson verification'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-course-render-'))
  const managed = path.join(root, 'KINAOU')
  await mkdir(path.join(managed, 'Assets'), { recursive: true })
  const child = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managed, KINAOU_WORKER_TOKEN: 'course-test', KINAOU_WORKER_PORT: '43937' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (data) => { logs += data }); child.stderr.on('data', (data) => { logs += data })
  try {
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=160x90:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=blue:size=160x90:rate=30:duration=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', path.join(managed, 'Assets/source.mp4')])
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(managed, 'Assets/voice.wav')])
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43937')) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(logs)
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    const original = parseProject({ ...createProject('Course fixture'), assets: [
      { id: 'video', kind: 'video', uri: 'KINAOU/Assets/source.mp4', managed: true, metadata: { durationMs: 2000 } },
      { id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, metadata: { durationMs: 1000 } }
    ], tracks: [
      { id: 'video', type: 'video', name: 'Demo', clips: [{ id: 'demo', assetId: 'video', startMs: 0, durationMs: 1000, speed: 2 }] },
      { id: 'voice', type: 'voice', name: 'Narration', clips: [{ id: 'speech', assetId: 'voice', startMs: 0, durationMs: 1000 }] }
    ] })
    let project = saveCourseOutline(original, { ...newCourseOutline(original), modules: [{ id: 'm1', title: 'Module', lessons: [
      { id: 'red', title: 'First lesson', objective: '', range: { inMs: 0, outMs: 500 } },
      { id: 'blue', title: 'Second lesson', objective: '', range: { inMs: 500, outMs: 1000 } }
    ] }] })
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43937', token: 'course-test' })
    let firstOutput: Buffer | undefined
    for (const [id, colorChannel] of [['red', 0], ['blue', 2]] as const) {
      const outputPath = `KINAOU/Renders/lesson-${id}.mp4`
      const full = createRenderPlan(project, id === 'red' ? preview1080pPreset : { ...preview1080pPreset, width: 320, height: 180 }, 'KINAOU/Renders/whole.mp4')
      const result = planCourseLessonExport(project, id, full, outputPath)
      let job = await client.startRender(result.plan)
      for (let i = 0; i < 200 && ['queued', 'running'].includes(job.state); i++) {
        await new Promise((resolve) => setTimeout(resolve, 50)); job = await client.renderStatus(job.id)
      }
      expect(job.state, job.error).toBe('succeeded')
      const rendered = path.join(root, outputPath)
      const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', rendered])).toString())
      expect(Math.abs(Number(probe.format.duration) - 0.5)).toBeLessThan(0.08)
      const rgb = await run('ffmpeg', ['-v', 'error', '-ss', '0.25', '-i', rendered, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
      expect(rgb[colorChannel]).toBeGreaterThan(200)
      expect(rgb[colorChannel === 0 ? 2 : 0]).toBeLessThan(30)
      const pcm = await run('ffmpeg', ['-v', 'error', '-ss', '0.35', '-i', rendered, '-t', '0.1', '-vn', '-ac', '1', '-f', 's16le', '-'])
      let peak = 0
      for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)))
      expect(peak).toBeGreaterThan(1000)
      project = recordSuccessfulExport(project, { jobId: job.id, label: result.label, outputRelativePath: outputPath, format: 'landscape', range: result.range, durationMs: result.plan.durationMs, completedAt: job.updatedAt, sceneIds: [], courseLesson: result.context })
      if (id === 'red') firstOutput = await readFile(rendered)
    }
    expect(await readFile(path.join(root, 'KINAOU/Renders/lesson-red.mp4'))).toEqual(firstOutput)
    expect(projectExportHistory(project).map((receipt) => receipt.courseLesson?.lessonId)).toEqual(['blue', 'red'])
    const retained = projectCourseOutputIndex(project)
    expect(retained.map(receipt => receipt.courseLesson?.lessonId)).toEqual(['blue', 'red'])
    project = forgetExportReceipt(project, retained[1].jobId)
    expect(projectCourseOutputIndex(parseProject(JSON.parse(JSON.stringify(project))))).toEqual(retained)
    expect(await readFile(path.join(root, 'KINAOU/Renders/lesson-red.mp4'))).toEqual(firstOutput)
    expect(project.tracks).toEqual(original.tracks)

    // Actual read-only course file preflight: the full-HD lesson matches, the
    // deliberately small fixture is a dimension mismatch, neither is course approval.
    const check = async (jobId: string) => {
      const scope = { project, jobId, connection: 'real-test-worker', dirty: false }, states: CourseOutputCheckFeedback[] = []
      await new CourseOutputPreflight(scope, { environment: () => scope, client, publish: value => states.push(value) }).check()
      return states.at(-1)!
    }
    const beforeCheck = JSON.stringify(project)
    const playback = await client.loadCourseOutput(retained[1])
    expect(Buffer.from(await playback.arrayBuffer())).toEqual(firstOutput)
    const playbackPath = path.join(root, 'roundtrip.mp4')
    await writeFile(playbackPath, Buffer.from(await playback.arrayBuffer()))
    const playbackProbe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', playbackPath])).toString())
    expect(playbackProbe.streams.some((stream: { codec_type: string }) => stream.codec_type === 'video')).toBe(true)
    expect(playbackProbe.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio')).toBe(true)
    const unauthenticated = await fetch('http://127.0.0.1:43937/course/output-media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ export: retained[1] }) })
    expect(unauthenticated.status).toBe(401)
    // Abort an actual byte response. The worker must remain alive for later checks.
    const aborted = new AbortController()
    const partial = await fetch('http://127.0.0.1:43937/course/output-media', { method: 'POST', signal: aborted.signal, headers: { authorization: 'Bearer course-test', 'content-type': 'application/json' }, body: JSON.stringify({ export: retained[1] }) })
    expect(partial.status).toBe(200); aborted.abort(); await partial.body?.cancel().catch(() => {})
    expect((await check(retained[1].jobId)).phase).toBe('matched')
    expect(await check(retained[0].jobId)).toMatchObject({ phase: 'mismatch', result: { checks: { videoStream: true, dimensions: false, duration: true } } })
    const bluePath = path.join(root, 'KINAOU/Renders/lesson-blue.mp4'), blueBytes = await readFile(bluePath)
    await rename(bluePath, bluePath + '.test-held')
    await expect(client.loadCourseOutput(retained[0])).rejects.toThrow()
    expect((await check(retained[0].jobId)).phase).toBe('failed')
    await rename(bluePath + '.test-held', bluePath)
    await writeFile(bluePath, 'Explicit test-only malformed MP4')
    await expect(client.loadCourseOutput(retained[0])).rejects.toThrow()
    expect((await check(retained[0].jobId)).phase).toBe('failed')
    await writeFile(bluePath, blueBytes)
    expect((await check(retained[0].jobId)).phase).toBe('mismatch')
    expect(await readFile(bluePath)).toEqual(blueBytes)
    expect(await readFile(path.join(root, 'KINAOU/Renders/lesson-red.mp4'))).toEqual(firstOutput)
    expect(JSON.stringify(project)).toBe(beforeCheck)
  } finally {
    child.kill('SIGKILL')
    await new Promise<void>((resolve) => { child.on('close', () => resolve()); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
