"""
PixelVault Runner — worker-comfyui fork handler (runtime LoRA + checkpoint download).

设计：docs/plans/comfy-runner-v2-runtime-lora.md（②a，LoRA）
     + docs/plans/comfy-runner-v3-checkpoint-ondemand.md（v3，底模）。

官方 runpod/worker-comfyui:5.8.6-base 的 /start.sh 先后台起 ComfyUI，再跑
`python -u /handler.py`（handler 通过 127.0.0.1:8188 和 ComfyUI 通信）。本 fork
不改 start.sh／CMD：Dockerfile 把官方 /handler.py 挪成 /handler_base.py，再把本文件
放到 /handler.py。于是 start.sh 那句 `python -u /handler.py` 跑的是本 wrapper——它在把
job 交给官方 handler 之前：
- v2：把 input.loras_to_fetch 里每把 LoRA 从 **R2 预签名 URL** 拉到
  /runpod-volume/models/loras/（缺则下、有则跳＝缓存）。
- v3：把 input.checkpoint_to_fetch 的底模从 **Civitai** 直下到
  /runpod-volume/models/checkpoints/（同样缓存）。
- v6：把 allowlist 中的后处理放大模型从 **Hugging Face** 拉到
  /runpod-volume/models/upscale_models/，并在落盘前校验 SHA-256。
ComfyUI 的 folder_paths 按目录 mtime 失效缓存，故新下载的 LoRA/checkpoint 当次请求即可
被 LoraLoader / CheckpointLoaderSimple 找到。

安全：
- LoRA 只认 source == "r2"（app 生成的短时效预签名链）；checkpoint 只认 source ==
  "civitai" 且 URL host 属 civitai.com（防 SSRF）。
- 文件名必须是纯 basename（无路径分隔 / ..），防目录穿越。

⚠ 部署前须核对（见 README，随 worker-comfyui 版本可能变）：
- 官方 handler 现为 /handler.py 且 serverless.start 有 __main__ 卫（5.8.6 已确认）。
- 目录由 /comfyui/extra_model_paths.yaml 决定：base_path /runpod-volume →
  loras models/loras/ · checkpoints models/checkpoints/（5.8.6 已确认）。
- v3 底模直下需给端点配 CIVITAI_KEY secret（gated/限流兜底；公开底模无 token 也能下）。
"""

import hashlib
import importlib.util
import os
from urllib.parse import urlparse

import requests
import runpod

from runner_payload import normalize_workflow_seeds
from cache_policy import cache_inventory, ensure_cache_capacity, touch_cache_hit
from cache_manifest import append_download_event, write_volume_manifest

# ── 需按 base 镜像核对的常量 ──────────────────────────────────────
LORA_DIR = os.environ.get("RUNNER_LORA_DIR", "/runpod-volume/models/loras")
CHECKPOINT_DIR = os.environ.get(
    "RUNNER_CHECKPOINT_DIR", "/runpod-volume/models/checkpoints"
)
# v4：Anima 等 DiT 底模是 UNET-only，配 UNETLoader（ComfyUI 的 "diffusion_models"
# folder）。worker-comfyui 的 extra_model_paths.yaml 把 volume 的 `models/unet/` 经
# ComfyUI legacy 别名 `unet→diffusion_models` 并入该 folder——所以落 models/unet/，
# UNETLoader 才找得到（volume 上没映射 models/diffusion_models/）。
DIFFUSION_MODELS_DIR = os.environ.get(
    "RUNNER_DIFFUSION_MODELS_DIR", "/runpod-volume/models/unet"
)
UPSCALER_DIR = os.environ.get(
    "RUNNER_UPSCALER_DIR", "/runpod-volume/models/upscale_models"
)
# checkpoint_to_fetch.target_dir 允许值 → 落盘目录。白名单，防写到卷上任意目录。
CHECKPOINT_TARGET_DIRS = {
    "checkpoints": CHECKPOINT_DIR,
    "diffusion_models": DIFFUSION_MODELS_DIR,
}
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("RUNNER_LORA_DL_TIMEOUT", "600"))
# 底模大（6.5GB+），给足下载窗口。
CHECKPOINT_DL_TIMEOUT_SECONDS = int(os.environ.get("RUNNER_CKPT_DL_TIMEOUT", "1800"))
BASE_HANDLER_PATH = os.environ.get("RUNNER_BASE_HANDLER", "/handler_base.py")
ALLOWED_LORA_SOURCE = "r2"
ALLOWED_CHECKPOINT_SOURCE = "civitai"
# v3：worker 发的是不带 token 的 civitai URL，fork 用自己的 secret 加鉴权。
CIVITAI_TOKEN = os.environ.get("CIVITAI_KEY") or os.environ.get("CIVITAI_API_TOKEN")
VOLUME_ROOT = os.environ.get("RUNNER_VOLUME_ROOT", "/runpod-volume")
CACHE_MANIFEST_PATH = os.environ.get(
    "RUNNER_CACHE_MANIFEST_PATH",
    os.path.join(VOLUME_ROOT, "pixelvault-cache-manifest.json"),
)
DOWNLOAD_HISTORY_PATH = os.environ.get(
    "RUNNER_DOWNLOAD_HISTORY_PATH",
    os.path.join(VOLUME_ROOT, "pixelvault-download-history.jsonl"),
)

