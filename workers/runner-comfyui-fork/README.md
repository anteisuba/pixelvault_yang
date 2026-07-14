# Runner ComfyUI fork — 运行时 LoRA 下载（v2 ②a）

官方 `runpod/worker-comfyui` 不能在请求时下载 LoRA。本 fork 只加一层 wrapper：把 job 的
`input.loras_to_fetch` 里每把 LoRA 从 **R2 预签名 URL** 拉到 Volume 的
`/runpod-volume/models/loras/`（缺则下、有则跳＝缓存），再交给官方 handler 跑。

设计全文：`docs/plans/comfy-runner-v2-runtime-lora.md`。

## 它怎么接进官方镜像（已按 worker-comfyui 5.8.6 核对）

官方镜像的入口是 `CMD ["/start.sh"]`：start.sh 先**后台**起 ComfyUI（`python /comfyui/main.py &`），
再跑 `python -u /handler.py`（handler 通过 `127.0.0.1:8188` 和 ComfyUI 通信）。所以本 fork
**不覆盖 CMD**，只在 Dockerfile 里把官方 `/handler.py` 挪成 `/handler_base.py`、把 wrapper
放到 `/handler.py`。start.sh 那句 `python -u /handler.py` 于是跑 wrapper，它 `import` 官方
handler 包一层下载再 `serverless.start`。

> ⚠ 若曾把 `CMD` 改成直接 `python /rp_handler.py`＝**盖掉 start.sh、ComfyUI 不启动**，每个
> job 都会「ComfyUI server (127.0.0.1:8188) not reachable」。别这么做。

| 事实（5.8.6 已确认）    | 值                                                         | 出处                                     |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| base 镜像               | `runpod/worker-comfyui:5.8.6-base`                         | Dockerfile `FROM`                        |
| 官方 handler 路径       | `/handler.py`（WORKDIR `/`）                               | 官方 Dockerfile `ADD … handler.py ./`    |
| `serverless.start` 有卫 | `if __name__ == "__main__":`（第 900 行）→ import 安全复用 | 官方 handler.py 尾                       |
| 入口                    | `CMD ["/start.sh"]`（后台起 ComfyUI + 跑 handler）         | 官方 Dockerfile / start.sh               |
| LoRA 目录               | `/runpod-volume/models/loras/`                             | `extra_model_paths.yaml`（base_path 卷） |
| 新下载的 LoRA 当次可见  | ComfyUI `folder_paths` 按目录 mtime 失效缓存               | ComfyUI 行为                             |

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

- `filename` 由 app `prepareRunnerLoras` 派生（Civitai 使用 version id，HF 使用来源哈希 + 文件名），workflow 的
  LoraLoader 也用它。
- `source` 恒为 `"r2"`——handler 拒绝其它来源（防 SSRF）；文件名须纯 basename（防目录穿越）。

---

# 部署教程

## 先选路（一次性）

| 方案                             | 要不要本机 Docker    | 端点 ID  | 后续更新               | 适合                     |
| -------------------------------- | -------------------- | -------- | ---------------------- | ------------------------ |
| **A · RunPod 从 GitHub 构建**    | 不要                 | **换新** | `git push` 自动重建    | 没装 Docker（推荐）      |
| **B · 本机 Docker 构建后推仓库** | 要（Docker Desktop） | **不变** | 手动 build+push+改镜像 | 已有 Docker、想保端点 ID |

换端点 ID 的代价其实很小：`RUNPOD_ENDPOINT` 只在 `workers/execution/wrangler.jsonc` 一处
（Vercel 不涉及），改 1 行 + `wrangler deploy` 即可。所以**没 Docker 就走 A**。

---

## 方案 A：RunPod 从 GitHub 自动构建（推荐，免本机 Docker）

### A1. 建一个专用小仓（避免 monorepo 构建上下文坑）

Dockerfile 里 `COPY rp_handler.py /handler.py` 是相对**构建上下文**的。RunPod GitHub 构建
默认拿仓库根当上下文，若直接指 monorepo 子目录，`COPY rp_handler.py` 可能找不到文件。最稳
＝把这 3 个文件放进一个**根目录**就是它们的独立小仓：

1. GitHub 新建仓（私有即可）：`pixelvault-runner-fork`。
2. 把 `workers/runner-comfyui-fork/` 下 `rp_handler.py` / `Dockerfile` / `README.md` 三个文件
   放到该仓**根目录**，push。

（想省一个仓也行：用本 monorepo，RunPod 里 Dockerfile Path 填
`workers/runner-comfyui-fork/Dockerfile`——但需确认 RunPod 用子目录当上下文，不确定就走小仓。）

### A2. 把 GitHub 接给 RunPod

RunPod 控制台 → **Settings → Connections → GitHub 卡片 → Connect** → 走 GitHub 授权 →
选「All repositories」或「Only select repositories」（选到上面的小仓）→ **Save**。私有仓也 OK。

### A3. 新建 Serverless 端点（从 GitHub 构建）

RunPod → **Serverless → New Endpoint** →

