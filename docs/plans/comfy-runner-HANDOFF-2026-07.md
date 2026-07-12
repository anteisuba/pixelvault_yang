# Comfy Runner 实现交接文档（HANDOFF · 2026-07-06）

> **给接手实现的 agent**：这份文档自包含，不依赖任何对话上下文。读完你应该能独立把「PixelVault 通过自建 RunPod runner 忠实复刻 Civitai 来源图」这件事推进下去。
>
> 语言：中文叙述，代码标识符/路径/命令英文。
>
> **关联文档（细节在这些里，本文是总纲 + 串线）**：
>
> - `docs/plans/comfy-runner-recipe-clone.md` — 原始任务包（契约/manifest/错误模型/安全/代码触点/**§1.5 后端分工拍板**）
> - `docs/plans/comfy-runner-deployment-research-2026-07.md` — 本地 vs 云部署形态调研（路线拍板 RunPod-first）
> - `docs/plans/comfy-runner-runpod-deploy-2026-07.md` — RunPod 逐步部署手册（Volume/Pod/端点/API）
> - memory: `project-comfy-runner`、`reference-local-comfyui`

---

## 0. 一句话目标

illustrious-xl 走 Replicate 托管端点，挂 WAI/Illustrious 社区 LoRA 时报 `layer ... not supported` —— 这是**托管后端的能力上限**，不是 prompt 或 LoRA 库的问题。解决办法：**自建一个「只接结构化 recipe、跑固定 ComfyUI 模板」的私有 runner**，用「同 checkpoint + 同 LoRA + 同 sampler/clipSkip/seed/尺寸」的真实环境忠实复刻。生产宿主 = **RunPod Serverless**。

---

## 1. 背景与前因（我们在解决什么）

### 1.1 触发问题

PixelVault 的 LoRA 复刻主线是「来源图一键同款」（见 [[project-lora-recipe-first]]）。但用户挑一张 Civitai 来源图点"复刻"时，如果它用的是社区 LoRA + 社区 checkpoint（如 WAI-Illustrious），当前 hosted 路径（Replicate `delta-lock/noobai-xl`）会失败：报 `layer lora_unet_... not supported`。因为那个 Cog 托管模型的 LoRA loader 只认特定 layer 格式，社区 LoRA 挂不上。换另一个托管模型只会"成功但不像"。

### 1.2 根本结论

复刻保真**靠环境一致，不靠提示词**。唯一解是把「同 checkpoint + 同 LoRA stack + 同 sampler/clipSkip/seed/尺寸」的真实 ComfyUI 环境跑起来 = 自己的 runner。

### 1.3 关键发现：执行骨架已存在

用户一度以为要新建的「Next.js → Worker → runner → R2 → 回调」骨架**已经是 PixelVault 现状并在生产运行**：

- 提交：`submitImageGeneration()` 建 `GenerationJob`（`src/services/image/submit-image.service.ts`）
- 分发：`dispatchImageWorkerRun()` HMAC 签名 POST（`src/services/execution-worker.service.ts`）
- 执行：Cloudflare Worker `pixelvault-execution` + Durable Object Workflows（`workers/execution/src/index.ts`）
- **所有 provider 调用都在 Worker 内**（含 Replicate）
- **Worker 自己 `GENERATION_BUCKET.put()` 传 R2**
- 回调：Worker 签名 POST `/api/internal/execution/callback` → `handleExecutionCallback()` 落 `Generation`
- 迁移闸门：`WORKER_MIGRATED_IMAGE_ADAPTERS`（`src/constants/execution.ts`）

**所以 runner 就是 Worker 眼里"又一个 provider"。谁调、谁传 R2、错误怎么走，全有现成先例照抄。**

---

## 2. 调查发现汇总（都是本会话实测/查证，非假设）

### 2.1 hosted 挂社区 LoRA 会崩（已确认根因）

Replicate `delta-lock/noobai-xl` 挂 WAI 社区 LoRA → `layer not supported`。这是托管后端上限。

### 2.2 本地 ComfyUI 复刻**已跑通验证**（go/no-go 通过）✅

本会话在 owner 本机（RTX 4060 Laptop 8GB）实测：

- 装了本地 ComfyUI（`C:\Users\15620\comfy-local\ComfyUI`，ComfyUI 0.9.4，torch 2.12.1+cu130，CUDA 可用）。
- 下 WAI-illustrious v15.0（6.9GB）+ LoRA Tutenstein Cleo carter V1（228MB）。
- 用一张真实来源图（civitai.com/images/107633015）的完整 recipe 跑固定 workflow → 出图 `clone_00001_.png`（1.14MB），元素高度吻合来源图（深肤色女性/黑 dreadlocks/白 tube top/粉背心/紫裤/亭子/暖光）。
- **证明：本地 WAI + 社区 LoRA 能忠实跑，而线上 Replicate 挂同 LoRA 直接失败。runner 路径成立。**

> 注：本地这一步是**一次性的廉价验证 + 产 workflow 模板**，不是生产宿主。生产在 RunPod。本地下的模型对 RunPod 无用（RunPod 自己从 Civitai 下）。

### 2.3 RunPod 部署机制（已查证 worker-comfyui 文档）

- 用 RunPod 官方镜像 `runpod/worker-comfyui:<ver>-base`（**不用自建 Docker**）。
- 模型走 **Network Volume**：Pod 挂 `/workspace`、serverless worker 挂 `/runpod-volume`，worker 的 `extra_model_paths.yaml` 自动发现 `/runpod-volume/models/{checkpoints,loras,vae}/`。同一 Volume 两处挂载路径不同、底层同一份文件。
- **stock worker 不支持"运行时按 URL 动态下载模型"**（configuration.md 查证）→ 第一版模型**预置 Volume**；"大量复刻动态下载 LoRA"要 **fork worker-comfyui 改 handler**（走 GitHub 自动构建，仍不用本地 docker）。
- 请求格式：`{"input":{"workflow":{…ComfyUI API 格式 JSON…}}}`，输出默认 base64（`output.images[].data`）。checkpoint/LoRA 在 workflow 里**按文件名引用**，文件必须在 Volume。
- RunPod REST API：`POST https://api.runpod.ai/v2/{endpoint_id}/run` + `GET .../status/{jobId}`；GraphQL `https://api.runpod.io/graphql`。Auth = `Authorization: Bearer <RUNPOD_KEY>`。

### 2.4 成本（RunPod 2026-07 价格，已查证）

- RTX 4090（24GB）Community $0.34/hr 按秒计费 → **~$0.002–0.006/图**（含冷启动，保守）。
- Network Volume $0.07/GB/月。
- 预付费 = 硬上限，花完自停、**无自动续费**。
- 冷启动（scale-to-zero，从 Volume 载 6.9GB checkpoint）约 15–40s —— 真正要用体验设计消化的点，不是成本。

### 2.5 HuggingFace 镜像不可用于 ComfyUI

John6666 的 WAI HF 镜像是 **diffusers 多文件格式**（`unet/diffusion_pytorch_model.safetensors`），**ComfyUI 单文件 CheckpointLoader 用不了**。→ checkpoint 必须从 **Civitai 下单文件 safetensors**。

---

## 3. 目标：第一版 vs 终态

### 3.1 第一版（本次要跑通）

- **单端点 + 预置 WAI + LoRA + 手动 API 提交**，复刻那一张来源图，验证 RunPod 形态端到端通。
- 单用户（owner）自用，feature flag 门控。
- 成功判据：RunPod 出的图 ≈ 本地那张（同 seed 同参数应几乎一致）。

### 3.2 终态（方向，不在本次范围但要对齐）

- **多次 + 大量复刻**。
- 模型分发：高频 checkpoint 烧镜像常驻，其余动态下载 + Volume 缓存（下一次用无数次）。
- **公共 Civitai key**（存服务端 secret），替换当前个人 key。
- 接进 PixelVault：Cloudflare Worker 里 `recipe→workflow` 映射（TS 纯函数）→ RunPod `/run` → 取图上 R2。
- **月度生成数限额**（$10/月预算护栏，见 §4.3）。

---

## 4. 核心决策（拍板清单，全部 owner 确认）

### 4.1 路线 = RunPod-first

- 生产直接 RunPod Serverless（fork/官方 worker-comfyui），**不自建本地 TS runner 宿主 + Tunnel**（那套降为 fallback，仅 RunPod 效果不达标/想彻底离线自托管时捡回）。
- 本地 ComfyUI 只是一次性验证台，不参与生产。
- `recipe→workflow` 映射放 **Cloudflare Worker（TS 纯函数）**，不是 runner 内。RunPod 端 fork 只加 LoRA 动态下载。

### 4.2 后端分工 = 统一体验，不统一后端（任务包 §1.5）

**不把能用的 hosted 模型搬 runner。** hosted（Replicate/FAL）有 runner 给不了的优势（按调用付费/无月租/秒回/7×24/FLUX 自建要 24GB 远不划算）。runner **只接 hosted 做不到的**：忠实复刻、挂任意社区 LoRA、市场没 hosted API 的小众模型。

**"统一"在体验层**（模型选择器里所有模型平等、用户不感知后端 = Replicate/FAL/RunPod；RUNNER 只是"又一个 adapter"）**，不在后端层**。

每个模型按特性配后端（`src/constants/lora-base-models.ts` 的"底模×后端"扁平结构已支持，只填条目）：

| 模型        | hosted | runner | 现状 available                                                                          |
| ----------- | :----: | :----: | --------------------------------------------------------------------------------------- |
| Illustrious |   ✅   |   ✅   | hosted 已 true（Replicate）                                                             |
| SDXL 1.0    |   ✅   |   ✅   | hosted 已 true                                                                          |
| Flux.1 D    |   ✅   |   —    | hosted 已 true（FAL）；不自建                                                           |
| Pony        |   —    |   ✅   | false（待 runner）                                                                      |
| SD 1.5      |   —    |   ✅   | false（待 runner）                                                                      |
| Anima       |   —    |   ✅   | false（Replicate 端点 404 死链；无 hosted 可买；社区实践全是当 SDXL checkpoint 自建跑） |

**能力路由（丝滑技术核心，目前半成品）**：对 Illustrious/SDXL 这种双后端，route resolve 判断"本次请求 hosted 能否满足"—— 纯出图→hosted；一旦挂社区 LoRA→**自动升级 runner**，别让用户撞 `layer not supported` 才发现。默认帮选最优后端（无感），高级可覆盖。

### 4.2b Runner 范围 + 服务器配置拍板（2026-07-07，owner 确认）

**范围收窄为 4 个家族（全部 SDXL 架构，共用 §7.1 同一 workflow 模板）**：

| checkpoint                 | Civitai versionId | 大小   | 备注                                                     |
| -------------------------- | ----------------- | ------ | -------------------------------------------------------- |
| WAI-illustrious-SDXL v15.0 | 2167369           | ~6.9GB | v1 施工中，模板已本地验证                                |
| anima_pencil-XL v5.0.0     | 597138            | 6.46GB | hosted 死链 + license 不许第三方托管，runner 唯一出路    |
| Pony Diffusion V6 XL       | 290640            | 6.46GB | 推荐参数：score_9 系质量词 + clipSkip 2（写进 manifest） |
| SDXL 1.0 (v1.0 VAE fix)    | 128078            | 6.46GB | 原生系 + 社区 merge 的忠实复刻底                         |

（versionId/大小 2026-07-07 经 Civitai API 核实。）**SD 1.5 移出 runner 范围**——
保持 external 跳转，不再做第二套分辨率/采样模板档。四家族同架构 ⇒ 增量成本
≈ 每家族一条 `runner-checkpoints.ts` manifest + Volume 里一个文件，无新模板。

**服务器配置（RunPod）**：

- **GPU**：RTX 4090 24GB（Community ~$0.34/hr）主选，A5000 24GB 缺货兜底
  （维持 §2.4 拍板；SDXL 推理 16GB 就够，但 4090 的速度让每图成本持平且
  冷启动更短——scale-to-zero 体验优先）。
- **Network Volume**：现有 `pixelvault-models` 20GB **需扩到 40GB**
  （US-CA-2，RunPod 支持在线扩容、不能缩）：4 checkpoint ≈ 26.3GB +
  ~12GB LoRA 动态缓存。成本 $2.8/月。
- **端点**：**单端点服务全部 4 个 checkpoint**（workflow JSON 按 `ckpt_name`
  选模型，不为每家族开端点）；Active 0 / Max 1 / Idle 5s / Execution
  Timeout 120s / Flash Boot 开（同 §4.3）。换 checkpoint 请求会触发重载
  （≈冷启动量级 15–40s），低频自用可接受，高频后再考虑按 checkpoint 拆端点。
- 交付时同步翻转 `src/constants/lora.ts` 的
  `CIVITAI_BASE_MODEL_GENERATABILITY`：Pony / Anima → 'native'
  （SD 1.5 保持 'external'）。

### 4.3 成本护栏 + 月度限额

RunPod 面板护栏（端点配置）：

- 预付费余额（充 $10 = 硬上限）
- Max Workers = 1（并发=成本上限）
- Active Workers = 0（scale-to-zero）
- Execution Timeout = 120s
- Idle Timeout = 5s
- Flash Boot = 开

⚠️ **RunPod 面板做不到"每月最多 N 张"这种计数上限** —— 必须 **PixelVault 代码里管**。项目已有先例：`FREE_TIER.DAILY_LIMIT`（`src/constants/config.ts:506` + `usage.service.ts`）。要加一个**按月、只认 RUNNER adapter** 的版本：

- 新增 `RUNNER_MONTHLY_LIMIT`（建议 **300 张/月** ≈ $1.8，离 $10 有 5× 余量，留足冷启动波动 + 调参重试缓冲）。
- service 层月度计数检查，到顶拒绝并给可操作提示（等下月 / 走 hosted 兜底 / 提额），不 dead-end。

### 4.4 模型分发 = Volume 持久缓存

RunPod 无公共模型库可蹭（它是 GPU 基础设施，不是模型托管）。模型源永远是 Civitai/HuggingFace。但「避免重复下载」靠 **Network Volume**：模型下一次进 Volume 就永久留存，所有 worker 共享读、永不重下。高频常驻、低频动态下缓存、冷的不留。**只有 runner 模型占 Volume，hosted 不占。**

### 4.5 安全（任务包 §7 红线）

- 不暴露原生 ComfyUI（8188）；RunPod 端点由 RunPod API key 保护，唯一调用方 = Worker。
- **runner 不持有 R2 凭证**（Worker 传 R2）。
- **公共 Civitai key** 存服务端 secret，绝不用个人 key、绝不明文进代码/命令行。
- allowlist / 模板 pin 由 Worker 强制（`recipe→workflow` 映射在 Worker）。
- 资源护栏：单并发、单任务超时、max 分辨率/steps；LoRA 下载源 allowlist（civitai.com / huggingface.co）。

---

## 5. 架构与数据流

```
PixelVault Studio UI
  └─ 用户选模型（Anima/WAI/… 平等，不感知后端）
     └─ Next.js: auth → Zod validate → submitImageGeneration() 建 GenerationJob   [现状]
          └─ route resolve: 能力路由判断 hosted 能否满足 → 否则 RUNNER 模型      [新，§4.2]
               └─ dispatchImageWorkerRun() 签名分发                              [现状]
                    └─ Cloudflare Worker (TS):
                        recipe → ComfyUI workflow JSON 映射(纯函数) + allowlist   [新，核心]
                        └─ POST https://api.runpod.ai/v2/{endpoint}/run          [新]
                             { "input": { "workflow": {…} } }
                        └─ 轮询 /status/{jobId} → 取 base64 图
                        └─ GENERATION_BUCKET.put() 传 R2                          [照抄现状]
                    └─ Worker 签名回调 /api/internal/execution/callback           [照抄现状]
          └─ handleExecutionCallback() 落 Generation(含 recipeSnapshot)           [现状]

RunPod Serverless Endpoint (runpod/worker-comfyui:base)
  └─ 挂 Network Volume @ /runpod-volume（extra_model_paths.yaml 自动发现 models/）
  └─ 收 workflow JSON → 跑 ComfyUI → 返回 base64
```

---

## 6. 当前进度（本会话已完成 / 卡在哪）

| 项                                             | 状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地 ComfyUI 复刻验证（go/no-go）              | ✅ 通过（§2.2）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| RunPod 注册 + 充值 $10 + API key               | ✅（key 已验证有效，账号 `user_3G67EXcAzNyHrBqcgeoBa88WAaY`；存本机注册表 `HKCU:\Environment\RUNPOD_KEY`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Network Volume `pixelvault-models`             | ✅ **40GB / US-CA-2 / id `rk3t3mb1ko`**（2026-07-10 重建：之前的 20GB Volume 在账号里已消失，API 查证为空；直接按 §4.2b 建 40GB，$2.8/月）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 起临时 Pod 下模型到 Volume                     | ✅ 完成（2026-07-10，CPU Pod $0.06/hr + REST API 全自动，无需网页手操；4 checkpoint 各 6.94GB + 测试 LoRA 228MB 全部进 Volume，共 ~26.2GB；首轮被 Civitai 账号级 429 限流打断，75s 长退避重跑通过，见 §9.7；Pod 已销毁）                                                                                                                                                                                                                                                                                                                                                                                                  |
| 建 serverless 端点 + 挂 Volume                 | ✅ **端点 `01g8rrmixe4hah`（pixelvault-runner）**，template `it11vb8960` = `runpod/worker-comfyui:5.8.6-base`；4090 主/A5000 备、Max 1、Active 0、Idle 5s、Timeout 120s、FlashBoot 开；已存 `HKCU:\Environment\RUNPOD_ENDPOINT`                                                                                                                                                                                                                                                                                                                                                                                           |
| API 提交 workflow 验证第一张                   | ✅ **验收通过**（2026-07-11）：§7.1 workflow 提交端点，出图与本地 `clone_00001_.png` 几乎逐像素一致（同 seed 确定性复现）。executionTime 18.5s；首次冷启动 delayTime 153s（含首次镜像拉取，非常态）。部署全程总花费 **$0.037**（余额 $9.963）                                                                                                                                                                                                                                                                                                                                                                             |
| 接进 PixelVault（代码触点 §8）                 | ✅ 代码全绿（2026-07-11）：RUNNER adapter + registry 注册 + Worker 侧 recipe→workflow 纯函数（models/runner/）+ RunPod submit/poll/decode + ImageQueueWorkflow runner 分支                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 月度限额代码                                   | ✅ `RUNNER_MONTHLY_LIMIT`（300/月）+ `usage.service.ts` 的 `assertRunnerMonthlyLimitNotExceeded`（按 GenerationJob 计数，非 ApiUsageLedger，含失败/在途请求）                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Anima/Pony V6/SDXL runner 条目                 | ✅ 4 checkpoint 全部登记（`runner-checkpoints.ts` + `models/image.ts` + `lora-base-models.ts`），`FEATURE_FLAGS.comfyRunner`（`NEXT_PUBLIC_FF_COMFY_RUNNER`）门控 available，默认关闭                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 能力路由（hosted 挂社区 LoRA → 自动升 runner） | ✅ v1：仅覆盖已知会崩 hosted 的 allowlist LoRA（当前 1 条：Tutenstein Cleo Carter V1）；未知 LoRA 走新增 `lora_incompatible_hosted` 错误码手动引导，见 `runner-capability-routing.service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Worker secret + 部署                           | ✅（2026-07-11，agent 代跑）`RUNPOD_KEY` secret 已上 `pixelvault-execution` + `wrangler deploy` 成功；最新版本 `8db66207`（含下方 img2img），绑定含 `RUNPOD_ENDPOINT=01g8rrmixe4hah`。secret 跨部署保留                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 参考图 img2img（runner）                       | ✅ **建成 + 真机验收 + 提交 `a05f2eb2`**（2026-07-11）：txt2img 工作流扩成 img2img——有参考图时 `EmptyLatentImage`→`LoadImage→ImageScale→VAEEncode`，KSampler `denoise = 1 − referenceStrength`（沿用 `invertReferenceStrength`）；纯加法，无参考图仍走 txt2img。触点 `workflow-builder.ts` / `request-builder.ts` / `submitRunnerImageJob`（取参考图→base64→RunPod `input.images`）/ `provider-capabilities.ts`（RUNNER `maxReferenceImages 0→1` + `referenceStrength` + `img2img` mode）。四个 runner 底模都吃 1 张参考图。真机出图验收通过（denoise 0.55 保结构 + 吃 prompt）。worker 测试 13→18、全量 vitest 3167 全绿 |
| LoRA 生成空态改造                              | ✅ 同 commit `a05f2eb2`：无 LoRA 时 composer（提示词框）+ 结果框常驻（不再整页占位），引导收进推荐列；结果框空态加虚线边界 + 微底色；`baseModelPending` 文案去掉误导的「即将」                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 遗留 TODO                                      | ✅ `wrangler secret put RUNPOD_KEY`（已上）；✅ Vercel 服务端 env `RUNPOD_KEY`（owner 已加）；⬜ **前端 push main + 部署 + 翻 `NEXT_PUBLIC_FF_COMFY_RUNNER=true`**（`NEXT_PUBLIC_*` 构建期内联，须重新 build 才生效）——生效后 runner 模型上架 + img2img chip 出现 + 空态改造可见；⬜ RunPod 端 LoRA 动态下载（fork worker-comfyui）仍是 v2 范围，v1 只认 allowlist                                                                                                                                                                                                                                                        |

---

## 7. 详细执行方案（第一版，只做 WAI）

> 完整逐步版见 `comfy-runner-runpod-deploy-2026-07.md`。这里是精炼可执行版。
> 分工：**网页操作 = 用户手动**（账号/支付/建资源，agent 无法代点）；**job 提交/取图 = agent 用 REST API 代劳**（有 RUNPOD_KEY）。

### 阶段 A — 临时 Pod 下模型到 Volume

1. 网页 Pods → Deploy：先选 Network Volume `pixelvault-models`（锁 US-CA-2，挂 `/workspace`）→ 选最便宜 GPU → 镜像用默认 RunPod PyTorch（自带 curl）→ Deploy。
2. 打开 Web Terminal，粘（`CIVITAI_KEY` 先用个人 key，临时）：
   ```bash
   export CIVITAI_KEY="<civitai key>"
   cd /workspace && mkdir -p models/checkpoints models/loras
   # WAI-illustrious-SDXL v15.0 (versionId 2167369, ~6.9GB)
   curl -L -H "Authorization: Bearer $CIVITAI_KEY" \
     -o models/checkpoints/waiIllustriousSDXL_v150.safetensors \
     "https://civitai.com/api/download/models/2167369"
   # LoRA Tutenstein Cleo carter V1 (versionId 1672783, ~0.23GB)
   curl -L -H "Authorization: Bearer $CIVITAI_KEY" \
     -o models/loras/tutenstein-cleo-carter-v1.safetensors \
     "https://civitai.com/api/download/models/1672783"
   ls -lh models/checkpoints models/loras   # checkpoint ~6.9G, lora ~230M
   ```
3. Terminate Pod（数据留 Volume，只剩 $0.07/GB/月）。

### 阶段 B — 建 Serverless Endpoint

网页 Serverless → New Endpoint：

- Image：`runpod/worker-comfyui:<最新 release>-base`（tag 见 github.com/runpod-workers/worker-comfyui/releases）
- GPU：24GB（RTX 4090；缺货用 A5000）
- Active 0 / Max 1 / Idle 5s / Execution Timeout 120s / Flash Boot 开
- Advanced → Network Volumes → 挂 `pixelvault-models`
- 记 Endpoint ID → `setx RUNPOD_ENDPOINT "<id>"`

### 阶段 C — 提交 workflow 验证（agent 用 REST API）

```bash
# key/endpoint 从注册表读，别明文进命令行（会被 classifier 拦）
POST https://api.runpod.ai/v2/$RUNPOD_ENDPOINT/run
  Header: Authorization: Bearer $RUNPOD_KEY
  Body:   {"input":{"workflow": <§7.1 JSON> }}
# 轮询 GET https://api.runpod.ai/v2/$RUNPOD_ENDPOINT/status/{jobId} 直到 COMPLETED
# 取 output.images[0].data (base64) → 解码 → 和本地那张/来源图对比
```

### 7.1 已验证的 workflow（API 格式，本地实测出图）

checkpoint/lora 文件名必须与 Volume 里一致。

> 注（2026-07-11）：下面是 **txt2img** 基线模板。runner 已扩出 **img2img**
> 分支（有参考图时 `EmptyLatentImage` 换成 `LoadImage → ImageScale →
VAEEncode`，KSampler `denoise = 1 − referenceStrength`，参考图经 RunPod
> `input.images:[{name,image(base64)}]` 上传）。权威实现见
> `workers/execution/src/models/runner/workflow-builder.ts`（§6 进度表「参考图
> img2img」行，commit `a05f2eb2`），已真机验收。

```jsonc
{
  "4": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": { "ckpt_name": "waiIllustriousSDXL_v150.safetensors" },
  },
  "10": {
    "class_type": "LoraLoader",
    "inputs": {
      "model": ["4", 0],
      "clip": ["4", 1],
      "lora_name": "tutenstein-cleo-carter-v1.safetensors",
      "strength_model": 1.0,
      "strength_clip": 1.0,
    },
  },
  "11": {
    "class_type": "CLIPSetLastLayer",
    "inputs": { "clip": ["10", 1], "stop_at_clip_layer": -2 },
  },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "clip": ["11", 0],
      "text": "Pink sneakers, dark skinned female, Purple pants, cleo carter, Belly button, Tutenstein, black dreadlocks, white tube top, Sapphire bracelets, pink open vest, standing, front view, full body, outdoors, pavilion, dawn, warm lighting",
    },
  },
  "7": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["11", 0], "text": "" },
  },
  "5": {
    "class_type": "EmptyLatentImage",
    "inputs": { "width": 1024, "height": 1024, "batch_size": 1 },
  },
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 30224931,
      "steps": 30,
      "cfg": 7.5,
      "sampler_name": "ddim",
      "scheduler": "normal",
      "denoise": 1.0,
      "model": ["10", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0],
    },
  },
  "8": {
    "class_type": "VAEDecode",
    "inputs": { "samples": ["3", 0], "vae": ["4", 2] },
  },
  "9": {
    "class_type": "SaveImage",
    "inputs": { "images": ["8", 0], "filename_prefix": "clone" },
  },
}
```

来源图 recipe（供对账）：checkpoint WAI-illustrious-SDXL v15.0（civitai modelVersionId 2167369）· LoRA Tutenstein Cleo carter V1（modelVersionId 1672783, weight 1.0）· seed 30224931 · 30 steps · cfg 7.5 · DDIM · clipSkip 2 · 1024×1024 · txt2img。

---

## 8. PixelVault 代码触点（接进产品，按 feature dev order）

> 完整版见任务包 `comfy-runner-recipe-clone.md` §8。摘要 + §1.5/§4.3 新增：

| 层        | 文件                                                | 改动                                                                                                                                        |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| constants | `src/constants/providers.ts`                        | `AI_ADAPTER_TYPES.RUNNER = 'runner'`                                                                                                        |
| constants | `src/constants/models/image.ts`                     | 新增 `ILLUSTRIOUS_RECIPE_CLONE`（adapterType RUNNER, supportsLora, available:false flag 门控）                                              |
| constants | `src/constants/execution.ts`                        | `RECIPE_CLONE_PATH` / workflow id；把 `RUNNER` 加进 `WORKER_MIGRATED_IMAGE_ADAPTERS`                                                        |
| constants | `src/constants/runner-checkpoints.ts` **(新)**      | checkpoint manifest（id/family/civitaiModelVersionId/sha256/推荐采样器·clipSkip·vae/available）                                             |
| constants | `src/constants/lora-base-models.ts`                 | 填 `anima-runner` / `pony-runner`(已在) 等 runner 条目；`runnerCheckpointId`                                                                |
| constants | `src/constants/config.ts`                           | **新增 `RUNNER_MONTHLY_LIMIT`（§4.3，仿 FREE_TIER）**                                                                                       |
| constants | `src/constants/generation-errors.ts`                | runner 错误码 + Replicate layer-error regex → `lora_incompatible_hosted`                                                                    |
| types     | `src/types/index.ts`                                | `RunnerRecipeRequestSchema`、`RunnerCapabilitiesSchema`（Zod）                                                                              |
| services  | `src/services/providers/runner.adapter.ts` **(新)** | 注册 `providers/registry.ts`，对齐 `replicate.adapter.ts`                                                                                   |
| services  | `src/services/image/*`                              | route resolve 支持 runner 模型 + **能力路由**（§4.2：挂社区 LoRA→升 runner）                                                                |
| services  | `src/services/usage.service.ts`（或新 service）     | **月度 RUNNER 计数 + 到顶拒绝（§4.3）**                                                                                                     |
| worker    | `workers/execution/*`                               | `recipe→workflow` 映射(纯函数) + POST RunPod /run + 轮询 /status + 取 base64 → `GENERATION_BUCKET.put` → 回调；runner code→worker code 映射 |
| i18n      | `src/messages/{en,ja,zh}.json`                      | 错误文案 + 模型名 + 月度限额提示，三文件同步                                                                                                |

不变更：credit/billing、Clerk、`Generation`/`GenerationJob` 表结构（`recipeSnapshot` 已是 Json）。

---

## 9. 环境 / 沙箱坑（接手前必读的教训）

> 这些是本会话踩出来的，接手 agent 若在同一 harness 里操作会遇到：

1. **Write/Edit 工具写文件 → 落真实磁盘（持久）；Bash/PowerShell 命令里 curl/写的文件 → 隔离 overlay（不持久、跨调用时有时无）。** 凡是"产出文件→再用该文件"的链条，**必须塞进同一个后台任务一次跑完**（下载+起 server+生成+结果 base64 回传全在一个 task）。任务的 `.output` 文件是持久可读的，是唯一可靠的跨环境回传通道。
2. **Civitai 下载必须 `curl.exe -L -H "Authorization: Bearer $key"`**；`Invoke-WebRequest` 处理其重定向/鉴权会失败（下出 0 字节/HTML）。
3. **key 从注册表读**（`(Get-ItemProperty 'HKCU:\Environment' -Name RUNPOD_KEY).RUNPOD_KEY`），**绝不明文进命令行**——classifier 会拦「明文 key」。`setx` 存的值新进程才可见；harness 的 shell 从父进程继承旧环境块，读不到刚 setx 的 → 走注册表读。
4. **本机默认 Python 是 3.14 Store 版，装不了 CUDA torch**；本地 ComfyUI 用单独装的 3.12。
5. RunPod REST base：`https://api.runpod.ai/v2/{endpoint}/run|status`；GraphQL：`https://api.runpod.io/graphql`。均 `Authorization: Bearer`。
6. Civitai 读图 recipe：`GET https://civitai.com/api/trpc/image.getGenerationData?input=%7B%22json%22%3A%7B%22id%22%3A<imageId>%7D%7D`，**需要登录**（带 Civitai key，否则 401）。返回 `result.data.json.{meta, resources}`。
7. **Civitai 下载有账号级限流**：连续大文件下载会触 429 `too_many_requests`（错误体 124 字节 JSON）。重试退避要 ≥75s，别 5s 快试；下载脚本必须校验文件大小（错误体也会落成"文件"）。
8. **RunPod REST API（`https://rest.runpod.io/v1`）能全自动建 Volume/Pod/Template/Endpoint**，原「网页手操」步骤全部可代劳。Pod 下载模型的模式：CPU Pod（$0.06/hr）+ `dockerStartCmd` 自带下载脚本 + `ports:["8000/http"]` 起 `python3 -m http.server` 服务 `download.log`，本机经 `https://{podId}-8000.proxy.runpod.net/` 轮询进度，完成后本机侧 DELETE Pod。⚠ classifier 会拦「把 RUNPOD_KEY 塞进 Pod env」（账号级凭证泄漏），Pod 内只放 CIVITAI_KEY，销毁动作放本机做。

---

## 10. 待决 / 风险 / 后续

- **RunPod 端 LoRA 动态下载**：stock worker 不支持，第一版预置 Volume。大量复刻时需 **fork worker-comfyui 改 handler**（收 recipe→缺的 LoRA 用公共 key 从 Civitai 下到 `/runpod-volume/models/loras` 缓存→再跑），走 GitHub 自动构建。这是"大量复刻不预囤"的关键增量。
- **公共 Civitai key**：当前个人 key 仅验证用，生产换公共 key（RunPod endpoint secret / env）。
- **能力路由细化**：§4.2 第 5 点，判断"hosted 能否满足本次请求"的具体逻辑（挂了 supportsLora 且是社区 LoRA → runner）待实现。
- **Anima 两处补丁**：`lora-base-models.ts` 补 `anima-runner`（`runnerCheckpointId:'animaPencilXL_v500'`, Civitai versionId 597138, ~6.78GB）；模型注册从 hosted 死链改 runner 可用。
- **US-CA-2 4090 实时库存**：型号确认有，实时容量以建端点 UI 为准；缺货用 A5000（24GB，稍慢便宜）。
- **冷启动体验**：scale-to-zero 第一张 15–40s，UI 需分阶段进度态（唤醒→载模型→生成），别让用户以为卡死。
- **Phase 0 保真度更严格验收**：本会话凭 prompt 要素判断"高度吻合"，未并排原图像素级对比。要更严谨可拉原图并排。

---

## 附：快速上手（接手 agent 第一步做什么）

1. 读本文 + 任务包 §1.5/§8 + 部署手册。
2. 确认当前卡点：**用户需网页起临时 Pod 下 WAI 模型到 Volume**（§7 阶段 A）——这步 agent 代不了（网页 + 账号），给用户命令让其在 Pod terminal 执行。
3. 用户建好端点给 `RUNPOD_ENDPOINT` 后，agent 用 REST API 提交 §7.1 workflow，取图对比验收。
4. 验收通过 → 进 §8 代码触点，把 runner 接进 PixelVault（RUNNER adapter + 能力路由 + 月度限额）。
