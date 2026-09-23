import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const sha256 = bytes =>
  createHash('sha256')
    .update(bytes)
    .digest('hex')

const pause = () =>
  new Promise(
    resolve =>
      setTimeout(resolve, 30)
  )

test(
  'worker hashes real avatar files and keeps an immutable receipt',
  { timeout: 30000 },
  async () => {
    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          'kinaou-avatar-receipt-'
        )
      )

    const managed =
      path.join(root, 'KINAOU')

    await mkdir(
      path.join(
        managed,
        'Assets',
        'GeneratedImages'
      ),
      { recursive: true }
    )

    const sourceBytes =
      Buffer.from(
        'authorized-avatar-reference'
      )

    const outputBytes =
      Buffer.from(
        'generated-avatar-output'
      )

    const sourcePath =
      path.join(
        managed,
        'Assets',
        'reference.png'
      )

    const outputPath =
      path.join(
        managed,
        'Assets',
        'GeneratedImages',
        'output.png'
      )

    await writeFile(
      sourcePath,
      sourceBytes
    )

    await writeFile(
      outputPath,
      outputBytes
    )

    const port = 43958

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
              'avatar-receipt-test',
            KINAOU_WORKER_PORT:
              String(port)
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
        logs += data.toString()
      }
    )

    child.stderr.on(
      'data',
      data => {
        logs += data.toString()
      }
    )

    const base =
      `http://127.0.0.1:${port}`

    async function request(
      route,
      body
    ) {
      const response =
        await fetch(
          `${base}${route}`,
          {
            method: 'POST',
            headers: {
              authorization:
                'Bearer avatar-receipt-test',
              'content-type':
                'application/json'
            },
            body:
              JSON.stringify(body)
          }
        )

      return {
        status:
          response.status,
        ...await response.json()
      }
    }

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
          || child.exitCode !== null
        ) {
          throw new Error(logs)
        }

        await pause()
      }

      const hashes =
        await request(
          '/assets/hash',
          {
            paths: [
              'KINAOU/Assets/reference.png',
              'KINAOU/Assets/GeneratedImages/output.png'
            ]
          }
        )

      assert.equal(
        hashes.status,
        200
      )

      assert.equal(
        hashes.results[0].sha256,
        sha256(sourceBytes)
      )

      assert.equal(
        hashes.results[1].sha256,
        sha256(outputBytes)
      )

      const document = {
        schemaVersion: 1,
        type:
          'kinaou-avatar-creation-receipt',
        project: {
          id: 'project-1',
          title: 'Avatar Test'
        },
        avatar: {
          id: 'avatar-1',
          name: 'Marc',
          versionId:
            'version-1',
          versionLabel:
            'Original'
        },
        receipt: {
          id: 'receipt-1',
          createdAt:
            '2026-09-23T20:00:00.000Z',
          avatarId:
            'avatar-1',
          versionId:
            'version-1',
          outputAssetId:
            'output-id',
          outputKind:
            'image',
          jobId: 'job-1',
          prompt:
            'Same person',
          editInstruction: '',
          engine: {
            adapterId:
              'fixture',
            engineId:
              'fixture',
            engineVersion: '1',
            modelId:
              'fixture',
            capabilities: [
              'identity-preservation',
              'scene-image'
            ],
            rights: {
              licenseName:
                'Fixture',
              licenseSnapshotAt:
                '2026-09-23T18:00:00.000Z',
              privateUse:
                'allowed',
              commercialOutput:
                'allowed',
              commercialSoftwareUse:
                'unknown',
              modelRedistribution:
                'unknown',
              attributionRequired:
                false,
              notes: ''
            }
          },
          sourceAssetIds: [
            'source-id'
          ],
          sourceHashes: {},
          metadata: {}
        },
        output: {
          id: 'output-id',
          kind: 'image',
          uri:
            'KINAOU/Assets/GeneratedImages/output.png'
        },
        sources: [{
          id: 'source-id',
          kind: 'image',
          uri:
            'KINAOU/Assets/reference.png'
        }]
      }

      const first =
        await request(
          '/avatar/receipts/export',
          { document }
        )

      assert.equal(
        first.status,
        201
      )

      assert.equal(
        first.result.output.sha256,
        sha256(outputBytes)
      )

      assert.equal(
        first.result.sources[0]
          .sha256,
        sha256(sourceBytes)
      )

      const receiptPath =
        path.join(
          managed,
          'Receipts',
          'Avatars',
          'receipt-1.json'
        )

      assert.equal(
        sha256(
          await readFile(receiptPath)
        ),
        first.result.documentSha256
      )

      const second =
        await request(
          '/avatar/receipts/export',
          { document }
        )

      assert.equal(
        second.result.documentSha256,
        first.result.documentSha256
      )

      await writeFile(
        outputPath,
        Buffer.from(
          'tampered-output'
        )
      )

      const tampered =
        await request(
          '/avatar/receipts/export',
          { document }
        )

      assert.equal(
        tampered.ok,
        false
      )

      assert.match(
        tampered.error.message,
        /no longer matches/
      )
    } finally {
      child.kill('SIGKILL')

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
