#!/usr/bin/env python3

import argparse
import gc
import hashlib
import json
from pathlib import Path


def args():
    p = argparse.ArgumentParser()

    p.add_argument(
        "--snapshot",
        required=True,
    )

    p.add_argument(
        "--dataset",
        required=True,
    )

    p.add_argument(
        "--out",
        required=True,
    )

    p.add_argument(
        "--prompt",
        required=True,
    )

    p.add_argument(
        "--size",
        required=True,
        type=int,
    )

    return p.parse_args()


def main():
    a = args()

    if (
        a.size < 128
        or a.size > 512
        or a.size % 8
    ):
        raise RuntimeError(
            "precompute size must be a multiple of 8 between 128 and 512"
        )

    snapshot = Path(
        a.snapshot
    ).resolve()

    dataset = Path(
        a.dataset
    ).resolve()

    out = Path(
        a.out
    ).resolve()

    out.mkdir(
        parents=True,
        exist_ok=True,
    )

    images = sorted(
        p
        for p in dataset.iterdir()
        if p.suffix.lower()
        in {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
        }
    )

    if not images:
        raise RuntimeError(
            "identity dataset is empty"
        )

    import mlx.core as mx
    import numpy as np

    from mlx_diffuser.converters import (
        get_converter,
    )

    from mlx_diffuser.utils import (
        prepare_image,
    )

    print(
        json.dumps({
            "phase":
                "vae-load",
            "images":
                len(images),
            "size":
                a.size,
        }),
        flush=True,
    )

    vae = (
        get_converter(
            "AutoencoderKL"
        )
        .convert(
            snapshot / "vae",
            dtype=mx.float32,
        )
    )

    mx.eval(
        vae.parameters()
    )

    latents = []

    for index, image in enumerate(images):
        pixels = prepare_image(
            image,
            height=a.size,
            width=a.size,
            dtype=mx.float32,
        )

        posterior = vae.encode(
            pixels
        )

        latent = (
            posterior.mode()
            * vae.scaling_factor
        ).astype(
            mx.float16
        )

        mx.eval(latent)

        latents.append(
            np.array(latent)
        )

        print(
            json.dumps({
                "phase":
                    "latent",
                "index":
                    index,
                "file":
                    image.name,
                "shape":
                    list(
                        latent.shape
                    ),
            }),
            flush=True,
        )

    latent_array = np.concatenate(
        latents,
        axis=0,
    )

    np.savez_compressed(
        out / "latents.npz",
        latents=
            latent_array,
    )

    del vae
    gc.collect()
    mx.clear_cache()

    print(
        json.dumps({
            "phase":
                "text-encoders-load",
        }),
        flush=True,
    )

    from transformers import (
        CLIPTokenizer,
    )

    te1 = (
        get_converter(
            "CLIPTextModel"
        )
        .convert(
            snapshot
            / "text_encoder",
            dtype=mx.float16,
        )
    )

    te2 = (
        get_converter(
            "CLIPTextModelWithProjection"
        )
        .convert(
            snapshot
            / "text_encoder_2",
            dtype=mx.float16,
        )
    )

    tokenizer1 = (
        CLIPTokenizer
        .from_pretrained(
            str(
                snapshot
                / "tokenizer"
            ),
            local_files_only=True,
        )
    )

    tokenizer2 = (
        CLIPTokenizer
        .from_pretrained(
            str(
                snapshot
                / "tokenizer_2"
            ),
            local_files_only=True,
        )
    )

    def ids(tokenizer):
        encoded = tokenizer(
            a.prompt,
            padding="max_length",
            max_length=77,
            truncation=True,
            return_tensors="np",
        )

        return mx.array(
            encoded[
                "input_ids"
            ].astype(
                "int32"
            )
        )

    hidden1, _ = te1(
        ids(
            tokenizer1
        )
    )

    hidden2, pooled = te2(
        ids(
            tokenizer2
        )
    )

    context = mx.concatenate(
        [
            hidden1[-2],
            hidden2[-2],
        ],
        axis=-1,
    ).astype(
        mx.float16
    )

    pooled = pooled.astype(
        mx.float16
    )

    mx.eval(
        context,
        pooled,
    )

    np.savez_compressed(
        out
        / "prompt-embeddings.npz",
        context=
            np.array(
                context
            ),
        pooled=
            np.array(
                pooled
            ),
    )

    source_hashes = {
        path.name:
            hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
        for path in images
    }

    manifest = {
        "schemaVersion": 1,
        "prompt":
            a.prompt,
        "size":
            a.size,
        "latentShape":
            list(
                latent_array.shape
            ),
        "contextShape":
            list(
                context.shape
            ),
        "pooledShape":
            list(
                pooled.shape
            ),
        "images":
            source_hashes,
    }

    (
        out
        / "precompute-manifest.json"
    ).write_text(
        json.dumps(
            manifest,
            indent=2,
        )
        + "\n",
        encoding="utf8",
    )

    print(
        json.dumps({
            "ok": True,
            "type":
                "kinaou-avatar-lora-precompute",
            **manifest,
        }),
        flush=True,
    )


if __name__ == "__main__":
    main()
