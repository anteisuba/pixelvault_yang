"""Qwen-Image-2.1 internal evaluation workflows; not a public model registration."""

import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.request import urlopen

from runner_payload import safe_basename

MODEL_REVISION = "ace0edeb3791a594ddfa36ed5f41a178a394e921"
MODEL_REPOSITORY = "https://huggingface.co/Comfy-Org/Qwen-Image-2.1"
MODEL_LICENSE_URL = "https://raw.githubusercontent.com/QwenLM/Qwen-Image-2.1/fb7ae1d1f9611cd91524d03c53c5246b36ac8577/LICENSE"
MODEL_FILES = (
    ("diffusion_models/qwen_image_2.1_int8_convrot.safetensors", 7256783064,
     "cb74113cb03faecd79611b01fd7fd642f0aa60d6f0b95086abee214d75eaa57d"),
    ("text_encoders/qwen3vl_8b_int8_convrot.safetensors", 9350798360,
     "8bfd0f6e12abf2d2d697ecc888e5e90b0d6741d6708f05799f53afa560452e8f"),
    ("vae/qwen_image_2.1_vae_bf16.safetensors", 675509688,
     "bb21f7473051e1ac368515dd3f2e15cd44d7a11748ee8823e1ddca3e4876b7c9"),
)


def build_workflow(prompt, *, negative_prompt="", seed=20260921, steps=25,
                   cfg=1.0, width=1024, height=1024, references=()):
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("A non-empty prompt is required")
    if type(seed) is not int or not 0 <= seed <= 18_446_744_073_709_551_615:
        raise ValueError("Seed must be a uint64 integer")
    if type(steps) is not int or not 1 <= steps <= 100:
        raise ValueError("Steps must be an integer from 1 to 100")
    if not isinstance(cfg, (int, float)) or not math.isfinite(cfg) or not 1 <= cfg <= 10:
        raise ValueError("CFG must be between 1 and 10")
    for size in (width, height):
        if type(size) is not int or not 256 <= size <= 2048 or size % 32:
            raise ValueError("Dimensions must be multiples of 32 between 256 and 2048")
    if isinstance(references, str) or len(references) > 10:
        raise ValueError("Supply at most 10 reference image filenames")
    for name in references:
        safe_basename(name)

    workflow = {
        "model": {"class_type": "UNETLoader", "inputs": {
            "unet_name": Path(MODEL_FILES[0][0]).name, "weight_dtype": "default"}},
        "clip": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": Path(MODEL_FILES[1][0]).name, "type": "qwen_image", "device": "default"}},
        "vae": {"class_type": "VAELoader", "inputs": {
            "vae_name": Path(MODEL_FILES[2][0]).name}},
        "encode": {"class_type": "TextEncodeQwenImage21", "inputs": {
            "clip": ["clip", 0], "prompt": prompt,
            "negative_prompt": negative_prompt, "resolution": 1024}},
        "sampler": {"class_type": "KSampler", "inputs": {
            "model": ["model", 0], "positive": ["encode", 0], "negative": ["encode", 1],
            "latent_image": ["latent", 0], "seed": str(seed), "steps": steps,
            "cfg": cfg, "sampler_name": "euler", "scheduler": "simple", "denoise": 1}},
        "decode": {"class_type": "VAEDecode", "inputs": {
            "samples": ["sampler", 0], "vae": ["vae", 0]}},
        "save": {"class_type": "SaveImage", "inputs": {
            "images": ["decode", 0], "filename_prefix": "qwen21-evaluation"}},
    }
    if references:
        workflow["encode"]["inputs"]["vae"] = ["vae", 0]
        for index, name in enumerate(references, start=1):
            node_id = f"reference-{index}"
            workflow[node_id] = {"class_type": "LoadImage", "inputs": {"image": name}}
            workflow["encode"]["inputs"][f"images.image_{index}"] = [node_id, 0]
        workflow["cache"] = {"class_type": "QwenImage21Cache", "inputs": {
            "model": ["model", 0], "device": "auto", "dtype": "default"}}
        workflow["sampler"]["inputs"].update(model=["cache", 0], latent_image=["encode", 2])
    else:
        workflow["latent"] = {"class_type": "EmptyLatentImage", "inputs": {
            "width": width, "height": height, "batch_size": 1}}
    return workflow


def download_models(root):
    root = Path(root)
    for relative_path, expected_size, expected_hash in MODEL_FILES:
        target = root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".partial")
        digest = hashlib.sha256()
        size = 0
        try:
            with urlopen(f"{MODEL_REPOSITORY}/resolve/{MODEL_REVISION}/{relative_path}", timeout=120) as response:
                with temporary.open("wb") as output:
                    while chunk := response.read(8 * 1024 * 1024):
                        output.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
            if size != expected_size or digest.hexdigest() != expected_hash:
                raise ValueError(f"Model integrity check failed: {relative_path}")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    license_path = root / "Qwen-Image-2.1-LICENSE.txt"
    with urlopen(MODEL_LICENSE_URL, timeout=60) as response:
        license_path.write_bytes(response.read())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-models", metavar="DIRECTORY")
    parser.add_argument("--prompt")
    parser.add_argument("--reference", action="append", default=[])
    parser.add_argument("--seed", type=int, default=20260921)
    parser.add_argument("--steps", type=int, default=25)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    args = parser.parse_args()
    if args.download_models:
        download_models(args.download_models)
    else:
        print(json.dumps({"input": {"workflow": build_workflow(
            args.prompt, seed=args.seed, steps=args.steps, width=args.width,
            height=args.height, references=args.reference)}}, ensure_ascii=False, indent=2))
