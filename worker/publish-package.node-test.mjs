import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'publish-package-test-token'
const PORT = 43928

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false })
    const stdout = []
    let stderr = ''
    child.stdout?.on('data', (chunk) => stdout.push(chunk))
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 400)}`)))
  })
}

test('publish preflight probes real media and packages only a matching export', { timeout: 120_000 }, async (t) => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) } catch { t.skip('ffmpeg/ffprobe not installed'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-publish-test-'))
  const managedRoot = path.join(root, 'KINAOU')
  const renders = path.join(managedRoot, 'Renders')
  await mkdir(renders, { recursive: true })
  const source = path.join(renders, 'finished.mp4')
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=10:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source])
  const sourceInfo = await stat(source)
  const sourceBefore = await readFile(source)

  const child = spawn(process.execPath, [workerScript], {
    env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managedRoot, KINAOU_WORKER_TOKEN: TOKEN, KINAOU_WORKER_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (data) => { output += data.toString() })
  child.stderr.on('data', (data) => { output += data.toString() })
  try {
    const deadline = Date.now() + 15_000
    while (!output.includes(`listening on http://127.0.0.1:${PORT}`)) {
      if (child.exitCode !== null) throw new Error(`Worker exited before listening: ${output}`)
      if (Date.now() > deadline) throw new Error(`Worker did not start in time: ${output}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const valid = {
      schemaVersion: 1,
      projectId: 'project-1',
      export: { schemaVersion: 1, jobId: 'job-1', label: 'Finished export', outputRelativePath: 'KINAOU/Renders/finished.mp4', format: 'landscape', range: { inMs: 0, outMs: 2000 }, sceneIds: ['scene-1'], durationMs: 2000, sizeBytes: sourceInfo.size, completedAt: '2026-09-13T08:00:00.000Z' },
      platform: 'youtube',
      title: 'Reviewed title',
      description: 'Reviewed description',
      tags: ['KINAOU', 'local']
    }
    const call = async (body, token = TOKEN) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/publish/packages`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, payload: await response.json() }
    }
    const preflight = async (exportReceipt, token = TOKEN) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/publish/preflight`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ export: exportReceipt }) })
      return { status: response.status, payload: await response.json() }
    }
    const list = async (projectId, token = TOKEN) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/publish/packages?projectId=${encodeURIComponent(projectId)}`, { headers: { authorization: `Bearer ${token}` } })
      return { status: response.status, payload: await response.json() }
    }
    const verify = async (packagePath, token = TOKEN) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/publish/packages/integrity`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ path: packagePath }) })
      return { status: response.status, payload: await response.json() }
    }

    const inspected = await preflight(valid.export)
    assert.equal(inspected.status, 200)
    assert.equal(inspected.payload.type, 'publish-preflight')
    assert.equal(inspected.payload.result.ready, true)
    assert.deepEqual(inspected.payload.result.checks, { size: true, videoStream: true, dimensions: true, duration: true })
    assert.deepEqual(inspected.payload.result.expected, { jobId: 'job-1', format: 'landscape', width: 1920, height: 1080, durationMs: 2000, sizeBytes: sourceInfo.size })
    assert.deepEqual({ width: inspected.payload.result.actual.width, height: inspected.payload.result.actual.height, videoCodec: inspected.payload.result.actual.videoCodec, audioCodec: inspected.payload.result.actual.audioCodec }, { width: 1920, height: 1080, videoCodec: 'h264', audioCodec: 'aac' })

    const mismatched = await preflight({ ...valid.export, format: 'vertical' })
    assert.equal(mismatched.status, 200)
    assert.equal(mismatched.payload.result.ready, false)
    assert.equal(mismatched.payload.result.checks.dimensions, false)
    assert.equal(mismatched.payload.result.checks.size, true)
    assert.equal(mismatched.payload.result.checks.duration, true)
    const blockedMismatch = await call({ ...valid, export: { ...valid.export, format: 'vertical' } })
    assert.equal(blockedMismatch.status, 400)
    assert.match(blockedMismatch.payload.error.message, /preflight failed: dimensions/)

    const first = await call(valid)
    assert.equal(first.status, 201)
    assert.equal(first.payload.type, 'publish-package')
    assert.equal(first.payload.result.schemaVersion, 2)
    assert.equal(first.payload.result.sourcePath, valid.export.outputRelativePath)
    assert.match(first.payload.result.path, /^KINAOU\/Renders\/finished_youtube_.*\.publish\.json$/)
    const sourceSha256 = createHash('sha256').update(sourceBefore).digest('hex')
    assert.equal(first.payload.result.sourceSha256, sourceSha256)
    const document = JSON.parse(await readFile(path.join(managedRoot, first.payload.result.path.slice('KINAOU/'.length)), 'utf8'))
    assert.deepEqual(document, {
      schemaVersion: 2,
      kind: 'kinaou-publish-package',
      createdAt: first.payload.result.createdAt,
      projectId: 'project-1',
      platform: 'youtube',
      title: 'Reviewed title',
      description: 'Reviewed description',
      tags: ['KINAOU', 'local'],
      media: valid.export,
      integrity: {
        checkedAt: document.integrity.checkedAt,
        actual: inspected.payload.result.actual,
        sha256: sourceSha256
      }
    })
    assert.match(document.integrity.checkedAt, /^2026-/)

    const unchanged = await verify(first.payload.result.path)
    assert.equal(unchanged.status, 200)
    assert.equal(unchanged.payload.type, 'publish-package-integrity')
    assert.deepEqual(unchanged.payload.result, {
      schemaVersion: 1,
      packagePath: first.payload.result.path,
      sourcePath: valid.export.outputRelativePath,
      checkedAt: unchanged.payload.result.checkedAt,
      status: 'unchanged',
      expectedSha256: sourceSha256,
      actualSha256: sourceSha256,
      sizeBytes: sourceInfo.size
    })

    const sameSizeMutation = Buffer.from(sourceBefore)
    sameSizeMutation[sameSizeMutation.length - 1] ^= 1
    await writeFile(source, sameSizeMutation)
    const modified = await verify(first.payload.result.path)
    assert.equal(modified.status, 200)
    assert.equal(modified.payload.result.status, 'modified')
    assert.equal(modified.payload.result.sizeBytes, sourceInfo.size)
    assert.notEqual(modified.payload.result.actualSha256, sourceSha256)
    await writeFile(source, sourceBefore)
    assert.equal((await verify(first.payload.result.path)).payload.result.status, 'unchanged')

    const second = await call(valid)
    assert.equal(second.status, 201)
    assert.notEqual(second.payload.result.path, first.payload.result.path)
    assert.deepEqual(await readFile(source), sourceBefore)

    // A successful visible check is not a permanent waiver: package creation probes
    // again and catches a file that changed between review and handoff.
    await writeFile(source, Buffer.from([0]), { flag: 'a' })
    const changedAfterReview = await call(valid)
    assert.equal(changedAfterReview.status, 400)
    assert.match(changedAfterReview.payload.error.message, /preflight failed: size/)
    await writeFile(source, sourceBefore)

    const otherProject = await call({ ...valid, projectId: 'project-2', title: 'Other project' })
    assert.equal(otherProject.status, 201)
    const legacyPath = path.join(renders, 'finished_legacy.publish.json')
    await writeFile(legacyPath, JSON.stringify({
      schemaVersion: 1,
      kind: 'kinaou-publish-package',
      createdAt: '2026-09-13T08:01:00.000Z',
      projectId: 'project-1',
      platform: 'generic',
      title: 'Legacy package',
      description: '',
      tags: [],
      media: valid.export
    }))
    const legacy = await verify('KINAOU/Renders/finished_legacy.publish.json')
    assert.equal(legacy.status, 200)
    assert.equal(legacy.payload.result.status, 'unverifiable')
    assert.equal(legacy.payload.result.expectedSha256, undefined)
    await writeFile(path.join(renders, 'malformed.publish.json'), '{not-json')
    await symlink(path.join(managedRoot, first.payload.result.path.slice('KINAOU/'.length)), path.join(renders, 'linked.publish.json'))
    const library = await list('project-1')
    assert.equal(library.status, 200)
    assert.equal(library.payload.type, 'publish-packages')
    assert.equal(library.payload.packages.length, 3)
    assert.ok(library.payload.packages.every((entry) => entry.document.projectId === 'project-1'))
    assert.ok(library.payload.packages.every((entry) => entry.document.kind === 'kinaou-publish-package'))
    assert.ok(library.payload.packages.every((entry) => entry.sourceAvailable === true))
    assert.ok(library.payload.packages.every((entry) => entry.path.endsWith('.publish.json')))
    assert.ok(!library.payload.packages.some((entry) => entry.path === otherProject.payload.result.path))

    await symlink(source, path.join(renders, 'linked.mp4'))
    const symlinkedSource = await call({ ...valid, export: { ...valid.export, outputRelativePath: 'KINAOU/Renders/linked.mp4' } })
    assert.equal(symlinkedSource.status, 400)
    assert.match(symlinkedSource.payload.error.message, /missing or empty/)

    await rm(source)
    const missingIntegrity = await verify(first.payload.result.path)
    assert.equal(missingIntegrity.status, 200)
    assert.equal(missingIntegrity.payload.result.status, 'missing')
    assert.equal(missingIntegrity.payload.result.expectedSha256, sourceSha256)
    const missingSourceLibrary = await list('project-1')
    assert.ok(missingSourceLibrary.payload.packages.every((entry) => entry.sourceAvailable === false))
    const invalidProject = await list(' ')
    assert.equal(invalidProject.status, 400)
    const unauthorizedList = await list('project-1', 'wrong')
    assert.equal(unauthorizedList.status, 401)

    const missing = await call({ ...valid, export: { ...valid.export, outputRelativePath: 'KINAOU/Renders/missing.mp4' } })
    assert.equal(missing.status, 400)
    assert.match(missing.payload.error.message, /missing or empty/)
    const escape = await call({ ...valid, export: { ...valid.export, outputRelativePath: 'KINAOU/../outside.mp4' } })
    assert.equal(escape.status, 403)
    const duplicateTags = await call({ ...valid, tags: ['same', 'SAME'] })
    assert.equal(duplicateTags.status, 400)
    const unauthorized = await call(valid, 'wrong')
    assert.equal(unauthorized.status, 401)
    const unauthorizedPreflight = await preflight(valid.export, 'wrong')
    assert.equal(unauthorizedPreflight.status, 401)
    const unauthorizedIntegrity = await verify(first.payload.result.path, 'wrong')
    assert.equal(unauthorizedIntegrity.status, 401)
    const escapedIntegrity = await verify('KINAOU/Renders/../outside.publish.json')
    assert.ok([400, 403].includes(escapedIntegrity.status))
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