# 载入官方 handler 模块。因其 serverless.start 有 __main__ 卫，import 不会用官方
# handler 抢先 start —— 由本 wrapper 统一 start（见文件末）。
_spec = importlib.util.spec_from_file_location("handler_base", BASE_HANDLER_PATH)
if _spec is None or _spec.loader is None:
    raise RuntimeError(
        f"Cannot load base worker-comfyui handler at {BASE_HANDLER_PATH!r}"
    )
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)
base_handler = _base.handler


def _safe_basename(name: str) -> str:
    if not name or "/" in name or "\\" in name or ".." in name:
        raise ValueError(f"Invalid filename (path traversal blocked): {name!r}")
    return name


def _is_civitai_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host == "civitai.com" or host.endswith(".civitai.com")


def _is_huggingface_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host == "huggingface.co" or host.endswith(".huggingface.co")


# v4：Anima DiT 的共享配件（文本编码器/VAE）+ 默认底模落盘目录白名单。source 限
# 'huggingface'（公开、无需鉴权），host 白名单防 SSRF。
COMPANION_TARGET_DIRS = {
    "unet": DIFFUSION_MODELS_DIR,
    "clip": os.environ.get("RUNNER_CLIP_DIR", "/runpod-volume/models/clip"),
    "vae": os.environ.get("RUNNER_VAE_DIR", "/runpod-volume/models/vae"),
}
ALLOWED_COMPANION_SOURCE = "huggingface"
ALLOWED_UPSCALER_SOURCE = "huggingface"
UPSCALER_SHA256_ALLOWLIST = {
    "4x-AnimeSharp.pth": "e7a7de2dafd7331c1992862bbbcd9e9712a9f9f8e6303f0aaa59b4341d359bab",
}


def _record_cache_event(action, kind, source, path, size_bytes=None):
    try:
        append_download_event(
            DOWNLOAD_HISTORY_PATH,
            action=action,
            kind=kind,
            source=source,
            filename=os.path.basename(path),
            target_path=os.path.relpath(path, VOLUME_ROOT),
            size_bytes=size_bytes,
        )
    except Exception as error:
        print(
            f"[runner-fork] cache history write failed: {error}",
            flush=True,
        )


def _persist_cache_manifest(inventory):
    try:
        manifest = write_volume_manifest(
            CACHE_MANIFEST_PATH,
            VOLUME_ROOT,
            inventory,
            DOWNLOAD_HISTORY_PATH,
        )
        print(
            f"[runner-fork] persisted cache manifest: {manifest['fileCount']} files",
            flush=True,
        )
    except Exception as error:
        print(
            f"[runner-fork] cache manifest write failed: {error}",
            flush=True,
        )


