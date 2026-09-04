# Runner ComfyUI fork — 运行时 LoRA 下载（v2 ②a）

官方 `runpod/worker-comfyui` 不能在请求时下载 LoRA。本 fork 只加一层 wrapper：把 job 的
`input.loras_to_fetch` 里每把 LoRA 从 **R2 预签名 URL** 拉到 Volume 的
`/runpod-volume/models/loras/`（缺则下、有则跳＝缓存），再交给官方 handler 跑。

设计全文：`docs/references/domains/runner.md`。

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
| 新下载的 LoRA 当次可见  | ⚠ 不自动成立——提交前由 wrapper 轮询 `/object_info` 验收    | 见下「模型可见性闸」                     |

## 契约（Cloudflare Worker 发的 job input）

```jsonc
{
  "input": {
    "workflow": {
      /* ComfyUI workflow，LoraLoader 用 filename */
    },
    "images_to_fetch": [
      {
        "name": "reference.png",
        "url": "<R2 图片 URL>",
        "source": "r2",
      },
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

### 模型可见性闸（v8）

**下载完成不等于 ComfyUI 看得见。** `folder_paths` 的文件清单缓存活在 ComfyUI 自己的进程里
（按目录 mtime 失效），wrapper 是另一个进程，模型目录又是网络卷（属性有客户端缓存）——写完
文件那一刻，ComfyUI 手上的清单可能还是旧的。2026-09-04 生产：首次使用的 LoRA
`civitai-2797481.safetensors` 提交即被挡回

```
Node lora-1 (errors): value_not_in_list — lora_name: 'civitai-2797481.safetensors' not in (list of length 39)
```

原样再点一次就成功——典型的「首次使用必失败一次」。

修法在 `comfy_models.py`：交给官方 handler 之前，按 workflow 里每个 model-loader 节点
（`MODEL_FILE_FIELDS`：LoraLoader / LoraLoaderModelOnly / CheckpointLoaderSimple /
UNETLoader / CLIPLoader / VAELoader / UpscaleModelLoader）问 ComfyUI 的
`/object_info/<class_type>`，直到引用的文件名出现在候选清单里才放行。

- 超时 `RUNNER_MODEL_VISIBILITY_TIMEOUT`（默认 180s）、轮询 `RUNNER_MODEL_VISIBILITY_POLL`（默认 1s）。
- 等不到就抛 `ComfyModelNotVisibleError` 并列出文件名——不降级、不改 workflow、不静默跳过。
- ComfyUI 冷启动没起来（请求失败）也在同一个窗口内重试；响应形状不认识则立即抛。
- ⛔ 别把这步删掉「省一个请求」：缓存命中的 LoRA 同样要验（可能是别的 worker 写进共享卷的，
  本机 ComfyUI 一样没列过）。

### `images_to_fetch`（v7，img2img 参考图）

**app 侧不再发 `images`。** 官方字段 `images`（`[{name, image}]`，image 是 base64）由本 fork
在 `ensure_input_images` 里填——它按 `images_to_fetch` 拉图、就地 base64，再交给官方
`upload_images()` 走 ComfyUI `/upload/image`。官方那条路一步没改。

换路的原因是旧路径夹在两堵墙中间：Cloudflare Worker 只有 128MB 内存（整张图转 base64 会
把它撑爆），而 base64 膨胀 4/3 后又会顶穿 RunPod `/run` 的 10MiB 请求体上限。一张 ~8MB
的参考图正好卡在两者之间——2026-08-24 同一张图连点两次，分别撞上了这两堵墙。改走 URL 后
Cloudflare Worker 完全不碰图片字节，和几百 MB 的 LoRA 走同一条路。

- `name` 须与 workflow 里 `LoadImage` 节点的文件名一致；纯 basename。
- `url` 须 `https://`——挡掉明文与内网元数据端点。
- 单张上限 `INPUT_IMAGE_MAX_BYTES`（64MB），只用来兜住畸形输入。
- 参考图**不落盘**：一次性数据，不该去和模型文件抢 Volume 的 LRU 名额。

⚠ **部署顺序**：本 fork 必须先上线，app 侧才能切到 `images_to_fetch`。反过来的话，新字段
发给老 worker，老 worker 不认识它、`images` 又是空的——参考图静默消失，img2img 悄悄退化
成 txt2img，出图会「成功」但完全不像参考图。

