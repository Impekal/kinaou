import test from 'node:test'
import assert from 'node:assert/strict'

import {
  spawn
} from 'node:child_process'

import {
  mkdir,
  mkdtemp,
  rm
} from 'node:fs/promises'

import os from 'node:os'
import path from 'node:path'

import {
  fileURLToPath
} from 'node:url'

import {
  listPublicPlatformCredentialStatuses,
  resolvePlatformCredentialSecrets
} from './platform-credentials.mjs'


const workerScript =
  fileURLToPath(
    new URL(
      './mac-worker.mjs',
      import.meta.url
    )
  )


test(
  'keeps environment credential values worker-internal while exposing safe status',
  () => {
    const env = {
      KINAOU_YOUTUBE_ACCESS_TOKEN:
        'youtube-access-secret',

      KINAOU_YOUTUBE_REFRESH_TOKEN:
        'youtube-refresh-secret',

      KINAOU_YOUTUBE_ACCOUNT_LABEL:
        'Creator Account',

      KINAOU_YOUTUBE_SCOPES:
        'youtube.upload, youtube.readonly',

      KINAOU_YOUTUBE_TOKEN_EXPIRES_AT:
        '2026-09-26T16:00:00.000Z'
    }

    const secrets =
      resolvePlatformCredentialSecrets(
        'youtube',
        env
      )

    assert.equal(
      secrets.accessToken,
      'youtube-access-secret'
    )

    assert.equal(
      secrets.refreshToken,
      'youtube-refresh-secret'
    )


    const statuses =
      listPublicPlatformCredentialStatuses(
        env
      )

    assert.equal(
      statuses.length,
      3
    )

    const youtube =
      statuses.find(
        status =>
          status.platform
          === 'youtube'
      )

    assert.deepEqual(
      youtube,
      {
        platform:
          'youtube',

        provider:
          'environment',

        state:
          'available',

        accessTokenAvailable:
          true,

        refreshTokenAvailable:
          true,

        accountLabel:
          'Creator Account',

        scopes: [
          'youtube.upload',
          'youtube.readonly'
        ],

        expiresAt:
          '2026-09-26T16:00:00.000Z'
      }
    )

    const serialized =
      JSON.stringify(
        statuses
      )

    assert.doesNotMatch(
      serialized,
      /youtube-access-secret/
    )

    assert.doesNotMatch(
      serialized,
      /youtube-refresh-secret/
    )

    assert.doesNotMatch(
      serialized,
      /KINAOU_YOUTUBE_ACCESS_TOKEN/
    )
  }
)


test(
  'authenticated worker credential endpoint never returns secret values',
  {
    timeout:
      30_000
  },
  async () => {
    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          'kinaou-credentials-test-'
        )
      )

    const managedRoot =
      path.join(
        root,
        'KINAOU'
      )

    await mkdir(
      managedRoot,
      {
        recursive:
          true
      }
    )

    const token =
      'credential-endpoint-worker-token'

    const port =
      43931

    const accessSecret =
      'endpoint-access-secret'

    const refreshSecret =
      'endpoint-refresh-secret'

    const child =
      spawn(
        process.execPath,
        [
          workerScript
        ],
        {
          env: {
            ...process.env,

            KINAOU_MANAGED_ROOT:
              managedRoot,

            KINAOU_WORKER_TOKEN:
              token,

            KINAOU_WORKER_PORT:
              String(
                port
              ),

            KINAOU_YOUTUBE_ACCESS_TOKEN:
              accessSecret,

            KINAOU_YOUTUBE_REFRESH_TOKEN:
              refreshSecret,

            KINAOU_YOUTUBE_ACCOUNT_LABEL:
              'Endpoint Creator',

            KINAOU_YOUTUBE_SCOPES:
              'youtube.upload'
          },

          stdio: [
            'ignore',
            'pipe',
            'pipe'
          ]
        }
      )

    let output =
      ''

    child.stdout.on(
      'data',
      data => {
        output +=
          data.toString()
      }
    )

    child.stderr.on(
      'data',
      data => {
        output +=
          data.toString()
      }
    )

    try {
      const deadline =
        Date.now()
        + 15_000

      while (
        !output.includes(
          `listening on http://127.0.0.1:${port}`
        )
      ) {
        if (
          child.exitCode
          !== null
        ) {
          throw new Error(
            `Worker exited before listening: ${output}`
          )
        }

        if (
          Date.now()
          > deadline
        ) {
          throw new Error(
            `Worker did not start in time: ${output}`
          )
        }

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              100
            )
        )
      }


      const response =
        await fetch(
          `http://127.0.0.1:${port}/publish/credentials`,
          {
            headers: {
              authorization:
                `Bearer ${token}`
            }
          }
        )

      assert.equal(
        response.status,
        200
      )

      const raw =
        await response.text()

      assert.doesNotMatch(
        raw,
        new RegExp(
          accessSecret
        )
      )

      assert.doesNotMatch(
        raw,
        new RegExp(
          refreshSecret
        )
      )

      const payload =
        JSON.parse(
          raw
        )

      assert.equal(
        payload.ok,
        true
      )

      assert.equal(
        payload.type,
        'publish-credentials'
      )

      const youtube =
        payload.statuses.find(
          status =>
            status.platform
            === 'youtube'
        )

      assert.equal(
        youtube.accessTokenAvailable,
        true
      )

      assert.equal(
        youtube.refreshTokenAvailable,
        true
      )


      const unauthorized =
        await fetch(
          `http://127.0.0.1:${port}/publish/credentials`,
          {
            headers: {
              authorization:
                'Bearer wrong-token'
            }
          }
        )

      assert.equal(
        unauthorized.status,
        401
      )
    } finally {
      child.kill(
        'SIGKILL'
      )

      await new Promise(
        resolve => {
          child.on(
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
          recursive:
            true,

          force:
            true
        }
      )
    }
  }
)