def _download_to(
    url: str,
    dest: str,
    timeout: int = DOWNLOAD_TIMEOUT_SECONDS,
    headers=None,
    protected_paths=(),
    expected_sha256=None,
) -> list:
    tmp = dest + ".part"
    try:
        with requests.get(
            url, stream=True, timeout=timeout, headers=headers
        ) as resp:
            resp.raise_for_status()
            incoming_bytes = int(resp.headers.get("content-length") or 0)
            evicted = ensure_cache_capacity(
                dest,
                incoming_bytes,
                LORA_DIR,
                CHECKPOINT_DIR,
                DIFFUSION_MODELS_DIR,
                protected_paths=protected_paths,
            )
            for path in evicted:
                print(f"[runner-fork] evicted LRU cache file {path}", flush=True)
                _record_cache_event(
                    action="evicted",
                    kind="cache",
                    source="runner",
                    path=path,
                )
            with open(tmp, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        fh.write(chunk)
        if expected_sha256:
            _verify_sha256(tmp, expected_sha256)
        os.replace(tmp, dest)
        return evicted
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _verify_sha256(path: str, expected_sha256: str) -> None:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual.lower() != expected_sha256.lower():
        raise ValueError(
            f"SHA-256 mismatch for {os.path.basename(path)!r}: {actual}"
        )


def ensure_checkpoint(spec, protected_paths=()) -> None:
    """v3：把源图配方的精确底模从 Civitai 直下到 models/checkpoints/（缺则下、有则跳）。"""
    if not spec:
        return
    source = spec.get("source")
    if source != ALLOWED_CHECKPOINT_SOURCE:
        raise ValueError(f"Refusing checkpoint from disallowed source: {source!r}")
    filename = _safe_basename(spec.get("filename", ""))
    url = spec.get("url")
    if not url:
        raise ValueError(f"Missing download url for checkpoint {filename!r}")
    if not _is_civitai_url(url):
        raise ValueError(
            f"Refusing checkpoint from non-civitai url (SSRF blocked): {url!r}"
        )
    # v4：按 target_dir 白名单选落盘目录（缺省 checkpoints/；Anima DiT→diffusion_models/）。
    target_dir_key = spec.get("target_dir") or "checkpoints"
    target_dir = CHECKPOINT_TARGET_DIRS.get(target_dir_key)
    if target_dir is None:
        raise ValueError(f"Refusing checkpoint with unknown target_dir: {target_dir_key!r}")
    os.makedirs(target_dir, exist_ok=True)
    dest = os.path.join(target_dir, filename)
    if os.path.exists(dest):
        touch_cache_hit(dest)
        return  # 缓存命中：Volume 上已有，跳过下载
    headers = (
        {"Authorization": f"Bearer {CIVITAI_TOKEN}"} if CIVITAI_TOKEN else None
    )
    print(f"[runner-fork] downloading checkpoint {filename} …", flush=True)
    _download_to(
        url,
        dest,
        timeout=CHECKPOINT_DL_TIMEOUT_SECONDS,
        headers=headers,
        protected_paths=protected_paths,
    )
    _record_cache_event(
        action="downloaded",
        kind="checkpoint",
        source=source,
        path=dest,
        size_bytes=os.path.getsize(dest),
    )
    print(f"[runner-fork] cached checkpoint {filename}", flush=True)


def ensure_companions(companions_to_fetch, protected_paths=()) -> None:
    """v4：把 Anima DiT 的共享配件（Qwen 文本编码器/VAE）+ 默认底模从 HuggingFace 拉到
    对应目录（缺则下、有则跳＝一次入卷永久缓存）。公开文件无需鉴权。"""
    if not companions_to_fetch:
        return
    for spec in companions_to_fetch:
        source = spec.get("source")
        if source != ALLOWED_COMPANION_SOURCE:
            raise ValueError(f"Refusing companion from disallowed source: {source!r}")
        filename = _safe_basename(spec.get("filename", ""))
        url = spec.get("url")
        if not url:
            raise ValueError(f"Missing download url for companion {filename!r}")
        if not _is_huggingface_url(url):
            raise ValueError(
                f"Refusing companion from non-huggingface url (SSRF blocked): {url!r}"
            )
        dir_key = spec.get("target_dir")
        target_dir = COMPANION_TARGET_DIRS.get(dir_key)
        if target_dir is None:
            raise ValueError(f"Refusing companion with unknown target_dir: {dir_key!r}")
        os.makedirs(target_dir, exist_ok=True)
        dest = os.path.join(target_dir, filename)
        if os.path.exists(dest):
            touch_cache_hit(dest)
            continue  # 缓存命中
        print(f"[runner-fork] downloading companion {filename} → {dir_key} …", flush=True)
        _download_to(
            url,
            dest,
            timeout=CHECKPOINT_DL_TIMEOUT_SECONDS,
            protected_paths=protected_paths,
        )
        _record_cache_event(
            action="downloaded",
            kind=dir_key,
            source=source,
            path=dest,
            size_bytes=os.path.getsize(dest),
        )
        print(f"[runner-fork] cached companion {filename}", flush=True)


def ensure_loras(loras_to_fetch, protected_paths=()) -> None:
    if not loras_to_fetch:
        return
    os.makedirs(LORA_DIR, exist_ok=True)
    for spec in loras_to_fetch:
        source = spec.get("source")
        if source != ALLOWED_LORA_SOURCE:
            raise ValueError(f"Refusing LoRA from disallowed source: {source!r}")
        filename = _safe_basename(spec.get("filename", ""))
        url = spec.get("url")
        if not url:
            raise ValueError(f"Missing download url for LoRA {filename!r}")
        dest = os.path.join(LORA_DIR, filename)
        if os.path.exists(dest):
            touch_cache_hit(dest)
            continue  # 缓存命中：Volume 上已有，跳过下载
        print(f"[runner-fork] downloading LoRA {filename} …", flush=True)
        _download_to(url, dest, protected_paths=protected_paths)
        _record_cache_event(
            action="downloaded",
            kind="lora",
            source=source,
            path=dest,
            size_bytes=os.path.getsize(dest),
        )
        print(f"[runner-fork] cached LoRA {filename}", flush=True)


def ensure_upscaler(spec, protected_paths=()) -> None:
    """Cache one hash-pinned, allowlisted ComfyUI upscale model."""
    if not spec:
        return
    source = spec.get("source")
    if source != ALLOWED_UPSCALER_SOURCE:
        raise ValueError(f"Refusing upscaler from disallowed source: {source!r}")
    filename = _safe_basename(spec.get("filename", ""))
    expected_sha256 = UPSCALER_SHA256_ALLOWLIST.get(filename)
    if expected_sha256 is None:
        raise ValueError(f"Refusing unknown upscaler: {filename!r}")
    requested_sha256 = (spec.get("sha256") or "").lower()
    if requested_sha256 != expected_sha256:
        raise ValueError(f"Refusing upscaler with unexpected digest: {filename!r}")
    url = spec.get("url")
    if not url:
        raise ValueError(f"Missing download url for upscaler {filename!r}")
    if not _is_huggingface_url(url):
        raise ValueError(
            f"Refusing upscaler from non-huggingface url (SSRF blocked): {url!r}"
        )

    os.makedirs(UPSCALER_DIR, exist_ok=True)
    dest = os.path.join(UPSCALER_DIR, filename)
    if os.path.exists(dest):
        _verify_sha256(dest, expected_sha256)
        touch_cache_hit(dest)
        return

    print(f"[runner-fork] downloading upscaler {filename} …", flush=True)
    _download_to(
        url,
        dest,
        protected_paths=protected_paths,
        expected_sha256=expected_sha256,
    )
    _record_cache_event(
        action="downloaded",
        kind="upscale_models",
        source=source,
        path=dest,
        size_bytes=os.path.getsize(dest),
    )
    print(f"[runner-fork] cached upscaler {filename}", flush=True)


def handler(job):
    inp = (job or {}).get("input", {}) or {}
    os.makedirs(LORA_DIR, exist_ok=True)
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    protected_paths = set()
    for spec in inp.get("loras_to_fetch") or []:
        protected_paths.add(
            os.path.join(LORA_DIR, _safe_basename(spec.get("filename", "")))
        )
    checkpoint_spec = inp.get("checkpoint_to_fetch")
    if checkpoint_spec:
        checkpoint_dir = CHECKPOINT_TARGET_DIRS.get(
            checkpoint_spec.get("target_dir") or "checkpoints", CHECKPOINT_DIR
        )
        protected_paths.add(
            os.path.join(
                checkpoint_dir,
                _safe_basename(checkpoint_spec.get("filename", "")),
            )
        )
    upscaler_spec = inp.get("upscaler_to_fetch")
    if upscaler_spec:
        protected_paths.add(
            os.path.join(
                UPSCALER_DIR,
                _safe_basename(upscaler_spec.get("filename", "")),
            )
        )
    print(
        f"[runner-fork] cache inventory before job: {cache_inventory(LORA_DIR, CHECKPOINT_DIR, DIFFUSION_MODELS_DIR)}",
        flush=True,
    )
    # 底模先于 LoRA：checkpoint 就位后 LoRA 才有意义。v4：Anima 的共享配件（编码器/VAE/
    # 默认底模）也先备好，UNETLoader/CLIPLoader/VAELoader 才找得到。
    try:
        ensure_checkpoint(inp.get("checkpoint_to_fetch"), protected_paths)
        ensure_companions(inp.get("companions_to_fetch"), protected_paths)
        ensure_upscaler(inp.get("upscaler_to_fetch"), protected_paths)
        ensure_loras(inp.get("loras_to_fetch"), protected_paths)
    except Exception:
        _persist_cache_manifest(
            cache_inventory(LORA_DIR, CHECKPOINT_DIR, DIFFUSION_MODELS_DIR)
        )
        raise
    normalize_workflow_seeds(job)
    inventory = cache_inventory(LORA_DIR, CHECKPOINT_DIR, DIFFUSION_MODELS_DIR)
    print(f"[runner-fork] cache inventory after job: {inventory}", flush=True)
    _persist_cache_manifest(inventory)
    return base_handler(job)


if __name__ == "__main__":
    print(
        "[runner-fork] starting wrapped handler (runtime LoRA + checkpoint download) …",
        flush=True,
    )
    runpod.serverless.start({"handler": handler})
