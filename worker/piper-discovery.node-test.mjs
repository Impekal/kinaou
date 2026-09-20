import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('authenticated voice discovery adds locale metadata while preserving legacy paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-piper-discovery-'))
  const managedRoot = path.join(root, 'KINAOU')
  const port = 43933
  await mkdir(path.join(managedRoot, 'Models'), { recursive: true })
  for (const [name, config] of [['renamed', { language: { code: 'fr_FR' } }], ['de_DE-unknown', {}]]) {
    await writeFile(path.join(managedRoot, 'Models', `${name}.onnx`), 'test fixture; never executed')
    await writeFile(path.join(managedRoot, 'Models', `${name}.onnx.json`), JSON.stringify(config))
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managedRoot, KINAOU_WORKER_TOKEN: 'discovery-test', KINAOU_WORKER_PORT: String(port), KINAOU_PIPER_CLI: process.execPath },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (data) => { output += data.toString() })
  child.stderr.on('data', (data) => { output += data.toString() })
  try {
    const deadline = Date.now() + 15000
    while (!output.includes(`listening on http://127.0.0.1:${port}`)) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Worker did not start: ${output}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const endpoint = `http://127.0.0.1:${port}/tts/voices`
    assert.equal((await fetch(endpoint)).status, 401)
    const response = await fetch(endpoint, { headers: { authorization: 'Bearer discovery-test' } })
    assert.equal(response.status, 200)
    const voices = ['KINAOU/Models/de_DE-unknown.onnx', 'KINAOU/Models/renamed.onnx']
    assert.deepEqual(await response.json(), {
      ok: true, type: 'tts-voices', voices,
      details: [{ path: voices[0], locale: null }, { path: voices[1], locale: 'fr-FR' }]
    })
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
