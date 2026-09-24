#!/usr/bin/env python3

import argparse
import importlib
import importlib.metadata
import json
import os
import sys
from pathlib import Path

ADAPTER_ID = (
    "sdxl-ip-adapter-plus-face"
)

BASE_MODEL = (
    "stabilityai/"
    "stable-diffusion-xl-base-1.0"
)

IP_ADAPTER = "h94/IP-Adapter"

IP_WEIGHT = (
    "sdxl_models/"
    "ip-adapter-plus-face_"
    "sdxl_vit-h.safetensors"
)


def parse_args():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--probe",
        action="store_true",
    )

    parser.add_argument(
        "--device",
        choices=[
            "mps",
            "cpu",
        ],
        default="mps",
    )

    parser.add_argument(
        "--cache",
        required=True,
    )

    return parser.parse_args()


def package_version(
    distribution,
):
    try:
        return importlib.metadata.version(
            distribution
        )
    except (
        importlib.metadata
        .PackageNotFoundError
    ):
        return None


def module_available(
    module,
):
    try:
        importlib.import_module(
            module
        )
        return True
    except Exception:
        return False


def snapshot_revision(
    value,
):
    path = Path(value)

    if (
        path.parent.name
        == "snapshots"
    ):
        revision = path.name

        if revision:
            return revision

    return None


def has_weights(
    directory,
):
    directory = Path(directory)

    if not directory.is_dir():
        return False

    return any(
        item.is_file()
        and item.suffix
        in {
            ".safetensors",
            ".bin",
        }
        for item
        in directory.rglob("*")
    )


def valid_sdxl_snapshot(
    snapshot,
):
    root = Path(snapshot)

    required = [
        root / "model_index.json",
        root
        / "scheduler"
        / "scheduler_config.json",
        root
        / "unet"
        / "config.json",
        root
        / "vae"
        / "config.json",
        root
        / "text_encoder"
        / "config.json",
        root
        / "text_encoder_2"
        / "config.json",
        root
        / "tokenizer"
        / "tokenizer_config.json",
        root
        / "tokenizer_2"
        / "tokenizer_config.json",
    ]

    if not all(
        item.is_file()
        for item
        in required
    ):
        return False

    for folder in (
        "unet",
        "vae",
        "text_encoder",
        "text_encoder_2",
    ):
        if not has_weights(
            root / folder
        ):
            return False

    return True


def valid_ip_snapshot(
    snapshot,
):
    root = Path(snapshot)

    weight = (
        root / IP_WEIGHT
    )

    encoder = (
        root
        / "models"
        / "image_encoder"
    )

    return (
        weight.is_file()
        and (
            encoder
            / "config.json"
        ).is_file()
        and has_weights(
            encoder
        )
    )


def local_snapshot(
    repo_id,
    cache_dir,
):
    try:
        from huggingface_hub import (
            snapshot_download,
        )

        return snapshot_download(
            repo_id=repo_id,
            repo_type="model",
            cache_dir=cache_dir,
            local_files_only=True,
        )
    except Exception:
        return None


def probe(
    device,
    cache,
):
    cache_path = Path(
        cache
    ).resolve()

    cache_path.mkdir(
        parents=True,
        exist_ok=True,
    )

    os.environ[
        "HF_HOME"
    ] = str(cache_path)

    hub = cache_path / "hub"

    os.environ[
        "HF_HUB_CACHE"
    ] = str(hub)

    os.environ[
        "HUGGINGFACE_HUB_CACHE"
    ] = str(hub)

    os.environ[
        "HF_HUB_OFFLINE"
    ] = "1"

    os.environ[
        "TRANSFORMERS_OFFLINE"
    ] = "1"

    os.environ[
        "DIFFUSERS_OFFLINE"
    ] = "1"

    os.environ[
        "HF_HUB_DISABLE_XET"
    ] = "1"

    packages = {
        "torch":
            package_version(
                "torch"
            ),
        "diffusers":
            package_version(
                "diffusers"
            ),
        "transformers":
            package_version(
                "transformers"
            ),
        "huggingface_hub":
            package_version(
                "huggingface-hub"
            ),
        "safetensors":
            package_version(
                "safetensors"
            ),
        "pillow":
            package_version(
                "Pillow"
            ),
    }

    required_modules = {
        "torch": "torch",
        "diffusers":
            "diffusers",
        "transformers":
            "transformers",
        "huggingface_hub":
            "huggingface_hub",
        "safetensors":
            "safetensors",
        "pillow":
            "PIL",
    }

    missing = []

    for (
        name,
        module,
    ) in required_modules.items():
        if not module_available(
            module
        ):
            missing.append(
                f"package:{name}"
            )

    device_ready = True

    if (
        "package:torch"
        not in missing
    ):
        import torch

        if device == "mps":
            device_ready = bool(
                torch.backends
                .mps
                .is_built()
                and torch.backends
                .mps
                .is_available()
            )

            if not device_ready:
                missing.append(
                    "device:mps"
                )

    base_snapshot = None
    ip_snapshot = None

    if (
        "package:huggingface_hub"
        not in missing
    ):
        base_snapshot = (
            local_snapshot(
                BASE_MODEL,
                str(hub),
            )
        )

        ip_snapshot = (
            local_snapshot(
                IP_ADAPTER,
                str(hub),
            )
        )

    base_available = bool(
        base_snapshot
        and valid_sdxl_snapshot(
            base_snapshot
        )
    )

    ip_available = bool(
        ip_snapshot
        and valid_ip_snapshot(
            ip_snapshot
        )
    )

    if not base_available:
        missing.append(
            "model:sdxl-base"
        )

    if not ip_available:
        missing.append(
            "model:ip-adapter-plus-face"
        )

    available = bool(
        not missing
        and device_ready
    )

    result = {
        "configured": True,
        "available":
            available,
        "offlineOnly": True,
        "adapterId":
            ADAPTER_ID,
        "device":
            device,
        "pythonVersion":
            sys.version.split()[0],
        "packageVersions":
            packages,
        "models": {
            "baseModel": {
                "repoId":
                    BASE_MODEL,
                "available":
                    base_available,
                **(
                    {
                        "snapshot":
                            str(
                                Path(
                                    base_snapshot
                                )
                                .resolve()
                            ),
                        "revision":
                            snapshot_revision(
                                base_snapshot
                            ),
                    }
                    if base_available
                    else {}
                ),
            },
            "ipAdapter": {
                "repoId":
                    IP_ADAPTER,
                "available":
                    ip_available,
                **(
                    {
                        "snapshot":
                            str(
                                Path(
                                    ip_snapshot
                                )
                                .resolve()
                            ),
                        "revision":
                            snapshot_revision(
                                ip_snapshot
                            ),
                    }
                    if ip_available
                    else {}
                ),
            },
        },
        "missing":
            sorted(
                set(missing)
            ),
        "notes": [
            (
                "Probe is offline-only; "
                "no Hub download is permitted."
            ),
            (
                "FaceID/InsightFace "
                "variants are intentionally "
                "not used by this adapter."
            ),
            (
                "Commercial-output status "
                "remains pending until the "
                "combined license snapshot "
                "is explicitly accepted."
            ),
        ],
    }

    print(
        json.dumps(
            result,
            separators=(
                ",",
                ":",
            ),
        )
    )


def main():
    args = parse_args()

    if not args.probe:
        raise RuntimeError(
            "Only --probe is implemented "
            "in Avatar Identity 4.3A"
        )

    probe(
        args.device,
        args.cache,
    )


if __name__ == "__main__":
    main()
