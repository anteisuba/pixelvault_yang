"""
PixelVault Runner — worker-comfyui fork handler (v2 runtime LoRA download).

设计：docs/plans/comfy-runner-v2-runtime-lora.md（②a）。

官方 `runpod/worker-comfyui:<ver>-base` 不支持请求时下载 LoRA。本 wrapper 在把 job
交给官方 handler 之前，先把 `input.loras_to_fetch` 里每把 LoRA 从 **R2 预签名 URL**
拉到 Network Volume 的 `models/loras/`（缺则下、有则跳＝缓存），再跑 ComfyUI。

安全：
- 只认 `source == "r2"`（app 侧生成的短时效预签名链），不下任意外链（防 SSRF）。
- 文件名必须是纯 basename（无路径分隔/`..`），防目录穿越。

⚠ 部署前须核对 base 镜像结构（见 README）：
- `BASE_HANDLER_IMPORT` —— worker-comfyui 官方 handler 的导入路径（随版本可能变）。
- LoRA 目录 —— serverless worker 上 Volume 挂在 `/runpod-volume`；ComfyUI 的
  loras 目录一般是 `/runpod-volume/models/loras`（`extra_model_paths.yaml` 自动发现）。
"""

import os
import runpod
import requests

# ── 需按 base 镜像核对的两个常量 ──────────────────────────────────
LORA_DIR = os.environ.get("RUNNER_LORA_DIR", "/runpod-volume/models/loras")
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("RUNNER_LORA_DL_TIMEOUT", "600"))
ALLOWED_SOURCE = "r2"

# worker-comfyui 官方 handler —— 导入路径随版本核对（README §故障排查）。
from handler import handler as base_handler  # noqa: E402


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


def handler(event):
    inp = (event or {}).get("input", {}) or {}
    ensure_loras(inp.get("loras_to_fetch"))
    return base_handler(event)


runpod.serverless.start({"handler": handler})
