import test from 'node:test'
import assert from 'node:assert/strict'

import {
  readFile,
  mkdtemp,
  rm
} from 'node:fs/promises'

import {
  spawn
} from 'node:child_process'

import os from 'node:os'
import path from 'node:path'
import {
  fileURLToPath
} from 'node:url'

import {
  AVATAR_IDENTITY_ADAPTER_ID,
  AVATAR_IDENTITY_BASE_MODEL,
  AVATAR_IDENTITY_IP_ADAPTER,
  buildAvatarIdentityProbeCommand,
  parseAvatarIdentityProbe,
  unconfiguredAvatarIdentityRuntime
} from './avatar-identity.mjs'

const here =
  path.dirname(
    fileURLToPath(
      import.meta.url
    )
  )

test(
  'builds only an explicit shell-free offline probe command',
  () => {
    const command =
      buildAvatarIdentityProbeCommand({
        pythonPath:
          '/tmp/avatar-python',
        bridgePath:
          '/tmp/avatar-bridge.py',
        cachePath:
          '/tmp/avatar-cache',
        device: 'mps'
      })

    assert.equal(
      command.executable,
      '/tmp/avatar-python'
    )

    assert.deepEqual(
      command.args,
      [
        '/tmp/avatar-bridge.py',
        '--probe',
        '--device',
        'mps',
        '--cache',
        '/tmp/avatar-cache'
      ]
    )

    assert.throws(
      () =>
        buildAvatarIdentityProbeCommand({
          pythonPath:
            'python',
          bridgePath:
            '/tmp/bridge.py',
          cachePath:
            '/tmp/cache'
        }),
      /absolute/
    )
  }
)

test(
  'does not claim an unconfigured runtime is available',
  () => {
    const runtime =
      unconfiguredAvatarIdentityRuntime(
        'mps'
      )

    assert.equal(
      runtime.configured,
      false
    )

    assert.equal(
      runtime.available,
      false
    )

    assert.deepEqual(
      runtime.missing,
      [
        'runtime:configuration'
      ]
    )
  }
)

test(
  'strictly parses an available offline runtime and rejects contradictory availability',
  () => {
    const value = {
      configured: true,
      available: true,
      offlineOnly: true,
      adapterId:
        AVATAR_IDENTITY_ADAPTER_ID,
      device: 'mps',
      pythonVersion:
        '3.11.16',
      packageVersions: {
        torch: '2.6.0'
      },
      models: {
        baseModel: {
          repoId:
            AVATAR_IDENTITY_BASE_MODEL,
          available: true,
          snapshot:
            '/tmp/cache/models--sdxl/snapshots/abcdef1',
          revision:
            'abcdef1'
        },
        ipAdapter: {
          repoId:
            AVATAR_IDENTITY_IP_ADAPTER,
          available: true,
          snapshot:
            '/tmp/cache/models--ip/snapshots/1234567',
          revision:
            '1234567'
        }
      },
      missing: [],
      notes: []
    }

    assert.equal(
      parseAvatarIdentityProbe(
        value
      ).available,
      true
    )

    assert.throws(
      () =>
        parseAvatarIdentityProbe({
          ...value,
          missing: [
            'model:sdxl-base'
          ]
        }),
      /missing dependencies/
    )
  }
)

test(
  'python bridge is structurally offline-only and can probe an empty cache without downloading',
  async t => {
    const source =
      await readFile(
        path.join(
          here,
          'avatar-identity-bridge.py'
        ),
        'utf8'
      )

    assert.match(
      source,
      /local_files_only=True/
    )

    assert.match(
      source,
      /HF_HUB_OFFLINE/
    )

    assert.match(
      source,
      /TRANSFORMERS_OFFLINE/
    )

    const cache =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          'kinaou-avatar-probe-'
        )
      )

    function runPython(
      executable
    ) {
      return new Promise(
        (resolve, reject) => {
          const child =
            spawn(
              executable,
              [
                path.join(
                  here,
                  'avatar-identity-bridge.py'
                ),
                '--probe',
                '--device',
                'cpu',
                '--cache',
                cache
              ],
              {
                shell: false,
                stdio: [
                  'ignore',
                  'pipe',
                  'pipe'
                ]
              }
            )

          let stdout = ''
          let stderr = ''

          child.stdout.on(
            'data',
            data => {
              stdout +=
                data.toString()
            }
          )

          child.stderr.on(
            'data',
            data => {
              stderr +=
                data.toString()
            }
          )

          child.on(
            'error',
            reject
          )

          child.on(
            'close',
            code => {
              resolve({
                code,
                stdout,
                stderr
              })
            }
          )
        }
      )
    }

    try {
      let result

      try {
        result =
          await runPython(
            'python3'
          )
      } catch (error) {
        if (
          error?.code
          === 'ENOENT'
        ) {
          t.skip(
            'python3 is unavailable'
          )
          return
        }

        throw error
      }

      assert.equal(
        result.code,
        0,
        result.stderr
      )

      const line =
        result.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .at(-1)

      assert.ok(line)

      const parsed =
        parseAvatarIdentityProbe(
          JSON.parse(line)
        )

      assert.equal(
        parsed.offlineOnly,
        true
      )

      assert.equal(
        parsed.available,
        false
      )

      assert.ok(
        parsed.missing.length
        > 0
      )
    } finally {
      await rm(
        cache,
        {
          recursive: true,
          force: true
        }
      )
    }
  }
)