---

# 部署

## 现状（2026-08-25 全部经 RunPod / GitHub API 实读，不是回忆）

| 项             | 值                                                            |
| -------------- | ------------------------------------------------------------- |
| 生产端点       | `dt0wyuid7lywic` · `pixelvault-runner-eu-ro-1`（EU-RO-1）     |
| Template       | `pmh4gs9eht`                                                  |
| 当前镜像       | `ghcr.io/anteisuba/pixelvault-runner-fork:5.8.6-v7`           |
| Network Volume | `ivchraoqjv`                                                  |
| 构建来源仓     | GitHub 私有仓 `anteisuba/pixelvault-runner-fork`（main 分支） |
| 构建方式       | 该仓 `.github/workflows/build.yml` → GitHub Actions → 推 GHCR |
| Worker 接线    | `workers/execution/wrangler.jsonc` 的 `RUNPOD_ENDPOINT`       |

⚠ **不需要本机 Docker**，也不用 Docker Hub。base 镜像 11.9GB（解压 20GB+），在 GitHub
托管 runner 上构建，本机一个字节都不用传。RunPod 只负责按 tag 拉 GHCR 镜像——它**没有**
接 GitHub 自动构建，控制台里 Import Git Repository 那条路本项目没在用。

⚠ 小仓的文件是从本目录**手工同步**过去的。同步时对着 Dockerfile 的 `COPY` 行核对：
`Dockerfile` + `rp_handler.py` · `runner_payload.py` · `comfy_models.py` · `cache_policy.py` ·
`cache_manifest.py`——**五个 .py 缺一不可**，少一个构建就在那一步失败。`README.md` 与测试
文件不进镜像。

## 改了 fork 代码，怎么上线

1. 同步改动到小仓，push `main` → Actions 构建，产出
   `ghcr.io/anteisuba/pixelvault-runner-fork:5.8.6-<commit-sha>`。
2. 等 Actions 绿（约 7 分钟，大头是拉 base 镜像）。
3. 把 template 的镜像指向那个 sha（REST）：

   ```bash
   curl -X PATCH -H "Authorization: Bearer $RUNPOD_KEY" -H "Content-Type: application/json" -d "{\"imageName\":\"ghcr.io/anteisuba/pixelvault-runner-fork:5.8.6-<sha>\"}" https://rest.runpod.io/v1/templates/pmh4gs9eht
   ```

   控制台等价操作：Serverless → 端点 → ⋮ Edit Endpoint → Container Image。
   ⚠ 回读确认，**但别打印整个响应**——它会把 template 的 env 连 `CIVITAI_KEY` 一起回显。

4. 改 template 会让 worker 滚动重启。重启期间会短暂出现 `ready:0 / throttled:N`
   （释放 GPU 后要重新抢容量），几十秒内恢复，别误判成故障。
5. app 侧若同时有改动：`cd workers/execution && npx wrangler deploy`。
   ⚠ **CI 不会替你部署 worker**——所有 workflow 里没有任何 `wrangler deploy`。

⚠ **fork 必须先于 app 上线**。反过来的话新字段发给老 worker、老 worker 不认识它，
参考图会静默消失、img2img 悄悄退化成 txt2img——出图照样「成功」，只是完全不像参考图。

## ⚠ 镜像 tag 纪律

`build.yml` 的 tag 现在是按 commit sha 生成的**不可变** tag。

**别改回固定串。** 这里先后硬编码过 `5.8.6-r3` 和 `5.8.6-v7`，而生产 template 恰好锁着
同名 tag——那样任何一次 push main 都会**静默覆盖生产正在运行的镜像**。2026-08-25 实地
撞上过一次（force push main 触发重建，覆盖了生产用的 `5.8.6-v7`；所幸源码逐字节相同）。
上线必须是「构建出 sha → 显式改 template 指向它」两步，不能是「push 一下就生效」。

## 端点参数（重建时照填，2026-08-25 实读）

