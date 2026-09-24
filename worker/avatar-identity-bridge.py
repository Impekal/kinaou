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

    parser.add_argument(
        "--manifest",
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


def require_inside(
    child,
    parent,
):
    child = Path(
        child
    ).resolve()

    parent = Path(
        parent
    ).resolve()

    try:
        child.relative_to(
            parent
        )
    except ValueError as exc:
        raise RuntimeError(
            "Pinned model snapshot is outside "
            "the configured Avatar cache"
        ) from exc

    return child


def pinned_models(
    manifest_path,
    cache_path,
):
    if not manifest_path:
        return (
            None,
            None,
            ["runtime:manifest"],
            [
                "Pinned Avatar install manifest "
                "is not configured."
            ],
        )

    manifest_file = Path(
        manifest_path
    ).resolve()

    if not manifest_file.is_file():
        return (
            None,
            None,
            ["runtime:manifest"],
            [
                "Pinned Avatar install manifest "
                "does not exist."
            ],
        )

    data = json.loads(
        manifest_file.read_text(
            encoding="utf8"
        )
    )

    if (
        data.get("adapterId")
        != ADAPTER_ID
    ):
        raise RuntimeError(
            "Avatar manifest adapter mismatch"
        )

    if (
        data.get("faceIdUsed")
        is not False
        or data.get(
            "insightFaceUsed"
        )
        is not False
    ):
        raise RuntimeError(
            "FaceID/InsightFace is forbidden"
        )

    base = data.get(
        "baseModel",
        {}
    )

    adapter = data.get(
        "ipAdapter",
        {}
    )

    if (
        base.get("repoId")
        != BASE_MODEL
        or adapter.get("repoId")
        != IP_ADAPTER
    ):
        raise RuntimeError(
            "Pinned repository identity mismatch"
        )

    hub = (
        Path(cache_path)
        .resolve()
        / "hub"
    )

    base_snapshot = require_inside(
        base["snapshot"],
        hub,
    )

    ip_snapshot = require_inside(
        adapter["snapshot"],
        hub,
    )

    if (
        base_snapshot.name
        != base.get("revision")
        or ip_snapshot.name
        != adapter.get("revision")
    ):
        raise RuntimeError(
            "Pinned snapshot/revision mismatch"
        )

    base_result = {
        "repoId":
            BASE_MODEL,
        "available":
            valid_sdxl_snapshot(
                base_snapshot
            ),
        "snapshot":
            str(base_snapshot),
        "revision":
            base["revision"],
    }

    ip_result = {
        "repoId":
            IP_ADAPTER,
        "available":
            valid_ip_snapshot(
                ip_snapshot
            ),
        "snapshot":
            str(ip_snapshot),
        "revision":
            adapter["revision"],
    }

    missing = []

    if not base_result[
        "available"
    ]:
        missing.append(
            "model:sdxl-base"
        )

    if not ip_result[
        "available"
    ]:
        missing.append(
            "model:ip-adapter-plus-face"
        )

    return (
        base_result,
        ip_result,
        missing,
        [
            (
                "Pinned snapshots resolved "
                "directly from local manifest."
            ),
            (
                "No Hugging Face snapshot lookup "
                "is used during runtime discovery."
            ),
        ],
    )

def probe(
    device,
    cache,
    manifest,
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

    (
        base_model,
        ip_adapter,
        model_missing,
        model_notes,
    ) = pinned_models(
        manifest,
        cache_path,
    )

    missing.extend(
        model_missing
    )

    if base_model is None:
        base_model = {
            "repoId":
                BASE_MODEL,
            "available":
                False,
        }

    if ip_adapter is None:
        ip_adapter = {
            "repoId":
                IP_ADAPTER,
            "available":
                False,
        }

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
            "baseModel":
                base_model,
            "ipAdapter":
                ip_adapter,
        },
        "missing":
            sorted(
                set(missing)
            ),
        "notes":
            model_notes
            + [
                (
                    "Probe is offline-only."
                ),
                (
                    "FaceID/InsightFace variants "
                    "are intentionally excluded."
                ),
                (
                    "Commercial-output status "
                    "remains pending explicit "
                    "combined license review."
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
        args.manifest,
    )


if __name__ == "__main__":
    main()
