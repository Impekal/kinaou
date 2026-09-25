import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readFile
} from 'node:fs/promises'

test(
  'PhotoMaker V1 harness uses safe pinned state and excludes InsightFace',
  async () => {
    const source =
      await readFile(
        new URL(
          './avatar-photomaker-v1-generate.py',
          import.meta.url
        ),
        'utf8'
      )

    assert.match(
      source,
      /PhotoMakerStableDiffusionXLPipeline/
    )

    assert.match(
      source,
      /weights_only=True/
    )

    assert.match(
      source,
      /input_id_images/
    )

    const moveIndex =
      source.indexOf(
        'pipe = pipe.to('
      )

    const adapterIndex =
      source.indexOf(
        'pipe.load_photomaker_adapter('
      )

    assert.ok(
      moveIndex >= 0
    )

    assert.ok(
      adapterIndex > moveIndex
    )

    assert.match(
      source,
      /idEncoderDevice/
    )

    assert.match(
      source,
      /device="mps"/
    )

    assert.match(
      source,
      /local_files_only/
    )

    assert.match(
      source,
      /insightface/
    )

    assert.doesNotMatch(
      source,
      /hf_hub_download/
    )

    assert.doesNotMatch(
      source,
      /snapshot_download/
    )

    assert.doesNotMatch(
      source,
      /PhotoMakerIDEncoder_CLIPInsightface/
    )

    assert.doesNotMatch(
      source,
      /identity-preservation/
    )
  }
)
