# Runner ComfyUI fork — 运行时 LoRA 下载（v2 ②a）

官方 `runpod/worker-comfyui` 不能在请求时下载 LoRA。本 fork 只加一层 wrapper：
把 job 的 `input.loras_to_fetch` 里每把 LoRA 从 R2 预签名 URL 拉到 Volume 的
`models/loras/`（缺则下、有则跳＝缓存），再交给官方 handler 跑。

设计全文：`docs/plans/comfy-runner-v2-runtime-lora.md`。

## 契约（Cloudflare Worker 发的 job input）

```jsonc
{
  "input": {
    "workflow": {
      /* ComfyUI workflow，LoraLoader 用 filename */
    },
    "images": [
      /* img2img 参考图，可无 */
    ],
    "loras_to_fetch": [
      {
        "filename": "civitai-3118200.safetensors",
        "url": "<R2 预签名 GET，15min 时效>",
        "source": "r2",
      },
    ],
  },
}
```

- `filename` 由 app `prepareRunnerLoras` 派生（`civitai-<versionId>.safetensors`），
  workflow 的 LoraLoader 也用它。
- `source` 恒为 `"r2"`——handler 拒绝其它来源（防 SSRF）。

## owner 部署步骤（RunPod GitHub 自动构建，不用本地 docker）

1. 把 `workers/runner-comfyui-fork/` 这个目录作为 fork 的构建上下文：
   - 简单法：单独建一个小 GitHub 仓，把这三个文件（`rp_handler.py` / `Dockerfile`
     / `README.md`）放进去；
   - 或用本仓 + RunPod 的 “Build Context / Dockerfile Path” 指到
     `workers/runner-comfyui-fork/`（RunPod GitHub 集成支持子目录）。
2. RunPod 控制台 → Serverless → 你的端点 `pixelvault-runner`（`01g8rrmixe4hah`）
   → Template → 改 Image 来源为 “GitHub repo”，选上面的仓/子目录 + 分支。
   RunPod 会自动 `docker build` 出镜像并滚动更新端点。
3. Network Volume 保持挂 `/runpod-volume`（底模仍预置在 Volume；LoRA 现在按需下）。
4. 无需给 fork 配 Civitai key —— 它只从 **R2** 拉（app 侧已用 `CIVITAI_API_TOKEN`
   把 LoRA 下到 R2）。R2 预签名链自带鉴权，worker 不需 R2 凭证。

## ⚠ 部署前必核对（随 worker-comfyui 版本可能变）

- **官方 handler 导入路径**：`rp_handler.py` 顶部 `from handler import handler as
base_handler`。5.8.x 的官方 handler 文件位置若不是默认 PYTHONPATH 上的 `handler.py`，
  改这行的导入路径（进 base 镜像 `docker run ... bash` 里 `find / -name 'handler.py'`
  或看官方 repo 对应 tag 的 `src/` 布局）。
- **启动方式**：`Dockerfile` 的 `CMD` 覆盖成跑我们的 wrapper。若官方镜像用别的
  entrypoint（如 `start.sh` 起额外服务），改成先跑官方 entrypoint、再把 handler
  换成我们的（或在官方 handler 之前 monkeypatch），别丢了官方镜像的 ComfyUI 起服务逻辑。
- **LoRA 目录**：serverless worker 上 Volume 在 `/runpod-volume`；ComfyUI 的 loras 目录
  一般是 `/runpod-volume/models/loras`（`extra_model_paths.yaml` 自动发现）。若不对，
  设环境变量 `RUNNER_LORA_DIR`。

## 验收（端到端，需上面部署完）

1. 前端选一把**没预烤**的 Anima/Illustrious LoRA（如 Cartethyia）→ 出图。
2. 首图应：冷启动 + 下载（worker 日志有 `[runner-fork] downloading LoRA …`）+ 出图（30–90s）。
3. 同一把再出一张 → 无下载日志（缓存命中）、更快。
4. 顺带验证 Anima 兼容性：看出的脸对不对（不对再收紧 `normalizeToLoraBaseFamily`）。
