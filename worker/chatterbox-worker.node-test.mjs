import assert from 'node:assert/strict'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import {
  execFileSync,
  spawn
} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test(
  'generic speech discovery and jobs execute through configured Chatterbox',
  async () => {
    const temporary =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          'kinaou-chatterbox-'
        )
      )

    const managed =
      path.join(
        temporary,
        'KINAOU'
      )

    const assets =
      path.join(
        managed,
        'Assets'
      )

    const cache =
      path.join(
        temporary,
        'hf'
      )

    await mkdir(
      assets,
      { recursive: true }
    )

    await mkdir(
      cache,
      { recursive: true }
    )

    const reference =
      path.join(
        assets,
        'own.wav'
      )

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:duration=1',
        '-c:a',
        'pcm_s16le',
        reference
      ]
    )

    const fake =
      path.join(
        temporary,
        'fake-chatterbox'
      )

    await writeFile(
      fake,
      `#!/usr/bin/env node
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const args = process.argv.slice(2)

if (args.includes('--probe')) {
  console.log(JSON.stringify({
    available: true,
    device: 'mps',
    packageVersion: 'test',
    modelRepo: 'test/model',
    snapshot: '/test/cache'
  }))
  process.exit(0)
}

const requestPath =
  args[args.indexOf('--request') + 1]

const outputPath =
  args[args.indexOf('--output') + 1]

const body =
  JSON.parse(
    fs.readFileSync(
      requestPath,
      'utf8'
    )
  )

fs.writeFileSync(
  outputPath + '.request.json',
  JSON.stringify({
    ...body,
    referenceExists:
      body.referencePath
        ? fs.existsSync(
            body.referencePath
          )
        : false
  })
)

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=0.5',
    '-c:a',
    'pcm_s16le',
    outputPath
  ]
)
`
    )

    await chmod(
      fake,
      0o700
    )

    const port = 43958
    const token =
      'chatterbox-test'

    const worker =
      spawn(
        process.execPath,
        [
          'worker/mac-worker.mjs'
        ],
        {
          env: {
            ...process.env,
            KINAOU_MANAGED_ROOT:
              managed,
            KINAOU_WORKER_PORT:
              String(port),
            KINAOU_WORKER_TOKEN:
              token,
            KINAOU_CHATTERBOX_PYTHON:
              fake,
            KINAOU_CHATTERBOX_HF_HOME:
              cache,
            KINAOU_CHATTERBOX_DEVICE:
              'mps'
          },
          stdio: [
            'ignore',
            'pipe',
            'pipe'
          ]
        }
      )

    let logs = ''

    worker.stdout.on(
      'data',
      chunk => {
        logs +=
          chunk.toString()
      }
    )

    worker.stderr.on(
      'data',
      chunk => {
        logs +=
          chunk.toString()
      }
    )

    try {
      const startupDeadline =
        Date.now() + 15_000

      while (
        !logs.includes(
          `listening on http://127.0.0.1:${port}`
        )
      ) {
        if (
          worker.exitCode !== null
          || Date.now()
            > startupDeadline
        ) {
          throw new Error(logs)
        }

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              30
            )
        )
      }

      const auth = {
        authorization:
          `Bearer ${token}`
      }

      const jsonHeaders = {
        ...auth,
        'content-type':
          'application/json'
      }

      const healthResponse =
        await fetch(
          `http://127.0.0.1:${port}/health`,
          {
            headers: auth
          }
        )

      assert.equal(
        healthResponse.status,
        200
      )

      const health =
        await healthResponse.json()

      assert(
        health.handshake
          .capabilities
          .includes(
            'text-to-speech'
          )
      )

      const voicesResponse =
        await fetch(
          `http://127.0.0.1:${port}/speech/voices`,
          {
            headers: auth
          }
        )

      assert.equal(
        voicesResponse.status,
        200
      )

      const voices =
        (await voicesResponse.json())
          .voices

      assert.deepEqual(
        voices,
        [
          {
            id:
              'chatterbox:multilingual-0.1.7',
            adapterId:
              'chatterbox',
            label:
              'Chatterbox Multilingual',
            locale: null,
            capabilities: [
              'synthesis',
              'language-control',
              'voice-clone',
              'reference-audio'
            ]
          }
        ]
      )

      const startResponse =
        await fetch(
          `http://127.0.0.1:${port}/speech/jobs`,
          {
            method: 'POST',
            headers:
              jsonHeaders,
            body:
              JSON.stringify({
                adapterId:
                  'chatterbox',
                voiceId:
                  'chatterbox:multilingual-0.1.7',
                text:
                  'Bonjour.',
                language: 'fr',
                referenceAudio: {
                  assetId: 'own',
                  path:
                    'KINAOU/Assets/own.wav',
                  authorized: true
                }
              })
          }
        )

      assert.equal(
        startResponse.status,
        202
      )

      let job =
        (await startResponse.json())
          .job

      assert.equal(
        job.adapterId,
        'chatterbox'
      )

      assert.equal(
        job.voiceId,
        'chatterbox:multilingual-0.1.7'
      )

      assert.equal(
        job.language,
        'fr'
      )

      assert.equal(
        job.referenceAssetId,
        'own'
      )

      assert(
        Number.isSafeInteger(
          job.seed
        )
      )

      assert.equal(
        job.tempoFactor,
        1.20
      )

      const jobDeadline =
        Date.now() + 15_000

      while (
        [
          'queued',
          'running'
        ].includes(job.state)
        && Date.now()
          < jobDeadline
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              30
            )
        )

        const response =
          await fetch(
            `http://127.0.0.1:${port}/speech/jobs/${job.id}`,
            {
              headers: auth
            }
          )

        assert.equal(
          response.status,
          200
        )

        job =
          (await response.json())
            .job
      }

      assert.equal(
        job.state,
        'succeeded'
      )

      assert.equal(
        job.adapterId,
        'chatterbox'
      )

      assert.equal(
        job.referenceAssetId,
        'own'
      )

      assert(
        job.durationMs > 0
      )

      assert(
        job.sizeBytes > 0
      )

      const output =
        path.join(
          temporary,
          job.audioPath
        )

      const bridgeRequest =
        JSON.parse(
          await readFile(
            output
              + '.request.json',
            'utf8'
          )
        )

      assert.equal(
        bridgeRequest.text,
        'Bonjour.'
      )

      assert.equal(
        bridgeRequest.language,
        'fr'
      )

      assert.equal(
        bridgeRequest
          .referenceExists,
        true
      )

      assert(
        Number.isSafeInteger(
          bridgeRequest.seed
        )
      )

      const unsupported =
        await fetch(
          `http://127.0.0.1:${port}/speech/jobs`,
          {
            method: 'POST',
            headers:
              jsonHeaders,
            body:
              JSON.stringify({
                adapterId:
                  'future-local',
                voiceId:
                  'future:voice',
                text:
                  'Do not run'
              })
          }
        )

      assert.equal(
        unsupported.status,
        400
      )
    } finally {
      worker.kill(
        'SIGTERM'
      )

      await new Promise(
        resolve => {
          if (
            worker.exitCode
              !== null
          ) {
            resolve()
          } else {
            worker.once(
              'close',
              resolve
            )
          }
        }
      )

      await rm(
        temporary,
        {
          recursive: true,
          force: true
        }
      )
    }
  }
)
