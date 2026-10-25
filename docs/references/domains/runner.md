# Runner 域 — 自建 ComfyUI 执行通道（Modal）

> 定位：**运维事实的唯一常驻处**。这些值代码里没有、控制台之外查不到，任务包删干净后只剩这份。
> 讨论过程、方案对比、施工步骤一律不进来——那些从 git 历史取。
> 上游关系：LoRA 侧的产品约束见 `domains/lora.md`；provider 名册见 `references/providers.md`。

2026-10-06 起生产跑在 Modal；2026-10-21 Worker 里的 RunPod 分支已删（owner 定）。下文带「RunPod 时期」字样的段落是历史记录，只为解释 fork 镜像里的路径与约束，不再描述现网。

---

## 1. 基础设施标识

| 项           | 当前生产值                                                                                     | 说明                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Modal App    | `pixelvault-runner`（`workers/runner-modal/app.py`，`modal deploy` 发布）                      | `MainRunner`（target `main`）与 `QwenRunner`（target `qwen`）两个类                      |
| HTTP 入口    | `RUNNER_MODAL_URL`（`workers/execution/wrangler.jsonc`）                                       | `POST /run` · `GET /status/{id}` · `POST /cancel/{id}` · `GET /health`，全部 Bearer 鉴权 |
| 凭证         | Worker secret `RUNNER_MODAL_TOKEN` ↔ Modal Secret `pixelvault-runner-token`                    | Next 侧不持有任何 Runner 凭证，Worker 不再为 Runner 回调 resolve-key                     |
| 下载凭证     | Modal Secret `pixelvault-runner`（`CIVITAI_KEY`）                                              | fork 下 Civitai 底模用，不进 job 载荷                                                    |
| Volume       | `pixelvault-runner-models`，挂 `/runpod-volume`（沿用 fork 的路径，不用改镜像）                | 无硬配额；fork LRU 按 `RUNNER_VOLUME_QUOTA_BYTES=300000000000` 清缓存                    |
| 镜像         | main `ghcr.io/anteisuba/pixelvault-runner-fork:5.10.0-f3b77c5…`；qwen `…:qwen21-eval-a156ba3…` | 与 RunPod 时期同一个 fork 镜像（`workers/runner-comfyui-fork`），换平台没改镜像          |
| GPU / 伸缩   | L40S → A100-40GB；main 最多 2 个容器、空闲 60s 缩容；qwen 最多 1 个、10s 缩容；单次时限 600s   | 以 `app.py` 为准                                                                         |
| 端点配置真值 | `workers/runner-modal/app.py` + `workers/execution/wrangler.jsonc`                             | 本机环境变量可能过时                                                                     |

⚠ Modal 的 `/status` 只回 `IN_PROGRESS` / `COMPLETED` / `FAILED`，没有 `IN_QUEUE`：Worker 首次轮询就会报 `runnerRunning`，主站分不出「排队等 GPU」和「正在出图」。待 Worker 设计第 3 步统一处理。

RunPod 时期的端点（`dt0wyuid7lywic`、Qwen 评估 `ok6riemrmpdiic`）、模板与 Network Volume `ivchraoqjv` 由 owner 在 RunPod 控制台删除；代码里已无任何引用。

---

## 2. 协议与路径（fork 镜像的约束，RunPod 时期定下）

- 挂载点两套：**Pod 挂 `/workspace`**，**serverless worker 挂 `/runpod-volume`**；worker 的
  `extra_model_paths.yaml` 自动发现。写路径时别混。
- 请求体：`{"input":{"workflow":{…ComfyUI API 格式 JSON…}}}`；输出默认 base64，取
  `output.images[].data`。checkpoint / LoRA 在 workflow JSON 里按文件名引用。
- ⛔ **stock worker 不支持「运行时按 URL 动态下载模型」**（RunPod configuration.md 查证）。
  所以模型必须**预置进 Volume**；想"大量复刻任意 Civitai 模型"就得换自建镜像，不是配置能解决的。

### Qwen-Image-2.1 内部评估（2026-09-21）

