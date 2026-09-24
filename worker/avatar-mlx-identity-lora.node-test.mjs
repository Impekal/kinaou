import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readFile
} from 'node:fs/promises'

test(
  'identity LoRA pilot precomputes expensive encoders and keeps acceptance truthful',
  async () => {
    const precompute =
      await readFile(
        new URL(
          './avatar-mlx-lora-precompute.py',
          import.meta.url
        ),
        'utf8'
      )

    const train =
      await readFile(
        new URL(
          './avatar-mlx-lora-train.py',
          import.meta.url
        ),
        'utf8'
      )

    const generate =
      await readFile(
        new URL(
          './avatar-mlx-lora-generate.py',
          import.meta.url
        ),
        'utf8'
      )

    assert.match(
      precompute,
      /posterior\.mode/
    )

    assert.match(
      precompute,
      /prompt-embeddings\.npz/
    )

    assert.match(
      train,
      /inject_lora/
    )

    assert.match(
      train,
      /scheduler\.add_noise/
    )

    assert.match(
      train,
      /scheduler[\s\S]*get_target/
    )

    assert.match(
      train,
      /value_and_grad/
    )

    assert.match(
      train,
      /save_lora/
    )

    assert.match(
      train,
      /identityPreservationAccepted/
    )

    assert.match(
      generate,
      /load_lora/
    )

    assert.match(
      generate,
      /release_text_encoders/
    )

    assert.doesNotMatch(
      precompute + train + generate,
      /snapshot_download/
    )

    assert.doesNotMatch(
      precompute + train + generate,
      /avatar-identity-preservation/
    )
  }
)
