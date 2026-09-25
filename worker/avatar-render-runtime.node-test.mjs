import test from 'node:test'
import assert from 'node:assert/strict'

import {
  availableAvatarRenderRuntime,
  buildAvatarRenderHost,
  buildNvidiaSmiProbeCommand,
  incompleteAvatarRenderRuntime,
  parseAvatarFinalRuntimeManifest,
  parseNvidiaSmiOutput,
  unconfiguredAvatarRenderRuntime
} from './avatar-render-runtime.mjs'


const rights = {
  licenseName:
    'Fixture license',

  licenseSnapshotAt:
    '2026-09-25T12:00:00.000Z',

  privateUse:
    'allowed',

  commercialOutput:
    'allowed',

  commercialSoftwareUse:
    'allowed',

  modelRedistribution:
    'restricted',

  attributionRequired:
    false,

  notes:
    'Fixture only'
}


function manifest() {
  return {
    schemaVersion:
      1,

    kind:
      'kinaou-avatar-local-generative-runtime',

    offlineOnly:
      true,

    executable:
      '/opt/kinaou/avatar-render',

    modelPaths: [
      '/opt/kinaou/models/video-model'
    ],

    engine: {
      adapterId:
        'local-photoreal-video',

      engineId:
        'fixture-video-engine',

      engineVersion:
        '1',

      modelId:
        'example/open-video-model',

      modelVersion:
        'fixture-revision',

      capabilities: [
        'identity-preservation',
        'image-reference',
        'scene-video',
        'motion',
        'expression'
      ],

      rights
    },

    notes: [
      'Fixture final renderer'
    ]
  }
}


test(
  'describes Apple Silicon as MPS when CUDA is absent',
  () => {
    assert.deepEqual(
      buildAvatarRenderHost({
        platform:
          'darwin',
        arch:
          'arm64',
        cpuModel:
          'Apple M2 Pro',
        systemMemoryBytes:
          16 * 1024 ** 3
      }),
      {
        platform:
          'darwin',
        arch:
          'arm64',
        accelerator:
          'mps',
        acceleratorName:
          'Apple M2 Pro',
        systemMemoryBytes:
          16 * 1024 ** 3
      }
    )
  }
)


test(
  'parses an NVIDIA CUDA probe without hard-wiring a GPU model',
  () => {
    const command =
      buildNvidiaSmiProbeCommand()

    assert.equal(
      command.executable,
      'nvidia-smi'
    )

    const gpu =
      parseNvidiaSmiOutput(
        'NVIDIA Example GPU, 32768\n'
      )

    assert.deepEqual(
      gpu,
      {
        accelerator:
          'cuda',
        acceleratorName:
          'NVIDIA Example GPU',
        vramBytes:
          32768 * 1024 * 1024
      }
    )

    assert.equal(
      buildAvatarRenderHost({
        platform:
          'win32',
        arch:
          'x64',
        cpuModel:
          'Example CPU',
        systemMemoryBytes:
          64 * 1024 ** 3,
        cuda:
          gpu
      }).accelerator,
      'cuda'
    )
  }
)


test(
  'does not invent an installed final runtime',
  () => {
    const runtime =
      unconfiguredAvatarRenderRuntime(
        buildAvatarRenderHost({
          platform:
            'darwin',
          arch:
            'arm64',
          cpuModel:
            'Apple Silicon',
          systemMemoryBytes:
            16 * 1024 ** 3
        })
      )

    assert.equal(
      runtime.localGenerative
        .available,
      false
    )

    assert.deepEqual(
      runtime.localGenerative
        .missing,
      [
        'runtime:configuration'
      ]
    )
  }
)


test(
  'accepts a model-agnostic local final manifest and exposes its exact engine',
  () => {
    const parsed =
      parseAvatarFinalRuntimeManifest(
        manifest()
      )

    assert.equal(
      parsed.engine.engineId,
      'fixture-video-engine'
    )

    const host =
      buildAvatarRenderHost({
        platform:
          'linux',
        arch:
          'x64',
        cpuModel:
          'Example CPU',
        systemMemoryBytes:
          96 * 1024 ** 3,
        cuda: {
          acceleratorName:
            'NVIDIA Example GPU',
          vramBytes:
            32 * 1024 ** 3
        }
      })

    const runtime =
      availableAvatarRenderRuntime(
        host,
        parsed
      )

    assert.equal(
      runtime.localGenerative
        .available,
      true
    )

    assert.equal(
      runtime.localGenerative
        .engine.modelId,
      'example/open-video-model'
    )

    assert.doesNotMatch(
      JSON.stringify(
        runtime
      ),
      /ltx|wan|higgsfield/i
    )
  }
)


test(
  'reports configured-but-missing local files without claiming availability',
  () => {
    const parsed =
      parseAvatarFinalRuntimeManifest(
        manifest()
      )

    const runtime =
      incompleteAvatarRenderRuntime(
        buildAvatarRenderHost({
          platform:
            'linux',
          arch:
            'x64',
          cpuModel:
            'Example CPU',
          systemMemoryBytes:
            64 * 1024 ** 3
        }),
        parsed,
        [
          'model:/opt/kinaou/models/video-model'
        ]
      )

    assert.equal(
      runtime.localGenerative
        .configured,
      true
    )

    assert.equal(
      runtime.localGenerative
        .available,
      false
    )

    assert.equal(
      runtime.localGenerative
        .engine.engineId,
      'fixture-video-engine'
    )
  }
)


test(
  'rejects manifests without required motion or verified commercial software rights',
  () => {
    const noMotion =
      manifest()

    noMotion.engine.capabilities =
      [
        'identity-preservation',
        'scene-video'
      ]

    assert.throws(
      () =>
        parseAvatarFinalRuntimeManifest(
          noMotion
        ),
      /motion/
    )

    const unknownRights =
      manifest()

    unknownRights.engine.rights = {
      ...rights,
      commercialSoftwareUse:
        'unknown'
    }

    assert.throws(
      () =>
        parseAvatarFinalRuntimeManifest(
          unknownRights
        ),
      /commercial software/
    )
  }
)