| 项                | 值                                                                        |
| ----------------- | ------------------------------------------------------------------------- |
| Type              | Queue（`isServerless: true`）                                             |
| Network Volume    | `ivchraoqjv` ⚠ 挂卷会把 GPU 过滤到卷所在数据中心（EU-RO-1），选那里的 GPU |
| GPU               | RTX 4090 / RTX A4500 / RTX 2000 Ada / RTX A5000 / L4 / RTX 3090           |
| Max / Min Workers | 2 / 0                                                                     |
| Standby Workers   | 1 ⚠ 有一个常驻 worker，是持续成本                                         |
| Idle Timeout      | 60s · FlashBoot 开                                                        |
| Execution Timeout | **600000 ms（10 分钟）**——早期文档写的 300 秒已不是现状                   |
| Scaler            | QUEUE_DELAY，值 4                                                         |
| Container Disk    | 20 GB                                                                     |

**环境变量**：生产 template 只配了 `CIVITAI_KEY`（gated/限流的 Civitai 文件要用，公开文件
匿名可下）。LoRA 走 R2 预签名链，fork 不需要 R2 凭证。可选覆盖项：`RUNNER_LORA_DIR` /
`RUNNER_LORA_DL_TIMEOUT` / `RUNNER_CACHE_RESERVE_BYTES`（默认保留 8GiB 空闲）/
`RUNNER_CACHE_MANIFEST_PATH` / `RUNNER_DOWNLOAD_HISTORY_PATH`。

缓存 LRU **只删** PixelVault 动态命名的 `civitai-*`、`hf-*` LoRA 和 `civitai-ckpt-*`
checkpoint，不碰手工放入或预置的模型。每次下载完成后原子更新
`/runpod-volume/pixelvault-cache-manifest.json`，事件追加到
`/runpod-volume/pixelvault-download-history.jsonl`，两者都不写下载 URL 或密钥。

⚠ 换端点 ID 的代价很小：`RUNPOD_ENDPOINT` 只在 `workers/execution/wrangler.jsonc` 一处
（Vercel 不涉及），改 1 行 + `wrangler deploy`。本机注册表 / 环境变量里的
`RUNPOD_ENDPOINT` 只给本地脚本用，**且可能是过时的**——2026-08-25 实测本机那个值指向一个
已不存在的端点。判断生产端点一律以 `wrangler.jsonc` 为准。

---

## 部署后：验收（端到端）

1. 前端选一把**没预烤**的 Anima/Illustrious LoRA（如 Cartethyia）→ 出图。
2. 首图应：冷启动 + 下载 + 出图（30–90s）；RunPod 端点 **Logs** 里应有
   `[runner-fork] downloading LoRA civitai-<id>.safetensors …` 和 `cached LoRA …`。
3. 同一把再出一张 → 无下载日志（缓存命中）、更快。
4. 顺带验 Anima 兼容性：看脸对不对（不对再收紧 app 侧 `normalizeToLoraBaseFamily`）。

### v7 参考图链路（`images_to_fetch`）

⚠ **这条必须看日志，不能只看「出图成功了」。** fork 没更新时新字段无人认领、`images`
又是空的，结果是**静默退化成 txt2img**——出图照常成功，只是完全不像参考图。成功本身
不是证据。

1. 放一张参考图 → 出图。
2. RunPod 端点 **Logs** 里必须有这两行：
   - `[runner-fork] downloading input image reference.png …`
   - `[runner-fork] fetched input image reference.png (<N> bytes)`

   **看不到 = fork 是老镜像**，此时出的图是纯 txt2img，别当成功。

3. 出图结果应体现参考图构图（参考强度 70% 时应明显相似）。
4. 换一张**大图**（>8MB）复验：旧路径会在这个量级上死（Worker OOM 或 RunPod 10MiB
   拒收），新路径应正常出图——这是 2026-08-24 那次事故的直接回归。

**不想动 UI 时的快速探针**：直接给端点发一个 job，`workflow` 传空对象、`images_to_fetch`
传一张真实 R2 图。`ensure_input_images` 跑完后官方 handler 会因空 workflow 报
`prompt_no_outputs` —— **报这个就说明取图那段全通了**；报别的（下载失败 / 超上限 /
source 被拒）才是本 fork 的问题。不出图、不占 GPU 时间、不计 app 侧月度额度。

2026-08-25 用这条探针实测：14.7MB 的 PNG，`executionTime` 2115ms 走完下载 + base64 +
送进 ComfyUI。同日端到端复测同一张图，`COMPLETED` 且落库；而 08-24 旧路径下这张图
两次分别死于 `Worker exceeded memory limit.` 和 `exceeded max body size of 10MiB`。

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
