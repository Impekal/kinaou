#!/usr/bin/env python3

import argparse
from pathlib import Path


def args():
    p = argparse.ArgumentParser()

    p.add_argument(
        "--snapshot",
        required=True,
    )

    p.add_argument(
        "--adapter",
        required=True,
    )

    p.add_argument(
        "--prompt",
        required=True,
    )

    p.add_argument(
        "--negative",
        default="",
    )

    p.add_argument(
        "--output",
        required=True,
    )

    p.add_argument(
        "--seed",
        type=int,
        required=True,
    )

    p.add_argument(
        "--size",
        type=int,
        default=384,
    )

    p.add_argument(
        "--adapter-scale",
        type=float,
        default=1.0,
    )

    return p.parse_args()


def main():
    a = args()

    import mlx.core as mx

    from mlx_diffuser.lora import (
        load_lora,
    )

    from mlx_diffuser.pipelines import (
        StableDiffusionXLPipeline,
    )

    from mlx_diffuser.utils import (
        to_pil,
    )

    pipe = (
        StableDiffusionXLPipeline
        .from_diffusers(
            a.snapshot,
            dtype=mx.float16,
        )
    )

    adapted = load_lora(
        pipe.unet,
        a.adapter,
    )

    from mlx_diffuser.lora.lora import (
        _iter_lora,
    )

    scaled_layers = 0

    for layer in _iter_lora(
        pipe.unet
    ):
        layer.scale *= (
            a.adapter_scale
        )

        scaled_layers += 1

    if scaled_layers != adapted:
        raise RuntimeError(
            f"LoRA scale layer mismatch: {scaled_layers} != {adapted}"
        )

    print(
        f"ADAPTER_SCALE={a.adapter_scale}"
    )

    if adapted != 420:
        raise RuntimeError(
            f"unexpected LoRA layer count: {adapted}"
        )

    result = pipe(
        a.prompt,
        negative_prompt=
            a.negative,
        height=
            a.size,
        width=
            a.size,
        num_inference_steps=
            20,
        guidance_scale=
            5.0,
        seed=
            a.seed,
        tile_vae=
            True,
        release_text_encoders=
            True,
        progress=
            True,
    )

    image = to_pil(
        result[0]
    )

    output = Path(
        a.output
    )

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    image.save(
        output,
        "PNG",
    )

    print(
        f"OUTPUT={output}"
    )


if __name__ == "__main__":
    main()