- owner 仅授权非商业研究／评估。`qwen-image-2.1-runner` 在开启 `NEXT_PUBLIC_FF_COMFY_RUNNER` 后支持本地及线上内部评估；生产账号须列入服务端私有 `QWEN_EVALUATION_USER_IDS`（逗号分隔的数据库 User ID）。个人资料接口返回可用权限，图片模型列表据此展示，生成服务再次校验；非授权账号即使携带 key 也拒绝调用。不作为公开商业模型，原 SDXL 端点保留。
- Runner 源码将 ComfyUI 固定到 v0.37.0（`73c9bad4d21e7addbe1d13bc92eee0f1431b017d`）；评估 target `qwen-evaluation` 预置 INT8 diffusion、INT8 Qwen3-VL 8B、BF16 专用 VAE，固定 HF revision 并校验 SHA-256 与文件长度。
- `workers/runner-comfyui-fork/qwen_workflow.py` 生成 API 工作流：文生图用 `TextEncodeQwenImage21` + Euler/simple；编辑通过同节点接入图片与 VAE 参考条件，最多 10 张，latent 随首图缩放尺寸。不是 SDXL 低 denoise 图生图。
- 基础镜像构建已通过 CPU 启动检查，实际 PyTorch 为 `2.12.0+cu130`；GPU 部署需选择 CUDA 13.0 驱动兼容机器。CPU 启动不能替代显存和真实出图验收。
- 已创建独立端点 `ok6riemrmpdiic`（`pixelvault-qwen21-internal-eval`），模板 `sw8qiqhsa9`，RTX 4090，Min 0 / Max 1 / Idle 5s。（RunPod 时期）现由 Modal 的 `qwen` target 承接，任务 ID 不再带端点前缀。
- 工作台默认 CFG 1、25 步，支持负面提示词、seed 与最多 10 张原生参考图；使用服务端 Runner 凭证，不弹用户 key 配置。编辑结果按 PNG 实际尺寸归档。当前未核实每图金额，界面不显示估算美元价；实际由 Modal 计费。
- GPU 实际验收与 Worker 部署状态见 `docs/status.md`；端点创建和代码测试不替代真实成图。

