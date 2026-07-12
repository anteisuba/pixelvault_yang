"""
PixelVault Runner — worker-comfyui fork handler (v2 runtime LoRA download).

设计：docs/plans/comfy-runner-v2-runtime-lora.md（②a）。

官方 runpod/worker-comfyui:5.8.6-base 的 /start.sh 先后台起 ComfyUI，再跑
`python -u /handler.py`（handler 通过 127.0.0.1:8188 和 ComfyUI 通信）。本 fork
不改 start.sh／CMD：Dockerfile 把官方 /handler.py 挪成 /handler_base.py，再把本文件
放到 /handler.py。于是 start.sh 那句 `python -u /handler.py` 跑的是本 wrapper——它先
把 input.loras_to_fetch 里每把 LoRA 从 R2 预签名 URL 拉到 /runpod-volume/models/loras/
（缺则下、有则跳＝缓存），再调用官方 handler。ComfyUI 的 folder_paths 按目录 mtime 失效
缓存，故新下载的 LoRA 当次请求即可被 LoraLoader 找到。

安全：
- 只认 source == "r2"（app 侧生成的短时效预签名链），不下任意外链（防 SSRF）。
- 文件名必须是纯 basename（无路径分隔 / ..），防目录穿越。

⚠ 部署前须核对（见 README，随 worker-comfyui 版本可能变）：
- 官方 handler 现为 /handler.py 且 serverless.start 有 __main__ 卫（5.8.6 已确认）。
- LoRA 目录由 /comfyui/extra_model_paths.yaml 决定：base_path /runpod-volume +
  loras models/loras/ → /runpod-volume/models/loras（5.8.6 已确认）。
"""

import importlib.util
import os

import requests
import runpod

# ── 需按 base 镜像核对的常量 ──────────────────────────────────────
LORA_DIR = os.environ.get("RUNNER_LORA_DIR", "/runpod-volume/models/loras")
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("RUNNER_LORA_DL_TIMEOUT", "600"))
BASE_HANDLER_PATH = os.environ.get("RUNNER_BASE_HANDLER", "/handler_base.py")
ALLOWED_SOURCE = "r2"

# 载入官方 handler 模块。因其 serverless.start 有 __main__ 卫，import 不会用官方
# handler 抢先 start —— 由本 wrapper 统一 start（见文件末）。
_spec = importlib.util.spec_from_file_location("handler_base", BASE_HANDLER_PATH)
if _spec is None or _spec.loader is None:
    raise RuntimeError(f"Cannot load base worker-comfyui handler at {BASE_HANDLER_PATH!r}")
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)
base_handler = _base.handler


def _safe_basename(name: str) -> str:
    if not name or "/" in name or "\\" in name or ".." in name:
        raise ValueError(f"Invalid LoRA filename (path traversal blocked): {name!r}")
    return name


def _download_to(url: str, dest: str) -> None:
    tmp = dest + ".part"
    with requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT_SECONDS) as resp:
        resp.raise_for_status()
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)
    os.replace(tmp, dest)  # 原子替换，避免并发/中断留半个文件


def ensure_loras(loras_to_fetch) -> None:
    if not loras_to_fetch:
        return
    os.makedirs(LORA_DIR, exist_ok=True)
    for spec in loras_to_fetch:
        source = spec.get("source")
        if source != ALLOWED_SOURCE:
            raise ValueError(f"Refusing LoRA from disallowed source: {source!r}")
        filename = _safe_basename(spec.get("filename", ""))
        url = spec.get("url")
        if not url:
            raise ValueError(f"Missing download url for LoRA {filename!r}")
        dest = os.path.join(LORA_DIR, filename)
        if os.path.exists(dest):
            continue  # 缓存命中：Volume 上已有，跳过下载
        print(f"[runner-fork] downloading LoRA {filename} …", flush=True)
        _download_to(url, dest)
        print(f"[runner-fork] cached LoRA {filename}", flush=True)


def handler(job):
    inp = (job or {}).get("input", {}) or {}
    ensure_loras(inp.get("loras_to_fetch"))
    return base_handler(job)


if __name__ == "__main__":
    print("[runner-fork] starting wrapped handler (runtime LoRA download) …", flush=True)
    runpod.serverless.start({"handler": handler})
