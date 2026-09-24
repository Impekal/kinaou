import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readFile
} from 'node:fs/promises'

test(
  'real Avatar bridge contains explicit offline seed and reference generation without download APIs',
  async () => {
    const source =
      await readFile(
        new URL(
          './avatar-identity-bridge.py',
          import.meta.url
        ),
        'utf8'
      )

    assert.match(
      source,
      /--generate-seed/
    )

    assert.match(
      source,
      /--generate-reference/
    )

    assert.match(
      source,
      /StableDiffusionXLPipeline/
    )

    assert.match(
      source,
      /load_ip_adapter/
    )

    assert.match(
      source,
      /ip_adapter_image/
    )

    assert.match(
      source,
      /pipe\.vae\.enable_slicing/
    )

    assert.match(
      source,
      /pipe\.vae\.enable_tiling/
    )

    assert.match(
      source,
      /if not args\.generate_reference:/
    )

    assert.match(
      source,
      /pipe\.enable_attention_slicing/
    )

    assert.doesNotMatch(
      source,
      /pipe\.enable_vae_slicing/
    )

    assert.doesNotMatch(
      source,
      /pipe\.enable_vae_tiling/
    )

    assert.match(
      source,
      /local_files_only=True/
    )

    assert.doesNotMatch(
      source,
      /snapshot_download/
    )

    assert.doesNotMatch(
      source,
      /hf_hub_download/
    )

    assert.doesNotMatch(
      source,
      /requests\./
    )

    assert.doesNotMatch(
      source,
      /urllib/
    )
  }
)
