import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FLUX2_KLEIN_ACCEPTED_SIZE,
  FLUX2_KLEIN_ACCEPTED_STEPS,
  FLUX2_KLEIN_BASE_MODEL,
  FLUX2_KLEIN_MODEL_REVISION,
  buildFlux2KleinAvatarEditCommand
} from './avatar-flux2-klein.mjs'

test(
  'builds the exact human-accepted offline FLUX.2 Klein edit profile',
  () => {
    const result =
      buildFlux2KleinAvatarEditCommand({
        cliPath:
          '/runtime/bin/mflux-generate-flux2-edit',
        modelPath:
          '/runtime/models/flux2',
        referencePaths: [
          '/managed/reference.png'
        ],
        prompt:
          'Keep the exact same person and change only the clothing.',
        outputPath:
          '/managed/output.png',
        seed:
          430202
      })

    assert.equal(
      result.executable,
      '/runtime/bin/mflux-generate-flux2-edit'
    )

    assert.deepEqual(
      result.env,
      {
        HF_HUB_OFFLINE:
          '1',
        TRANSFORMERS_OFFLINE:
          '1'
      }
    )

    assert.deepEqual(
      result.args,
      [
        '--model',
        '/runtime/models/flux2',
        '--base-model',
        'flux2-klein-4b',
        '--image-paths',
        '/managed/reference.png',
        '--prompt',
        'Keep the exact same person and change only the clothing.',
        '--steps',
        '4',
        '--seed',
        '430202',
        '--width',
        '512',
        '--height',
        '512',
        '--low-ram',
        '--vae-tile-size',
        '512',
        '--mlx-cache-limit-gb',
        '2',
        '--metadata',
        '--output',
        '/managed/output.png'
      ]
    )

    assert.equal(
      FLUX2_KLEIN_BASE_MODEL,
      'flux2-klein-4b'
    )

    assert.equal(
      FLUX2_KLEIN_ACCEPTED_STEPS,
      4
    )

    assert.equal(
      FLUX2_KLEIN_ACCEPTED_SIZE,
      512
    )

    assert.equal(
      FLUX2_KLEIN_MODEL_REVISION,
      '73dcaa322be48ea49374b32b4b23aab1a3e59b87'
    )
  }
)

test(
  'accepts multiple unique local references without claiming multi-reference quality yet',
  () => {
    const result =
      buildFlux2KleinAvatarEditCommand({
        cliPath:
          '/runtime/bin/mflux-generate-flux2-edit',
        modelPath:
          '/runtime/models/flux2',
        referencePaths: [
          '/managed/master.png',
          '/managed/profile.png'
        ],
        prompt:
          'Preserve the exact same identity.',
        outputPath:
          '/managed/output.png',
        seed:
          42
      })

    const index =
      result.args.indexOf(
        '--image-paths'
      )

    assert.deepEqual(
      result.args.slice(
        index + 1,
        index + 3
      ),
      [
        '/managed/master.png',
        '/managed/profile.png'
      ]
    )
  }
)

test(
  'rejects unsafe or unsupported command inputs',
  () => {
    const base = {
      cliPath:
        '/runtime/bin/mflux-generate-flux2-edit',
      modelPath:
        '/runtime/models/flux2',
      referencePaths: [
        '/managed/master.png'
      ],
      prompt:
        'Same person.',
      outputPath:
        '/managed/output.png',
      seed:
        42
    }

    assert.throws(
      () =>
        buildFlux2KleinAvatarEditCommand({
          ...base,
          cliPath:
            'relative-cli'
        }),
      /absolute path/
    )

    assert.throws(
      () =>
        buildFlux2KleinAvatarEditCommand({
          ...base,
          referencePaths: []
        }),
      /1–12/
    )

    assert.throws(
      () =>
        buildFlux2KleinAvatarEditCommand({
          ...base,
          referencePaths: [
            '/managed/master.png',
            '/managed/master.png'
          ]
        }),
      /unique/
    )

    assert.throws(
      () =>
        buildFlux2KleinAvatarEditCommand({
          ...base,
          prompt: ' '
        }),
      /prompt/
    )

    assert.throws(
      () =>
        buildFlux2KleinAvatarEditCommand({
          ...base,
          seed: -1
        }),
      /seed/
    )
  }
)

test(
  'accepts only the exact pinned runtime manifest',
  async () => {
    const {
      parseFlux2KleinRuntimeManifest
    } =
      await import(
        './avatar-flux2-klein.mjs'
      )

    const manifest = {
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
    }

    assert.equal(
      parseFlux2KleinRuntimeManifest(
        manifest
      ).modelAggregateSha256,
      manifest.modelAggregateSha256
    )

    assert.throws(
      () =>
        parseFlux2KleinRuntimeManifest({
          ...manifest,
          modelRevision:
            '0'.repeat(40)
        }),
      /runtime manifest/
    )

    assert.throws(
      () =>
        parseFlux2KleinRuntimeManifest({
          ...manifest,
          commercialOutput:
            'restricted'
        }),
      /runtime manifest/
    )
  }
)
