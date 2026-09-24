#!/usr/bin/env python3

import argparse
import json
import math
import time
from pathlib import Path


def args():
    p = argparse.ArgumentParser()

    p.add_argument(
        "--snapshot",
        required=True,
    )

    p.add_argument(
        "--precomputed",
        required=True,
    )

    p.add_argument(
        "--out",
        required=True,
    )

    p.add_argument(
        "--steps",
        type=int,
        default=16,
    )

    p.add_argument(
        "--rank",
        type=int,
        default=4,
    )

    p.add_argument(
        "--lr",
        type=float,
        default=5e-5,
    )

    p.add_argument(
        "--seed",
        type=int,
        default=43001,
    )

    return p.parse_args()


def main():
    a = args()

    if (
        a.steps < 1
        or a.steps > 500
    ):
        raise RuntimeError(
            "training steps must be between 1 and 500"
        )

    snapshot = Path(
        a.snapshot
    ).resolve()

    precomputed = Path(
        a.precomputed
    ).resolve()

    out = Path(
        a.out
    ).resolve()

    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    import numpy as np

    from mlx_diffuser.converters import (
        get_converter,
    )

    from mlx_diffuser.lora import (
        inject_lora,
        save_lora,
    )

    from mlx_diffuser.schedulers import (
        EulerDiscreteScheduler,
    )

    from mlx_diffuser.schedulers.euler import (
        EulerConfig,
    )

    latent_data = np.load(
        precomputed
        / "latents.npz"
    )

    embedding_data = np.load(
        precomputed
        / "prompt-embeddings.npz"
    )

    latents_np = latent_data[
        "latents"
    ]

    context = mx.array(
        embedding_data[
            "context"
        ]
    ).astype(
        mx.float16
    )

    pooled = mx.array(
        embedding_data[
            "pooled"
        ]
    ).astype(
        mx.float16
    )

    if (
        latents_np.ndim != 4
        or latents_np.shape[-1]
        != 4
    ):
        raise RuntimeError(
            "invalid precomputed latent tensor"
        )

    latent_h = int(
        latents_np.shape[1]
    )

    latent_w = int(
        latents_np.shape[2]
    )

    image_h = (
        latent_h * 8
    )

    image_w = (
        latent_w * 8
    )

    time_ids = mx.array(
        [[
            image_h,
            image_w,
            0,
            0,
            image_h,
            image_w,
        ]],
        dtype=mx.float16,
    )

    mx.eval(
        context,
        pooled,
        time_ids,
    )

    started = time.time()

    print(
        json.dumps({
            "phase":
                "load-unet",
            "latentShape":
                list(
                    latents_np.shape
                ),
        }),
        flush=True,
    )

    unet = (
        get_converter(
            "UNet2DConditionModel"
        )
        .convert(
            snapshot
            / "unet",
            dtype=mx.float16,
        )
    )

    adapted = inject_lora(
        unet,
        rank=a.rank,
        alpha=
            float(
                a.rank * 2
            ),
        targets=(
            "to_q",
            "to_k",
            "to_v",
        ),
    )

    if adapted != 420:
        raise RuntimeError(
            f"unexpected adapted layer count: {adapted}"
        )

    scheduler = EulerDiscreteScheduler(
        EulerConfig(
            beta_schedule=
                "scaled_linear",
            beta_start=
                0.00085,
            beta_end=
                0.012,
            prediction_type=
                "epsilon",
            timestep_spacing=
                "leading",
            steps_offset=
                1,
        )
    )

    optimizer = optim.AdamW(
        learning_rate=
            a.lr,
    )

    def loss_fn(
        noisy,
        timestep,
        prompt_context,
        prompt_pooled,
        ids,
        target,
    ):
        prediction = unet(
            noisy,
            timestep,
            prompt_context,
            prompt_pooled,
            ids,
        )

        delta = (
            prediction
            - target
        )

        return mx.mean(
            delta
            * delta
        )

    loss_and_grad = (
        nn.value_and_grad(
            unet,
            loss_fn,
        )
    )

    key = mx.random.key(
        a.seed
    )

    losses = []

    print(
        json.dumps({
            "phase":
                "training-start",
            "steps":
                a.steps,
            "images":
                int(
                    latents_np.shape[0]
                ),
            "rank":
                a.rank,
            "adaptedLayers":
                adapted,
        }),
        flush=True,
    )

    for step in range(
        a.steps
    ):
        key, noise_key, time_key = (
            mx.random.split(
                key,
                3,
            )
        )

        index = (
            step
            % latents_np.shape[0]
        )

        clean = mx.array(
            latents_np[
                index:index + 1
            ]
        ).astype(
            mx.float16
        )

        noise = mx.random.normal(
            clean.shape,
            key=noise_key,
        ).astype(
            mx.float16
        )

        timestep = (
            scheduler
            .sample_timesteps(
                1,
                time_key,
            )
        )

        noisy = scheduler.add_noise(
            clean,
            noise,
            timestep,
        ).astype(
            mx.float16
        )

        target = (
            scheduler
            .get_target(
                clean,
                noise,
                timestep,
            )
            .astype(
                mx.float16
            )
        )

        loss, gradients = (
            loss_and_grad(
                noisy,
                timestep,
                context,
                pooled,
                time_ids,
                target,
            )
        )

        optimizer.update(
            unet,
            gradients,
        )

        mx.eval(
            loss,
            unet.trainable_parameters(),
            optimizer.state,
        )

        value = float(
            loss.item()
        )

        if not math.isfinite(
            value
        ):
            raise RuntimeError(
                "non-finite training loss"
            )

        losses.append(
            value
        )

        print(
            json.dumps({
                "phase":
                    "step",
                "step":
                    step + 1,
                "loss":
                    value,
                "imageIndex":
                    int(index),
                "timestep":
                    int(
                        timestep[0]
                        .item()
                    ),
            }),
            flush=True,
        )

    save_lora(
        unet,
        out,
        rank=a.rank,
        alpha=
            float(
                a.rank * 2
            ),
        targets=(
            "to_q",
            "to_k",
            "to_v",
        ),
    )

    manifest = {
        "schemaVersion": 1,
        "kind":
            "kinaou-avatar-identity-lora-pilot",
        "steps":
            a.steps,
        "rank":
            a.rank,
        "learningRate":
            a.lr,
        "adaptedLayers":
            adapted,
        "trainingImageCount":
            int(
                latents_np.shape[0]
            ),
        "latentSize": [
            latent_h,
            latent_w,
        ],
        "lossFirst":
            losses[0],
        "lossLast":
            losses[-1],
        "lossMin":
            min(
                losses
            ),
        "elapsedSeconds":
            round(
                time.time()
                - started,
                3,
            ),
        "identityPreservationAccepted":
            False,
    }

    (
        out
        / "training-manifest.json"
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
                "kinaou-avatar-identity-lora-training",
            **manifest,
        }),
        flush=True,
    )

    mx.clear_cache()


if __name__ == "__main__":
    main()
