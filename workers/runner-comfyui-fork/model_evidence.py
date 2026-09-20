"""Bind loaded SDXL model file identities to the generated PNG."""

import hashlib
import json
import os
from functools import lru_cache

import folder_paths
import nodes
from comfy.cli_args import args


def fingerprint(path):
    stat = os.stat(path)
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


@lru_cache(maxsize=128)
def file_digest(path, signature):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    if fingerprint(path) != signature:
        raise RuntimeError("Model file changed while hashing")
    return digest.hexdigest()


def identify(folder, name):
    path = folder_paths.get_full_path_or_raise(folder, name)
    signature = fingerprint(path)
    return path, signature, {
        "kind": "checkpoint" if folder == "checkpoints" else "lora",
        "filename": name,
        "sha256": file_digest(path, signature),
        "sizeBytes": signature[2],
    }


def assert_unchanged(path, signature):
    if fingerprint(path) != signature:
        raise RuntimeError("Model file changed during loading")


class PixelVaultCheckpointLoader(nodes.CheckpointLoaderSimple):
    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING")
    FUNCTION = "load_verified"

    @classmethod
    def IS_CHANGED(cls, ckpt_name):
        path = folder_paths.get_full_path_or_raise("checkpoints", ckpt_name)
        return file_digest(path, fingerprint(path))

    def load_verified(self, ckpt_name):
        path, signature, record = identify("checkpoints", ckpt_name)
        loaded = super().load_checkpoint(ckpt_name)
        assert_unchanged(path, signature)
        return (*loaded[:3], json.dumps([record]))


class PixelVaultLoraLoader(nodes.LoraLoader):
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    FUNCTION = "load_verified"

    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs["required"]["audit"] = ("STRING", {"forceInput": True})
        return inputs

    @classmethod
    def IS_CHANGED(cls, lora_name, **kwargs):
        path = folder_paths.get_full_path_or_raise("loras", lora_name)
        return file_digest(path, fingerprint(path))

    def load_verified(self, model, clip, lora_name, strength_model, strength_clip, audit):
        records = json.loads(audit)
        if strength_model == 0 and strength_clip == 0:
            return (model, clip, audit)
        path, signature, record = identify("loras", lora_name)
        # ComfyUI caches node outputs; an executed node must not reuse stale file tensors.
        self.loaded_lora = None
        loaded = super().load_lora(model, clip, lora_name, strength_model, strength_clip)
        assert_unchanged(path, signature)
        record.update(strengthModel=strength_model, strengthClip=strength_clip)
        return (*loaded, json.dumps([*records, record]))


class PixelVaultSaveImage(nodes.SaveImage):
    FUNCTION = "save_verified"

    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs["required"]["audit"] = ("STRING", {"forceInput": True})
        return inputs

    def save_verified(self, images, audit, filename_prefix="pixelvault", prompt=None, extra_pnginfo=None):
        if args.disable_metadata:
            raise RuntimeError("PixelVault requires PNG metadata for model load evidence")
        evidence = {"version": 1, "evidence": "loader-output", "models": json.loads(audit)}
        return super().save_images(
            images, filename_prefix, prompt,
            {**(extra_pnginfo or {}), "pixelvaultExecution": evidence},
        )


NODE_CLASS_MAPPINGS = {
    "PixelVaultCheckpointLoader": PixelVaultCheckpointLoader,
    "PixelVaultLoraLoader": PixelVaultLoraLoader,
    "PixelVaultSaveImage": PixelVaultSaveImage,
}
