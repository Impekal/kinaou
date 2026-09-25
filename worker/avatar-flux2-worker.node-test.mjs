import assert from 'node:assert/strict'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {
  spawn
} from 'node:child_process'
import test from 'node:test'
import {
  fileURLToPath
} from 'node:url'

const workerScript =
  fileURLToPath(
    new URL(
      './mac-worker.mjs',
      import.meta.url
    )
  )

const PNG =
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )

async function freePort() {
  const server =
    net.createServer()

  await new Promise(
    resolve =>
      server.listen(
        0,
        '127.0.0.1',
        resolve
      )
  )

  const address =
    server.address()

  const port =
    typeof address === 'object'
      && address
      ? address.port
      : 0

  await new Promise(
    resolve =>
      server.close(
        resolve
      )
  )

  return port
}

async function waitFor(
  predicate,
  timeoutMs = 10_000
) {
  const deadline =
    Date.now()
    + timeoutMs

  while (
    Date.now()
      < deadline
  ) {
    const value =
      await predicate()

    if (value) {
      return value
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          50
        )
    )
  }

  throw new Error(
    'Timed out'
  )
}

test(
  'authenticated worker executes and cancels only the pinned Avatar edit runtime',
  {
    timeout:
      60_000
  },
  async () => {
    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          'kinaou-avatar-flux2-worker-'
        )
      )

    const managedRoot =
      path.join(
        root,
        'KINAOU'
      )

    const assets =
      path.join(
        managedRoot,
        'Assets'
      )

    const runtime =
      path.join(
        root,
        'runtime'
      )

    const model =
      path.join(
        runtime,
        'model'
      )

    const cli =
      path.join(
        runtime,
        'fake-mflux'
      )

    const manifest =
      path.join(
        runtime,
        'runtime-manifest.json'
      )

    await mkdir(
      assets,
      {
        recursive:
          true
      }
    )

    await mkdir(
      model,
      {
        recursive:
          true
      }
    )

    await writeFile(
      path.join(
        assets,
        'master.png'
      ),
      PNG
    )

    await writeFile(
      manifest,
      JSON.stringify({
        schemaVersion:
          1,
        runtime:
          'mflux',
        runtimeVersion:
          '0.20.0',
        runtimeReleaseCommit:
          '83ca6f2c230830e8e90e106ef7adb33abc93c9fc',
        modelRepository:
          'Runpod/FLUX.2-klein-4B-mflux-4bit',
        modelRevision:
          '73dcaa322be48ea49374b32b4b23aab1a3e59b87',
        modelAggregateSha256:
          '59f63035f2800752eb18f6afb24d88bbc6ae5759bb9d46a02038fbc7c2d05f32',
        baseModelRepository:
          'black-forest-labs/FLUX.2-klein-4B',
        baseLicenseEvidenceRevision:
          '6dfcebfd3cb91f82d131896f70845e96d902a304',
        licenseId:
          'apache-2.0',
        commercialOutput:
          'allowed',
        insightFaceUsed:
          false,
        faceIdUsed:
          false,
        quantization:
          '4-bit'
      })
    )

    await writeFile(
      cli,
      `#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const index = args.indexOf('--output')
const output = args[index + 1]
const promptIndex = args.indexOf('--prompt')
const prompt = args[promptIndex + 1] ?? ''

if (!output) process.exit(2)

if (prompt.includes('CANCEL-ME')) {
  await new Promise(resolve => setTimeout(resolve, 30000))
}

await mkdir(path.dirname(output), { recursive: true })

await writeFile(
  output,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
)
`
    )

    await chmod(
      cli,
      0o755
    )

    const port =
      await freePort()

    const token =
      'avatar-worker-test-token'

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
              String(port),
            KINAOU_FLUX2_EDIT_CLI:
              cli,
            KINAOU_FLUX2_MODEL_PATH:
              model,
            KINAOU_FLUX2_RUNTIME_MANIFEST:
              manifest
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

    const base =
      `http://127.0.0.1:${port}`

    const headers = {
      authorization:
        `Bearer ${token}`,
      'content-type':
        'application/json'
    }

    try {
      await waitFor(
        async () => {
          if (
            child.exitCode
              !== null
          ) {
            throw new Error(
              output
            )
          }

          return output.includes(
            `listening on http://127.0.0.1:${port}`
          )
        }
      )

      const healthResponse =
        await fetch(
          `${base}/health`,
          {
            headers: {
              authorization:
                `Bearer ${token}`
            }
          }
        )

      const health =
        await healthResponse.json()

      assert.equal(
        health.ok,
        true
      )

      assert.ok(
        health.handshake
          .capabilities
          .includes(
            'avatar-identity-edit'
          )
      )

      const startResponse =
        await fetch(
          `${base}/avatar/edit/jobs`,
          {
            method:
              'POST',
            headers,
            body:
              JSON.stringify({
                prompt:
                  'Keep the exact same person.',
                seed:
                  42,
                referencePaths: [
                  'KINAOU/Assets/master.png'
                ]
              })
          }
        )

      const started =
        await startResponse.json()

      assert.equal(
        startResponse.status,
        202
      )

      assert.equal(
        started.ok,
        true
      )

      const succeeded =
        await waitFor(
          async () => {
            const response =
              await fetch(
                `${base}/avatar/edit/jobs/${started.job.id}`,
                {
                  headers: {
                    authorization:
                      `Bearer ${token}`
                  }
                }
              )

            const payload =
              await response.json()

            return payload.job
              ?.state
              === 'succeeded'
              ? payload.job
              : false
          }
        )

      assert.match(
        succeeded.outputPath,
        /^KINAOU\/Assets\/GeneratedAvatars\/.+\.png$/
      )

      const generated =
        path.join(
          managedRoot,
          succeeded.outputPath
            .slice(
              'KINAOU/'.length
            )
        )

      assert.deepEqual(
        await readFile(
          generated
        ),
        PNG
      )

      const multiResponse =
        await fetch(
          `${base}/avatar/edit/jobs`,
          {
            method:
              'POST',
            headers,
            body:
              JSON.stringify({
                prompt:
                  'Unsupported product multi reference.',
                seed:
                  43,
                referencePaths: [
                  'KINAOU/Assets/master.png',
                  'KINAOU/Assets/master-2.png'
                ]
              })
          }
        )

      assert.equal(
        multiResponse.status,
        400
      )

      const cancelResponse =
        await fetch(
          `${base}/avatar/edit/jobs`,
          {
            method:
              'POST',
            headers,
            body:
              JSON.stringify({
                prompt:
                  'CANCEL-ME',
                seed:
                  44,
                referencePaths: [
                  'KINAOU/Assets/master.png'
                ]
              })
          }
        )

      const cancelStarted =
        await cancelResponse.json()

      const cancelledResponse =
        await fetch(
          `${base}/avatar/edit/jobs/${cancelStarted.job.id}/cancel`,
          {
            method:
              'POST',
            headers: {
              authorization:
                `Bearer ${token}`
            }
          }
        )

      const cancelled =
        await cancelledResponse.json()

      assert.equal(
        cancelled.job.state,
        'cancelled'
      )

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            200
          )
      )

      const finalResponse =
        await fetch(
          `${base}/avatar/edit/jobs/${cancelStarted.job.id}`,
          {
            headers: {
              authorization:
                `Bearer ${token}`
            }
          }
        )

      const final =
        await finalResponse.json()

      assert.equal(
        final.job.state,
        'cancelled'
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
          recursive:
            true,
          force:
            true
        }
      )
    }
  }
)
