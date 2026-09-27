import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, planCourseLessonExport, projectCourse, saveCourseOutline } from '../src/core/course'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { WorkerClient } from '../src/core/workerClient'
import { forgetExportReceipt, projectCourseOutputIndex, projectExportHistory, recordSuccessfulExport } from '../src/core/exportHistory'
import { CourseOutputPreflight, type CourseOutputCheckFeedback } from '../src/core/courseOutputPreflight'
import { prepareLessonDelivery, type LessonDeliveryRequest } from '../src/core/courseLessonDelivery'
import { createHash } from 'node:crypto'
import { reviewCourseDeliveryMaterials, useReviewedCourseDeliveryMaterials } from '../src/core/courseDeliveryMaterials'
import { addCaption } from '../src/core/captions'
import { reviewCourseCollection, useCollectionReview } from '../src/core/courseDeliveryCollection'

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
    const deliveryRequest = prepareLessonDelivery(project, retained[1].jobId, true)
    const awaitDelivery = async (request: LessonDeliveryRequest) => {
      let result = await client.startLessonDelivery(request)
      for (let i = 0; i < 200 && ['queued','copying','verifying'].includes(result.state); i++) { await new Promise(resolve => setTimeout(resolve, 20)); result = await client.lessonDeliveryStatus(request) }
      return result
    }
    const delivered = await awaitDelivery(deliveryRequest)
    expect(delivered.state, delivered.error).toBe('ready')
    const copiedPath = path.join(root, delivered.result!.mediaPath)
    expect(await readFile(copiedPath)).toEqual(firstOutput)
    expect(delivered.result!.sha256).toBe(createHash('sha256').update(firstOutput!).digest('hex'))
    const manifest = JSON.parse(await readFile(path.join(root, delivered.result!.manifestPath), 'utf8'))
    expect(manifest.request.export.courseLesson.lessonId).toBe('red'); expect(manifest.preflight.ready).toBe(true)
    expect(manifest.fullProjectBackup).toBe(false)
    expect((await client.startLessonDelivery(deliveryRequest)).result?.mediaPath).toBe(delivered.result!.mediaPath)
    const modifiedCopy = Buffer.from(firstOutput!); modifiedCopy[modifiedCopy.length - 1] ^= 1; await writeFile(copiedPath, modifiedCopy)
    expect((await client.lessonDeliveryStatus(deliveryRequest)).state).toBe('integrityFailed')
    await writeFile(copiedPath, firstOutput!); expect((await client.lessonDeliveryStatus(deliveryRequest)).state).toBe('ready')
    // Texts authored after the render require a fresh explicit review; both revisions survive.
    const outline = projectCourse(project)!, lesson = outline.modules[0].lessons[0]
    lesson.script = '\ufeff  Bonjour 🌍\r\nPRIVATE_SCRIPT'
    lesson.materials = [{ id: 'handout', title: 'Handout', audience: 'learner', body: 'Saved handout' }]
    lesson.exercises = [{ id: 'exercise', title: 'Practice', prompt: 'Question?', hint: 'Hint', solution: 'PRIVATE_ANSWER', criteria: 'PRIVATE_RUBRIC' }]
    const authoredBase = saveCourseOutline(project, outline)
    authoredBase.tracks = [...authoredBase.tracks, { id: 'delivery-captions', type: 'caption', name: 'Delivery captions', clips: [], muted: false, locked: false }]
    const authored = addCaption(addCaption(authoredBase, { text: 'Bonjour <b>🌍</b>', startMs: 100, durationMs: 200 }), { text: 'Fin', startMs: 400, durationMs: 200 })
    const materialReview = await reviewCourseDeliveryMaterials(authored, retained[1].jobId, { includeSubtitles: true })
    const richRequest = useReviewedCourseDeliveryMaterials(authored, materialReview, prepareLessonDelivery(authored, retained[1].jobId, true), true)
    const rich = await awaitDelivery(richRequest)
    expect(rich.state, rich.error).toBe('ready'); expect(rich.result!.files).toHaveLength(6)
    expect(richRequest.schemaVersion).toBe(3); expect(richRequest.materials!.subtitles).toEqual({ cueCount: 2, clippedCues: 1 })
    expect(richRequest.materials!.source.context.outlineRevision).toBe(richRequest.export.courseLesson.outlineRevision + 1)
    expect(await readFile(path.join(root, rich.result!.mediaPath))).toEqual(firstOutput)
    for (const file of richRequest.materials!.files) {
      const actual = await readFile(path.join(root, rich.result!.directory, file.path))
      expect(actual).toEqual(Buffer.from(file.text)); expect(createHash('sha256').update(actual).digest('hex')).toBe(file.sha256)
      if (file.path.startsWith('learner/')) expect(actual.toString()).not.toContain('PRIVATE_')
    }
    const richManifest = JSON.parse(await readFile(path.join(root, rich.result!.manifestPath), 'utf8'))
    expect(richManifest.request.materials.source.context.outlineRevision).toBe(richRequest.materials!.source.context.outlineRevision)
    const subtitlePath = path.join(root, rich.result!.directory, 'learner/subtitles.vtt'), subtitleBytes = await readFile(subtitlePath)
    const subtitleProbe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_packets', '-of', 'json', subtitlePath])).toString())
    expect(subtitleProbe.packets.map((packet: { pts_time: string; duration_time: string }) => [Number(packet.pts_time), Number(packet.duration_time)])).toEqual([[0.1, 0.2], [0.4, 0.1]])
    await writeFile(subtitlePath, 'WEBVTT\n\n'); expect((await client.lessonDeliveryStatus(richRequest)).state).toBe('integrityFailed')
    await writeFile(subtitlePath, subtitleBytes); expect((await client.lessonDeliveryStatus(richRequest)).state).toBe('ready')
    // Discovery/reinspection uses only worker-held records, no retained browser ticket.
    const library = await client.listLessonDeliveries({ projectId: project.id })
    expect(library.entries.map(entry => entry.requestId).sort()).toEqual([deliveryRequest.requestId, richRequest.requestId].sort())
    const richEntry = library.entries.find(entry => entry.requestId === richRequest.requestId)!
    expect(richEntry).toMatchObject({ requestVersion: 3, materialFiles: 6, hasSubtitles: true, hasCompletionRecord: true })
    const lookup = { projectId: project.id, requestId: richRequest.requestId }, beforeLibrary = await readFile(path.join(root, rich.result!.manifestPath))
    expect((await client.inspectLessonDelivery(lookup)).state).toBe('ready')
    await writeFile(subtitlePath, 'Changed'); expect((await client.inspectLessonDelivery(lookup)).state).toBe('integrityFailed')
    await writeFile(subtitlePath, subtitleBytes)
    await expect(client.inspectLessonDelivery({ ...lookup, projectId: 'another-project' })).rejects.toThrow()
    expect((await client.listLessonDeliveries({ projectId: 'another-project' })).entries).toEqual([])
    expect(await readFile(path.join(root, rich.result!.manifestPath))).toEqual(beforeLibrary)
    for (const endpoint of ['list', 'inspect']) expect((await fetch(`http://127.0.0.1:43937/course/delivery/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(endpoint === 'list' ? { projectId: project.id } : lookup) })).status).toBe(401)
    const worksheet = path.join(root, rich.result!.directory, 'learner/worksheet.txt'), originalWorksheet = await readFile(worksheet)
    await writeFile(worksheet, 'Changed'); expect((await client.lessonDeliveryStatus(richRequest)).state).toBe('integrityFailed')
    await writeFile(worksheet, originalWorksheet); expect((await client.lessonDeliveryStatus(richRequest)).state).toBe('ready')
    // Browser-compatible fingerprint and real worker copy path: independently recheck
    // the collection; this technical fixture is not teaching/voice quality evidence.
    const selection = [await client.inspectLessonDelivery(lookup)]
    const collectionRequest = useCollectionReview(await reviewCourseCollection(authored, selection), authored, selection, true)
    let collection = await client.startCourseCollection(collectionRequest)
    for (let i = 0; i < 200 && ['queued','checking','copying'].includes(collection.state); i++) { await new Promise(resolve => setTimeout(resolve, 20)); collection = await client.courseCollectionStatus(collectionRequest) }
    expect(collection.state, collection.error).toBe('ready')
    const collectionFolder = path.join(root, collection.result!.directory), collectionVideo = path.join(root, collection.result!.lessons[0].mediaPath)
    expect(await readFile(collectionVideo)).toEqual(firstOutput)
    const collectionIndex = JSON.parse(await readFile(path.join(collectionFolder, 'COURSE.json'), 'utf8'))
    expect(collectionIndex.request.course.lessonCount).toBe(2); expect(collectionIndex.lessons).toHaveLength(1)
    await exec('shasum', ['-a', '256', '-c', 'SHA256SUMS'], { cwd: collectionFolder })
    await run('cmp', [copiedPath, collectionVideo])
    for (const endpoint of ['start','status']) expect((await fetch(`http://127.0.0.1:43937/course/collection/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(collectionRequest) })).status).toBe(401)
    await writeFile(collectionVideo, modifiedCopy); expect((await client.courseCollectionStatus(collectionRequest)).state).toBe('integrityFailed')
    await writeFile(collectionVideo, firstOutput!); expect((await client.courseCollectionStatus(collectionRequest)).state).toBe('ready')
    expect(await readFile(path.join(root, rich.result!.manifestPath))).toEqual(beforeLibrary)
    await run('shasum', ['-a', '256', path.join(root, rich.result!.mediaPath)])
    const rejectedDelivery = await awaitDelivery(prepareLessonDelivery(project, retained[0].jobId, true))
    expect(rejectedDelivery.state).toBe('failed'); expect(rejectedDelivery.error).toContain('dimensions')
    expect((await fetch('http://127.0.0.1:43937/course/delivery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(deliveryRequest) })).status).toBe(401)
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
