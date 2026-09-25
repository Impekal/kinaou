import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript =
  fileURLToPath(
    new URL(
      './mac-worker.mjs',
      import.meta.url
    )
  )

const TOKEN =
  'clip-reframing-test-token'

const PORT =
  43931


function run(command, args) {
  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          command,
          args,
          {
            shell:
              false
          }
        )

      const stdout = []
      let stderr = ''

      child.stdout?.on(
        'data',
        chunk =>
          stdout.push(chunk)
      )

      child.stderr?.on(
        'data',
        chunk => {
          stderr +=
            chunk.toString()
        }
      )

      child.on(
        'error',
        reject
      )

      child.on(
        'close',
        code =>
          code === 0
            ? resolve(
                Buffer.concat(
                  stdout
                )
              )
            : reject(
                new Error(
                  `${command} exited with ${code}: ${stderr.slice(0, 400)}`
                )
              )
      )
    }
  )
}


async function hasFfmpeg() {
  try {
    await run(
      'ffmpeg',
      ['-version']
    )

    await run(
      'ffprobe',
      ['-version']
    )

    return true
  } catch {
    return false
  }
}


async function centreRgb(
  file,
  atSeconds
) {
  const raw =
    await run(
      'ffmpeg',
      [
        '-v',
        'error',
        '-ss',
        String(atSeconds),
        '-i',
        file,
        '-vf',
        'crop=40:40:130:280,scale=1:1',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-'
      ]
    )

  return {
    red:
      raw[0] ?? 0,

    green:
      raw[1] ?? 0,

    blue:
      raw[2] ?? 0
  }
}


test(
  'different Short clips can select different cover-focus regions in one real render',
  {
    timeout:
      120_000
  },
  async t => {
    if (
      !(await hasFfmpeg())
    ) {
      t.skip(
        'ffmpeg/ffprobe not installed'
      )

      return
    }

    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          'kinaou-clip-reframe-'
        )
      )

    const managedRoot =
      path.join(
        root,
        'KINAOU'
      )

    await mkdir(
      path.join(
        managedRoot,
        'Assets'
      ),
      {
        recursive:
          true
      }
    )

    await mkdir(
      path.join(
        managedRoot,
        'Renders'
      ),
      {
        recursive:
          true
      }
    )

    const source =
      path.join(
        managedRoot,
        'Assets',
        'striped.mp4'
      )

    await run(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:size=900x600:rate=24:duration=1.2',
        '-vf',
        'drawbox=x=300:y=0:w=300:h=600:color=green:t=fill,drawbox=x=600:y=0:w=300:h=600:color=blue:t=fill',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        source
      ]
    )

    const child =
      spawn(
        process.execPath,
        [workerScript],
        {
          env: {
            PATH:
              process.env.PATH,

            KINAOU_MANAGED_ROOT:
              managedRoot,

            KINAOU_WORKER_TOKEN:
              TOKEN,

            KINAOU_WORKER_PORT:
              String(PORT)
          },

          stdio: [
            'ignore',
            'pipe',
            'pipe'
          ]
        }
      )

    let output = ''

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
          `listening on http://127.0.0.1:${PORT}`
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

      const outputRelativePath =
        'KINAOU/Renders/per-clip-focus.mp4'

      const asset = {
        id:
          'striped',

        kind:
          'video',

        uri:
          'KINAOU/Assets/striped.mp4',

        managed:
          true,

        offline:
          false,

        metadata: {
          durationMs:
            1200
        }
      }

      const transform = {
        x:
          0,

        y:
          0,

        scale:
          1,

        cropLeft:
          0,

        cropTop:
          0,

        cropRight:
          0,

        cropBottom:
          0
      }

      const baseClip = {
        trackId:
          'video',

        trackType:
          'video',

        trackIndex:
          0,

        asset,

        durationMs:
          1000,

        sourceOffsetMs:
          0,

        gain:
          1,

        speed:
          1,

        transform,

        fades: {
          inMs:
            0,

          outMs:
            0
        }
      }

      const plan = {
        purpose:
          'export',

        projectId:
          'clip-reframing-proof',

        outputRelativePath,

        preset: {
          name:
            'Per clip focus',

          container:
            'mp4',

          width:
            300,

          height:
            600,

          fps:
            24,

          videoCodec:
            'h264',

          audioCodec:
            'aac',

          fit:
            'cover',

          focusX:
            0.5,

          focusY:
            0.5
        },

        durationMs:
          2000,

        requiredCapabilities: [
          'filesystem',
          'ffmpeg',
          'format-reframing'
        ],

        clips: [
          {
            ...baseClip,

            clipId:
              'left',

            startMs:
              0,

            reframe: {
              focusX:
                0,

              focusY:
                0.5
            }
          },

          {
            ...baseClip,

            clipId:
              'right',

            startMs:
              1000,

            reframe: {
              focusX:
                1,

              focusY:
                0.5
            }
          }
        ]
      }

      const response =
        await fetch(
          `http://127.0.0.1:${PORT}/render`,
          {
            method:
              'POST',

            headers: {
              authorization:
                `Bearer ${TOKEN}`,

              'content-type':
                'application/json'
            },

            body:
              JSON.stringify({
                plan
              })
          }
        )

      const started =
        await response.json()

      assert.equal(
        started.ok,
        true,
        `render did not start: ${JSON.stringify(started)}`
      )

      let rendered = ''

      for (
        let attempt = 0;
        attempt < 120;
        attempt += 1
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              250
            )
        )

        const status =
          await fetch(
            `http://127.0.0.1:${PORT}/render/jobs/${started.job.id}`,
            {
              headers: {
                authorization:
                  `Bearer ${TOKEN}`
              }
            }
          )

        const {
          job
        } =
          await status.json()

        if (
          job.state
          === 'succeeded'
        ) {
          rendered =
            path.join(
              managedRoot,
              outputRelativePath.slice(
                'KINAOU/'.length
              )
            )

          break
        }

        if (
          job.state
            !== 'queued'
          && job.state
            !== 'running'
        ) {
          throw new Error(
            `render ${job.state}: ${job.error ?? ''}`
          )
        }
      }

      assert.ok(
        rendered,
        'render did not finish in time'
      )

      const first =
        await centreRgb(
          rendered,
          0.5
        )

      const second =
        await centreRgb(
          rendered,
          1.5
        )

      assert.ok(
        first.red
          > first.blue + 100
        && first.red
          > first.green + 100,
        `first clip should focus left: ${JSON.stringify(first)}`
      )

      assert.ok(
        second.blue
          > second.red + 100
        && second.blue
          > second.green + 100,
        `second clip should focus right: ${JSON.stringify(second)}`
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