核验来源：[官方模型仓](https://github.com/QwenLM/Qwen-Image-2.1)、[ComfyUI v0.37.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.37.0)、[官方工作流](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json)、[研究许可证](https://github.com/QwenLM/Qwen-Image-2.1/blob/main/LICENSE)。

---

### SDXL 来源精修与加载证据（2026-09-13 fork 已部署并通过 GPU 验收）

- 来源 `Latent` 配方映射 `runnerHires`：第一遍 latent → bilinear `LatentUpscale` → 第二遍 `KSampler` → VAE；第二遍共用模型、LoRA、正负 conditioning 与 seed，独立 denoise / 可选 steps / CFG，步骤 0 或缺失继承第一遍。目标尺寸向下对齐 8、每边不超过 2048；Anima 不接受该设置。
- Sue 来源：672×984、Latent ×1.45、denoise 0.45、25 步、CFG 7 → 968×1424。未改原 prompt 或三枚 LoRA 权重；与 Forge 的 RNG/采样实现仍可能不同，不能承诺逐像素复现。
- `PixelVaultCheckpointLoader` / `PixelVaultLoraLoader` 在调用原加载器时核对文件 SHA-256、大小和变更；audit 与模型输出同链传入 `PixelVaultSaveImage`，写入 PNG `pixelvaultExecution`。Comfy 缓存复用时保留对应加载输出的证据；零权重跳过的 LoRA 不记为已加载。
- fork 从成图读取证据并附加图像 SHA-256，Execution Worker 校验结构及图像绑定后，将 `runnerExecution` 连同 `runnerJobId`（RunPod 时期的历史记录里叫 `runpodJobId`）送入现有 `executionCallback.providerMetadata` 快照。普通 Anima/旧结果缺证据时不伪造；记录证明文件经过加载器，不证明所有 LoRA key 都匹配或出图质量达标。
- 官方 5.8.6 的 `src/start.sh` 在两个启动分支均传入 `--disable-metadata`；fork 构建时移除该参数，否则自定义保存节点在二次采样完成后拒绝保存，无法输出模型文件证据。
- 实测镜像 `92ef778b5d6bab2cf1981b2eecb8311a92460a12` 返回 968×1424 PNG；加载证据确认 RIN v4 SHA-256 `29d5281e0adba1cf2dc8795e9016d3bf6e8c06b71630492b49468b7be8411bdf` 与三枚 LoRA 的 0.9/0.8/0.8 权重。随后应用端任务 `f6521add-8454-4ab0-aad1-7d32bc53e311` 成功归档；回调保存的完整加载证据（含图片 hash）与直接 RunPod 实测一致，提示词逐字一致。
- 发布顺序：先构建并更新 RunPod fork（含 `/comfyui/custom_nodes/pixelvault_model_evidence`），验收自定义节点可见，再发布 Execution Worker 与应用。新工作流不能交给缺这些节点的旧镜像；本地单元测试没有替代真实 GPU 验收。

契约核对：[ComfyUI nodes](https://github.com/comfyanonymous/ComfyUI/blob/master/nodes.py)、[Forge Latent 插值](https://github.com/lllyasviel/stable-diffusion-webui-forge/blob/main/modules/shared.py)、[RunPod 5.8.6 handler](https://github.com/runpod-workers/worker-comfyui/blob/5.8.6/handler.py)。

### 5.10 底座 · 下载核对 · DiT 加载证据（2026-09-28 回归通过并已切生产）

- 镜像 `ghcr.io/anteisuba/pixelvault-runner-fork:5.10.0-2f1eb8ec295464fd275027f57fca49e4b09a4c29`：官方 `worker-comfyui:5.10.0-base`（CUDA 12.8 + ComfyUI 0.34）。主仓提交 `04d7f4f7` · `cd43f24e` · `7e38067d` · `b257f659`，小仓 `a414072` · `2f1eb8e` · `f3b77c5`；`build.yml` 的 final tag 前缀已改为 `5.10.0`。回归跑在 `2f1eb8e`，生产用的是加了配额修复的 `f3b77c5`。
- 回归用临时端点（同一 Volume、4090 / A5000 / L4 / 3090、CUDA 12.8 / 12.9 / 13.0、Max 1）直接发作业，跑完已删；测试模板 `zx61alrcs3` 保留，可复用。6 项全过：SDXL + LoRA + 来源精修 968×1424（与首跑逐字节相同）· Pony 直出 + 4x-AnimeSharp 512×640 → 2048×2560（「VAEDecode 直连放大 → 空结果」在 0.34 **未复现**）· Anima Base + 已缓存 LoRA · Anima Base + 首次使用的 LoRA（一次成功）· 从 Civitai 现下 Anima Turbo v1.1 并核对 SHA 后出图 · 给错 SHA 的配件被拦下（`SHA-256 mismatch`）。冷启动排队 57–141s，执行 22–64s（含 4.2G 下载）。
- 升级抓到的坑：0.34 的 `UpscaleModelLoader` 是 V3 节点，`/object_info` 里的文件清单变成 `["COMBO", {"options": [...]}]`，可见性闸原先认不出、所有放大作业提交前即失败；`7e38067d` 已修。
- Civitai 公布的 `SHA256` 就是下载到的文件本体（R2 里 7 把 LoRA 与 Anima Turbo 实测一致）；DiT 加载证据里 Anima Base 的 SHA 与 HF LFS oid 一致。
- 切生产（2026-09-28 已做）：`PATCH` template `pmh4gs9eht` 的 `imageName`（只改这一个字段，env 里的 `CIVITAI_KEY` 不动；`RUNNER_VOLUME_QUOTA_BYTES=150000000000` 由 owner 在控制台加）+ 端点 `allowedCudaVersions` 12.8 / 12.9 / 13.0。⚠ 改完模板后旧镜像的 worker 仍被 FlashBoot 秒恢复、继续接活（第一批新镜像 worker 很可能在 CUDA 限定生效前被分到旧驱动机器、起不来退出）；把 `workersMax` 临时设 0 清空 worker 再设回 2 后，新镜像才接手（新机器首次拉镜像约 7 分钟）。验收：生产端点直接发 SDXL + LoRA + 精修、Anima + LoRA 各一个，出图与测试端点逐字节相同，DiT 证据齐全。新 fork 兼容线上旧 Worker（旧工作流用原生节点、不带 sha256）；新 Worker（Anima 用 DiT 证据节点）与应用尚未发布。本机 `~/.runpod/config.toml` 的 key 于 09-28 换成有写权限的。
- **没机器可用（owner：以前就常卡在排队）**：Volume 把 worker 锁在 EU-RO-1 一个机房，这里的 24G 卡一紧张就全体 throttled；限定 CUDA ≥ 12.8 后更少。09-28 实测清 worker 后首个作业排队 676s。当天 owner 定：端点 GPU 加 48G 档（A40 / A6000，$0.00034/s，与 4090 PRO $0.00031/s 相近）作回退，现为 4090 → A5000 / L4 / 3090 → A40 / A6000（RunPod 文档：最多选三档，按优先级回退，少于 5 个 worker 时只用最高优先级的可用档）。第二机房 Volume（跨机房调度，每月约多 $10）owner 09-28 定**不做**，只靠 48G 回退。
- **Volume 满（2026-09-27 生产实见）**：80 GB 配额写满，Anima 作业下载底模撞 `[Errno 122] Disk quota exceeded`，且被 `quota.*exceeded` 规则说成「Agent Key 余额不足」。根因是网络卷配额从文件系统剩余量里看不出来，LRU 从未触发。09-28 已扩到 150 GB；fork 改为按 `RUNNER_VOLUME_QUOTA_BYTES`（切生产时在 template 配 `150000000000`）与卷上实际文件大小判断清缓存，写盘撞配额报「存储已满」；app 同时把该原话归到 `runner_storage_full`。
- 本次回归留在 Volume 上的：`civitai-ckpt-3263843.safetensors`（Anima Turbo v1.1，4.2G，受 LRU 管理）与 LoRA `civitai-3340256.safetensors`；后者也按应用规则进了 R2 `runner-loras/`。

### 底模插槽 · Anima Turbo v1.1（2026-09-28，进度表 45 ②）

- 清单 id `animaTurbo_v11`（应用模型 `anima-turbo-runner`，Civitai 版本 `3263843`）：权重从 HF `circlestone-labs/Anima` 钉住的 revision `f973fc41…` 拉 `split_files/diffusion_models/anima-turbo-v1.1.safetensors`（4,182,230,656 B，SHA-256 `fba11953…d3f7eb`，与 Civitai 公布值一致），作为 companion 落 `models/unet/`，与 Base 共用 Qwen 编码器 / VAE。Worker 按清单 id 挑这一档的配件（`ANIMA_CHECKPOINT_COMPANIONS`），来源图精确底模时不带。
- 出图默认按清单条目走（`recommendedSteps` / `recommendedCfg`，两边清单同步）：Turbo euler · simple · 10 步 · CFG 1 · shift 3；Base er_sde · simple · 30 步 · CFG 4；SDXL 系没写 = 30 步 · CFG 7.5。来源图底模的 Civitai 版本名带 turbo 时，应用在 `runnerCheckpoint.defaultsCheckpointId` 里写 `animaTurbo_v11`，Worker 按它的默认出。
- ⚠ 卷上会有两份同一个 Turbo 文件：回归时从 Civitai 下的 `civitai-ckpt-3263843.safetensors`（受 LRU 管）与这份 `anima-turbo-v1.1.safetensors`（companion，不进 LRU）。前者被清掉不影响出图。

### 底模插槽 · Z-Image Turbo（2026-09-28，进度表 45 ③）

- 清单 id `zImageTurbo_bf16`（应用模型 `z-image-turbo-runner`，Civitai 官方页版本 `2442439`，同一文件）：三份文件钉 HF `Comfy-Org/z_image_turbo` revision `6fc90a3b…`，按需作为 companion 下——`diffusion_models/z_image_turbo_bf16.safetensors`（12,309,866,400 B，SHA `24076130…74a6`）→ `models/unet/`、`text_encoders/qwen_3_4b.safetensors`（8,044,982,048 B，SHA `6c671498…fc5a`）→ `models/clip/`、`vae/ae.safetensors`（335,304,388 B，SHA `afc8e282…9e38`）→ `models/vae/`。共约 20.7G，不进 LRU。
- 工作流照 Comfy-Org 官方模板 `image_z_image_turbo.json`：CLIPLoader `type=lumina2` · `EmptySD3LatentImage` · ModelSamplingAuraFlow shift 3 · 负面为空时 `ConditioningZeroOut`；与 Anima 共用一个 DiT 构图（`dit-workflow-builder.ts` 的 `DIT_WORKFLOW_PROFILES`）。默认 res_multistep · simple · **9 步**（owner 09-28 定；官方模板 8 步）· CFG 1；尺寸按 DiT 约 1MP 表，精确尺寸上限 2048。LoRA 走 model-only；采样器表新增 `res_multistep`。
- 只有固定档：ZImageBase / ZImageTurbo 两种 LoRA 都挂它，没有「来源图底模（自动）」。

### 底模插槽 · RIN Flanime v5.0 与 SDXL 系「来源图底模（自动）」（2026-10-25）

- 清单 id `rinFlanimeIllustrious_v50`（应用模型 `rin-flanime-illustrious-runner`，Civitai 版本 `3262295`）：**不预装**（`downloadOnDemand: true`；云端代理不转 gRPC，Modal CLI 用不了）。出图时 app 的 `prepareOnDemandRunnerCheckpoint` 解析下载链下发 `checkpoint_to_fetch`，fork 首次下载 6.8 GB 后缓存（LRU）。文件名就是 T1 命名 `civitai-ckpt-3262295.safetensors`，与来源图恰好用它时共用一份缓存。默认 Euler a · normal · 25 步 · CFG 7 · Clip skip 2。
- SDXL 系的 T1 覆盖档若正好是清单某一档，`defaultsCheckpointId` 借那一档的默认（Worker SDXL 分支现在也认这个字段）；来源图底模就是选中的预装档时不再重复下载。
- Illustrious / Pony / SDXL / Anima Pencil 与 DiT Anima 一样，第一项是「来源图底模（自动）」（沿用原 id），后面是固定档（`illustrious-wai-runner` · `illustrious-rin-flanime-runner` · `pony-v6-runner` · `sdxl-base-runner` · `anima-pencil-runner`）。固定档忽略配方里写的底模。

## 3. Volume 里有什么（2026-07-18 S3 SigV4 只读实测）

用量 **47.40 GiB**（50,894,963,889 B），自由 **32.60 GiB**；`checkpoints/` 占 32.31 GiB。

| 类别        | 内容                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDXL 底模 5 | WAI-illustrious-SDXL v15.0（Civitai versionId `2167369`）· anima_pencil-XL v5.0.0（`597138`）· Pony Diffusion V6 XL（`290640`）· SDXL 1.0 VAE-fix（`128078`）· Nova Anime XL（运行时缓存） |
| Anima DiT 2 | base v1.0 + turbo（turbo 落在 `models/unet/civitai-ckpt-3108589.safetensors`，曾误置于 `checkpoints/`，已服务端 copy 并删原位）                                                            |
| LoRA        | 运行时缓存 14 个                                                                                                                                                                           |
| 放大模型    | 4x-AnimeSharp —— ⚠ **在 Volume 里但没有任何 workflow 引用它**，属顺路件                                                                                                                    |

**现有 workflow 3 条**：SDXL txt2img · SDXL img2img（单参考，`denoise = 1 - strength`）· Anima DiT txt2img。

**范围边界**：⛔ **SD 1.5 不在 runner 范围**，保持 external 跳转 —— 它要第二套分辨率/采样模板档。
2026-09-28 重新评估后仍暂缓：近 30 / 90 天新发或更新的 LoRA 里只占 1.2%；恢复时从设计总图第 6 页「SD 1.5」导图接。
四家族同为 SDXL 架构、共用同一 workflow 模板，所以增量成本 ≈ 每家族一条
`runner-checkpoints.ts` manifest + Volume 里一个文件。

**Pony 推荐参数**：`score_9` 系质量词 + `clipSkip 2`（写进 manifest，不靠用户自己记）。

---

## 4. 限额

`RUNNER_MONTHLY_LIMIT`：**每人 100/月 + 全站 600/月，不设日限**（owner 2026-10-07，换 Modal 后由 300 放大）。
按 **GenerationJob 计数**（不是 ApiUsage，失败与在飞也算），派发前 `assertRunnerMonthlyLimitNotExceeded(userId)`
先查一遍，`createGenerationJob` 在全站锁里再判一次。`ADMIN_USER_IDS` 两道都不拦，但仍计入全站数。
同时在跑的上限沿用平台出资并发闸（每人 4 个 = 一批），不另设 Runner 专属并发。

定额依据（2026-10-07 Modal 账单）：L40S $0.000542/s，加冷启动与 60s 缩容尾巴，平均约 $0.03–0.05/张、
单独一张约 $0.09；全站 600 ≈ Starter 档每月 $30 免费额度。

---

## 5. 已知坑与未竟

- **r4a（multi-reference IPAdapter）已施工完成、测试端点验证绿，生产未切换**。
  fork 仓库 HEAD `c1dbf58`（2026-07-18）。要切生产得走 fork 构建 + template + 端点滚动。
- **Krea 2 已接（owner 2026-10-07，在 Modal 上）**：固定档 `krea2Turbo_fp8`（应用模型 `krea2-turbo-runner`，
  家族 `krea2`，Civitai baseModel 精确值 "Krea 2"；`Flux.1 Krea` 仍归 flux）。权重钉 HF `Comfy-Org/Krea-2`
  revision `eb1eddd3…`：`diffusion_models/krea2_turbo_fp8_scaled`（13.1G，SHA `eb4dd8c6…02f1`）→ `models/unet/`、
  `text_encoders/qwen3vl_4b_fp8_scaled`（5.2G，SHA `54bd5144…7094`）→ `models/clip/`；VAE `qwen_image_vae` 与 Anima
  **同一文件**（LFS oid 相同），卷上共用。工作流照 Comfy-Org `text_to_image_krea_2_turbo` 模板：CLIP type `krea2`、
  `EmptyLatentImage`、空负面清零、**不包 ModelSamplingAuraFlow**（profile `modelSamplingShift: null`）；euler · simple ·
  8 步 · CFG 1。方言来自 298 条真实配方（中位 130 词、标签墙 6%、CFG 1 占 82%、8 步占 53%）。LoRA 栈总权重护栏
  单独一档 4.0（真实配方中位 2.7，蒸馏档的 1.0 会让大多数标红）。回归：纯底模（首次下载 252s）+ 官方
  retroanime LoRA（32s）均出图且带加载证据。
  - ⚠ 许可证：Krea 2 Community License 只许年收入低于 100 万美元的主体免费商用，且要求「合理的内容过滤」。
    owner 2026-10-07 定**不加图片审核**，只有公开前的提示词检查（`lib/content-safety.ts`），这条风险由 owner 承担。
- 托管 LoRA 底模 2026-09-17 全部退役。它们挂社区 LoRA 报的 `layer ... not supported`（错误码
  `lora_incompatible_hosted`）只为历史记录的文案保留；为它而设的「能力路由」（托管 Illustrious 遇到
  白名单 LoRA 升到 Runner）与 LoRA 白名单 2026-09-28 删除——任意 LoRA 早已按需从 R2 下到卷上。
- **没缓存过的 LoRA 在出图请求里下进 R2**（`prepareRunnerLoras`，R2 `runner-loras/`）。2026-10-21
  两次 `/api/studio/generate` 内存不足被杀（新 LoCon 整个读进内存再上传，Vercel 函数 2 GB），留下两条
  RUNNING 任务等 sweeper 收。现在边下边传（8 MB 分片 × 4），超过 512 MB 当场掐断，SHA-256 对不上时
  分片上传取消、R2 不落对象；几把并行，每把 240 s 截止，入口路由 `maxDuration` 300。若 300 s 也不够，
  再把下载挪到 Cloudflare Worker。

---

## 6. 怎么核对本页是否过期

```bash
# Modal 入口存活（token 只在 Worker secret / Modal Secret 里，别贴进对话）
curl -s -H "Authorization: Bearer $RUNNER_MODAL_TOKEN" "$RUNNER_MODAL_URL/health"
# 部署状态、容器与日志
modal app list && modal app logs pixelvault-runner
```

- 秒失败先看平台总闸 `PLATFORM_GENERATION_ENABLED`，再看 Worker 是否缺 `RUNNER_MODAL_URL` / `RUNNER_MODAL_TOKEN`（会直接报 not configured）。
- ⛔ 别信 95% 这类进度数字，那是假进度。

## Last Verified

2026-09-01 · 事实来自 `runner-r4-krea2-multiref-2026-07`（2026-07-18 S3+REST 审计）与
`comfy-runner-HANDOFF-2026-07`（2026-07-11 交付）两份任务包，两份已按「完成即删」清除。
⚠ 值本身最后一次实测是 **2026-07-18**，距本次沉淀已 6 周，用前请按 §6 现查。
