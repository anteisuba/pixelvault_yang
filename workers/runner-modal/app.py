"""PixelVault Runner on Modal —— 与 RunPod 同一个 fork 镜像、同一份 job 契约。

迁移方案（2026-10-06 owner 定）：Worker 加 `RUNNER_BACKEND` 开关切过来，观察一周后
删掉 RunPod 分支、端点与卷。fork 的 `handler(job)` 本身是普通函数（经 127.0.0.1:8188
跟 ComfyUI 通信），这里只负责：起 ComfyUI → 调它 → 把新下的模型提交进 Volume。

HTTP（全部要 `Authorization: Bearer $RUNNER_MODAL_TOKEN`），形状照搬 RunPod：
  POST /run          {"input": {...}, "target": "main" | "qwen"} -> {"id": "fc-..."}
  GET  /status/{id}  -> {"status": "IN_PROGRESS" | "COMPLETED" | "FAILED", "output"?, "error"?}
  POST /cancel/{id}  -> {"ok": true}
  GET  /health       -> {"ok": true}

部署：modal deploy workers/runner-modal/app.py
"""

import os
import subprocess
import sys
import time
import urllib.request

import modal

APP_NAME = os.environ.get("RUNNER_MODAL_APP", "pixelvault-runner")
VOLUME_NAME = os.environ.get("RUNNER_MODAL_VOLUME", "pixelvault-runner-models")
# 两把 Secret 分开：`pixelvault-runner` 由 owner 在 Modal 后台建（CIVITAI_KEY，下载
# Civitai 底模用）；`pixelvault-runner-token` 放 Worker 调这里的 bearer token。
SECRET_NAME = os.environ.get("RUNNER_MODAL_SECRET", "pixelvault-runner")
TOKEN_SECRET_NAME = os.environ.get("RUNNER_MODAL_TOKEN_SECRET", "pixelvault-runner-token")

# 与 RunPod template 同一个 tag（runner.md「基础设施标识」）。ghcr 包可匿名拉取。
MAIN_IMAGE = "ghcr.io/anteisuba/pixelvault-runner-fork:5.10.0-f3b77c521de6c8caf44e6054497f053ba459fe4e"
QWEN_IMAGE = "ghcr.io/anteisuba/pixelvault-runner-fork:qwen21-eval-a156ba3fa831a95d9a056be1ff8a9829464d177b"

# 挂在 stock `extra_model_paths.yaml` 本来就找的位置，fork 里的路径一个都不用改。
VOLUME_PATH = "/runpod-volume"
COMFY_URL = "http://127.0.0.1:8188"
COMFY_START_TIMEOUT_S = 180

app = modal.App(APP_NAME)
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
secret = modal.Secret.from_name(SECRET_NAME)
token_secret = modal.Secret.from_name(TOKEN_SECRET_NAME)

# Modal Volume 没有硬配额（1 TiB 内免费）；fork 的 LRU 按这个数清缓存。
main_image = modal.Image.from_registry(MAIN_IMAGE).env(
    {"RUNNER_VOLUME_QUOTA_BYTES": "300000000000"}
)
qwen_image = modal.Image.from_registry(QWEN_IMAGE)
web_image = modal.Image.debian_slim().pip_install("fastapi[standard]")


def _start_comfy():
    """start.sh 里起 ComfyUI 的那一句（⛔ 不跑 start.sh：它最后会进 RunPod 的作业循环）。

    fork 构建时已去掉 `--disable-metadata`，这里同样不带——保存节点要写加载证据。
    """
    subprocess.Popen(
        [
            "python",
            "-u",
            "/comfyui/main.py",
            "--disable-auto-launch",
            "--verbose",
            "INFO",
            "--log-stdout",
        ],
        cwd="/comfyui",
    )
    deadline = time.time() + COMFY_START_TIMEOUT_S
    while True:
        try:
            with urllib.request.urlopen(f"{COMFY_URL}/system_stats", timeout=5):
                break
        except Exception:
            if time.time() > deadline:
                raise RuntimeError("ComfyUI did not start within the timeout")
            time.sleep(0.5)
    sys.path.insert(0, "/")
    import handler  # fork 的 /handler.py（包着官方 /handler_base.py）

    return handler.handler


def _run(fork_handler, job_input: dict) -> dict:
    try:
        return fork_handler(
            {"id": modal.current_function_call_id(), "input": job_input}
        )
    except Exception as error:
        # web 容器没装 fork 的依赖（requests 等），反序列化不了原异常类型，会把原话吞掉；
        # 转成内置 RuntimeError 带回原话。
        raise RuntimeError(f"{type(error).__name__}: {error}") from None
    finally:
        # 新下的底模 / LoRA 要提交，别的容器下次启动才看得见。
        # ⚠ 同时开着的另一台看不见，会自己再下一次——慢但不会错。
        volume.commit()


common = dict(
    volumes={VOLUME_PATH: volume},
    secrets=[secret],
    timeout=600,  # 与 RunPod 端点的 Execution Timeout 一致
)


