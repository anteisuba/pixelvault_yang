# Runner 域 — 自建 ComfyUI 执行通道（RunPod serverless）

> 定位：**运维事实的唯一常驻处**。这些值代码里没有、控制台之外查不到，任务包删干净后只剩这份。
> 讨论过程、方案对比、施工步骤一律不进来——那些从 git 历史取。
> 上游关系：LoRA 侧的产品约束见 `domains/lora.md`；provider 名册见 `references/providers.md`。

⚠ **本页记的是 2026-07-18 的审计快照，动手前必须现查一遍**（端点和 Volume 都改过一次：
07-10 建的 40GB Volume 与 `01g8rrmixe4hah` 端点都已不是现状）。核对手段见文末。

---

## 1. 基础设施标识

| 项              | 值                                                                                                                               | 备注                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Network Volume  | id `rk3t3mb1ko` · **80GB** · US-CA-2                                                                                             | 07-10 首建 40GB，后扩到 80GB。RunPod 支持在线扩容、**不能缩**   |
| Serverless 端点 | **`p4qb5294ma1qzi`**（`pixelvault-runner-v2`）                                                                                   | ⛔ 旧端点 `01g8rrmixe4hah`（`pixelvault-runner`）**已退役删除** |
| Template        | `it11vb8960` = `runpod/worker-comfyui:5.8.6-base`                                                                                | —                                                               |
| GPU             | RTX 4090 24GB 主 · A5000 24GB 备                                                                                                 | SDXL 推理 16GB 就够，选 4090 是为冷启动更短                     |
| 端点参数        | Active 0 / Max 1 / Idle 5s / Execution Timeout 120s / Flash Boot 开                                                              | 单端点服务全部 checkpoint，不按家族拆端点                       |
| API key 存放    | 本机注册表 `HKCU:\Environment\RUNPOD_KEY`；Worker 侧 `wrangler secret`（`pixelvault-execution`）；Vercel 服务端 env `RUNPOD_KEY` | ⛔ 值不进任何文档                                               |
| 端点注册表      | 本机 `RUNPOD_ENDPOINT`                                                                                                           | 换端点时必须同步，否则请求打到已删的旧端点                      |

**成本**：4090 Community $0.34/hr 按秒计费 → 约 **$0.002–0.006/图**（含冷启动，保守估）；
Volume $0.07/GB/月。**冷启动**从 Volume 载 6.9GB checkpoint 约 **15–40s** —— 这是要靠体验
设计消化的点，不是成本问题。

---

## 2. 协议与路径（stock worker 的硬约束）

- 挂载点两套：**Pod 挂 `/workspace`**，**serverless worker 挂 `/runpod-volume`**；worker 的
  `extra_model_paths.yaml` 自动发现。写路径时别混。
- 请求体：`{"input":{"workflow":{…ComfyUI API 格式 JSON…}}}`；输出默认 base64，取
  `output.images[].data`。checkpoint / LoRA 在 workflow JSON 里按文件名引用。
- ⛔ **stock worker 不支持「运行时按 URL 动态下载模型」**（RunPod configuration.md 查证）。
  所以模型必须**预置进 Volume**；想"大量复刻任意 Civitai 模型"就得换自建镜像，不是配置能解决的。

---

## 3. Volume 里有什么（2026-07-18 S3 SigV4 只读实测）

用量 **47.40 GiB**（50,894,963,889 B），自由 **32.60 GiB**；`checkpoints/` 占 32.31 GiB。

| 类别        | 内容                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDXL 底模 5 | WAI-illustrious-SDXL v15.0（Civitai versionId `2167369`）· anima_pencil-XL v5.0.0（`597138`）· Pony Diffusion V6 XL（`290640`）· SDXL 1.0 VAE-fix（`128078`）· Nova Anime XL（运行时缓存） |
| Anima DiT 2 | base v1.0 + turbo（turbo 落在 `models/unet/civitai-ckpt-3108589.safetensors`，曾误置于 `checkpoints/`，已服务端 copy 并删原位）                                                            |
| LoRA        | 运行时缓存 14 个                                                                                                                                                                           |
| 放大模型    | 4x-AnimeSharp —— ⚠ **在 Volume 里但没有任何 workflow 引用它**，属顺路件                                                                                                                    |

