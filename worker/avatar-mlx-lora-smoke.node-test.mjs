import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readFile
} from 'node:fs/promises'

test(
  'MLX LoRA feasibility smoke is SDXL-specific and cannot advertise a product capability',
  async () => {
    const source =
      await readFile(
        new URL(
          './avatar-mlx-lora-smoke.py',
          import.meta.url
        ),
        'utf8'
      )

    assert.match(
      source,
      /UNet2DConditionModel/
    )

    assert.match(
      source,
      /inject_lora/
    )

    assert.match(
      source,
      /to_q/
    )

    assert.match(
      source,
      /to_k/
    )

    assert.match(
      source,
      /to_v/
    )

    assert.match(
      source,
      /value_and_grad/
    )

    assert.match(
      source,
      /optimizer\.update/
    )

    assert.doesNotMatch(
      source,
      /avatar-identity-generation/
    )

    assert.doesNotMatch(
      source,
      /avatar-identity-preservation/
    )

    assert.doesNotMatch(
      source,
      /snapshot_download/
    )

    assert.doesNotMatch(
      source,
      /hf_hub_download/
    )
  }
)
