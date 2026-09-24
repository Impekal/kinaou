import test from 'node:test'
import assert from 'node:assert/strict'

import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises'

import {
  spawn
} from 'node:child_process'

import os from 'node:os'
import path from 'node:path'

const pause =
  () =>
    new Promise(
      resolve =>
        setTimeout(
          resolve,
          30
        )
    )

test(
  'real worker exposes runtime discovery without claiming avatar generation',
  {
    timeout: 30000
  },
  async () => {
    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          'kinaou-avatar-runtime-'
        )
      )

    const managed =
      path.join(
        root,
        'KINAOU'
      )

    const hfHome =
      path.join(
        root,
        'hf'
      )

    await mkdir(
      managed,
      {
        recursive: true
      }
    )

    await mkdir(
      hfHome,
      {
        recursive: true
      }
    )


    const manifestPath =
      path.join(
        root,
        'install-manifest.json'
      )

    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        adapterId:
          'sdxl-ip-adapter-plus-face',
        faceIdUsed: false,
        insightFaceUsed: false
      }),
      'utf8'
    )

    const fakePython =
      path.join(
        root,
        'fake-avatar-python'
      )

    const runtime = {
      configured: true,
      available: true,
      offlineOnly: true,
      adapterId:
        'sdxl-ip-adapter-plus-face',
      device: 'mps',
      pythonVersion:
        '3.11.16',
      packageVersions: {
        torch: '2.6.0',
        diffusers:
          '0.29.0'
      },
      models: {
        baseModel: {
          repoId:
            'stabilityai/stable-diffusion-xl-base-1.0',
          available: true,
          snapshot:
            '/tmp/sdxl/snapshots/abcdef1',
          revision:
            'abcdef1'
        },
        ipAdapter: {
          repoId:
            'h94/IP-Adapter',
          available: true,
          snapshot:
            '/tmp/ip/snapshots/1234567',
          revision:
            '1234567'
        }
      },
      missing: [],
      notes: []
    }

    await writeFile(
      fakePython,
      [
        '#!/bin/sh',
        "cat <<'JSON'",
        JSON.stringify(
          runtime
        ),
        'JSON'
      ].join('\n'),
      'utf8'
    )

    await chmod(
      fakePython,
      0o755
    )

    const port = 43969

    const child =
      spawn(
        process.execPath,
        [
          path.resolve(
            'worker/mac-worker.mjs'
          )
        ],
        {
          env: {
            ...process.env,
            KINAOU_MANAGED_ROOT:
              managed,
            KINAOU_WORKER_TOKEN:
              'avatar-runtime-test',
            KINAOU_WORKER_PORT:
              String(port),
            KINAOU_AVATAR_PYTHON:
              fakePython,
            KINAOU_AVATAR_HF_HOME:
              hfHome,
            KINAOU_AVATAR_MANIFEST:
              manifestPath,
            KINAOU_AVATAR_DEVICE:
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

    child.stdout.on(
      'data',
      data => {
        logs +=
          data.toString()
      }
    )

    child.stderr.on(
      'data',
      data => {
        logs +=
          data.toString()
      }
    )

    const base =
      `http://127.0.0.1:${port}`

    try {
      for (
        let attempt = 0;
        !logs.includes(
          `listening on ${base}`
        );
        attempt += 1
      ) {
        if (
          attempt > 300
          || child.exitCode
            !== null
        ) {
          throw new Error(
            logs
          )
        }

        await pause()
      }

      const headers = {
        authorization:
          'Bearer avatar-runtime-test'
      }

      const runtimeResponse =
        await fetch(
          `${base}/avatar/identity/runtime`,
          {
            headers
          }
        )

      assert.equal(
        runtimeResponse.status,
        200
      )

      const payload =
        await runtimeResponse.json()

      assert.equal(
        payload.type,
        'avatar-identity-runtime'
      )

      assert.equal(
        payload.runtime.available,
        true
      )

      const health =
        await (
          await fetch(
            `${base}/health`,
            {
              headers
            }
          )
        ).json()

      assert.ok(
        health.handshake
          .capabilities
          .includes(
            'avatar-identity-runtime'
          )
      )

      assert.ok(
        !health.handshake
          .capabilities
          .includes(
            'avatar-identity-generation'
          )
      )
    } finally {
      child.kill(
        'SIGKILL'
      )

      await new Promise(
        resolve => {
          child.once(
            'close',
            resolve
          )

          setTimeout(
            resolve,
            3000
          ).unref()
        }
      )

      await rm(
        root,
        {
          recursive: true,
          force: true
        }
      )
    }
  }
)
