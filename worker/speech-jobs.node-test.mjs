import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test(
  'generic speech jobs execute through Piper while preserving adapter identity',
  async () => {
    const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'kinaou-speech-jobs-')
    )

    const managed = path.join(temporary, 'KINAOU')
    const models = path.join(managed, 'Models')

    await mkdir(models, { recursive: true })

    await writeFile(
      path.join(models, 'fixture.onnx'),
      'TEST ONLY - NO MODEL'
    )

    await writeFile(
      path.join(models, 'fixture.onnx.json'),
      JSON.stringify({
        language: {
          code: 'de_DE'
        }
      })
    )

    const cli = path.join(temporary, 'speech-fixture.mjs')

    await writeFile(
      cli,
      `#!/usr/bin/env node
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'

const args=process.argv.slice(2)
const output=args[args.indexOf('-f')+1]
const text=args[args.indexOf('--input-file')+1]

writeFileSync(output+'.text',readFileSync(text))

execFileSync(
  'ffmpeg',
  [
    '-v','error',
    '-f','lavfi',
    '-i','sine=frequency=440:duration=0.5',
    '-c:a','pcm_s16le',
    output
  ]
)
`
    )

    await chmod(cli, 0o700)

    const port = 43957
    const token = 'speech-jobs-test'

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
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      }

      const startResponse = await fetch(
        `http://127.0.0.1:${port}/speech/jobs`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            adapterId: 'piper',
            voiceId: 'KINAOU/Models/fixture.onnx',
            text: 'Guten Tag aus dem generischen Vertrag.'
          })
        }
      )

      assert.equal(startResponse.status, 202)

      let job = (await startResponse.json()).job

      assert.equal(job.adapterId, 'piper')
      assert.equal(job.voiceId, 'KINAOU/Models/fixture.onnx')
      assert.equal(job.state, 'queued')

      const deadlineJob = Date.now() + 15_000

      while (
        ['queued', 'running'].includes(job.state)
        && Date.now() < deadlineJob
      ) {
        await new Promise(resolve => setTimeout(resolve, 30))

        const statusResponse = await fetch(
          `http://127.0.0.1:${port}/speech/jobs/${job.id}`,
          {
            headers: {
              authorization: `Bearer ${token}`
            }
          }
        )

        assert.equal(statusResponse.status, 200)
        job = (await statusResponse.json()).job
      }

      assert.equal(job.state, 'succeeded')
      assert.equal(job.adapterId, 'piper')
      assert.equal(job.voiceId, 'KINAOU/Models/fixture.onnx')
      assert.match(
        job.audioPath,
        /^KINAOU\/Assets\/GeneratedVoice\/.+\.wav$/
      )

      assert(job.durationMs > 0)
      assert(job.sizeBytes > 0)

      const absoluteAudio = path.join(
        temporary,
        job.audioPath
      )

      assert.equal(
        await readFile(
          absoluteAudio + '.text',
          'utf8'
        ),
        'Guten Tag aus dem generischen Vertrag.'
      )

      const legacyStatus = await fetch(
        `http://127.0.0.1:${port}/tts/jobs/${job.id}`,
        {
          headers: {
            authorization: `Bearer ${token}`
          }
        }
      )

      assert.equal(legacyStatus.status, 200)

      const legacyJob = (await legacyStatus.json()).job

      assert.equal(legacyJob.id, job.id)
      assert.equal(
        legacyJob.voicePath,
        'KINAOU/Models/fixture.onnx'
      )

      const unsupported = await fetch(
        `http://127.0.0.1:${port}/speech/jobs`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            adapterId: 'future-local',
            voiceId: 'future:voice',
            text: 'Do not run'
          })
        }
      )

      assert.equal(unsupported.status, 400)

      const unauthorized = await fetch(
        `http://127.0.0.1:${port}/speech/jobs`,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer wrong',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            adapterId: 'piper',
            voiceId: 'KINAOU/Models/fixture.onnx',
            text: 'Do not run'
          })
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