@app.cls(
    image=main_image,
    gpu=["L40S", "A100-40GB"],  # 按顺序回退，取代 RunPod 端点的 48G 回退档
    max_containers=2,
    scaledown_window=60,
    **common,
)
class MainRunner:
    @modal.enter()
    def start(self):
        self.handler = _start_comfy()

    @modal.method()
    def run(self, job_input: dict) -> dict:
        return _run(self.handler, job_input)


@app.cls(
    image=qwen_image,
    gpu=["L40S", "A100-40GB"],
    max_containers=1,
    scaledown_window=10,
    **common,
)
class QwenRunner:
    @modal.enter()
    def start(self):
        self.handler = _start_comfy()

    @modal.method()
    def run(self, job_input: dict) -> dict:
        return _run(self.handler, job_input)


# 清单里没有下载地址、在 RunPod 卷上是手工预置的那几个 SDXL 底模（其余 Anima /
# Z-Image / 放大模型都随作业带 HF 地址 + SHA 按需下）。文件名与 checkpoints.ts 一致。
SEED_CHECKPOINTS = {
    "waiIllustriousSDXL_v150.safetensors": 2167369,
    "animaPencilXL_v500.safetensors": 597138,
    "ponyDiffusionV6XL.safetensors": 290640,
    "sdXL_v10VAEFix.safetensors": 128078,
}


@app.function(
    image=web_image, volumes={VOLUME_PATH: volume}, secrets=[secret], timeout=3600
)
def seed_checkpoints() -> dict:
    """modal run workers/runner-modal/app.py::seed_checkpoints —— 只用 CPU，可重复跑。"""
    import hashlib

    import httpx

    # Civitai 前面是 Cloudflare，默认 UA 会被 403；下载会 302 到存储的预签名地址，
    # httpx 跨域重定向时会去掉 Authorization（urllib 不会，带着它会被存储回 400）。
    headers = {
        "Authorization": f"Bearer {os.environ['CIVITAI_KEY']}",
        "User-Agent": "pixelvault-runner/1.0",
    }
    target_dir = f"{VOLUME_PATH}/models/checkpoints"
    os.makedirs(target_dir, exist_ok=True)
    report = {}
    with httpx.Client(headers=headers, follow_redirects=True, timeout=1800) as client:
        for filename, version_id in SEED_CHECKPOINTS.items():
            dst = f"{target_dir}/{filename}"
            meta = client.get(
                f"https://civitai.com/api/v1/model-versions/{version_id}"
            ).raise_for_status().json()
            file = next(
                f
                for f in meta["files"]
                if f.get("primary") or len(meta["files"]) == 1
            )
            expected = file["hashes"]["SHA256"].lower()
            if not os.path.exists(dst):
                tmp = f"{dst}.part"
                with client.stream("GET", file["downloadUrl"]) as resp, open(
                    tmp, "wb"
                ) as out:
                    resp.raise_for_status()
                    for chunk in resp.iter_bytes(8 << 20):
                        out.write(chunk)
                os.replace(tmp, dst)
            digest = hashlib.sha256()
            with open(dst, "rb") as fh:
                while chunk := fh.read(8 << 20):
                    digest.update(chunk)
            ok = digest.hexdigest() == expected
            if not ok:
                os.remove(dst)
            report[filename] = {
                "bytes": os.path.getsize(dst) if ok else 0,
                "sha_ok": ok,
            }
            volume.commit()
    return report


@app.function(image=web_image, secrets=[token_secret])
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Header, HTTPException

    web = FastAPI()
    token = os.environ["RUNNER_MODAL_TOKEN"]

    def check(authorization: str | None) -> None:
        if authorization != f"Bearer {token}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    @web.get("/health")
    async def health(authorization: str | None = Header(default=None)):
        check(authorization)
        return {"ok": True}

    @web.post("/run")
    async def run(body: dict, authorization: str | None = Header(default=None)):
        check(authorization)
        job_input = body.get("input")
        if not isinstance(job_input, dict):
            raise HTTPException(status_code=400, detail="input must be an object")
        runner = QwenRunner() if body.get("target") == "qwen" else MainRunner()
        call = await runner.run.spawn.aio(job_input)
        return {"id": call.object_id}

    @web.get("/status/{call_id}")
    async def status(call_id: str, authorization: str | None = Header(default=None)):
        check(authorization)
        call = modal.FunctionCall.from_id(call_id)
        try:
            output = await call.get.aio(timeout=0)
        except TimeoutError:
            return {"status": "IN_PROGRESS"}
        except Exception as error:  # 远端抛的错原样带回，Worker 按原话归类
            return {"status": "FAILED", "error": str(error)[:500]}
        return {"status": "COMPLETED", "output": output}

    @web.post("/cancel/{call_id}")
    async def cancel(call_id: str, authorization: str | None = Header(default=None)):
        check(authorization)
        await modal.FunctionCall.from_id(call_id).cancel.aio()
        return {"ok": True}

    return web
