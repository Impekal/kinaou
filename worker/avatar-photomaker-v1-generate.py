#!/usr/bin/env python3

import argparse
import contextlib
import io
import gc
import importlib.util
import json
from pathlib import Path
import sys
import time


def arguments():
    p = argparse.ArgumentParser()

    p.add_argument("--source", required=True)
    p.add_argument("--snapshot", required=True)
    p.add_argument("--checkpoint", required=True)

    p.add_argument(
        "--reference",
        action="append",
        required=True,
    )

    p.add_argument("--output", required=True)
    p.add_argument("--prompt", required=True)
    p.add_argument("--negative", default="")
    p.add_argument("--seed", type=int, required=True)
    p.add_argument("--steps", type=int, default=30)

    p.add_argument(
        "--start-merge-step",
        type=int,
        default=0,
    )

    p.add_argument("--size", type=int, default=512)

    return p.parse_args()


def main():
    args = arguments()

    if (
        importlib.util.find_spec(
            "insightface"
        )
        is not None
    ):
        raise RuntimeError(
            "V1 harness refuses an environment containing InsightFace"
        )

    source = Path(
        args.source
    ).resolve()

    snapshot = Path(
        args.snapshot
    ).resolve()

    checkpoint = Path(
        args.checkpoint
    ).resolve()

    output = Path(
        args.output
    ).resolve()

    references = [
        Path(value).resolve()
        for value
        in args.reference
    ]

    sys.path.insert(
        0,
        str(source),
    )

    import torch
    from PIL import Image

    from diffusers import (
        EulerDiscreteScheduler,
    )

    from photomaker.pipeline import (
        PhotoMakerStableDiffusionXLPipeline,
    )

    if not torch.backends.mps.is_available():
        raise RuntimeError(
            "MPS unavailable"
        )

    started = time.time()

    print(
        json.dumps({
            "phase":
                "load-base",
            "references":
                len(references),
            "size":
                args.size,
        }),
        flush=True,
    )

    pipe = (
        PhotoMakerStableDiffusionXLPipeline
        .from_pretrained(
            str(snapshot),
            torch_dtype=
                torch.float16,
            use_safetensors=
                True,
            variant=
                "fp16",
            local_files_only=
                True,
        )
    )

    # PhotoMaker V1 constructs its ID encoder on self.device.
    # The upstream V1 usage moves SDXL to the execution device first,
    # then loads the PhotoMaker adapter.
    pipe = pipe.to(
        "mps"
    )

    state = torch.load(
        checkpoint,
        map_location="cpu",
        weights_only=True,
    )

    if set(state) != {
        "id_encoder",
        "lora_weights",
    }:
        raise RuntimeError(
            "Unexpected PhotoMaker V1 checkpoint structure"
        )

    print(
        json.dumps({
            "phase":
                "load-photomaker-v1",
        }),
        flush=True,
    )

    adapter_log = io.StringIO()

    with contextlib.redirect_stdout(
        adapter_log
    ):
        pipe.load_photomaker_adapter(
            state,
            weight_name=
                checkpoint.name,
            trigger_word=
                "img",
        )

    # Explicitly seal the V1 ID encoder onto the same execution device.
    pipe.id_encoder = (
        pipe.id_encoder
        .to(
            device="mps",
            dtype=torch.float16,
        )
    )

    first_id_parameter = next(
        pipe.id_encoder.parameters()
    )

    if first_id_parameter.device.type != "mps":
        raise RuntimeError(
            "PhotoMaker V1 ID encoder is not on MPS"
        )

    if first_id_parameter.dtype != torch.float16:
        raise RuntimeError(
            "PhotoMaker V1 ID encoder is not float16"
        )

    print(
        json.dumps({
            "phase":
                "photomaker-v1-ready",
            "idEncoderDevice":
                first_id_parameter.device.type,
            "idEncoderDtype":
                str(
                    first_id_parameter.dtype
                ),
        }),
        flush=True,
    )

    pipe.scheduler = (
        EulerDiscreteScheduler
        .from_config(
            pipe.scheduler.config
        )
    )

    pipe.fuse_lora()

    if hasattr(
        pipe.vae,
        "enable_slicing"
    ):
        pipe.vae.enable_slicing()

    if hasattr(
        pipe.vae,
        "enable_tiling"
    ):
        pipe.vae.enable_tiling()

    images = []

    for reference in references:
        with Image.open(
            reference
        ) as opened:
            images.append(
                opened
                .convert(
                    "RGB"
                )
                .copy()
            )

    generator = (
        torch.Generator(
            device="cpu"
        )
        .manual_seed(
            args.seed
        )
    )

    print(
        json.dumps({
            "phase":
                "generate",
            "seed":
                args.seed,
        }),
        flush=True,
    )

    result = pipe(
        prompt=
            args.prompt,
        input_id_images=
            images,
        negative_prompt=
            args.negative,
        num_images_per_prompt=
            1,
        num_inference_steps=
            args.steps,
        start_merge_step=
            args.start_merge_step,
        guidance_scale=
            5.0,
        height=
            args.size,
        width=
            args.size,
        generator=
            generator,
    )

    generated = (
        result.images[0]
    )

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    generated.save(
        output,
        "PNG",
    )

    print(
        json.dumps({
            "ok":
                True,
            "type":
                "kinaou-photomaker-v1-generation",
            "output":
                str(output),
            "referenceCount":
                len(references),
            "seed":
                args.seed,
            "steps":
                args.steps,
            "startMergeStep":
                args.start_merge_step,
            "device":
                "mps",
            "insightFace":
                False,
            "faceId":
                False,
            "elapsedSeconds":
                round(
                    time.time()
                    - started,
                    3,
                ),
        }),
        flush=True,
    )

    del generated
    del result
    del pipe

    gc.collect()
    torch.mps.empty_cache()


if __name__ == "__main__":
    main()
