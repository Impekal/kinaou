#!/usr/bin/env python3

import argparse
import json
import os
import random
from importlib.metadata import version
from pathlib import Path

MODEL_REPO = "ResembleAI/chatterbox"


def parse_args():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--probe",
        action="store_true"
    )

    parser.add_argument(
        "--request"
    )

    parser.add_argument(
        "--output"
    )

    parser.add_argument(
        "--device",
        default="mps"
    )

    return parser.parse_args()


def probe(device):
    import perth
    import torch
    from huggingface_hub import snapshot_download

    if (
        device == "mps"
        and not torch.backends.mps.is_available()
    ):
        raise RuntimeError(
            "PyTorch MPS is not available"
        )

    if perth.PerthImplicitWatermarker is None:
        raise RuntimeError(
            "Perth implicit watermarker is unavailable"
        )

    cache = os.environ.get(
        "HF_HUB_CACHE"
    )

    if not cache:
        raise RuntimeError(
            "HF_HUB_CACHE is required"
        )

    snapshot = snapshot_download(
        repo_id=MODEL_REPO,
        repo_type="model",
        revision="main",
        allow_patterns=[
            "ve.pt",
            "t3_mtl23ls_v2.safetensors",
            "s3gen.pt",
            "grapheme_mtl_merged_expanded_v1.json",
            "conds.pt",
            "Cangjie5_TC.json",
        ],
        cache_dir=cache,
        local_files_only=True,
    )

    print(json.dumps({
        "available": True,
        "device": device,
        "packageVersion": version(
            "chatterbox-tts"
        ),
        "modelRepo": MODEL_REPO,
        "snapshot": snapshot,
    }))


def generate(request_path, output_path, device):
    import numpy as np
    import torch
    import torchaudio as ta

    from chatterbox.mtl_tts import (
        ChatterboxMultilingualTTS
    )

    request = json.loads(
        Path(request_path).read_text(
            encoding="utf8"
        )
    )

    text = request["text"]
    language = request["language"]
    seed = int(request["seed"])

    reference = request.get(
        "referencePath"
    )

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    model = (
        ChatterboxMultilingualTTS
        .from_pretrained(
            device=device
        )
    )

    cfg_weight = (
        0.0
        if reference
        else 0.5
    )

    with torch.inference_mode():
        wav = model.generate(
            text,
            language_id=language,
            audio_prompt_path=reference,
            exaggeration=0.35,
            cfg_weight=cfg_weight,
            temperature=0.8,
        )

    destination = Path(output_path)
    destination.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    ta.save(
        str(destination),
        wav.detach().cpu(),
        model.sr
    )


def main():
    args = parse_args()

    if args.probe:
        probe(args.device)
        return

    if not args.request or not args.output:
        raise RuntimeError(
            "--request and --output are required"
        )

    generate(
        args.request,
        args.output,
        args.device
    )


if __name__ == "__main__":
    main()
