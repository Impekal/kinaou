import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test(
  'authenticated generic speech discovery preserves the legacy Piper catalog',
  async () => {
    const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'kinaou-speech-discovery-')
    )

    const managed = path.join(temporary, 'KINAOU')
    const models = path.join(managed, 'Models')

    await mkdir(models, { recursive: true })

    await writeFile(
      path.join(models, 'fixture.onnx'),
      'TEST ONLY - NEVER EXECUTED'
    )

    await writeFile(
      path.join(models, 'fixture.onnx.json'),
      JSON.stringify({
        language: {
          code: 'fr_FR'
        }
      })
    )

    const cli = path.join(temporary, 'fake-piper')

    await writeFile(
      cli,
      '#!/bin/sh\nexit 0\n'
    )

    await chmod(cli, 0o700)

    const port = 43956
    const token = 'speech-discovery-test'

    const worker = spawn(
      process.execPath,
      ['worker/mac-worker.mjs'],
      {
        env: {
          ...process.env,
          KINAOU_MANAGED_ROOT: managed,
          KINAOU_WORKER_PORT: String(port),
          KINAOU_WORKER_TOKEN: token,
          KINAOU_PIPER_CLI: cli
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    let logs = ''

    worker.stdout.on('data', chunk => {
      logs += chunk
    })

    worker.stderr.on('data', chunk => {
      logs += chunk
    })

    try {
      const deadline = Date.now() + 15_000

      while (!logs.includes(`listening on http://127.0.0.1:${port}`)) {
        if (worker.exitCode !== null || Date.now() > deadline) {
          throw new Error(logs)
        }

        await new Promise(resolve => setTimeout(resolve, 30))
      }

      const headers = {
        authorization: `Bearer ${token}`
      }

      const genericResponse = await fetch(
        `http://127.0.0.1:${port}/speech/voices`,
        { headers }
      )

      assert.equal(genericResponse.status, 200)

      assert.deepEqual(
        await genericResponse.json(),
        {
          ok: true,
          type: 'speech-voices',
          voices: [{
            id: 'KINAOU/Models/fixture.onnx',
            adapterId: 'piper',
            label: 'fixture',
            locale: 'fr-FR',
            capabilities: [
              'synthesis',
              'declared-locale'
            ]
          }]
        }
      )

      const legacyResponse = await fetch(
        `http://127.0.0.1:${port}/tts/voices`,
        { headers }
      )

      assert.equal(legacyResponse.status, 200)

      assert.deepEqual(
        await legacyResponse.json(),
        {
          ok: true,
          type: 'tts-voices',
          voices: [
            'KINAOU/Models/fixture.onnx'
          ],
          details: [{
            path: 'KINAOU/Models/fixture.onnx',
            locale: 'fr-FR'
          }]
        }
      )

      const unauthorized = await fetch(
        `http://127.0.0.1:${port}/speech/voices`,
        {
          headers: {
            authorization: 'Bearer wrong'
          }
        }
      )

      assert.equal(unauthorized.status, 401)
    } finally {
      worker.kill('SIGTERM')

      await new Promise(resolve => {
        if (worker.exitCode !== null) resolve()
        else worker.once('close', resolve)
      })

      await rm(temporary, {
        recursive: true,
        force: true
      })
    }
  }
)