1. **Import Git Repository**：搜到 `pixelvault-runner-fork`。
2. **Branch**：`main`。**Dockerfile Path**：`Dockerfile`（小仓根目录）。→ **Next**。
3. 端点设置：
   - **Endpoint Name**：`pixelvault-runner-v2`（随意）。**Type**：`Queue`。
   - **GPU**：选便宜档（16–24GB 够 SDXL；如 RTX 4090 / A5000）。
   - **⚠ Network Volume**：挂现有的 **`rk3t3mb1ko`（US-CA-2，80GB）**。
     挂了卷，GPU 会被过滤到该卷所在数据中心（US-CA-2）——正常，选那里的 GPU。
   - **Max Workers**：1–2。**Active（min）Workers**：0（省钱，冷启动换钱）。
   - **Execution Timeout**：**300 秒**（冷启动＋下载 LoRA＋出图，默认 120 可能不够）。
   - **Environment Variables**：一般不用加。如需覆盖：`RUNNER_LORA_DIR` /
     `RUNNER_LORA_DL_TIMEOUT` / `RUNNER_CACHE_RESERVE_BYTES`（默认保留 8GiB
     空闲）。LRU 只会删除 PixelVault 动态命名的 `civitai-*`、`hf-*` LoRA 和
     `civitai-ckpt-*` checkpoint；不会删除手工放入或预置的模型。
     每次下载准备完成后会原子更新 `/runpod-volume/pixelvault-cache-manifest.json`，
     下载/淘汰事件追加到 `/runpod-volume/pixelvault-download-history.jsonl`；两者都不写
     下载 URL 或密钥。路径可用 `RUNNER_CACHE_MANIFEST_PATH` / `RUNNER_DOWNLOAD_HISTORY_PATH`
     覆盖。
   - LoRA 从 **R2** 预签名链拉取，fork 不需要 R2 凭证。源图精确 checkpoint 会由
     fork 直接访问 Civitai；公开文件可匿名下载，gated/限流文件需要把 `CIVITAI_KEY`
     配成 RunPod endpoint secret（不要写进普通环境变量或仓库）。
4. **Deploy Endpoint**。首次构建要几分钟（RunPod build，超时 30min/单次、总 160min）。

### A4. 记下新端点 ID → 接线

构建完，端点详情页顶部有新的 **Endpoint ID**（形如 `xxxxxxxxxxxx`）。把它接进 Worker：

- 改 `workers/execution/wrangler.jsonc` 的 `"RUNPOD_ENDPOINT"` 为新 ID（**让我改这行**）。
- owner 跑 `cd workers/execution && npx wrangler deploy`（`RUNPOD_KEY` secret 不变，同 RunPod 账户）。

> 之后 v2 才算通。（本机注册表 `HKCU\…\RUNPOD_ENDPOINT` 只给本地脚本用，改不改都不影响生产。）

### A5. 以后更新 fork

改小仓文件 → `git push` → RunPod 自动重建端点。升级 worker-comfyui 版本时，改 Dockerfile
`FROM …:x.y.z-base` 那行并复核下方「故障排查」再 push。

---

## 方案 B：本机 Docker 构建后推镜像仓库（保留现端点 ID）

需要 Docker Desktop + 一个镜像仓库账号（Docker Hub 免费）。

```bash
cd workers/runner-comfyui-fork
docker build -t <你的DockerHub用户名>/pixelvault-runner:5.8.6 .
docker push <你的DockerHub用户名>/pixelvault-runner:5.8.6
```

RunPod → Serverless → 现端点 **`01g8rrmixe4hah`** → 右上 **⋮ → Edit Endpoint** →

- **Container Image** 改成 `<你的用户名>/pixelvault-runner:5.8.6`。
- **Execution Timeout** 设 **300**。
- 确认 Network Volume 仍是 `rk3t3mb1ko`。
- **Save Endpoint**（RunPod 滚动重启 worker）。

端点 ID 不变 → `wrangler.jsonc` / Worker **无需改动**。

---

## 部署后：验收（端到端）

1. 前端选一把**没预烤**的 Anima/Illustrious LoRA（如 Cartethyia）→ 出图。
2. 首图应：冷启动 + 下载 + 出图（30–90s）；RunPod 端点 **Logs** 里应有
   `[runner-fork] downloading LoRA civitai-<id>.safetensors …` 和 `cached LoRA …`。
3. 同一把再出一张 → 无下载日志（缓存命中）、更快。
4. 顺带验 Anima 兼容性：看脸对不对（不对再收紧 app 侧 `normalizeToLoraBaseFamily`）。

## ⚠ 故障排查 / 升级 worker-comfyui 时的核对点

- **「ComfyUI server not reachable」**：多半是 CMD 被覆盖没跑 start.sh。本 Dockerfile
  故意不写 CMD——别加回去。
- **「Cannot load base worker-comfyui handler」**：官方 handler 路径变了（不再是 `/handler.py`）。
  进 base 镜像 `docker run --rm -it runpod/worker-comfyui:<ver>-base bash` 里
  `ls -la /handler*.py`，或设环境变量 `RUNNER_BASE_HANDLER=/新路径.py`。
- **LoRA 下了但 LoraLoader 说找不到**：核对 `extra_model_paths.yaml` 的 loras 目录；若不是
  `/runpod-volume/models/loras`，设环境变量 `RUNNER_LORA_DIR`。
- **handler `serverless.start` 无 `__main__` 卫了**（升级后）：import `/handler_base.py` 会用
  官方 handler 抢先 start。届时改 wrapper 用 `importlib` 的做法仍安全（本文件已用），但要确认
  官方没把 start 挪到模块顶层。
