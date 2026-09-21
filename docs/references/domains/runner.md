# Runner 域 — 自建 ComfyUI 执行通道（RunPod serverless）

> 定位：**运维事实的唯一常驻处**。这些值代码里没有、控制台之外查不到，任务包删干净后只剩这份。
> 讨论过程、方案对比、施工步骤一律不进来——那些从 git 历史取。
> 上游关系：LoRA 侧的产品约束见 `domains/lora.md`；provider 名册见 `references/providers.md`。

基础设施标识于 2026-09-21 通过 RunPod CLI 回读；下方注明日期的历史 Volume 清单与性能记录不代表当前库存或价格。

---

## 1. 基础设施标识

| 项              | 当前生产值                                                                     | 核验范围                                                                                       |
| --------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Network Volume  | `ivchraoqjv` · `pixelvault-models-eu-ro-1` · 80 GB · EU-RO-1                   | 2026-09-21 API 回读；本轮未扫描文件                                                            |
| Serverless 端点 | `dt0wyuid7lywic` · `pixelvault-runner-eu-ro-1`                                 | Execution Worker 的 `RUNPOD_ENDPOINT` 同值                                                     |
| Template        | `pmh4gs9eht`                                                                   | 镜像 `ghcr.io/anteisuba/pixelvault-runner-fork:5.8.6-92ef778b5d6bab2cf1981b2eecb8311a92460a12` |
| 端点参数        | Min 0 / Max 2 / Idle 60s / Execution Timeout 600000ms / FlashBoot 开           | 单 Worker 一张 GPU，QUEUE_DELAY 4                                                              |
| GPU 型号        | 本轮 CLI 响应未包含具体型号                                                    | 不把旧文档的 GPU 档位当成实查结果                                                              |
| API 凭证        | Execution Worker 的 `RUNPOD_KEY`；本机 RunPod CLI 使用 `~/.runpod/config.toml` | 不记录值；本轮本机凭证可读，创建模板返回 403                                                   |
| 端点配置真值    | `workers/execution/wrangler.jsonc`                                             | 本机环境变量可能过时，不用它判断生产端点                                                       |

2026-09-21 Qwen 评估部署未改动上述生产端点。当前价格与显存／耗时须实测，旧的每图费用估算不再作为现行依据。

---

## 2. 协议与路径（stock worker 的硬约束）

- 挂载点两套：**Pod 挂 `/workspace`**，**serverless worker 挂 `/runpod-volume`**；worker 的
  `extra_model_paths.yaml` 自动发现。写路径时别混。
- 请求体：`{"input":{"workflow":{…ComfyUI API 格式 JSON…}}}`；输出默认 base64，取
  `output.images[].data`。checkpoint / LoRA 在 workflow JSON 里按文件名引用。
- ⛔ **stock worker 不支持「运行时按 URL 动态下载模型」**（RunPod configuration.md 查证）。
  所以模型必须**预置进 Volume**；想"大量复刻任意 Civitai 模型"就得换自建镜像，不是配置能解决的。

### Qwen-Image-2.1 内部评估（2026-09-21）

- owner 仅授权非商业研究／评估。没有新增公开模型条目，也没有将生产 Execution Worker 切到评估通道。
- Runner 源码将 ComfyUI 固定到 v0.37.0（`73c9bad4d21e7addbe1d13bc92eee0f1431b017d`）；评估 target `qwen-evaluation` 预置 INT8 diffusion、INT8 Qwen3-VL 8B、BF16 专用 VAE，固定 HF revision 并校验 SHA-256 与文件长度。
- `workers/runner-comfyui-fork/qwen_workflow.py` 生成 API 工作流：文生图用 `TextEncodeQwenImage21` + Euler/simple；编辑通过同节点接入图片与 VAE 参考条件，最多 10 张，latent 随首图缩放尺寸。不是 SDXL 低 denoise 图生图。
- 基础镜像构建已通过 CPU 启动检查，实际 PyTorch 为 `2.12.0+cu130`；GPU 部署需选择 CUDA 13.0 驱动兼容机器。CPU 启动不能替代显存和真实出图验收。
- GPU 部署状态与未决权限见 `docs/status.md`；镜像构建成功不能当作 RunPod 端点已部署。

核验来源：[官方模型仓](https://github.com/QwenLM/Qwen-Image-2.1)、[ComfyUI v0.37.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.37.0)、[官方工作流](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json)、[研究许可证](https://github.com/QwenLM/Qwen-Image-2.1/blob/main/LICENSE)。

---

### SDXL 来源精修与加载证据（2026-09-13 fork 已部署并通过 GPU 验收）

- 来源 `Latent` 配方映射 `runnerHires`：第一遍 latent → bilinear `LatentUpscale` → 第二遍 `KSampler` → VAE；第二遍共用模型、LoRA、正负 conditioning 与 seed，独立 denoise / 可选 steps / CFG，步骤 0 或缺失继承第一遍。目标尺寸向下对齐 8、每边不超过 2048；Anima 不接受该设置。
- Sue 来源：672×984、Latent ×1.45、denoise 0.45、25 步、CFG 7 → 968×1424。未改原 prompt 或三枚 LoRA 权重；与 Forge 的 RNG/采样实现仍可能不同，不能承诺逐像素复现。
- `PixelVaultCheckpointLoader` / `PixelVaultLoraLoader` 在调用原加载器时核对文件 SHA-256、大小和变更；audit 与模型输出同链传入 `PixelVaultSaveImage`，写入 PNG `pixelvaultExecution`。Comfy 缓存复用时保留对应加载输出的证据；零权重跳过的 LoRA 不记为已加载。
- fork 从成图读取证据并附加图像 SHA-256，Execution Worker 校验结构及图像绑定后，将 `runnerExecution` 连同 `runpodJobId` 送入现有 `executionCallback.providerMetadata` 快照。普通 Anima/旧结果缺证据时不伪造；记录证明文件经过加载器，不证明所有 LoRA key 都匹配或出图质量达标。
- 官方 5.8.6 的 `src/start.sh` 在两个启动分支均传入 `--disable-metadata`；fork 构建时移除该参数，否则自定义保存节点在二次采样完成后拒绝保存，无法输出模型文件证据。
- 实测镜像 `92ef778b5d6bab2cf1981b2eecb8311a92460a12` 返回 968×1424 PNG；加载证据确认 RIN v4 SHA-256 `29d5281e0adba1cf2dc8795e9016d3bf6e8c06b71630492b49468b7be8411bdf` 与三枚 LoRA 的 0.9/0.8/0.8 权重。随后应用端任务 `f6521add-8454-4ab0-aad1-7d32bc53e311` 成功归档；回调保存的完整加载证据（含图片 hash）与直接 RunPod 实测一致，提示词逐字一致。
- 发布顺序：先构建并更新 RunPod fork（含 `/comfyui/custom_nodes/pixelvault_model_evidence`），验收自定义节点可见，再发布 Execution Worker 与应用。新工作流不能交给缺这些节点的旧镜像；本地单元测试没有替代真实 GPU 验收。

契约核对：[ComfyUI nodes](https://github.com/comfyanonymous/ComfyUI/blob/master/nodes.py)、[Forge Latent 插值](https://github.com/lllyasviel/stable-diffusion-webui-forge/blob/main/modules/shared.py)、[RunPod 5.8.6 handler](https://github.com/runpod-workers/worker-comfyui/blob/5.8.6/handler.py)。

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