**现有 workflow 3 条**：SDXL txt2img · SDXL img2img（单参考，`denoise = 1 - strength`）· Anima DiT txt2img。

**范围边界**：⛔ **SD 1.5 不在 runner 范围**，保持 external 跳转 —— 不为它做第二套分辨率/采样模板档。
四家族同为 SDXL 架构、共用同一 workflow 模板，所以增量成本 ≈ 每家族一条
`runner-checkpoints.ts` manifest + Volume 里一个文件。

**Pony 推荐参数**：`score_9` 系质量词 + `clipSkip 2`（写进 manifest，不靠用户自己记）。

---

## 4. 限额

`RUNNER_MONTHLY_LIMIT` = **300/月**，由 `usage.service.ts` 的
`assertRunnerMonthlyLimitNotExceeded` 按 **GenerationJob 计数**（不是 ApiUsage）执行。

---

## 5. 已知坑与未竟

- ⚠ **可复现 bug**：workflow 里 `VAEDecode` 直连 `ImageUpscaleWithModel` 时，job 返回
  `COMPLETED` 但**既无 output 也无 error** —— 静默空结果。改 hires-fix 相关 workflow 前先绕开。
- **r4a（multi-reference IPAdapter）已施工完成、测试端点验证绿，生产未切换**。
  fork 仓库 HEAD `c1dbf58`（2026-07-18）。要切生产得走 fork 构建 + template + 端点滚动。
- **Krea 2** 当前 `generatability = 'external'`，且 `normalizeToLoraBaseFamily` **故意**对它返回 null
  —— 加分类只开浏览、不开生成，这是有意为之，别"顺手修正"。
  - **闸是版本，不是意愿**：Krea 2 原生支持要 ComfyUI **≥ 0.27**，而 runner 基础镜像 `worker-comfyui 5.8.6`
    内置 **0.25.0**。upstream main 已把 ComfyUI 钉到 **0.29.0 但尚未发版** —— 所以这条从「时间不可控」
    降级成「只差发版」。⚠ 查进度**只看 tag 会误判**，要看 upstream main 的版本声明 + `.changeset/`。
  - 发版后接通 r4b 管线（fork 构建 → template → 端点滚动，同 r4a 那条路），届时把
    `CIVITAI_BASE_MODEL_GENERATABILITY['Krea 2']` 翻成 `'native'`。在那之前 UI 引导去 Civitai。
- hosted 后端挂社区 LoRA 会报 `layer ... not supported`（illustrious-xl 走 Replicate 托管端点时实测），
  这是**托管后端的能力边界**，不是配置问题 —— 能力路由把这类请求升到 runner 就是为了它。

---

## 6. 怎么核对本页是否过期

```bash
# 端点存活与健康
curl -s -H "Authorization: Bearer $RUNPOD_KEY" https://api.runpod.ai/v2/<endpointId>/health
```

- **端点僵死的判据**：`health` 显示 idle ≥ 1 且 running = 0，而请求全程停在 `IN_QUEUE`
  —— 这不是排队，是端点卡死；秒失败则是另一回事（平台总闸 `PLATFORM_GENERATION_ENABLED`）。
- Volume 用量与明细只能走 **RunPod S3 API（SigV4 只读）**，控制台不给明细。
- ⛔ 别信 95% 这类进度数字，那是假进度。

## Last Verified

2026-09-01 · 事实来自 `runner-r4-krea2-multiref-2026-07`（2026-07-18 S3+REST 审计）与
`comfy-runner-HANDOFF-2026-07`（2026-07-11 交付）两份任务包，两份已按「完成即删」清除。
⚠ 值本身最后一次实测是 **2026-07-18**，距本次沉淀已 6 周，用前请按 §6 现查。
