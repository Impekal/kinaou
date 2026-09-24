#!/usr/bin/env python3

import argparse
import json
import math
import time
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--snapshot",
        required=True,
    )

    parser.add_argument(
        "--latent-size",
        type=int,
        required=True,
    )

    parser.add_argument(
        "--rank",
        type=int,
        default=4,
    )

    parser.add_argument(
        "--lr",
        type=float,
        default=1e-4,
    )

    return parser.parse_args()


def main():
    args = parse_args()

    if (
        args.latent_size < 4
        or args.latent_size > 64
    ):
        raise RuntimeError(
            "latent size must be between 4 and 64"
        )

    if (
        args.rank < 1
        or args.rank > 32
    ):
        raise RuntimeError(
            "LoRA rank must be between 1 and 32"
        )

    snapshot = Path(
        args.snapshot
    ).resolve()

    unet_dir = (
        snapshot / "unet"
    )

    if not (
        unet_dir
        / "config.json"
    ).is_file():
        raise RuntimeError(
            "SDXL UNet config missing"
        )

    if not list(
        unet_dir.glob(
            "*.safetensors"
        )
    ):
        raise RuntimeError(
            "SDXL UNet weights missing"
        )

    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim

    from mlx.utils import (
        tree_flatten,
    )

    from mlx_diffuser.converters import (
        get_converter,
    )

    from mlx_diffuser.lora import (
        inject_lora,
        lora_state_dict,
    )

    started = time.time()

    print(
        json.dumps({
            "phase":
                "load-unet",
            "snapshot":
                str(snapshot),
            "latentSize":
                args.latent_size,
            "rank":
                args.rank,
        }),
        flush=True,
    )

    converter = get_converter(
        "UNet2DConditionModel"
    )

    unet = converter.convert(
        unet_dir,
        dtype=mx.float16,
    )

    mx.eval(
        unet.parameters()
    )

    loaded_seconds = (
        time.time()
        - started
    )

    print(
        json.dumps({
            "phase":
                "unet-loaded",
            "seconds":
                round(
                    loaded_seconds,
                    3,
                ),
        }),
        flush=True,
    )

    adapted_layers = inject_lora(
        unet,
        rank=args.rank,
        alpha=
            float(
                args.rank * 2
            ),
        targets=(
            "to_q",
            "to_k",
            "to_v",
        ),
    )

    if adapted_layers < 1:
        raise RuntimeError(
            "No SDXL attention layers received LoRA"
        )

    state = lora_state_dict(
        unet
    )

    if not state:
        raise RuntimeError(
            "LoRA state is empty"
        )

    trainable_parameters = sum(
        math.prod(
            value.shape
        )
        for value
        in state.values()
    )

    print(
        json.dumps({
            "phase":
                "lora-injected",
            "adaptedLayers":
                adapted_layers,
            "trainableParameters":
                trainable_parameters,
            "tensors":
                len(state),
        }),
        flush=True,
    )

    size = args.latent_size

    k0 = mx.random.key(4300)
    k1 = mx.random.key(4301)
    k2 = mx.random.key(4302)

    sample = (
        mx.random.normal(
            (
                1,
                size,
                size,
                4,
            ),
            key=k0,
        )
        .astype(
            mx.float16
        )
    )

    context = (
        mx.random.normal(
            (
                1,
                77,
                2048,
            ),
            key=k1,
        )
        .astype(
            mx.float16
        )
    )

    text_embeds = (
        mx.random.normal(
            (
                1,
                1280,
            ),
            key=k2,
        )
        .astype(
            mx.float16
        )
    )

    timestep = mx.array(
        [500.0],
        dtype=mx.float32,
    )

    image_size = (
        size * 8
    )

    time_ids = mx.array(
        [[
            image_size,
            image_size,
            0,
            0,
            image_size,
            image_size,
        ]],
        dtype=mx.float16,
    )

    mx.eval(
        sample,
        context,
        text_embeds,
        timestep,
        time_ids,
    )

    def loss_fn(
        sample_value,
        timestep_value,
        context_value,
        text_value,
        time_value,
    ):
        prediction = unet(
            sample_value,
            timestep_value,
            context_value,
            text_value,
            time_value,
        )

        return mx.mean(
            prediction
            * prediction
        )

    loss_and_grad = (
        nn.value_and_grad(
            unet,
            loss_fn,
        )
    )

    optimizer = optim.AdamW(
        learning_rate=
            args.lr,
    )

    step_started = (
        time.time()
    )

    print(
        json.dumps({
            "phase":
                "forward-backward-start",
        }),
        flush=True,
    )

    loss, gradients = (
        loss_and_grad(
            sample,
            timestep,
            context,
            text_embeds,
            time_ids,
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

    step_seconds = (
        time.time()
        - step_started
    )

    loss_value = float(
        loss.item()
    )

    if not math.isfinite(
        loss_value
    ):
        raise RuntimeError(
            "Non-finite LoRA training loss"
        )

    after = lora_state_dict(
        unet
    )

    if not after:
        raise RuntimeError(
            "LoRA state disappeared after update"
        )

    first_key = sorted(
        after
    )[0]

    checksum = float(
        mx.sum(
            after[first_key]
            .astype(
                mx.float32
            )
        ).item()
    )

    result = {
        "ok":
            True,
        "type":
            "kinaou-avatar-sdxl-lora-gradient-smoke",
        "latentSize":
            size,
        "equivalentImageSize":
            image_size,
        "rank":
            args.rank,
        "adaptedLayers":
            adapted_layers,
        "trainableParameters":
            trainable_parameters,
        "loss":
            loss_value,
        "firstTrainableTensor":
            first_key,
        "firstTensorChecksum":
            checksum,
        "loadSeconds":
            round(
                loaded_seconds,
                3,
            ),
        "stepSeconds":
            round(
                step_seconds,
                3,
            ),
        "totalSeconds":
            round(
                time.time()
                - started,
                3,
            ),
    }

    print(
        json.dumps(
            result,
            separators=(
                ",",
                ":",
            ),
        ),
        flush=True,
    )

    mx.clear_cache()


if __name__ == "__main__":
    main()
