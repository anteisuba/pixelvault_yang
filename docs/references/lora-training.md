# LoRA 训练 — 调研结论（草稿 2026-11-20，未提交，等 owner 点头）

> 定位：owner 2026-11-18 定「LoRA 训练先不做，以后搬本地或云端，先研究」；11-20 扩题为八问：
> ①自训方法论 ②放到 Modal 上训 ③PixAI 怎么训 ④NovelAI 怎么训 ⑤训完谁能用 ⑥训练方向 ⑦HF/GitHub 资料 ⑧相关论文。
> 本篇只沉淀结论与来源，不是施工单。给 owner 看的图版：[LoRA 训练调研 Artifact](https://claude.ai/artifact/2G7DyEuRhscghPnKiF25ms)。
> 上游：LoRA 产品约束见 `domains/lora.md`；推理通道（Modal 上的 ComfyUI Runner）见 `domains/runner.md`。

## Source of Truth

| 事实                                                | 位置                                                                                                                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 现有训练流程（fal / Replicate 托管，仅 FLUX.1 dev） | `src/features/lora/services/lora-training.service.ts`                                                                                                                        |
| 可选底模与上下限                                    | `src/constants/lora.ts` `LORA_TRAINING_BASE_MODELS`（SDXL / Illustrious 为 `available:false`）· `src/constants/config.ts` `LORA_TRAINING`（5–50 张、推荐 15–30、标价 $1.20） |
| 训练记录与资产                                      | `prisma/schema.prisma` `LoraTrainingJob`（`loraStorageKey` = R2 `lora-weights/<userId>/<jobId>.safetensors`）→ `LoraAsset`                                                   |
| 推理挂 LoRA 的入口                                  | `src/services/runner/civitai-lora-to-r2.service.ts` `ensureRunnerLoraInR2` / `prepareRunnerLoras`（R2 `runner-loras/` → 预签名 GET → Modal Runner）                          |
| Modal 应用                                          | `workers/runner-modal/app.py`（`pixelvault-runner`：`MainRunner` / `QwenRunner` / CPU `Tagger` / `api()`）                                                                   |

## Last Verified

- 2026-11-20 · 仓库现状对照代码核过；外部资料由 7 路子调研逐条附来源，查阅日期均为 2026-11-20（来源自身日期写在括号里，没有的写 date unknown）。没核实的标「未验证」，官方没公开的标「未公开」。不是法律意见。

---

## 0. 仓库现状里和训练有关的三件事（读代码得出）

1. **推理已经在 Modal 上**（2026-10-06 起，`domains/runner.md` §1），不是 RunPod。训练放 Modal 可以共用账号、Secret 习惯和 spawn/轮询模式；账单实测 L40S $0.000542/s。
2. **打标器已经在 Modal 上**：`Tagger` 类跑 `pixai-labs/pixai-tagger-v1.0`（CPU 8 核，一张约 5 秒，按类别回 Danbooru 标签）。SDXL 动漫训练集的自动打标可以直接复用。
3. **推理侧挂不上自训 LoRA**：`ensureRunnerLoraInR2` 只认 Civitai 与 Hugging Face 链接，其余抛 `INVALID_LORA_URL`。自训 LoRA 落在 R2 `lora-weights/…`，要进 Runner 必须加第三个分支「自家 R2 key → 直接预签名」。这是接入的唯一硬缺口，改动小。

另：现有托管训练只做 FLUX.1 dev，而 FLUX.1 dev 是非商用许可（§5），站点一旦收费就有问题。

---

## 1. 自训方法论

### 1.1 底模分两族，打标方式相反

|         | SDXL 动漫（Illustrious / NoobAI / Pony）                                                                                                 | FLUX.1 dev                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| caption | **Danbooru 标签**（底模本身就是 Danbooru 词表训的；NoobAI 数据截至 2024-10-23，[卡](https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0)） | **自然语言**，BFL 要求「descriptive, detailed captions」（[BFL 训练文档](https://docs.bfl.ai/flux_2/flux2_klein_training)，date unknown） |
| 打标器  | wd-eva02-large-tagger-v3（Apache-2.0）· pixai-tagger（我们已部署）· Camie                                                                | JoyCaption（[repo](https://github.com/fpgaminer/joycaption)，Descriptive 模式）                                                           |
| 触发词  | 放 caption 开头；`keep_tokens=1`                                                                                                         | 放开头；ai-toolkit 用 `[trigger]` 占位                                                                                                    |

通用规则（两族一致，多源）：**caption 里没写的特征会被触发词吸收**。所以角色固有特征（发色、瞳色）删掉，会变的属性（服装、背景、姿势）保留，否则会和触发词绑死（[rentry 数据集指南](https://rentry.co/lora-dataset-creation)；社区多篇，部分未验证）。

### 1.2 数据集

- 张数：角色 15–30（有指南给到 35–150）、画风 17–40、复杂概念 30–150；物体 DreamBooth 原版 3–5 张。数字各家差很大，只当起点（未验证单一权威）。
- 清洗：去近重复、去水印边框、角度/背景/服装分布均衡；ai-toolkit 自动按宽高比分桶只缩不放，不用手裁（[README](https://github.com/ostris/ai-toolkit)）；general 标签少于 10 个的图过滤（[pixai-tagger-v0.9 卡](https://huggingface.co/pixai-labs/pixai-tagger-v0.9)）。
- 步数 = 图数 × repeats × epochs ÷ batch；最优存档常常不是最后一个。

### 1.3 推荐默认配方

**SDXL 动漫角色（kohya sd-scripts）**

1. 15–30 张，Danbooru 标签，删固有特征，触发词开头。
2. LoRA dim 16–32、alpha = dim/2；AdamW8bit，U-Net 1e-4，TE 1e-5～5e-5 或只训 U-Net（[sdxl_train_network.md](https://github.com/kohya-ss/sd-scripts/blob/main/docs/sdxl_train_network.md)）。
3. 1024 分桶、bf16、梯度检查点、cache latents、`keep_tokens=1`。
4. 用 Prodigy 时 lr=1、`safeguard_warmup`、`use_bias_correction`、wd 0.01（[prodigy](https://github.com/konstmish/prodigy)）。
5. **v-pred 底模（NoobAI-Vpred）必加 `--v_parameterization`**，`zero_terminal_snr` 社区有分歧，两种都试。sd-scripts 代码已支持 SDXL v-pred，但文档还写着「for SD1.x/2.x」（子调研直接读代码，2026-11-20）。Civitai 站内训练器不支持 v-pred（未验证）。

**FLUX.1 dev 角色（ostris ai-toolkit）**

1. 15–30 张高清图，JoyCaption 写自然语言，描述要学的东西以外的一切。
2. 默认 rank 16 / alpha 16、adamw8bit、lr 1e-4、batch 1、512/768/1024 分桶、2000 步（建议 500–4000），caption dropout 0.05（[train_lora_flux_24gb.yaml](https://raw.githubusercontent.com/ostris/ai-toolkit/main/config/examples/train_lora_flux_24gb.yaml)）。
3. 24GB 上 quantize + 梯度检查点；QLoRA 约 9GB（[HF flux-qlora](https://huggingface.co/blog/flux-qlora)，2025-06-19）。
4. 不训 T5；每 250 步存档出样张。
5. 用 sd-scripts 时：`guidance_scale 1.0`、`model_prediction_type raw`、`timestep_sampling shift` + `discrete_flow_shift 3.1582`（[flux_train_network.md](https://github.com/kohya-ss/sd-scripts/blob/main/docs/flux_train_network.md)）。

### 1.4 怎么判断一个 LoRA 好不好

- 过拟合信号：不同 seed 姿势构图复读；背景/服装被绑在触发词上改不动；配色锁死；画风渗进不相关画面；水印边框被复现；细节烧焦，后期存档低权重下仍如此（[LocalForge](https://offlinecreator.com/guide/lora-overfitting-explained)，©2026）。
- 测试网格：固定 seed + 不挂 LoRA 的基线；5 类提示（接近训练 caption / 新环境 / 换服装 / 不带触发词 / 难角度）× 权重 0.6–1.0 × 早中晚三个存档。**在推理端测**，训练器样张和 ComfyUI 出图不一定一致。
- 可组合性：与另一个常用 LoRA 叠挂、换同族另一个 checkpoint 各测一次。
- 自动指标（小众）：SimpleTuner 的 CLIP score；DreamBench++（多模态模型当评委，[arXiv 2406.16855](https://arxiv.org/abs/2406.16855)）。

### 1.5 训练器对比（GitHub API，2026-11-20）

| 训练器                                                                                   | 底模                                                       | 配置           | 进容器              | 许可         | 最近版本                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- | ------------------- | ------------ | --------------------------- |
| [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts)                            | SDXL（含 v-pred）、FLUX.1、SD3、Lumina、Anima              | CLI + TOML     | 最适合              | Apache-2.0   | v0.12.3（2026-10-26）       |
| [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit)                                | FLUX.1/.2、Qwen-Image、Z-Image、Chroma、SDXL               | YAML + Web UI  | 自带 `run_modal.py` | MIT          | 无 release，push 2026-11-18 |
| [diffusers 示例](https://github.com/huggingface/diffusers/tree/main/examples/dreambooth) | FLUX、SDXL                                                 | CLI 参数       | 可以                | Apache-2.0   | v0.43.0（2026-11-12）       |
| [OneTrainer](https://github.com/Nerogar/OneTrainer)                                      | SDXL、FLUX、Qwen、Z-Image                                  | GUI + 无头脚本 | 可以                | **AGPL-3.0** | push 2026-11-19             |
| [SimpleTuner](https://github.com/bghira/SimpleTuner)                                     | 40+ 家族                                                   | config + CLI   | Docker              | **AGPL-3.0** | v4.12.1（2026-11-17）       |
| [musubi-tuner](https://github.com/kohya-ss/musubi-tuner)                                 | 新一代 DiT（FLUX.2、Qwen、Z-Image、视频），不含 FLUX.1 dev | CLI + TOML     | 可以                | Apache-2.0   | v0.3.6（2026-09-27）        |

结论：**SDXL 动漫用 sd-scripts，FLUX 用 ai-toolkit**。AGPL 的两个放进服务端前要评估许可义务（判断，非来源结论）。

### 1.6 2026 年新底模

FLUX.2 klein 4B Base（Apache-2.0，12GB 可训）/ 9B（非商用）官方可训 LoRA（[BFL](https://docs.bfl.ai/flux_2/flux2_klein_training)；[HF 博客](https://huggingface.co/blog/black-forest-labs/flux-2-klein-lora)，2026-06-04）。Qwen-Image、Z-Image、Chroma 主流训练器都支持，Civitai 训练 API 已提供（[Civitai](https://developer.civitai.com/orchestration/recipes/training-other-image)）。Z-Image Turbo 是蒸馏模型，要训 Base。

---

## 2. 放到 Modal 上训

### 2.1 价格（[modal.com/pricing](https://modal.com/pricing)）

| GPU       | $/s          | $/h                              |
| --------- | ------------ | -------------------------------- |
| L4        | 0.000222     | 0.80                             |
| **L40S**  | **0.000542** | **1.95**（与我们 10 月账单一致） |
| A100-40GB | 0.000583     | 2.10                             |
| A100-80GB | 0.000694     | 2.50                             |
| H100      | 0.001097     | 3.95                             |
| H200      | 0.001261     | 4.54                             |

CPU $0.0000131/核·s，内存 $0.00000222/GiB·s；Starter 每月送 $30。指定 region 1.15–1.75×，non-preemptible 3×。`gpu="H100"` 可能被免费升到 H200（[GPU 文档](https://modal.com/docs/guide/gpu)）。

### 2.2 搭法（全部 2026-11-20 读 Modal 文档）

- **函数**：`@app.function(gpu=["L40S","A100-80GB"], timeout=…)`，单次最长 **24h**（[timeouts](https://modal.com/docs/guide/timeouts)）；`modal.Retries` 最多 10 次；长训练范式 = checkpoint 存 Volume + 重试 + 启动时续训（modal-examples `06_gpu_and_ml/long-training.py`）。
- **触发与轮询**：`.spawn()` → `FunctionCall.from_id(id).get(timeout=0)`，结果保留 7 天（[job-queue](https://modal.com/docs/guide/job-queue)）。与现有 Runner 的 `/run`、`/status` 完全同一套，可以在 `api()` 上加 `/train`。
- **底模权重**：放 Volume（与 `pixelvault-runner-models` 同理），镜像只装训练器。新建 Volume 用 `version=2`。
- **训练集直接挂 R2**：`CloudBucketMount` 官方支持 Cloudflare R2（`bucket_endpoint_url` + 含 AWS key 的 Secret，[文档](https://modal.com/docs/guide/cloud-bucket-mounts)）。只读挂训练集；它不支持 append / seek 写 / rename，所以 checkpoint 写本地或 Volume，最后整文件写回 R2。
- **官方示例已下线**：`diffusers_lora_finetune.py`（FLUX LoRA）2026-10-27 从 modal-examples 删除（commit `929e44f3`），旧版可从删除前的 commit 取（两路子调研分别给了 `d5ccd986` 和 `2c846d0914`，未逐一核对）。现存可用入口是 ai-toolkit 自带的 [`run_modal.py`](https://github.com/ostris/ai-toolkit/blob/main/run_modal.py)（2026-07-27）。没有 kohya on Modal 的有分量示例。

### 2.3 单次成本估算

公式：`(GPU $/s + CPU/内存约 $0.000124/s) × (步数 × s/步 + 冷启动与缓存约 7–8 分钟)`。

| 任务                        | GPU       | 总耗时   | 估算成本       |
| --------------------------- | --------- | -------- | -------------- |
| SDXL 30 图 · 2000 步 · 1024 | L40S      | 24–34 分 | **$0.96–1.36** |
| 同上                        | A100-80GB | 19–27 分 | $0.92–1.32     |
| 同上                        | H100      | 15–20 分 | $1.12–1.49     |
| FLUX 20 图 · 1000 步        | H100      | 25–28 分 | **$1.81–2.05** |
| FLUX 20 图 · 2000 步        | H100      | 41–48 分 | $3.03–3.52     |

⚠ s/步 是按公开数据点推的（Civitai SDXL 0.3–0.5 s/步、[Paperspace](https://blog.paperspace.com/fine-tune-flux-schnell-dev/) FLUX H100 约 1.08 s/步、[Replicate](https://replicate.com/blog/fine-tune-flux) FLUX 1000 步 20–30 分），**L40S/A100 上 kohya SDXL 无公开实测，未验证**。定价前必须自己跑一次基准。

### 2.4 与托管方案对比

| 方案                                             | SDXL/Illustrious         | FLUX | 超参 | 一次典型 LoRA                                              | 备注                                     |
| ------------------------------------------------ | ------------------------ | ---- | ---- | ---------------------------------------------------------- | ---------------------------------------- |
| **Modal 自建**                                   | ✅ 任意底模              | ✅   | 全控 | SDXL ≈ $1；FLUX ≈ $2                                       | 要自己封装训练器；数据不出我们的 R2      |
| fal `flux-lora-fast-training`（现用）            | ❌                       | ✅   | 少   | $2 / 1000 步                                               | **fal 没有 SDXL trainer**                |
| Replicate `ostris/flux-dev-lora-trainer`（现用） | ❌                       | ✅   | 中   | $1.85–2.75（H100 $0.001525/s）                             |                                          |
| Civitai 训练 API                                 | ✅（Illustrious 未验证） | ✅   | 中   | SDXL 约 500 Buzz、FLUX 约 2000 Buzz（1000 Buzz≈$1 未验证） | 后端 ai-toolkit；v-pred 不支持（未验证） |
| RunPod（对照）                                   | ✅                       | ✅   | 全控 | Serverless 48GB $1.89/h、H100 $5.89/h                      | 我们 10 月已迁出                         |

结论：**现有托管方案没有一家能训 SDXL 动漫**，而这正是 LoRA 库的主力（Civitai Illustrious 桶最大，`src/constants/lora.ts` 注释）。Modal 自建是唯一同时覆盖两族、且和推理同平台的选择。

### 2.5 接进本产品的数据流

```
浏览器 ──直传──▶ R2 lora-training/<user>/…（已有：presign + complete 校验）
   │
   ▼ POST /api/lora-training（已有：建 LoraTrainingJob）
Next 服务 ──(1) 打标──▶ Modal Tagger（已有，CPU）→ 标签写回 job / 让用户改
   │
   └─(2) 提交──▶ Cloudflare Execution Worker ──▶ Modal api() POST /train（新）
                                                   │ spawn TrainLora(gpu=L40S/H100)
                                                   │ 挂 R2 训练集（CloudBucketMount 只读）
                                                   │ 底模从 Volume 读
                                                   ▼
                                     kohya / ai-toolkit 训练，存档写 Volume
                                                   │ 完成后整文件上传
                                                   ▼
                          R2 lora-weights/<user>/<job>.safetensors（已有路径）
   ◀── GET /status/{call_id} 轮询（同 Runner）── job.status=COMPLETED → LoraAsset（已有）
   │
   ▼ 出图时选这个 LoraAsset
prepareRunnerLoras → ensureRunnerLoraInR2 ⚠ 需新增「自家 R2 key」分支 → 预签名 GET
   ▼
Modal MainRunner（已有）下到 models/loras/ 挂上 → 出图
```

新增件只有：Modal 上一个训练函数 + `/train` 路由、Worker 一条转发、`ensureRunnerLoraInR2` 一个分支、`LORA_TRAINING_BASE_MODELS` 翻开 SDXL/Illustrious。其余（直传、job 表、R2 路径、LoraAsset、Runner 挂载）都已存在。

---

## 3. PixAI 怎么训（两层分开）

### 3.1 平台底模（PixAI 自己的大规模训练）

| 模型                      | 架构                                                                                                                                                                              | 公开了什么                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Haruka v2、Hoshino v1/v2  | SDXL（[docs](https://docs.pixai.art/docs/models/other-models)，2026-10-17）                                                                                                       | 从哪个 SDXL 系 checkpoint 起步：**未公开** |
| Tsubaki（DiT.1）          | 自称从零训的 DiT（[模型页](https://pixai.art/en/model/1884107375027888751)，2025-06-24）                                                                                          | 参数、数据：未公开                         |
| Tsubaki.2（DiT.2）        | DiT，2026-03 发布（[新闻](https://pixai.art/en/news/1986490644850049152)）                                                                                                        | 架构细节、数据：未公开                     |
| **Tsubaki.3**（现任旗舰） | DiT，2026-09-16 发布，图/漫画/视频一体，通稿称「不是对公开模型的微调，从零自研」（[PR Times 转载](https://www.inside-games.jp/release/prtimes/20260924/308636.html)，2026-09-24） | 见下                                       |

Tsubaki.3 [技术报告](https://pixai.art/ja/tsubaki-3/report)（2026-08）公开的部分：

- 数据：从开源数据集收约 5 亿图文对，过滤、去重、重打标、概念均衡后剩约 5000 万。
- 打标：**Qwen3.5-27B + 自家 Tagger 1.0** 重打标，每张图同时有 tag 列表和短/中/长三档自然语言描述。
- 流程：预训练 768→1024→1536 → 动漫概念 mid-training → 文生图线（SFT 7k 张 → 两段 RL → 蒸馏）与参考图线分叉。
- 架构（DiT/MMDiT）、参数量、文本编码器、VAE、权重：**未公开**。

打标器是唯一开放的权重：[pixai-tagger-v1.0](https://huggingface.co/pixai-labs/pixai-tagger-v1.0)（Apache-2.0，SAM3 backbone 约 486M，30,877 个标签，知识截止 2026-05，训练数据未公开）。我们 Modal 上跑的就是它。

### 3.2 给用户的 LoRA 训练（[Advanced LoRA Training](https://docs.pixai.art/docs/lora/lora-training-advanced)，2026-11-03）

- 10–100 张；分类 Character / Outfit / Art style / 其他。
- **自动打标出自然语言描述，不是 Danbooru 标签**，可逐条改；触发词自动前置，≤256 字符。
- 底模**只能选 Tsubaki.2 / Tsubaki.3**；只有标准 LoRA，没有 LyCORIS。
- 暴露参数：Steps 默认 325（50–800）· LR 6e-4（5e-5～1e-3）· Rank 64（8/16/32/64）· Alpha = rank × 0.5/1/2 · Batch 1/2/4。没有 epoch、repeats、optimizer、scheduler。
- 价格：描述费 100×图数+500 credits；训练默认约 70,000 credits（只有 Steps/Batch 影响价），失败不收训练费。⚠ 计费页（2026-09-16）写的是 DiT.2 = 200,000 / SDXL = 75,000，两处冲突，哪个是现价**未验证**。credits 对美元官方价**未公开**；按 Starter $9.99 = 300k credits 粗算 70k ≈ $2.3（推算，未验证）。会员 Starter/Plus/Premium 每月含 3/5/10 次免费训练（[membership](https://docs.pixai.art/docs/pricing/membership)）。
- 时长：约 2–6 小时（不含排队）。
- **不能下载或导出**，只能在 PixAI 上用；私有需会员；公开后不可改回私有；开了收益分成就不能删。

对我们的启发：PixAI 把参数收得很窄（一个 LR、四档 rank、步数滑杆），默认值偏「高 LR + 少步数 + 大 rank」；打标改成自然语言是因为底模换成了 DiT。

---

## 4. NovelAI 怎么训（两层分开）

### 4.1 平台底模

| 版本   | 时间                        | 底座                                                                        | 公开的训练细节                                                                                                                                                                                                                                                                                                                                 |
| ------ | --------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1     | 2022-10                     | SD 1.4 微调                                                                 | 博客（[gwern 存档](https://gwern.net/doc/www/blog.novelai.net/9834857b30b5dac8059511f754c57f76632c51d1.html)，2022-10-10）：CLIP 倒数第二层、**长宽比分桶**（现在所有训练器都在用）、225 token、自家 hypernetwork（内部技术）                                                                                                                  |
| **V3** | 2023-11                     | **SDXL**                                                                    | 技术报告 [arXiv 2409.15997](https://arxiv.org/abs/2409.15997)（2024-09）：ε→**v-prediction**；**zero terminal SNR**；σmax 14.6→29 消除高分辨率多躯体；MinSNR（γ 未写）；按 tag 频率给 loss 加权；VAE 解码器针对动漫微调；约 **600 万张**「crowd-sourced platforms」带详细 tag；**256×H100、约 75k H100 小时**。batch、lr、优化器、步数：未公开 |
| V4     | 2024-12 预览 / 2025-03 Full | **从零训练，不基于 SD**（[docs](https://docs.novelai.net/en/image/models)） | T5 文本编码器、512 token、多角色 + 5×5 位置控制、英文文字渲染；约 23 万 H100 小时（[窗の杜](https://forest.watch.impress.co.jp/docs/news/1668324.html) 转述官方，2025-03-10）。网络结构、参数量、数据规模：未公开                                                                                                                              |
| V4.5   | 2025-05（日期未验证）       | 在 V4 上改进                                                                | 16 通道 VAE（V5 公告提及）；是不是 Flux VAE：未验证                                                                                                                                                                                                                                                                                            |
| V5     | 2026-08-21                  | 自研架构，规模为 V4.5 的 2 倍多（另一处写 2.5 倍，官方不一致）              | 自训 32 通道 VAE；**268,000 B200 GPU 小时**；日文文字；tag 与自然语言都支持；最多 22 个角色（[journal](https://journal.novelai.net/image-generation-novelai-diffusion-v5-is-here-c2df7c6b8d2d/)）                                                                                                                                              |

数据与标签体系：2022-10 官方推特承认训练数据来自 Danbooru，Danbooru 随后声明无关（[ITmedia](https://www.itmedia.co.jp/news/article/2210/05/1221005133/)）；V3 报告只写「crowd-sourced platforms」，现行 docs 不提。标签体系 = 质量（masterpiece / best quality…）、审美（very aesthetic）、评级（rating:general）、年份、dataset tag 放最前（[qualitytags](https://docs.novelai.net/en/image/qualitytags)）。艺术家标签怎么处理：未公开。

### 4.2 用户层

- **没有用户自训图像 LoRA 的功能**（docs 图像导航里没有任何训练入口；这是「文档里没有」，不是官方声明「不支持」）。
- 文本侧的 Custom AI Modules 已弃用：「Training of new custom Modules is no longer supported」（[docs](https://docs.novelai.net/en/text/modules)）。
- 用户能用的定制全是**推理时参考，不训练**：Vibe Transfer（最多叠 16 个，V4+ 编码 2 Anlas，[docs](https://docs.novelai.net/en/image/vibetransfer)）、Precise Reference（V4.5，+5 Anlas，[docs](https://docs.novelai.net/en/image/precisereference)）、Director Tools（编辑工具）。

对我们的启发：V3 那套（v-pred + ZTSNR + 高 σmax）就是 NoobAI-Vpred 的训练要点来源，我们 Runner 已按 v-pred 插 `ModelSamplingDiscrete`（`domains/runner.md`），训练侧要对齐同一套参数。NAI 证明「参考图零训练」可以替代很多用户 LoRA 需求。

---

## 5. 训完谁能用

### 5.1 底模许可对 LoRA 的约束（不是法律意见）

| 底模                                                                                                                     | LoRA 算衍生品？                                                                                  | 收费站点能训/推理吗                                                                                                                                                                                                                                              | 分享给别人                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **FLUX.1 dev**（[BFL Non-Commercial License](https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/LICENSE.md)） | 算（Sec.1(a) 含 fine-tuned version）                                                             | ⛔ 「产生收入」和「与终端用户直接交互」都被排除在非商用之外，**收积分就需要 BFL 商业许可**，FLUX.1 dev 的商业价**未公开**（[BFL 帮助页](https://help.bfl.ai/articles/9272590838-self-serve-dev-license-overview-pricing) 自助档只覆盖 FLUX.2 klein）。输出可商用 | 免费站点可以；要附 Attribution，要做内容过滤                                 |
| **SDXL 1.0**（[Open RAIL++-M](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md)）    | 算                                                                                               | ✅                                                                                                                                                                                                                                                               | ✅ 但必须把 Attachment A 使用限制写进下游协议                                |
| Illustrious v0.1（[卡](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0)）                         | FAIPL-1.0-SD                                                                                     | 禁止靠闭源衍生变现；衍生品要开源                                                                                                                                                                                                                                 | 他人在线使用时大概率要提供权重下载                                           |
| Illustrious v1.0 / v2.0                                                                                                  | v1.0 `sdxl-license`（正文未取到，未验证）/ v2.0 `creativeml-openrail-m`                          | v2.0 ✅                                                                                                                                                                                                                                                          | v2.0 ✅（RAIL 约束下传）                                                     |
| NoobAI-XL（[卡](https://huggingface.co/Laxhar/noobai-XL-1.1)）                                                           | [FAIPL-1.0-SD](https://freedevproject.org/faipl-1.0-sd/)：修改须同许可，网络提供要给源码（模型） | 可以，但要开放                                                                                                                                                                                                                                                   | ⚠ 必须能下载权重；「禁下载」与 FAIPL 冲突。LoRA 是否算「修改」属解读，未验证 |
| Pony V6 及衍生                                                                                                           | 修改版 FAIPL                                                                                     | ⛔ 任何有变现的网站都不能推理（仅 Civitai/HF 豁免）                                                                                                                                                                                                              | ⛔                                                                           |
| Qwen-Image / Z-Image                                                                                                     | Apache-2.0                                                                                       | ✅                                                                                                                                                                                                                                                               | ✅（Qwen-Image **2.1** 是另一份研究许可，见 `domains/runner.md`）            |

### 5.2 训练数据与地区

- **日本**：文化审议会「AIと著作権に関する考え方について」（[2024-03-15](https://www.bunka.go.jp/seisaku/chosakuken/aiandcopyright.html)，无法律约束力）——带「享受目的」或「不当损害权利人利益」时不适用第 30 条之 4；针对特定创作者的学习可能不适用（二手摘要，未验证）。所以**单个画师的画风 LoRA 在日本不当然受保护**。肖像有 publicity 权（最高裁 2012-02-02 ピンク・レディー事件）。
- **中国**：《生成式人工智能服务管理暂行办法》（[2023-08-15 施行](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)）第 7 条要求合法来源数据、不得侵害知识产权；第 4 条不得侵害肖像权；面向境内公众时平台属于「提供者」（第 22 条）。
- **欧盟 AI Act**：下游修改算力超过原模型 1/3 才推定为 GPAI provider（[委员会指南解读](https://cms.law/en/swe/legal-updates/general-purpose-ai-models-obligations-and-roles-for-providers-and-downstream-modifiers-under-the-eu-ai-act)，2025-07-18），LoRA 远低于此（推断）。

### 5.3 平台怎么做

- **Civitai**：上传者勾选权限（免署名 / 允许 merge / 卖图 / 站内生成 / 站外生成 / 卖模型），只有 SD1.5、SDXL（RAIL 系）会生成有约束力的 Addendum，其他底模的勾选只是意向（[licensing guide](https://education.civitai.com/guide-to-licensing-options-on-civitai/)，2026-10-26）。站内训练要求确认拥有图片权利，产物可下载，数据保留 30 天。2025-05 起禁真人肖像（[404 Media](https://404media.co/civitai-ban-of-real-people-content-deals-major-blow-to-the-nonconsensual-ai-porn-ecosystem)）。
- **PixAI**：ToS §5.8 不主张用户内容所有权，§5.6/5.7 上传即授予托管/生成许可（[terms](https://pixai.art/terms)，2023-08-25）；Tsubaki LoRA 不能导出，公开后不能撤回。
- **Tensor.art**：ToS 打不开；官方文章称创作者激励按运行次数付费、排除私有模型（[文章](https://tensor.art/articles/963636376601904080)）。所有权条款未验证。

### 5.4 给本产品的三个归属模型

|                       | 谁能用                                                      | 被哪些底模挡                                             |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| **A 默认私有**        | 只有训练者本人出图和下载                                    | 收费时挡 FLUX.1 dev、Pony；FAIPL 底模本人可下载即合规    |
| **B 私有 + 链接分享** | 被分享者也能出图；LoRA 带底模许可元数据，下载开关受底模约束 | 再加：FAIPL 底模分享后要给下载；RAIL 系要传 Attachment A |
| **C 公开上架**        | 公开列出，Civitai 式权限勾选                                | Pony ⛔；FLUX.1 dev 勾选不能覆盖 BFL 许可                |

所有模型都需要：上传时确认拥有图片权利；禁真人肖像 LoRA；对单画师画风 LoRA 给风险提示。

---

## 6. 训练方向

### 6.1 LoRA 种类

| 类型           | 张数                                                                                                 | caption 要点                    | 常见失败                             |
| -------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| 角色           | 15–30（指南也有 35–150）                                                                             | 删固有特征，留会变的            | 复读训练图；漏写的元素（纹身）冒出来 |
| 画风           | 17–40                                                                                                | 内容照写，画风不写              | 画风串进内容；被锁在训练题材         |
| 概念/姿势/动作 | 30–150，一半核心一半变化                                                                             | 动作给触发词，人物服装背景照写  | 背景或画风一起学进去                 |
| 服装           | 未找到权威数字                                                                                       | 零件写进 tag 就不会变成默认外观 | 和脸绑死                             |
| 背景/场景      | Civitai 例 17 张                                                                                     | 变化宽高比和构图                | 人物被学进去                         |
| **滑杆**       | 文本 slider 不要图；图像 slider 4–6 对前后图（[sliders](https://github.com/rohitgandikota/sliders)） | 不用 caption                    | 属性纠缠；FLUX 版标 experimental     |
| 物体           | 3–5（DreamBooth）                                                                                    | 稀有 token + 类名               | 类别先验被覆盖                       |

### 6.2 适配路线

| 路线                                                                        | 体积                | 适合本产品？                                                          |
| --------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| **LoRA**                                                                    | 几十 MB             | **是，默认**                                                          |
| LoCon / LoHa / LoKr（[LyCORIS](https://github.com/KohakuBlueleaf/LyCORIS)） | LoKr 可到 1–3M 参数 | 可能：LoHa 做画风、LoKr 省空间；FLUX 没卷积层，LoCon 收益有限（推断） |
| DoRA                                                                        | ≈ LoRA              | 可能；推理侧兼容未验证                                                |
| OFT/BOFT                                                                    | 小                  | 否：kohya 不支持 FLUX                                                 |
| DreamBooth 全量 / checkpoint 微调                                           | GB 级               | 否：每用户 GB 级存储和算力                                            |
| Textual Inversion                                                           | KB 级               | 可能，和 LoRA 组合成 pivotal tuning                                   |
| B-LoRA（单图分离风格/内容，仅 SDXL）                                        | 小                  | 可能                                                                  |
| ZipLoRA / K-LoRA（合并角色×画风，K-LoRA 免训练）                            | —                   | 可能，做「角色 × 画风」组合                                           |
| **IP-Adapter / FLUX Kontext / 参考图零训练**                                | 不产生文件          | **是，做「先试后训」入门档**（NAI 就只给这一档）                      |

---

## 7. HF / GitHub 资料清单（2026-11-20 核对；日期=最后 push 或 HF lastModified）

**最该先看的 5 条**：ai-toolkit `run_modal.py` · kohya sd-scripts · 已删 Modal 示例旧版 + diffusers `train_dreambooth_lora_flux.py` · wd-eva02-large-tagger-v3 与 JoyCaption · NoobAI-Vpred 与 Illustrious v0 模型卡。

| 类别    | 名称                                                                                                                                                          | 干什么                             | 更新              | 许可                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------- | ------------------------------------------------------ |
| 训练器  | [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts)                                                                                                 | SDXL（含 v-pred）/FLUX CLI         | 2026-11-19        | Apache-2.0                                             |
| 训练器  | [bmaltais/kohya_ss](https://github.com/bmaltais/kohya_ss)                                                                                                     | sd-scripts GUI                     | 2026-08-01        | Apache-2.0                                             |
| 训练器  | [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit)                                                                                                     | FLUX 主力，含 Modal 入口           | 2026-11-18        | MIT                                                    |
| 训练器  | [Nerogar/OneTrainer](https://github.com/Nerogar/OneTrainer)                                                                                                   | GUI，低显存                        | 2026-11-19        | AGPL-3.0                                               |
| 训练器  | [bghira/SimpleTuner](https://github.com/bghira/SimpleTuner)                                                                                                   | 多架构                             | 2026-11-19        | AGPL-3.0                                               |
| 训练器  | [kohya-ss/musubi-tuner](https://github.com/kohya-ss/musubi-tuner)                                                                                             | 新 DiT 与视频                      | 2026-10-31        | Apache-2.0（部分沿用上游）                             |
| 训练器  | [diffusers dreambooth 示例](https://github.com/huggingface/diffusers/tree/main/examples/dreambooth)                                                           | SDXL/FLUX LoRA 官方脚本            | 2026-11-13        | Apache-2.0                                             |
| 训练器  | [diffusers advanced_diffusion_training](https://github.com/huggingface/diffusers/tree/main/examples/advanced_diffusion_training)                              | pivotal tuning、Prodigy            | 2026-11-13        | Apache-2.0                                             |
| 训练器  | [KohakuBlueleaf/LyCORIS](https://github.com/KohakuBlueleaf/LyCORIS)                                                                                           | LoCon/LoHa/LoKr                    | 2026-10-19        | Apache-2.0                                             |
| 训练器  | [Akegarasu/lora-scripts](https://github.com/Akegarasu/lora-scripts)                                                                                           | 秋叶中文 GUI                       | 2026-11-03        | AGPL-3.0                                               |
| 训练器  | [cocktailpeanut/fluxgym](https://github.com/cocktailpeanut/fluxgym)                                                                                           | 低显存 FLUX GUI                    | 2026-07-28        | MIT                                                    |
| 训练器  | [kijai/ComfyUI-FluxTrainer](https://github.com/kijai/ComfyUI-FluxTrainer)                                                                                     | ComfyUI 训练节点（停更约 19 个月） | 2025-04-02        | Apache-2.0                                             |
| Modal   | [ai-toolkit run_modal.py](https://github.com/ostris/ai-toolkit/blob/main/run_modal.py)                                                                        | 唯一维护中的 Modal 训练入口        | 2026-07-27        | MIT                                                    |
| Modal   | [modal-examples](https://github.com/modal-labs/modal-examples)                                                                                                | `long-training.py` 续训范式        | 2026-11-18        | MIT                                                    |
| 打标    | [corkborg/wd14-tagger-standalone](https://github.com/corkborg/wd14-tagger-standalone)                                                                         | WD 打标 CLI                        | 2026-11-16        | 未声明                                                 |
| 打标    | [fpgaminer/joycaption](https://github.com/fpgaminer/joycaption)                                                                                               | 自然语言 caption                   | 2026-02-24        | Apache-2.0                                             |
| 打标    | [jhc13/taggui](https://github.com/jhc13/taggui)                                                                                                               | 桌面打标                           | 2025-10-11        | GPL-3.0                                                |
| 数据集  | [starik222/BooruDatasetTagManager](https://github.com/starik222/BooruDatasetTagManager)                                                                       | 批量改标签                         | 2026-02-25        | MIT                                                    |
| 数据集  | [Particle1904/DatasetHelpers](https://github.com/Particle1904/DatasetHelpers)                                                                                 | 筛选/缩放/打标                     | 2026-11-01        | MIT                                                    |
| 数据集  | [deepghs/waifuc](https://github.com/deepghs/waifuc) · [imgutils](https://github.com/deepghs/imgutils)                                                         | 动漫数据清洗、裁人物、相似度       | 2024-08 / 2025-10 | MIT                                                    |
| 数据集  | [idealo/imagededup](https://github.com/idealo/imagededup)                                                                                                     | 图片去重                           | 2025-08-15        | Apache-2.0                                             |
| HF 底模 | [FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev)                                                                                             |                                    | 2026-11-19        | FLUX.1-dev 非商用                                      |
| HF 底模 | [SDXL base 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)                                                                              |                                    | 2023-10-30        | openrail++                                             |
| HF 底模 | [Illustrious v0](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0) · [v2.0](https://huggingface.co/OnomaAIResearch/Illustrious-XL-v2.0) | 社区最常用训练底座 / 最新版        | 2025-02 / 2025-04 | FAIPL / RAIL-M                                         |
| HF 底模 | [noobai-XL-1.1](https://huggingface.co/Laxhar/noobai-XL-1.1) · [Vpred-1.0](https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0)                                 | eps / v-pred                       | 2025-09 / 2025-11 | FAIPL-1.0-SD                                           |
| HF 打标 | [wd-eva02-large-tagger-v3](https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3)                                                                       | Danbooru 标签                      | 2024-07-28        | Apache-2.0                                             |
| HF 打标 | [pixai-tagger-v1.0](https://huggingface.co/pixai-labs/pixai-tagger-v1.0)                                                                                      | 我们已部署                         | 2026-09-22        | Apache-2.0                                             |
| HF 打标 | [camie-tagger-v2](https://huggingface.co/Camais03/camie-tagger-v2)                                                                                            | 覆盖广                             | 2026-01-01        | GPL-3.0                                                |
| HF 打标 | [llama-joycaption-beta-one](https://huggingface.co/fancyfeast/llama-joycaption-beta-one-hf-llava)                                                             | FLUX caption                       | 2025-05-16        | 未声明（可能受 Llama 许可，未验证）                    |
| 数据集  | [diffusers/dog-example](https://huggingface.co/datasets/diffusers/dog-example)                                                                                | DreamBooth 5 张示例                | 2023-04-18        | 未声明                                                 |
| 数据集  | [nyanko7/danbooru2023](https://huggingface.co/datasets/nyanko7/danbooru2023) · [deepghs/danbooru2024](https://huggingface.co/datasets/deepghs/danbooru2024)   | Danbooru 全量                      | 2024              | ⚠ 标签写 MIT/other，**图片版权归原作者**，不代表可商用 |
| 教程    | [diffusers LoRA 训练](https://huggingface.co/docs/diffusers/training/lora) · [SDXL 训练](https://huggingface.co/docs/diffusers/training/sdxl)                 | 官方                               | 2026-08 / 2026-10 |                                                        |
| 教程    | [HF: LoRA training scripts of the world, unite!](https://huggingface.co/blog/sdxl_lora_advanced_script)                                                       | SDXL 进阶（pivotal、Prodigy）      | 2024-01-02        |                                                        |
| 教程    | [HF: flux-qlora](https://huggingface.co/blog/flux-qlora)                                                                                                      | 消费卡训 FLUX                      | 2025-06-19        |                                                        |
| 教程    | [Civitai Illustrious LoRA Guide](https://civitai.com/models/850658)                                                                                           | 带 kohya 配置                      | 2024-10-13        |                                                        |

---

## 8. 相关论文（arXiv 编号经子调研逐个打开核实）

| 论文                                                                                                                                                                                                                         | 解决什么                                                              | 对应                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------- |
| LoRA，Hu et al. 2021 · [2106.09685](https://arxiv.org/abs/2106.09685)                                                                                                                                                        | 冻结原权重只训低秩增量                                                | ①⑥                         |
| DreamBooth，Ruiz et al. 2022 · [2208.12242](https://arxiv.org/abs/2208.12242)                                                                                                                                                | 3–5 张主体定制 + prior preservation 防语言漂移                        | ⑥                          |
| Textual Inversion，Gal et al. 2022 · [2208.01618](https://arxiv.org/abs/2208.01618)                                                                                                                                          | 只学一个新词向量                                                      | ⑥                          |
| LyCORIS，Yeh et al. 2023 · [2309.14859](https://arxiv.org/abs/2309.14859)                                                                                                                                                    | LoHa/LoKr 等算法库 + 评测框架                                         | ①⑥                         |
| KronA，Edalati et al. 2022 · [2212.10650](https://arxiv.org/abs/2212.10650)                                                                                                                                                  | Kronecker 适配器（LoKr 思想来源，实验在 NLP）                         | ⑥                          |
| DoRA，Liu et al. 2024 · [2402.09353](https://arxiv.org/abs/2402.09353)                                                                                                                                                       | 拆幅值和方向，低 rank 逼近全量微调                                    | ⑥                          |
| Concept Sliders，Gandikota et al. 2023 · [2311.12092](https://arxiv.org/abs/2311.12092)                                                                                                                                      | LoRA 做连续属性滑杆                                                   | ⑥                          |
| SDXL，Podell et al. 2023 · [2307.01952](https://arxiv.org/abs/2307.01952)                                                                                                                                                    | 动漫底模母架构；分辨率条件化影响分桶                                  | ①④                         |
| Lin et al. 2023 · [2305.08891](https://arxiv.org/abs/2305.08891)                                                                                                                                                             | zero terminal SNR + v-pred，修「出不了纯黑纯白」                      | ①④（NoobAI-Vpred、NAI V3） |
| Salimans & Ho 2022 · [2202.00512](https://arxiv.org/abs/2202.00512)                                                                                                                                                          | 社区认为 v-prediction 出自此文（正文命名未核实）                      | ④                          |
| Min-SNR，Hang et al. 2023 · [2303.09556](https://arxiv.org/abs/2303.09556)                                                                                                                                                   | 按 SNR 加权 loss 加速收敛（HF 推荐 γ=5）                              | ①④                         |
| Illustrious，Park et al. 2024 · [2409.19946](https://arxiv.org/abs/2409.19946)                                                                                                                                               | 开源动漫 SDXL：高分辨率、多层级 caption                               | ①⑤                         |
| NovelAI V3，Ossa et al. 2024 · [2409.15997](https://arxiv.org/abs/2409.15997)                                                                                                                                                | SDXL 动漫化：v-pred、ZTSNR、σmax                                      | ④                          |
| SD3 / Rectified Flow，Esser et al. 2024 · [2403.03206](https://arxiv.org/abs/2403.03206)                                                                                                                                     | rectified flow + MMDiT，FLUX 前身；解释 FLUX 训练用 flow 目标和 shift | ①                          |
| FLUX.1 Kontext，BFL 2025 · [2506.15742](https://arxiv.org/abs/2506.15742)                                                                                                                                                    | 参考图上下文生成（零训练一致性）                                      | ⑥                          |
| ZipLoRA，Shah et al. 2023 · [2311.13600](https://arxiv.org/abs/2311.13600)                                                                                                                                                   | 合并主体 LoRA 与画风 LoRA                                             | ⑥                          |
| K-LoRA，Ouyang et al. 2025 · [2502.18461](https://arxiv.org/abs/2502.18461)                                                                                                                                                  | 免训练按层选 LoRA 融合                                                | ⑥                          |
| DreamBench++，Peng et al. 2024 · [2406.16855](https://arxiv.org/abs/2406.16855)                                                                                                                                              | 多模态模型当评委的个性化评测                                          | ①（评估）                  |
| B-LoRA [2403.14572](https://arxiv.org/abs/2403.14572) · OFT [2306.07280](https://arxiv.org/abs/2306.07280) · BOFT [2311.06243](https://arxiv.org/abs/2311.06243) · IP-Adapter [2308.06721](https://arxiv.org/abs/2308.06721) | 见 §6.2                                                               | ⑥                          |

FLUX.1 dev 本身有没有独立论文：未验证。PixAI 没有论文，只有 Tsubaki.3 技术报告网页（§3.1）。

---

## 9. 下一步的最小切片（候选，等 owner 选）

1. **Modal 上跑通一个 SDXL/Illustrious LoRA（脚本，不进产品）**：独立 Modal 函数装 kohya sd-scripts，底模用 Illustrious v2.0（RAIL-M，许可最干净），L40S，固定一套 20–30 张测试集（用现有 Tagger 打标），产出 `.safetensors` 写 R2，同时记下真实 s/步。成本约 $1、一次；**跑之前要 owner 批准花钱**。证伪点：s/步远超 0.8 或 L40S 显存不够。
2. **推理侧先接通「自家 R2 里的 LoRA」**：`ensureRunnerLoraInR2` 加自家 key 分支，拿一个已在 R2 的 Civitai LoRA 换个路径冒充自训产物，在 Runner 上挂它出图。零训练成本，把 §2.5 数据流的后半段先打通。
3. **定归属模型与底模名单**（owner 决策，不是代码）：按 §5.4 选 A/B/C；同时决定 FLUX.1 dev 训练在站点收费前是否保留。

## 判断与教训

- 「现有托管方案能训 SDXL 动漫」是错的：fal 没有 SDXL trainer，Replicate 现用的也只训 FLUX。SDXL 动漫训练只能自建或走 Civitai API。
- 托管平台和 PixAI 的价格口径都在变（PixAI 自家两页冲突），引用价格前要重查。

## §10 底模重选（2026-11-27）

目标改为「训一个 LoRA 传到 HF / Civitai」。§1 用的 SDXL / FLUX.1 已不是主流；按下面重选。

**本月 Civitai LoRA 底模分布**（公开 API `/api/v1/models?types=LORA&period=Month`，三种排序各取前 100，2026-11-27 拉取；civitai.com 自 2026-04 只放全年龄内容，样本不含 civitai.red）：

| 底模                   | 最新上传 | 下载最多 | 评分最高 |
| ---------------------- | -------- | -------- | -------- |
| MOSS Image             | 14       | 39       | 38       |
| Anima                  | 30       | 18       | 20       |
| Krea 2（含 Turbo）     | 15       | 25       | 24       |
| Illustrious            | 33       | 4        | 7        |
| MiniMax H3（含 Image） | 2        | 10       | 9        |
| Qwen（含 2.1）         | 1        | 3        | 1        |
| FLUX.1 D               | 2        | 0        | 0        |

**候选对比**（许可均读原文，2026-11-27）：

| 底模                                     | LoRA 上传许可                                                                                                                                                                                           | 出图端                                          | ai-toolkit | 结论     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------- | -------- |
| Anima Base（circlestone-labs，2B，动漫） | [CircleStone 非商用 v1.2](https://huggingface.co/circlestone-labs/Anima/blob/main/LICENSE.md)：LoRA 属 Derivative；2(c) 允许个人上传/出售 LoRA 权重；分发须附许可原文 + Attribution Notice 并声明已修改 | 已跑（`dit-workflow-builder.ts` anima profile） | 支持       | **首选** |
| MOSS-Image Base（OpenMOSS，5B，2026-10） | Apache-2.0                                                                                                                                                                                              | 未接                                            | 支持       | 次选     |
| Krea 2 Raw（12.8B，2026-06）             | [Krea 2 Community License](https://krea.ai/krea-2-licensing)：年营收 < $1M 可商用、须内容过滤（门槛数字有二手报道写「50 席」，未逐字核对）                                                              | 只跑 Turbo                                      | 支持       | 备选     |
| Illustrious XL v2.0                      | openrail-m                                                                                                                                                                                              | 已跑                                            | 支持       | 保底     |
| MiniMax H3 Image（2026-11）              | [Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE)：Excluded Territories = 欧盟/英国/韩国/美国；托管服务须书面授权                                                | 未接                                            | 支持       | 不选     |
| Qwen-Image 2.1（7B，2026-09）            | [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE)：仅研究/评估，商用另签                                                                                            | 跑 Turbo                                        | 支持       | 不选     |

ai-toolkit 支持列表：[ostris/ai-toolkit `extensions_built_in/diffusion_models`](https://github.com/ostris/ai-toolkit/tree/main/extensions_built_in/diffusion_models)（含 anima / moss_image / krea2 / minimax_h3 / qwen_image_2 / z_image / flux2，2026-11-27）。

**Anima 训练要点**（[模型卡](https://huggingface.co/circlestone-labs/Anima)）：LoRA 在 Anima-Base 上训（不是 Aesthetic 版）；不要训 LLM adapter（diffusion-pipe `llm_adapter_lr=0`，sd-scripts 有同类开关）；标签可用 Danbooru 标签、自然语言或二者混合，训练时有随机标签 dropout。

**顺带发现（与训练无关）**：站内出图在用的 Anima（非商用）与 Qwen-Image 2.1 Turbo（研究许可）都不是商用许可；站点收费即需授权或下线。Turbo 是否与 2.1 原版同许可：未验证。
