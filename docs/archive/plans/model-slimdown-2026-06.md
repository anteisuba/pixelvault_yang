# PixelVault 模型精简实施报告 (Model Slimdown — Codex 执行版)

> 基准 commit: `3ebfecf0`。所有行号/字段名以当前 `src/constants/models/*` 为准。
> 本报告区分两种删除：**(a) 仅 `available:false`**（仍在 catalog 里占位，需彻底删 enum+option+i18n）与 **(b) 已在 `RETIRED_MODEL_IDS`**（运行时已屏蔽，但 enum/option/i18n 仍在，仍需物理删除）。两者对 Codex 都是"删干净"，但验证点不同——已 retired 的删起来零运行时风险，`available:true` 的删除要先确认无默认指向。
>
> 调研基准日期 2026-06-15，联网核实。标 medium/low 置信度与"verify before wiring"处务必在接线前核对 slug/价格。

---

## 1. 精简哲学

每一类 = **1 个旗舰**（覆盖 80% 主流需求的最强通用项）+ **少数不可替代的特色专精**（旗舰覆盖不到的独占能力：向量 SVG、开放权重 LoRA 生态、声音克隆、ZH 发音覆写、多说话人对话……），其余**冗余中间档全部物理删除**（不是 disable，是从 enum / option 数组 / i18n 三处一起删，避免 catalog 噪音与"看起来能选实际跑不通"）。判据是**"删了之后是否有一个角色/能力没人覆盖"——没有才删**（不是"被旗舰压制就删"：一个被旗舰整体压制但仍有独占能力/独占受众的模型要留）。直连官方 API 优先于 fal/Replicate，只有无官方直连或聚合器明确更优/唯一时才用 fal。

---

## 2. 四类最终 lineup

### 2.1 Text-to-Text (LLM 拆解能力)

**定位**：拆解图片 / 拆解关键词 / 剧本生成 / 剧本拆解 / 分镜生成。5 个任务里**只有"拆解图片"需要 VISION**，另外 4 个是纯文本。精简后 **6 → 4**：3 个 vision 档（Gemini×2 + GPT）吃需要看图的路由，`deepseek-v4-pro` 作**纯文本推理档**（剧本/分镜/关键词，强中文），按能力分流而非一刀切。零新增 adapter。

> 注意：这一类**不在 `AI_MODELS` enum / `MODEL_OPTIONS`**，而在 `src/constants/config.ts` 的 `LLM_TEXT_MODEL_IDS`（L405-412），消费方是 `node-studio.ts`、`script-breakdown.ts`、`llm-text.service.ts`、`llm-capability.ts`。删除动作在这几个文件，不动 `models/*`。

**最终保留 lineup**

| 角色/能力                           | model id                | provider      | 连接方式 | 成本                 | 理由                                                                                                                                                                |
| ----------------------------------- | ----------------------- | ------------- | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 廉价 vision 主力（全 5 任务）       | `gemini-3.1-flash-lite` | Google Gemini | direct   | $0.25 / $1.50 per 1M | vision + 图/视频/PDF 输入 + 1M ctx + 结构化 JSON，输入比 3.5-flash 便宜 ~6x。已是 GEMINI adapter 默认（`llm-text.service.ts:100`）。                                |
| 高级推理 + vision 档                | `gemini-3.5-flash`      | Google Gemini | direct   | $1.50 / $9 per 1M    | thinking-level 推理 + 强 zh/ja，吃硬剧本拆解/分镜 + 精确拆解图片。已被 node-studio / script-breakdown 用作 planner。                                                |
| 跨厂商 vision 兜底                  | `gpt-5.4-mini`          | OpenAI        | direct   | $0.75 / $4.50 per 1M | 只绑了 OpenAI key 的用户仍能用全套拆解，避免 lineup 单押 Gemini。已接好。                                                                                           |
| **纯文本推理（剧本/分镜，强中文）** | `deepseek-v4-pro`       | DeepSeek      | direct   | 便宜（MIT）          | **保留**。文本拆解/剧本生成的强项，中文尤佳，已是 DeepSeek 默认（`llm-text.service.ts:101`）。**只服务文本路由，不接"拆解图片"**（adapter 对 imageData 硬 throw）。 |

**新增表**：无（保留项全部已在仓库接好）。

**删除表**

| model id             | 理由                                                                                                                                                                         | 置信度 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `doubao-1.5-pro-32k` | **VISION-BLIND** 且仅 `enhance` scope；wired SKU 是非 vision 版 Doubao。文本价值与 DeepSeek 重叠，VolcEngine 的真实价值（Seedream/Doubao 图像 gen）在 IMAGE lineup，不在此。 | high   |
| `deepseek-v4-flash`  | 剧本/分镜是低频质量优先任务，`deepseek-v4-pro` 已覆盖，flash 高并发档在此冗余。砍 flash 留 pro。                                                                             | medium |

> **修正记录**：早期草案曾把 `deepseek-v4-pro` 一并删除，理由是它做不了"拆解图片"——这是过度精简。5 个拆解任务里只有 1 个需要视觉，DeepSeek 在另外 4 个纯文本任务（尤其中文剧本/分镜）是强项。正确修法是**按能力分流**：DeepSeek 保留为文本 planner，"拆解图片"路由到 vision 档。真正要修的是 `assistant` scope 把文本+视觉混在一起（"DeepSeek 进不了助手"根因），见 §5 `llm-capability.ts`。

---

### 2.2 Text-to-Image (生成能力)

**定位**：生成，`gpt-image-2` 是旗舰，其余只留有**独占能力**的特色专精。精简后 **最终 13 个模型**（含 1 ADD `flux-2-flash` + ideogram v3→v4 就地升级），删 15（8 个 available + 7 个已禁用死重）。

> **删除清单复查记录（按"是否有独占特色"重过）**：早期草案删 18 个，复查后捞回 3 个有独占能力的——`gemini-3.1-flash-image`（唯一免费档 + 当前 Arena T2I 第一）、`seedream-4.5`（中文语义/图内中文最强）、`nai-diffusion-4-5-curated`（干净数据集、更可控）。判据从"是否被旗舰压制"改成"删了之后是否有一个角色/能力没人覆盖"。

**最终保留 lineup**

| 角色/能力                             | model id (enum)                                     | provider                 | 连接方式                | 成本(credits) | 理由                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------- | ------------------------ | ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 旗舰通用                              | `gpt-image-2`                                       | OpenAI                   | direct                  | 3             | LLM-Stats 图像 arena #1；~99% 多语种文字准确、4K、推理驱动。最强全能。                                                                                                                     |
| 推理+多参考通用                       | `gemini-3-pro-image-preview`                        | Gemini (Nano Banana Pro) | direct                  | 3             | verified #2，独占 profile：SOTA 推理、多轮编辑、最多 14 张参考图、FID 12.4。                                                                                                               |
| 写实替代                              | `flux-2-pro`                                        | fal (BFL)                | fal                     | 2             | FLUX 领先纯写实+提示词遵循，pro 是量产价值档。gpt 占绝对顶档，一个 FLUX 写实就够。                                                                                                         |
| 图内文字/排版                         | `ideogram-3`(enum 名保留)                           | fal (Ideogram 4.0)       | fal — **升级 endpoint** | 2             | 文字渲染断层第一（90-95% vs 30-50%）。v4 = 9.3B、原生 2K。                                                                                                                                 |
| 设计/原生矢量 SVG                     | `recraft-v4-pro`                                    | fal (Recraft)            | fal                     | 2             | 唯一能出真·可编辑 SVG 路径（真曲线/节点，非描摹）+ 品牌套件。独占角色。                                                                                                                    |
| 闭源动漫旗舰                          | `nai-diffusion-4-5-full`                            | NovelAI                  | direct                  | 2             | 从零训练的专有动漫模型，#1 闭源动漫，线稿/解剖 pro 级。                                                                                                                                    |
| **可控动漫档**（复查捞回，最可选）    | `nai-diffusion-4-5-curated`                         | NovelAI                  | direct                  | 2             | 干净数据集、更易 steer、输出更稳定——与 Full 是不同控制档（Full 知识更全、Curated 更可控）。三个捞回里最接近冗余，若要再砍一个先砍它。                                                      |
| 开放动漫底模+Civitai LoRA             | `illustrious-xl`(→`delta-lock/noobai-xl`)           | Replicate                | Replicate               | 2             | 开放 SDXL 系动漫底模 + 海量 Civitai LoRA 生态，`supportsLora:true`。NovelAI 无法替代。                                                                                                     |
| **中文语义/图内中文专精**（复查捞回） | `seedream-4.5`                                      | fal (ByteDance)          | fal                     | 2             | 中文 prompt 语义与图内中文文字渲染最强，服务 en/ja/zh 的中文用户。gpt/ideogram 的英文文字强但中文不及。可选走 VolcEngine direct(`doubao-seedream-4-5-251128`)。                            |
| LoRA 通道 (FLUX.1-D)                  | `flux-lora`                                         | fal                      | fal                     | 1             | 跑 Civitai FLUX.1-D LoRA 的规范 endpoint。                                                                                                                                                 |
| 廉价/快速档                           | **`flux-2-flash`** (NEW)                            | fal (BFL)                | fal                     | ~1            | BFL 最快 FLUX.2，亚秒、$0.005/MP、文字清晰。严格优于 FLUX.1 schnell。                                                                                                                      |
| **免费档 + Arena 顶档**（复查捞回）   | `gemini-3.1-flash-image`(enum `GEMINI_FLASH_IMAGE`) | Gemini                   | direct                  | 2 (freeTier)  | **唯一 `freeTier:true` 图片档**（免费/新用户体验）+ 当前 LM Arena T2I 第一。**升 GA**：externalModelId `-preview` → `gemini-3.1-flash-image`（`-preview` 约 2026-06-25 停服，见 §6-Q12）。 |
| 参考/局部编辑                         | `flux-kontext-max`                                  | fal (BFL)                | fal                     | 3             | 外科级 in-context 编辑（重绘/换姿势/扩展）不毁周边像素，Max 是多参考超集。                                                                                                                 |

**新增表**

| model id                                        | provider  | connection | 置信度                                                                                                                                            |
| ----------------------------------------------- | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flux-2-flash` (endpoint `fal-ai/flux-2/flash`) | fal (BFL) | fal        | high — **wire 前确认 fal credit 成本 + 是否 `supportsLora`/`maxPromptChars`**，对照 live `fal-ai/flux-2/flash` schema。占位设 1 credit / budget。 |

**就地升级（非新增非删除）**：

- `IDEOGRAM_3` 的 `externalModelId` 从 `fal-ai/ideogram/v3` → `fal-ai/ideogram/v4`（image.ts:115）。enum 名/i18n key 不变，仅换 endpoint 字符串。**wire 前确认 v4 默认 tier（Turbo/Default/Quality = $0.03/$0.06/$0.10）及 `maxPromptChars:1000` 是否仍成立**。
- `GEMINI_FLASH_IMAGE` 的 `externalModelId` 升 GA `gemini-3.1-flash-image`（见上表，§6-Q12 紧急度）。

**删除表**

| model id                                                                | 当前状态        | 理由                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `flux-2-max`                                                            | available:true  | 冗余 FLUX 顶档孪生；gpt 占绝对顶档，flux-2-pro 占写实，一个就够。                                                                                                                                                        |
| `flux-2-dev`                                                            | available:true  | 冗余中间：flux-lora 占 LoRA、flux-2-pro 占质量、flux-2-flash 占便宜。**独占点是 FLUX.2 代 LoRA 生态**（flux-lora 跑 FLUX.1-D）；目前 Civitai FLUX.1-D LoRA 量级远大于 FLUX.2，故先删，等 FLUX.2 LoRA 生态起来再 re-add。 |
| `flux-2-schnell`                                                        | available:true  | 被 flux-2-flash 取代。**排序**：flux-2-flash 验活（§ 新增表 caveat）后再删，否则会暂时没有便宜快档。                                                                                                                     |
| `seedream-5.0-lite`                                                     | available:true  | 轻量档与 flux-2-flash 重叠，不够特色（中文专精改留 4.5）。                                                                                                                                                               |
| `seedream-4.0`                                                          | available:true  | 中档被 4.5 + flux-2-pro + gpt 压制。                                                                                                                                                                                     |
| `seedream-3.0`                                                          | available:false | 已 retired，入门级，全档压制。彻底删。                                                                                                                                                                                   |
| `recraft-v3`                                                            | available:false | 被 recraft-v4-pro 完全取代。                                                                                                                                                                                             |
| `animagine-xl-4.0`                                                      | available:true  | 开放动漫位被 Illustrious/noobai 压制（LoRA 生态更大）；其特定审美不足以独占一档。                                                                                                                                        |
| `flux-kontext-pro`                                                      | available:true  | 单参考是 kontext-max（多参考超集）的子集。                                                                                                                                                                               |
| `sd-3.5-large`                                                          | available:true  | 开源基线被 FLUX 全面压制，无独占受众。                                                                                                                                                                                   |
| `gemini-2.5-flash-image`                                                | available:false | 上一代 Nano Banana，2026-10-02 停服，被 Gemini 3 Pro Image + 升 GA 的 gemini-3.1-flash-image 取代。                                                                                                                      |
| `sdxl` / `playground-v2.5` / `nai-diffusion-4-full` / `nai-diffusion-3` | available:false | 已 retired 死重，本轮一并物理删（enum+option+i18n+各 map）。                                                                                                                                                             |

> **保留 `ANIMA_PENCIL_XL` enum 占位不动**（image.ts:214-244 已详细说明：Cosmos DiT 无 hosted endpoint + 非商用许可，`available:false`，Civitai LoRA 库靠它路由 Anima baseModel LoRA 到"open in Civitai"）。这是开放问题 §6-Q1。

---

### 2.3 Text-to-Video (Seedance 最强)

**定位**：Seedance 是用户认定最强；保留旗舰 Seedance 四件套 + 不重叠的电影/对白/开放权重专精。精简后 **available → 4 KEEP（Seedance 家族）+ 2 KEEP（Kling/Veo）+ 2 ADD（HappyHorse / LTX）**，删 15（全部已 retired）。

**最终保留 lineup**

| 角色/能力                    | model id (enum)               | provider   | 连接方式                                             | 成本                                  | 理由                                                                                                              |
| ---------------------------- | ----------------------------- | ---------- | ---------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 旗舰生成器 + 最省路线        | `seedance-2.0`                | ByteDance  | fal (现在) → BytePlus ModelArk direct (阶段性, flag) | fal $0.3034/s@720p；BytePlus ~$0.13/s | 用户认定最强；原生音频+导演级运镜。详见 §4。                                                                      |
| 旗舰快/省变体                | `seedance-2.0-fast`           | ByteDance  | fal \| BytePlus                                      | fal $0.2419/s@720p                    | 量产用的便宜快档。                                                                                                |
| 全参考+声音克隆              | `seedance-2.0-reference`      | ByteDance  | fal \| BytePlus                                      | fal $0.3024/s (视频输入 ×0.6)         | catalog 内唯一 audio_urls 声音克隆 + 多图参考组合，无替代。                                                       |
| 声音克隆快变体               | `seedance-2.0-fast-reference` | ByteDance  | fal \| BytePlus                                      | fal $0.2419/s                         | 迭代用的快速声音克隆。                                                                                            |
| #1 arena 黑马 (NEW)          | `happyhorse-1.0`              | Alibaba    | fal: `alibaba/happy-horse/text-to-video`             | $0.14/s@720p, $0.28/s@1080p           | Artificial Analysis Video Arena #1（~58% blind 胜 Seedance），比 fal-Seedance-std 还便宜。原生音频+7 语言唇同步。 |
| 电影专精（最便宜 premium/s） | `kling-v3-pro`                | Kuaishou   | fal: `fal-ai/kling-video/v3/pro/...`                 | $0.095/s                              | 多镜分镜、原生音频、native extend 到 180s。与 Veo 不冗余。                                                        |
| premium 对白/音频 + 4K       | `veo-3.1`                     | Google     | fal: `fal-ai/veo3.1`                                 | $0.20-0.60/s                          | 唇同步/对白真实度 + 原生 4K，premium 语音位无可替代。                                                             |
| 开放权重预算锚 (NEW)         | `ltx-2.3`                     | Lightricks | fal: `fal-ai/ltx-2.3/text-to-video`                  | $0.06/s@1080p（catalog 最低）         | 22B 开放权重（HF/可自托管）、联合音频，一个干掉整条 wan/hunyuan/pika/luma/minimax 预算尾巴。                      |

**新增表**

| model id                                                                                                                | provider           | connection                                 | 置信度                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `happyhorse-1.0` (endpoint `alibaba/happy-horse/text-to-video` + `/image-to-video`,`/reference-to-video`,`/video-edit`) | Alibaba            | fal                                        | high — **wire 前确认 fal endpoint 稳定在线**（arena 报告称它"登顶后一度消失"，§6-Q2）。需 `HAPPYHORSE_10` enum + ModelOption(FAL) + i18n×3。          |
| `ltx-2.3` (endpoint `fal-ai/ltx-2.3/text-to-video` + i2v/audio-to-video/extend/retake)                                  | Lightricks         | fal                                        | high — **wire 前确认要暴露的分辨率 tier**：$0.06/s 是 1080p，1440p/2160p 跳 $0.12/$0.24（§6-Q3）。需 `LTX_23` enum + ModelOption + i18n×3。           |
| `seedance-2.0` **BytePlus direct 连接路由**                                                                             | ByteDance/BytePlus | BytePlus ModelArk direct（USD，flag 门控） | medium — **wire 前确认可用的 USD 计费 endpoint + 确切 ModelArk model ID**；全球 API rollout 一直时断时续，未确认前 fal 是唯一可靠路线（§4 + §6-Q4）。 |

**删除表**（全部已 retired + `available:false`，本轮物理删 enum+option+i18n）

| model id                                                 | 理由                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seedance-2.0-volc` / `seedance-2.0-fast-volc`           | VolcEngine-direct 与 seedance-2.0 同模型，CN account+实名+接入点墙劣于 BytePlus；冗余（成本走 BytePlus 路由，不需独立条目）。                      |
| `seedance-pro` / `seedance-1.5-pro` / `seedance-1.0-pro` | legacy v1/1.5，被 2.0 + Kling v3 native extend 取代。                                                                                              |
| `minimax-video` (Hailuo 2.3)                             | 中档，无独占角色。                                                                                                                                 |
| `luma-ray-2`                                             | Ray-2 无音频，被 Kling v3/LTX 压制。                                                                                                               |
| `pika-v2.5`                                              | Pikaffects 创意特效/场景扩展~25s 属 niche，非核心（见复查记录）。                                                                                  |
| `kling-video` (v2.1)                                     | 被 kling-v3-pro 严格取代。                                                                                                                         |
| `runway-gen4.5` / `runway-gen4-turbo` / `runway-gen3`    | director-level 控制是 gen4.5 的独占点（见复查记录），但本轮删以砍掉整个 RUNWAY adapter 依赖（§6-Q5）；turbo/gen3 被 Seedance/HappyHorse i2v 覆盖。 |
| `wan-video` (2.6) / `hunyuan-video`                      | 被 LTX-2.3 取代（开放、更便宜、更好）。                                                                                                            |
| `vidu-q3-pro`                                            | 动漫视频 + 多主体参考一致性是其特色（见复查记录），但被 HappyHorse/Kling + Seedance reference 覆盖，本轮删。                                       |

> **删除清单复查记录（按"是否有独占特色"重过）**：视频长尾绝大多数是真死重（legacy/retired/被严格取代），复查后维持删除。3 个有"可辩护独占特色"但仍建议**本轮删、文档标注 re-add 触发条件**：
>
> - `runway-gen4.5` — 导演级控制（motion brush / Aleph 编辑 / Act-Two 表演捕捉）+ 直连 API。**re-add 触发**：产品要专业运镜/表演控制时（代价=保留整个 RUNWAY adapter）。
> - `vidu-q3-pro` — 动漫视频 + 多主体参考一致性强（产品偏动漫）。**re-add 触发**：要动漫向视频专精时。
> - `pika-v2.5` — Pikaffects 创意特效。纯特效 niche，优先级最低。

---

### 2.4 Text-to-Voice (双轴：声音库 + 音声生成)

**定位**：A 轴 = 声音库/克隆（pre-made + cloneable banks），B 轴 = 音声生成质量（per-language 最强合成）。精简后保留 **Fish（现役）+ 2 必加（ElevenLabs / MiniMax）+ 2 可选（OpenAI / Gemini TTS）**，删 1，VOICEVOX 见 §3。

**最终保留 lineup**

| 角色/能力（轴）                                            | model id                             | provider      | 连接方式                                               | 成本                    | 理由                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------ | ------------- | ------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A: marketplace + 即时克隆锚（兼 EN/JA 顶级合成）           | `s2-pro` (`FISH_AUDIO_S2_PRO`)       | Fish Audio    | direct                                                 | ~$15/1M chars           | 现役。声音市场 + 15s 即时克隆 + premium 克隆，开放权重(Apache2.0)，TTS-Arena2 第一，最便宜旗舰，强 JA/ZH/EN。          |
| A: premium 保真 roster + 专业克隆(IVC+PVC)，兼 EN 表现上限 | `eleven_v3`                          | ElevenLabs    | direct                                                 | ~$100/1M chars (credit) | GA via `model_id=eleven_v3`。10000+ 社区 Voice Library，IVC(~30s)+PVC(1-5min)，70+ 语言。补 Fish 缺的市场规模+PVC 档。 |
| B: 最强 zh 普通话/粤语旗舰                                 | `speech-2.8-hd`                      | MiniMax       | direct (`api.minimax.io/v1/t2a_v2`)                    | ~$100/1M chars          | Speech Arena/HF TTS Arena #1，行内 Pinyin(1-5)+Jyutping(1-6) 发音覆写，5s 克隆，32 语言。补 ZH 质量缺口。              |
| B: 可选工具合成——可调预设、最便宜、无克隆                  | `gpt-4o-mini-tts`                    | OpenAI        | direct（复用现有 OPENAI adapter，需新增 TTS 代码路径） | ~$0.015/min             | 13 个可调预设、指令驱动。近零集成成本。最小化时第一个砍。                                                              |
| B: 可选——单次原生多说话人对话                              | `gemini-2.5-flash-preview-tts`       | Google Gemini | direct（复用现有 GEMINI adapter，需 TTS 代码路径）     | low (Flash)             | 30 voices/24 语言，原生 multi_speaker_markup，独占单次对话。最小化时第一个砍。                                         |
| A: JA 角色声音库                                           | (AivisSpeech via `VOICEVOX` adapter) | self-host     | self-host                                              | free (local)            | 见 §3 专项结论。                                                                                                       |

**新增表**

| model id                       | provider      | connection                                    | 置信度                                                                                                                                             |
| ------------------------------ | ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eleven_v3`                    | ElevenLabs    | direct                                        | high — 需**全新 ElevenLabs adapter**（仓库无）。**caveat**：PVC 尚未对 v3 完全优化，PVC 克隆短期内可能更适合走 `eleven_multilingual_v2`（§6-Q7）。 |
| `speech-2.8-hd`                | MiniMax       | direct (`api.minimax.io/v1/t2a_v2`)           | high — 需**全新 MINIMAX adapter + `AI_ADAPTER_TYPES.MINIMAX`**。**MiniMax ≠ VolcEngine**，别 overload VOLCENGINE。                                 |
| `gpt-4o-mini-tts`              | OpenAI        | direct（现有 OPENAI adapter + 新增 TTS 路径） | low — 非覆盖两轴必需，最小化时先砍。                                                                                                               |
| `gemini-2.5-flash-preview-tts` | Google Gemini | direct（现有 GEMINI adapter + 新增 TTS 路径） | low — 仅当需要多说话人对话时保留。                                                                                                                 |

**删除表**

| model id                    | 状态          | 理由                                                                                                                                                        |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fal-f5-tts` (`FAL_F5_TTS`) | retired+false | 已 disable 且走 fal 聚合器。每条轴都被 Fish s2-pro 超越（同为开放权重但有直连 API + 声音市场 + 更好质量 + zero-shot 克隆）。违反 lean-direct 规则，物理删。 |

---

## 3. VOICEVOX 专项结论

**它是什么**：VOICEVOX 是免费的日语 TTS + 歌声合成系统，JP 动漫/VTuber/同人圈极流行。三件套全在 GitHub：EDITOR（GUI）、**ENGINE**（Python HTTP server，集成对象）、CORE（Rust 推理库）。**没有官方云 SaaS，必须自托管**。输出"中品質"——卖点是 ~43 个命名角色（ずんだもん/四国めたん/春日部つむぎ……），不是裸自然度。**仅日语**。

**API**：自托管 HTTP REST（默认 `localhost:50021`，无 API key）。两步：`POST /audio_query` 拿可编辑的 AudioQuery JSON → `POST /synthesis` 拿 24kHz WAV。`speaker` 是 per-style 整数 ID。同步返回原始字节，干净映射到现有 `ProviderAudioResult`；但**无 word-level 时间戳对齐**，所以 `fish-audio.adapter.ts` 的 timestamp-segment 路径对它是空的。

**商用许可的坑（dealbreaker 在第二层）**：

- **(A) 引擎/软件**：商用+非商用免费，LGPL-3.0 或联系作者拿无源码披露的商业许可。作为独立 HTTP server 跑（非静态链接）即可避开 LGPL copyleft 传染到 app 代码。需通用"made with VOICEVOX"署名。
- **(B) per-character 声音条款（致命）**：每个角色的条款由其所有者各自设定、各不相同。旗舰 ずんだもん/四国めたん/春日部つむぎ 属东北ずん子项目（zunko.jp）：**允许商用，但必须按精确格式显示 per-character 署名** `VOICEVOX:ずんだもん`，且放在用户可见处。免署名商用需 **¥400,000(+税)/角色** 付费合同。更糟：禁止用途清单宽而硬绑——禁 R18、禁政治/宗教、禁诽谤、禁虚假信息。对一个用户自由生成、可能涉成人/edgy 内容的动漫向付费 SaaS，这是真实合规责任，需逐角色追踪条款 + 强制 per-character 署名 + 执法 R18/政治禁令。

**集成方式**：唯一一等公民是 **self-host**。Docker：`docker pull voicevox/voicevox_engine:cpu-latest`。**CPU 完全够**（小声学模型非 LLM，一句话亚秒级，内存几百 MB~1-2GB）；GPU 仅 nice-to-have。非官方 hosted（su-shiki / tts.quest）是爱好者服务，无 SLA、限流，**生产不可依赖**。落地为现有 FISH_AUDIO TTS adapter 的对等 peer（非 hosted-key provider，无 API key → 不走 QuickSetupDialog key-gate，是服务端自有 endpoint）。

**最终判定**：**裸 VOICEVOX → SKIP**。若要日语角色声音，**ADD AivisSpeech 替代**，落在 **A 轴（声音库 / "anime character voices (JA)" 档）**。

- 理由：AivisSpeech（Aivis-Project，Style-Bert-VITS2 系）比 VOICEVOX 明显更自然/情感化、**VOICEVOX-API 兼容**（同 `/audio_query`+`/synthesis`，端口 10101）、Docker CPU/GPU、日语-only，**关键是许可更干净**——其声音模型用 ACML/ACML-NC/CC0，其中 **ACML 与 CC0 免署名、允许商用**，绕开 VOICEVOX 的 per-character 署名 + ¥400k + 禁令地狱。
- **落点**：用**单一 `AI_ADAPTER_TYPES.VOICEVOX`（VOICEVOX-API 兼容）adapter** 指向自托管 **AivisSpeech** Docker 容器（CPU 够），**只暴露 CC0/ACML（免署名、可商用）声音模型**，作为 Fish 旁边独立的"日语角色声音"档。若产品/法务确实要字面上的 Zundamon 做品牌识别，再单独按东北ずん子项目署名 + 禁令执法门控，或付 per-character 许可——**绝不作为 free-for-all 生成器上线**。
- 这与项目"prefer direct/self-host over middleman FAL"一致，且本轮 voice 主线 = Fish（质量/多语言默认）+ 一个自托管 AivisSpeech 角色档即可覆盖需求，无需 VOICEVOX 的许可税。

> 此 ADD 是**基础设施级工作**（要跑引擎容器，接 Worker→provider→R2→callback），比加一个 hosted model 重得多。建议先拍板是否本轮做（§6-Q10），再排期。

---

## 4. 视频连接成本结论 (Seedance: direct vs fal)

**已核实单价（720p，含音频；音频在任何路线都不改价）**：

| 路线                            | Seedance 2.0 std       | Seedance 2.0 Fast | 计费                                                              | 坑                                                                                                                                        |
| ------------------------------- | ---------------------- | ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **VolcEngine direct (CN)**      | **~¥0.95/s ≈ $0.13/s** | 更低              | RMB，token-based（46 CNY/M tokens 纯生成；28 CNY/M 视频编辑输入） | **CN account + 实名 + 每模型建接入点(ep-xxx)**，`doubao-seedance-2-0-260128`。最便宜但对非 CN 主体门槛硬。                                |
| **BytePlus ModelArk (intl 臂)** | ~$0.13-0.15/s          | Fast 更便宜       | USD，国际合规                                                     | VolcEngine 国际臂。ModelArk 公测 2026-04-14 开放，但**全球 API rollout 一直时断时续**（playground 先于 full API 暴露）。wire 前必须验活。 |
| **fal.ai (proxy)**              | **$0.3034/s**          | **$0.2419/s**     | USD 预付                                                          | ~2.3x 加价，但零账号摩擦，已接进 `AI_ADAPTER_TYPES.FAL`。视频输入到 reference endpoint ×0.6（std ~$0.1814/s）。                           |

**明确推荐：fal 作 LIVE 默认，BytePlus direct 作成本优化阶段性目标（flag 门控），不追 VolcEngine-CN。**

1. **现在**：ship on fal（已编码、ID 已验、零摩擦）。$0.24-0.30/s 是加价税但可靠。
2. **成本路径**：BytePlus ModelArk 是对的 direct 目标（USD、国际、~$0.13/s ≈ fal 一半），需 BytePlus account + endpoint，但**无需 CN 主体**。门控在 feature flag + live-status check 后面——全球 API 一直 flaky。这是真正 ~2x 省钱杠杆。
3. **VolcEngine direct**：贴牌最便宜但 CN account+实名+接入点墙真实存在，且是 BytePlus 路线的近重复——**两个 `-volc` 条目保持删除**（已 retired，本轮物理删）。

**注意事项**：BytePlus 全球 API 在 wire 前必须确认有可用 USD 计费 endpoint + 确切 ModelArk model ID；未确认前 fal 是唯一可靠路线。是否已运营 CN/ByteDance 主体决定要不要保留 VolcEngine-direct（§6-Q6）。

### 4.1 Seedance 接入路线复查（2026-06-15，含 mini）

> 复查目标：从「接口明确 + 价格不贵 + 更新及时 + 最好官方」四标准选一条主接。**诚实结论：没有一条同时满足四条**——「最官方」(火山 CN) 与「最清晰+最及时」(fal) 在 2026 年中是相反方向。

**结论：fal 作主接，BytePlus ModelArk intl 作官方备选（先接 1.5 pro GA），Seedance mini 暂不接。**

| 路线                          | 官方?                        | API 清晰                             | 账号门槛                     | 代表价 (USD)                                                 | 更新及时                       | 裁决                               |
| ----------------------------- | ---------------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------ | ------------------------------ | ---------------------------------- |
| **VolcEngine Ark (火山, CN)** | 一手                         | 高（中文 SPA 难抓、token 计价）      | **PRC 实名 + RMB**           | 2.0 ~$0.14/s（最便宜）                                       | 最快（源头）                   | **出局**：非 CN 主体接不了         |
| **BytePlus ModelArk (intl)**  | 一手                         | 中高（2.0 model-id console≠docs）    | USD、需验证 + 建 endpoint    | 2.0 ~$0.05–0.10/s、fast 更低                                 | 落后 CN 数天–数周              | **官方备选**（2.0 仍 public beta） |
| **fal**                       | 否（launch partner，非一手） | **最高**（playground+OpenAPI+queue） | **极低**（邮箱、无 CN 主体） | 2.0 std $0.3034/s、fast $0.2419/s（含音频）                  | **day-zero**（4/9 同日上 2.0） | **主接**                           |
| **Replicate**                 | 否（proxy）                  | 高（可 pin 版本）                    | 极低                         | 2.0 ~$0.18/s、fast $0.08–0.10/s@480p、1.0 lite ~$0.01–0.02/s | 快                             | 最强备胎（档位最全）               |

逐条裁决：**接口明确→fal**（官方两家都是中文 SPA + BytePlus 2.0 命名乱）；**更新及时→fal**（day-zero）；**价格→**极廉看 Replicate fast / PiAPI $0.108/s，但 fal 计价透明含音频 reference 全模态，溢价换可规划性；**官方→**只有火山/BytePlus，火山实名墙挡死、BytePlus 2.0 仍 beta（QPS 2 / 并发 3 / 429 / model-id console(`seed-2-0-*`)≠docs(`seedance-2.0`)）。

**落地（给 Codex）**：

- **主接 fal**，model id（已 GA 可商用）：
  - 主力 reference sink：`bytedance/seedance-2.0/reference-to-video`（$0.3024/s@720p；video 输入 ×0.6 ~$0.1814/s；含音频）
  - 省钱档：`bytedance/seedance-2.0/fast/reference-to-video`（$0.2419/s@720p）
  - 纯 t2v/i2v：`bytedance/seedance-2.0/{text,image}-to-video`（+ `/fast/`）
  - 稳定回退：`fal-ai/bytedance/seedance/v1.5/pro/text-to-video`
  - **⚠ 命名空间陷阱**：2.0 用短前缀 `bytedance/...`，1.x 用长前缀 `fal-ai/bytedance/...`——别写错。
- **官方备选 BytePlus**：并行注册账号、**先 verify 非 CN 团队能否通过身份验证**；短期只接 **1.5 pro GA**（`seedance-1-5-pro`）做官方稳定回退；监控 2.0 转 GA + model-id 收敛后再把 2.0 主接从 fal 切过来（接口见 §8.6）。
- **适配器设计**：model id 做成 per-tier 可配置映射表，reference 输入字段按能力契约抽象、不硬绑 fal slug——这样 fal→BytePlus 切换、未来 mini 替 fast 都只改配置不改 service。

**Seedance mini — 暂不接线**：

- 它是**传闻**的 Seedance **2.0 家族预算档**（在 fast 之下，2.0 无 "pro"，高质量档叫 Standard）。**两个陷阱**：(a) mini ≠ lite（lite 是 1.0 时代轻量档）；(b) ByteDance 的 **Seed 2.0 LLM**（纯文本）也有 Pro/Lite/Mini，网上常混。
- **现状判负**：Wikipedia 标发布 2026-06-15，但其他所有源说「传闻/即将」，ByteDance 自家 Seed 模型页**没列 mini**，**全网零个确认的 wire model id / spec / endpoint**，seedance2mini.ai 仍 "Soon"。无法对一个名字集成。
- **做法**：预算档现在就用 `bytedance/seedance-2.0/fast/*`；2–4 周后等官方 model card + endpoint + 价格出来再评估把 fast 换成 mini（只改配置）。

### 4.2 国内/海外区分：文字标注，不做自动分流（已对照仓库核实）

> **决策更新（取代早期 billingRegion 方案）**：**不做**自动区域分流。真正的「区分」已经是**按功能（outputType）分流**——这是现状。国内/海外只在 UI 用**纯文字标注 provider/route**，不碰任何运行时路由。Ark（国内）通过 BYOK 让用户自己配 key 接入。

**① 现状：功能分流已存在（无需新增路由逻辑）**

- API **不是单一总入口**，而是 **4 个按 outputType 分的端点**：`POST /api/generate`(IMAGE) / `/api/generate-video`(VIDEO) / `/api/generate-audio`(AUDIO) / `/api/generate-3d`(MODEL_3D)，每个 auth(Clerk)→Zod→service。
- service 调 `resolveGenerationRoute()`（`generate-image.service.ts:114`，图片+视频共用），按模型自带 `adapterType` 选 provider → `getProviderAdapter()` → adapter 方法（`generateImage`/`submitVideoToQueue`/`generateAudio`/`submitModel3DToQueue`）→ provider → `uploadToR2()`。
- UI 侧每个工具页只拿本类模型：`use{Image,Video,Audio,3D}ModelOptions()` → `getAvailable{Image,Video,Audio,Model3D}Models()`（按 outputType 过滤）→ `MainModelPicker`→`BaseModelPickerPanel`。**所以 image 页天然只给图片模型，无需新写分流。**

**② 国内/海外文字标注落点（纯展示，不自动分流）**

- 首选 `BaseModelPickerPanel.tsx` 触发钮（~226-232）下加一行 `text-xs text-muted-foreground` 渲染 `getProviderLabel(option.providerConfig)`（"OpenAI"/"fal.ai"/"VolcEngine"…）。下拉项 metadata（~160-162）已在显示 providerLabel。
- 要「国内/海外」字样：在 `providers.ts` 加 `ADAPTER_REGION_LABEL: Record<AI_ADAPTER_TYPES, '国内'|'海外'>`（如 `VOLCENGINE → 国内`，其余 → 海外），picker 读它显示。**纯展示常量，不参与选 adapter。**
- 第二落点：`ApiKeyManager`（截图「API 路由」面板）的路由组 badge 已显示 provider 文字，可同口径加 region。

**③ 用户怎么用上 Ark（国内）= BYOK**

- 用户在「API 路由」面板（`ApiKeyManager.tsx`/`ApiKeyForm.tsx`）为某模型加自己的 VolcEngine Ark key（现有 ep-xxx 分支已支持），启用（`isActive=true`）后经 `buildSavedModelOptionsForModels()` 出现在 Studio picker。
- `volcengine.adapter.ts` **已完整**（generateImage + submitVideoToQueue for doubao-seedance/seedream），BYOK 路径已可达 —— **不需要平台级自动区域分流**。
- 是否额外搞「平台兜底 Ark 账号」是独立决策（要开 RMB 账号 + 设 `VOLCENGINE_API_KEY` + 处理视频特例 `canSubmitVideoViaExecutionWorker()` 硬绑 FAL + 数据落 cn-beijing 合规）——本轮可不做。

**④ Seedance wire-set（id 参考）** —— 海外用 fal slug；国内用 Ark `doubao-*` id（用户 BYOK Ark key 时填，或将来平台接 Ark 时用）：

| 档                       | 决策                                    | Ark id（国内 BYOK）                         | fal slug（海外）                                         |
| ------------------------ | --------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| 2.0 Standard             | **接**（旗舰 1080p + 音频，全模态参考） | `doubao-seedance-2-0-260128`                | `bytedance/seedance-2.0/{text,image,reference}-to-video` |
| 2.0 Fast                 | **接**（主力 720p + 音频，量产）        | `doubao-seedance-2-0-fast-260128`           | `bytedance/seedance-2.0/fast/*`                          |
| 2.0 Reference            | **接**（能力，非独立模型）              | = 2.0 同 id + 参数                          | `.../reference-to-video`                                 |
| 1.0 Lite                 | **接**（廉价静音底，720p 无音频）       | `doubao-seedance-1-0-lite-{t2v,i2v}-250219` | `fal-ai/bytedance/seedance/v1/lite/*`                    |
| 1.5 Pro                  | 备用（1080p + 音频兜底，无多模态参考）  | `seedance-1-5-pro-251215`                   | `fal-ai/bytedance/seedance/v1.5/pro/*`                   |
| 1.0 Pro / 2.0 mini / 2.1 | 跳过                                    | —                                           | —                                                        |

**⑤ 结构差异（适配器要对齐）**：**Ark = 每速度档一个 unified id**（t2v/i2v/reference/audio 靠请求参数切），**fal = 每模式一个独立 slug**——适配器需把 fal 多 slug ↔ Ark 单 id+mode 字段映射。**原生音频从 1.5 Pro 起，整个 1.0 系列静音**。Ark dated id 会被 re-stamp，硬编前 console 核对。fal 命名空间：2.0 短前缀 `bytedance/...`，1.x 长前缀 `fal-ai/bytedance/seedance/...`。

**相关文件**：`src/components/business/studio-shared/pickers/BaseModelPickerPanel.tsx`（加 provider/region 文字）・`src/constants/providers.ts`（`getProviderLabel` 已有；加 `ADAPTER_REGION_LABEL` 纯展示映射）・`src/constants/models.ts`（`getProviderGroup`）・`src/components/business/ApiKeyManager.tsx`（路由面板 badge）・`src/services/providers/volcengine.adapter.ts`（Ark adapter 已就绪，BYOK 可达）。`resolveGenerationRoute`@`generate-image.service.ts:114` 与 4 个 `/api/generate*` 端点是现状功能分流，**不改**。

---

## 5. 给 Codex 的落地 change-list

> 通用规则：每删/加一个 `AI_MODELS` 模型，必须同步 7 处：**enum.ts → 对应 option 数组 → `models.ts` 的 `MODEL_MESSAGE_KEYS` + `MODEL_FAMILIES`（+ 若涉及 `RETIRED_MODEL_IDS`/`PROVIDER_FALLBACK_MAP`/`VIDEO_MODEL_PRIORITY`）→ i18n en/ja/zh 三个 `models.*` 块**。LLM-text 模型不在 enum，改 config.ts + node-studio.ts + script-breakdown.ts + llm-text.service.ts + llm-capability.ts。做完跑 `npx vitest run src/constants/`。

### `src/constants/models/enum.ts`

- **[KEEP]** image: `OPENAI_GPT_IMAGE_2`, `GEMINI_PRO_IMAGE`, `GEMINI_FLASH_IMAGE`(升 GA), `FLUX_2_PRO`, `IDEOGRAM_3`, `RECRAFT_V4_PRO`, `NOVELAI_V45_FULL`, `NOVELAI_V45_CURATED`, `ILLUSTRIOUS_XL`, `SEEDREAM_45`, `FLUX_LORA`, `FLUX_KONTEXT_MAX`, `ANIMA_PENCIL_XL`(占位不动)；视频 `SEEDANCE_20/_FAST/_REFERENCE/_FAST_REFERENCE`, `KLING_V3_PRO`, `VEO_31`；音频 `FISH_AUDIO_S2_PRO`。
- **[ADD]** image: `FLUX_2_FLASH = 'flux-2-flash'`；video: `HAPPYHORSE_10 = 'happyhorse-1.0'`, `LTX_23 = 'ltx-2.3'`。
- **[ADD]** audio: `ELEVENLABS_V3 = 'eleven-v3'`, `MINIMAX_SPEECH_28_HD = 'minimax-speech-2.8-hd'`；可选 `OPENAI_GPT_4O_MINI_TTS`, `GEMINI_25_FLASH_TTS`；（若本轮做 §3）`VOICEVOX_AIVIS = 'voicevox-aivis'`。
- **[DELETE]** image（15 个）: `SDXL`, `ANIMAGINE_XL_4`, `FLUX_2_DEV`, `FLUX_2_SCHNELL`, `RECRAFT_V3`, `SEEDREAM_50_LITE`, `SEEDREAM_40`, `SEEDREAM_30`, `SD_35_LARGE`, `NOVELAI_V4_FULL`, `NOVELAI_V3`, `GEMINI_25_FLASH_IMAGE`, `FLUX_2_MAX`, `FLUX_KONTEXT_PRO`, `PLAYGROUND_V25`。（注意：`GEMINI_FLASH_IMAGE` / `SEEDREAM_45` / `NOVELAI_V45_CURATED` 复查后**改为 KEEP**，不在删除列。）
- **[DELETE]** audio: `FAL_F5_TTS`。
- **[DELETE]** video（15 个）: `KLING_VIDEO`, `MINIMAX_VIDEO`, `LUMA_RAY_2`, `WAN_VIDEO`, `HUNYUAN_VIDEO`, `SEEDANCE_20_VOLC`, `SEEDANCE_20_FAST_VOLC`, `SEEDANCE_PRO`, `SEEDANCE_15_PRO`, `SEEDANCE_10_PRO`, `VIDU_Q3_PRO`, `PIKA_V25`, `RUNWAY_GEN45`, `RUNWAY_GEN4_TURBO`, `RUNWAY_GEN3`。
- **验证点**：删 enum 成员会让 `MODEL_MESSAGE_KEYS`/`MODEL_FAMILIES`/`RETIRED_MODEL_IDS` 里的 `[AI_MODELS.X]` 引用编译失败——这是好事，顺着 tsc 报错逐处删干净。

### `src/constants/models/image.ts`

- **[REPLACE]** `IDEOGRAM_3.externalModelId`: `'fal-ai/ideogram/v3'` → `'fal-ai/ideogram/v4'`（验证点：v4 默认 tier + `maxPromptChars:1000` 是否仍准）。
- **[REPLACE]** `GEMINI_FLASH_IMAGE.externalModelId`（image.ts:145，当前复用 enum 值 `'gemini-3.1-flash-image-preview'`）→ 显式字符串 `'gemini-3.1-flash-image'`（GA）。**不要改 enum 值本身**（99+ importers/DB/i18n 稳定键）。`-preview` 约 2026-06-25 停服（§6-Q12）。
- **[ADD]** `FLUX_2_FLASH` ModelOption：`adapterType: FAL`, `externalModelId:'fal-ai/flux-2/flash'`, `outputType:'IMAGE'`, `available:true`, `qualityTier:'budget'`, `styleTag:'general'`, `cost:1`（占位）。验证点：confirm fal credit 成本 + `supportsLora`/`maxPromptChars`。
- **[DELETE]** 上述 15 个 image 删除项的 ModelOption 块。
- **[KEEP]** `GPT_IMAGE_2`, `GEMINI_PRO_IMAGE`, `GEMINI_FLASH_IMAGE`(freeTier), `FLUX_2_PRO`, `IDEOGRAM_3`, `RECRAFT_V4_PRO`, `NOVELAI_V45_FULL`, `NOVELAI_V45_CURATED`, `ILLUSTRIOUS_XL`, `SEEDREAM_45`, `FLUX_LORA`, `FLUX_KONTEXT_MAX`, `ANIMA_PENCIL_XL`(false)。

### `src/constants/models/video.ts`

- **[ADD]** `HAPPYHORSE_10` ModelOption：`FAL`, `'alibaba/happy-horse/text-to-video'`, `i2vModelId:'alibaba/happy-horse/image-to-video'`, `available:true`, `qualityTier:'premium'`, `timeoutMs:300_000`, `videoDefaults:{generateAudio:true,resolution:'720p'}`, `cost` 按 §6-Q3 由 USD 反推。
- **[ADD]** `LTX_23` ModelOption：`FAL`, `'fal-ai/ltx-2.3/text-to-video'`, `i2vModelId:'fal-ai/ltx-2.3/image-to-video'`, `available:true`, `qualityTier:'budget'`, `videoDefaults.resolution` 按选定 tier。
- **[ADD]**（medium 置信）`SEEDANCE_20` 的 BytePlus direct 路由：不是新 ModelOption，而是 adapter 层备选路由 + feature flag；wire 前确认 ModelArk endpoint/ID。
- **[DELETE]** 上述 15 个 video 删除项的 ModelOption 块。
- **[KEEP]** `SEEDANCE_20/_FAST/_REFERENCE/_FAST_REFERENCE`, `KLING_V3_PRO`, `VEO_31`。
- **验证点**：`VIDEO_MODEL_PRIORITY`(models.ts:261) 现含 4 个 Seedance/Veo/Kling——加 HappyHorse/LTX 后补排序权重，否则它们落到 999 尾部。

### `src/constants/models/audio.ts`

- **[ADD]** `ELEVENLABS_V3`：`adapterType: ELEVENLABS`(新), `externalModelId:'eleven_v3'`, `available:true`, `qualityTier:'premium'`, `cost` 5-6（见 §6-Q8）。
- **[ADD]** `MINIMAX_SPEECH_28_HD`：`adapterType: MINIMAX`(新), `externalModelId:'speech-2.8-hd'`, `available:true`, `qualityTier:'premium'`, `cost` 5-6。
- **[ADD]**（可选 low）`OPENAI_GPT_4O_MINI_TTS`(adapter `OPENAI`, `'gpt-4o-mini-tts'`)、`GEMINI_25_FLASH_TTS`(adapter `GEMINI`, `'gemini-2.5-flash-preview-tts'`)。
- **[ADD]**（若本轮做 §3）`VOICEVOX_AIVIS`：`adapterType: VOICEVOX`(新), `available:true`, `cost:0`/低, externalModelId = speaker/style ID。
- **[DELETE]** `FAL_F5_TTS` ModelOption。
- **[KEEP]** `FISH_AUDIO_S2_PRO`。

### `src/constants/config.ts`

- **[DELETE]** `LLM_TEXT_MODEL_IDS` 里 `VOLCENGINE_DOUBAO_1_5_PRO_32K`, `DEEPSEEK_V4_FLASH`（L409-410）。
- **[KEEP]** `GEMINI_3_1_FLASH_LITE`, `GEMINI_3_5_FLASH`, `OPENAI_GPT_5_4_MINI`, **`DEEPSEEK_V4_PRO`（纯文本推理档，保留）**。
- **[ADD]**（视频 §4 选了 BytePlus）`AI_PROVIDER_ENDPOINTS.BYTEPLUS_MODELARK`（确切 base URL wire 前确认）。
- **[ADD]**（音声 ADD）`AI_PROVIDER_ENDPOINTS.MINIMAX`(`https://api.minimax.io/v1`), `ELEVENLABS`, `VOICEVOX_ENGINE_URL`(env 配置)。
- **验证点**：删 Doubao/DeepSeek-flash 前 grep `DEEPSEEK_V4_FLASH`/`VOLCENGINE_DOUBAO`——相关消费方会编译失败，逐处删（见下）。

### `src/constants/llm-capability.ts`

- **[REPLACE]** `ADAPTER_CAPABILITIES`：`[DEEPSEEK]: ['planner']`（**去掉 `assistant`**——assistant 含看图反推需要 vision，DeepSeek 文本版进不去会 throw；planner=剧本/分镜文本规划是它的强项，**保留**）、`[VOLCENGINE]: []`（doubao 文本退出 LLM-text）。核心修复 = `assistant` scope 不再混入 vision-blind adapter。
- **验证点**：确认 `assistant`/看图反推只路由到 vision adapter（Gemini/OpenAI），且 route resolver 在 `imageData` 存在时跳过 DeepSeek（否则命中 `deepseekTextCompletion` 的 imageData throw，`llm-text.service.ts:487`）；`llm-capability.test.ts` 同步更新断言。

### `src/constants/providers.ts`

- **[ADD]** `AI_ADAPTER_TYPES`：`MINIMAX = 'minimax'`, `ELEVENLABS = 'elevenlabs'`，（§3）`VOICEVOX = 'voicevox'`。三处同步：enum + `AI_ADAPTER_TYPE_OPTIONS` + 五个 `Record<AI_ADAPTER_TYPES, …>`（`DEFAULT_PROVIDER_CONFIGS`/`ADAPTER_KEY_HINTS`/`ADAPTER_DEFAULT_COSTS`/`ADAPTER_CUSTOM_MODEL_EXAMPLES`/`ADAPTER_API_GUIDES`）+ `getProviderGroup`(models.ts) + `ProviderGroup` 联合类型 + `PROVIDER_GROUP_ORDER`。VOICEVOX 无 key → `ADAPTER_KEY_HINTS` 给空/占位，**不进 QuickSetupDialog key-gate**（服务端自有 endpoint）。
- **[REPLACE]** `PROVIDER_FALLBACK_MAP`（L214-225）：(a) 把所有 `gemini-3.1-flash-image-preview` 字符串（key 与 value）改成 GA `gemini-3.1-flash-image`——**该模型保留，只升 GA，兜底链保持有效**；(b) 删除 `'flux-2-dev': 'flux-2-schnell'`（两者都删），并把任何指向 `flux-2-dev`/`flux-2-schnell` 的兜底重指到保留模型（如改 `flux-2-flash` 或 `gemini-3.1-flash-image`）。验证点：所有 fallback 的 key 与 value 必须都是保留模型 id。
- **[KEEP]** 是否删 `RUNWAY`/`VOLCENGINE`/`DEEPSEEK` adapter type 本身——**先不删**，因为 enum 删除是 model 层；adapter type 删除影响 BYOK custom-model 路径，单列为 §6-Q5/Q6/Q10。

### `src/messages/{en,ja,zh}.json`

- **[DELETE]** 三文件 `models.*` 块里所有删除模型的 key（image：`sdxl`,`animagineXl4`,`flux2Dev`,`flux2Schnell`,`recraftV3`,`seedream50Lite`,`seedream40`,`seedream30`,`sd35Large`,`novelaiV4Full`,`novelaiV3`,`gemini25FlashImage`,`flux2Max`,`fluxKontextPro`,`playgroundV25`；audio：`falF5Tts`；video：`klingVideo`,`minimaxVideo`,`lumaRay2`,`wanVideo`,`hunyuanVideo`,`seedance20Volc`,`seedance20FastVolc`,`seedancePro`,`seedance15Pro`,`seedance10Pro`,`viduQ3Pro`,`pikaV25`,`runwayGen45`,`runwayGen4Turbo`,`runwayGen3`）。**注意**：`geminiFlashImage`/`seedream45`/`novelaiV45Curated` 复查后保留，不删。
- **[ADD]** 三文件同步加：`flux2Flash`,`happyhorse10`,`ltx23`,`elevenV3`,`minimaxSpeech28Hd`，可选 `gpt4oMiniTts`/`geminiFlashTts`，（§3）`voicevoxAivis`——每个 `{label, description}`，并在 `models.ts` 的 `MODEL_MESSAGE_KEYS` 加对应映射。
- **[REPLACE]** `ideogram3.label/description` 文案 v3 → v4（en/ja/zh 三处）。
- **验证点**：跑 `i18n-check` skill 确认三文件 key 完全对齐，无遗漏/多余。

### LLM-text 消费方（非 models 层）

- **[DELETE]** `node-studio.ts:112-116`（`NODE_STUDIO_ASSISTANT_ROUTE_MODELS` 的 DeepSeek 条目）——assistant 含看图反推，DeepSeek 文本版会 throw，仅从 assistant 路由移除（planner 路由保留）。
- **[KEEP]** `script-breakdown.ts:47-51`（`SCRIPT_PLANNER_MODELS.deepseek`）——剧本拆解是纯文本，DeepSeek 是合适 planner，**保留**。仅删该处的 doubao/volcengine planner 项（若有）。
- **[REPLACE]** `llm-text.service.ts`：删 `103-104`(VOLCENGINE) + `LLM_TEXT_ADAPTERS`(L90) 的 VOLCENGINE + `LLM_TEXT_MODELS`/`LLM_TEXT_LABELS` 的 VOLCENGINE 项；**保留 DEEPSEEK**(L88/101)，`DEEPSEEK_V4_PRO` 仍是 DeepSeek 默认。验证点：route resolver 遇 `imageData` 时不得选 DeepSeek；`resolveLlmTextRoute` 兜底到平台 Gemini key 仍工作（§6-Q11）。
- **新增 adapter 实现**：`elevenlabs.adapter.ts`、`minimax.adapter.ts`（audio path，`ProviderAudioInput→ProviderAudioResult`，`withRetry` 包裹）；OPENAI/GEMINI adapter 需补 TTS 代码路径（当前仅图像）；（§3）`voicevox.adapter.ts`（`/audio_query`→`/synthesis`，timestamps 留空，指向 self-host AivisSpeech）。全部在 `src/services/providers/`，注册进 `registry.ts`。

---

## 6. 需用户拍板的开放问题

1. **ANIMA_PENCIL_XL enum**：确认是彻底删 enum 占位，还是保留 `available:false` 占位（Civitai LoRA 库靠它把 Anima baseModel LoRA 路由到"open in Civitai"）。删了要同步改 LoRA 路由 fallback。
2. **HappyHorse-1.0 长期性**：arena 报告称它"登顶后一度从部分平台消失"。wire enum+i18n 前，确认 fal `alibaba/happy-horse/*` 端点稳定在线、非临时挂牌。
3. **LTX-2.3 默认分辨率 + 视频 credit 映射**：$0.06/s 是 1080p，1440p/2160p 跳 $0.12/$0.24——先定默认分辨率再设 `videoDefaults`；HappyHorse/LTX 的内部 credit 成本要从已核 USD 单价反推，保持计费比例（LTX 最低、Veo 最高）。
4. **BytePlus ModelArk 全球 API 活性**：对国际 API 是否 full GA vs playground-only 有冲突。wire direct adapter 前必须确认可用 USD 计费 endpoint + 确切 ModelArk model ID；未确认前 fal 保持唯一可靠路线。
5. **RUNWAY adapter 去留**：三个 Runway video 全删后，是否还有 BYOK custom-model 路径用 `AI_ADAPTER_TYPES.RUNWAY` / `RUNWAY_API`？无则可顺带砍掉整个 adapter 依赖。若将来要专业运镜控制，gen4.5 是 re-add 目标（见 §2.3 复查记录）。
6. **是否运营 CN/ByteDance 主体**：是 → VolcEngine-direct(~$0.13/s) 值得保留；否（默认假设）→ 删 `-volc` 重复，用 BytePlus 省钱。
7. **ElevenLabs PVC 路由**：PVC 尚未对 `eleven_v3` 完全优化。高保真专业克隆是否让 adapter 把 PVC voice 路由到 `eleven_multilingual_v2` 兜底、`eleven_v3` 只用于即时/库声音？这是真实质量悬崖，wire 前定。
8. **Voice 最小 vs 全量 + credit 跨度**：要绝对最小 3（Fish+Eleven+MiniMax），还是含两个近零成本工具合成（gpt-4o-mini-tts/gemini-flash-tts）？且 Fish ~$15/M vs MiniMax&Eleven ~$100/M 是 ~6-7x 跨度——`audio.ts` 的 per-model credit 是否反映该跨度（如 Fish=2、MiniMax/Eleven=5-6）还是保持平价？
9. **删 VolcEngine `enhance` 授权前**：确认无 enhance-only 流程依赖它（`llm-capability.ts:12`），且 VolcEngine 仍服务 Seedream/Doubao IMAGE 模型——确认从 LLM_TEXT 摘除 `doubao-1.5-pro-32k` 不影响图像路径（它们引用不同 externalModelId，应独立，但需验 config.ts + i18n 三语清理）。
10. **VOICEVOX/AivisSpeech 本轮是否做**：这是基础设施级工作（自托管引擎容器 + Worker→provider→R2→callback），远重于加 hosted model。本轮做还是单独排期？做的话只暴露 CC0/ACML 免署名声音。
11. **是否有用户把 DeepSeek/VolcEngine key 绑为唯一 LLM key**：`resolveLlmTextRoute` 会兜底到平台 Gemini key 保活，但需确认 `script-breakdown.ts`/`node-studio.ts` 里的 per-call modelId override 不会 pin 到已删 model id。
12. **Gemini Flash Image 停服紧迫度**：`gemini-3.1-flash-image-preview` 约 2026-06-25 停服（约 10 天内）。这是全报告唯一近期会打断生产的项——建议**优先**把 `GEMINI_FLASH_IMAGE.externalModelId` 升 GA `gemini-3.1-flash-image`（独立于整体精简，可先单独 ship）。

---

## 7. 精简前后对比（净数量）

| 类别            | 精简前 available | 精简后                             | 删除                          | 新增                                                     |
| --------------- | ---------------- | ---------------------------------- | ----------------------------- | -------------------------------------------------------- |
| Text→Text (LLM) | 6                | **4**                              | 2 (doubao, deepseek-v4-flash) | 0                                                        |
| Text→Image      | 20               | **13** (12 旧 KEEP + 1 ADD)        | 15 (8 available + 7 已禁用)   | 1 (flux-2-flash) + ideogram v4 升级 + gemini flash 升 GA |
| Text→Video      | 6                | **8** (6 KEEP + 2 ADD)             | 15 (全 retired)               | 2 (happyhorse, ltx-2.3)                                  |
| Text→Voice      | 1                | **3 必加 + 2 可选 (+AivisSpeech)** | 1 (fal-f5-tts)                | 2 必 (eleven_v3, minimax) + 2 选 + 可选 AivisSpeech      |

**新增 adapter 清单**：`MINIMAX`、`ELEVENLABS`、（可选）`VOICEVOX`；`OPENAI`/`GEMINI` 需补 TTS 代码路径；（可选）`BYTEPLUS_MODELARK` 视频 direct 路由。

**复查捞回汇总（按"独占特色"重过删除清单的结果）**：

- 图片捞回 3 个：`gemini-3.1-flash-image`（唯一免费档 + Arena 顶档）、`seedream-4.5`（中文语义/图内中文）、`nai-diffusion-4-5-curated`（可控动漫档）。
- 视频维持全删，但 3 个标注 re-add 触发条件：`runway-gen4.5`（导演级控制）、`vidu-q3-pro`（动漫向视频）、`pika-v2.5`（创意特效 niche）。
- LLM 捞回 1 个：`deepseek-v4-pro`（中文文本推理，按能力分流不接拆解图片）。

---

## 8. 新增模型 API 接口规格 (供 Codex 实现)

> 本节给出每个 ADD 的实拍接口规格，目标是 Codex 不离开本文即可接线。所有 endpoint / 字段名 / model id / header / env var 保留英文；说明用中文。标 **⚠ verify** 的项必须在 wire 前用 live 请求核对（snapshot id 漂移、preview 限流、定价倍率、beta 门控）。基准日期 2026-06-15。

### 8.0 ADD → adapter → env var 速查表

先建 provider 接线再填模型配置。下表已对照 `src/constants/providers.ts`（`AI_ADAPTER_TYPES` enum）与 `src/services/providers/registry.ts` 现状核实。

| ADD model                       | accessVia | adapter                 | 新建 or 复用                           | 主要 env var                                              |
| ------------------------------- | --------- | ----------------------- | -------------------------------------- | --------------------------------------------------------- |
| `flux-2-flash`                  | fal       | `falAdapter`            | 复用                                   | `FAL_KEY`                                                 |
| `happyhorse-1.0`                | fal       | `falAdapter`            | 复用                                   | `FAL_KEY`                                                 |
| `ltx-2.3`                       | fal       | `falAdapter`            | 复用                                   | `FAL_KEY`                                                 |
| `ideogram/v4`（endpoint 修正）  | fal       | `falAdapter`            | 复用（仅改 slug）                      | `FAL_KEY`                                                 |
| `eleven_v3`                     | direct    | `elevenlabs.adapter.ts` | **新建** `AI_ADAPTER_TYPES.ELEVENLABS` | `ELEVENLABS_API_KEY`                                      |
| `speech-2.8-hd`                 | direct    | `minimax.adapter.ts`    | **新建** `AI_ADAPTER_TYPES.MINIMAX`    | `MINIMAX_API_KEY` + `MINIMAX_GROUP_ID`                    |
| `gpt-4o-mini-tts`               | direct    | `openai.adapter.ts`     | 复用（新增 `generateAudio` path）      | `OPENAI_API_KEY`                                          |
| `gemini-2.5-flash-preview-tts`  | direct    | `gemini.adapter.ts`     | 复用（新增 `generateAudio` path）      | `GEMINI_API_KEY`                                          |
| AivisSpeech / VOICEVOX          | self-host | `voicevox.adapter.ts`   | **新建** `AI_ADAPTER_TYPES.VOICEVOX`   | `VOICEVOX_ENGINE_URL`（alias `AIVIS_ENGINE_URL`，无 key） |
| Seedance 2.0（direct USD 路由） | direct    | `volcengineAdapter`     | 复用（仅改 baseUrl + model id + key）  | `BYTEPLUS_API_KEY`（alias `MODELARK_API_KEY`）            |

**新增 enum 一共 3 个**：`ELEVENLABS`、`MINIMAX`、`VOICEVOX`。每新增一个都要同步本节末尾「接入现有 adapter 约定」里列的五个 Record + `AI_ADAPTER_TYPE_OPTIONS` + `getProviderGroup` + `ProviderGroup` 联合类型。

---

### 8.1 fal-hosted adds（复用 `falAdapter`，无需新 adapter）

四个模型全部走项目现有 fal queue：`POST https://queue.fal.run/<slug>` → `{ request_id }` → 轮询 `GET .../requests/<id>/status` 至 `COMPLETED` → `GET .../requests/<id>` 取结果。`src/services/providers/fal.adapter.ts` + webhook route 已实现 submit/status/webhook，**只需在 constants 层加模型配置（slug + 输入字段映射 + 输出 url 提取）**。

- 输出提取统一：图片 `output.images[].url`，视频 `output.video.url`。
- **Auth**：`Authorization: Key <FAL_KEY>`（已接线）。
- **⚠ slug 前缀陷阱**：fal 有两个命名空间——`fal-ai/*`（FLUX.2、LTX-2.3）和裸厂商命名空间（`alibaba/happy-horse/*`、`ideogram/v4`）。queue base path 必须逐字带全 slug，**不要自动补 `fal-ai/` 前缀**。
- **⚠ 变体即独立 slug**：i2v / ref / audio / edit / fast 都是不同 slug，不是 param。

#### 8.1.1 FLUX.2 [flash] — text-to-image

一行定位：BFL 旗舰 t2i 的低价档（`$0.005/MP`）。accessVia=fal，复用 adapter。

| 用途                                 | method | slug                       | 同步模式   |
| ------------------------------------ | ------ | -------------------------- | ---------- |
| text-to-image                        | POST   | `fal-ai/flux-2/flash`      | queue-poll |
| image-edit / multi-reference（可选） | POST   | `fal-ai/flux-2/flash/edit` | queue-poll |

| name             | type                     | 必填 | 说明                                                                                                                         |
| ---------------- | ------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| `prompt`         | string                   | ✓    | 文本提示，无公开字符上限                                                                                                     |
| `image_size`     | enum \| `{width,height}` |      | 默认 `landscape_4_3`；enum: `square_hd/square/portrait_4_3/portrait_16_9/landscape_4_3/landscape_16_9`；自定义 512–2048px/边 |
| `num_images`     | integer                  |      | 默认 1，范围 1–4                                                                                                             |
| `guidance_scale` | float                    |      | 默认 2.5                                                                                                                     |
| `seed`           | integer                  |      | 省略则随机，输出里回传                                                                                                       |
| `output_format`  | enum                     |      | 默认 `png`；`jpeg/png/webp`                                                                                                  |
| `image_urls`     | list\<string\>           |      | **仅 `/edit` slug**；多参考图，prompt 里按编号引用                                                                           |

响应：`{ images:[{url,width,height,content_type}], seed, has_nsfw_concepts:bool[], prompt }`；取 `output.images[0].url`（`https://*.fal.media/...`）。

示例 body：

```json
{
  "prompt": "a neon koi pond at dusk",
  "image_size": "landscape_4_3",
  "num_images": 1,
  "guidance_scale": 2.5,
  "output_format": "png"
}
```

坑：**flash 不支持 LoRA**——LoRA 在独立且更贵的 `fal-ai/flux-2/lora`（`$0.021/MP`）/ `fal-ai/flux-2/lora/edit`。base flash slug **无图片输入**，参考图/编辑走 `/edit` slug，`/edit` 对 input+output 都按 `$0.005/MP` 计费。
来源：https://fal.ai/models/fal-ai/flux-2/flash/api ・ https://fal.ai/models/fal-ai/flux-2/flash/edit

#### 8.1.2 HappyHorse-1.0 — text/image/reference/edit-to-video（自带原生音频）

一行定位：阿里系视频模型，音频原生联合生成（音效+多语口型），无音频开关、无加价。accessVia=fal，复用 adapter。

| 用途                               | method | slug                                     | 同步模式   |
| ---------------------------------- | ------ | ---------------------------------------- | ---------- |
| text-to-video                      | POST   | `alibaba/happy-horse/text-to-video`      | queue-poll |
| image-to-video（首帧）             | POST   | `alibaba/happy-horse/image-to-video`     | queue-poll |
| reference-to-video（1–9 主体参考） | POST   | `alibaba/happy-horse/reference-to-video` | queue-poll |
| video-edit                         | POST   | `alibaba/happy-horse/video-edit`         | queue-poll |

| name           | type           | 必填             | 说明                                                                     |
| -------------- | -------------- | ---------------- | ------------------------------------------------------------------------ |
| `prompt`       | string         | t2v ✓ / i2v 可选 | 最长 2500 字符；ref 模式用 `character1/character2` 指代主体              |
| `image_url`    | string         | **i2v ✓**        | 首帧图（singular）；JPEG/PNG/BMP/WEBP，≥300px，宽高比 1:2.5–2.5:1，≤10MB |
| `image_urls`   | list\<string\> | **ref ✓**        | 1–9 参考图（list），最短边 ≥400px，每张 ≤10MB                            |
| `resolution`   | enum           |                  | 默认 `1080p`；`720p/1080p`                                               |
| `duration`     | integer        |                  | 默认 5，**普通整数 3–15**（非受限 enum）                                 |
| `aspect_ratio` | enum           |                  | 默认 `16:9`；`16:9/9:16/1:1/4:3/3:4`（i2v 无此字段，由输入图推导）       |
| `seed`         | integer        |                  | 0–2147483647                                                             |

响应：`{ video:{url,content_type,width,height,fps,duration,num_frames,...}, seed }`；取 `output.video.url`。

示例 body：

```json
{
  "prompt": "a horse galloping on a beach at sunset, ambient waves",
  "resolution": "1080p",
  "duration": 5,
  "aspect_ratio": "16:9"
}
```

坑：**音频永远 on、内建、免费**——无 `generate_audio`、无 `audio_url`/`audio_urls`、无 voice/lip-sync 参数，**不要设计独立音频输入字段**。无 `negative_prompt`。`image_to_video` 用 `image_url`（singular），`reference_to_video` 用 `image_urls`（list），两者是不同 slug+字段，**勿混用**。计价 `$0.14/s @720p`、`$0.28/s @1080p`，四模式同价。
来源：https://fal.ai/models/alibaba/happy-horse/text-to-video/api ・ https://fal.ai/happyhorse-1.0

#### 8.1.3 LTX-2.3 — Lightricks 视频族（Pro/Fast/audio/extend）

一行定位：分档视频模型，Fast 档便宜，有原生音频开关 + 独立 audio-to-video slug。accessVia=fal，复用 adapter。

| 用途                      | method | slug                                                        | 同步模式   |
| ------------------------- | ------ | ----------------------------------------------------------- | ---------- |
| t2v Pro / Fast            | POST   | `fal-ai/ltx-2.3/text-to-video` / `.../text-to-video/fast`   | queue-poll |
| i2v Pro / Fast            | POST   | `fal-ai/ltx-2.3/image-to-video` / `.../image-to-video/fast` | queue-poll |
| audio-to-video            | POST   | `fal-ai/ltx-2.3/audio-to-video`                             | queue-poll |
| extend-video（>20s 链式） | POST   | `fal-ai/ltx-2.3/extend-video`                               | queue-poll |
| retake-video              | POST   | `fal-ai/ltx-2.3/retake-video`                               | queue-poll |

| name             | type      | 必填      | 说明                                                                           |
| ---------------- | --------- | --------- | ------------------------------------------------------------------------------ |
| `prompt`         | string    | t2v/i2v ✓ | a2v 仅在无 `image_url` 时必填                                                  |
| `image_url`      | string    | **i2v ✓** | 公开 URL 或 base64 data URI；a2v 可选                                          |
| `end_image_url`  | string    |           | 仅 i2v，过渡视频的目标末帧                                                     |
| `audio_url`      | string    | **a2v ✓** | 音频时长须 2–20s                                                               |
| `resolution`     | enum      |           | 默认 `1080p`；`1080p/1440p/2160p`（a2v 不暴露此字段）                          |
| `duration`       | enum(int) |           | 默认 6；标准/Pro: `6/8/10`；Fast 可到 `12/14/16/18/20`，**但仅在 25fps+1080p** |
| `aspect_ratio`   | enum      |           | 默认 `16:9`(t2v)/`auto`(i2v,a2v)；`auto/16:9/9:16`                             |
| `fps`            | enum      |           | 默认 25；`24/25/48/50`                                                         |
| `generate_audio` | boolean   |           | 默认 `true`，原生音频开关（t2v/i2v；a2v 无此字段）                             |

响应：`{ video:{url,content_type:'video/mp4',width,height,fps,duration,num_frames,...} }`；取 `output.video.url`。

示例 body：

```json
{
  "prompt": "a paper boat drifting down a rain gutter, cinematic",
  "resolution": "1080p",
  "duration": 6,
  "aspect_ratio": "16:9",
  "fps": 25,
  "generate_audio": true
}
```

坑：模型级宣称支持 LoRA，但 fal schema **不暴露 `loras` 字段**——别加。**无 `seed`、无 `negative_prompt`**。`duration` 是受限 enum（区别于 HappyHorse 的自由整数）；`resolution` 档位（1080p/1440p/2160p）也和 HappyHorse（720p/1080p）不同。Fast vs Pro 是 slug 后缀 `/fast`，不是 param。计价示例：i2v Fast `$0.04/$0.08/$0.16 per s`（1080p/1440p/2160p），i2v Pro `$0.06/$0.12/$0.24`，a2v/extend `$0.10/s`。
来源：https://fal.ai/models/fal-ai/ltx-2.3/text-to-video/api ・ https://fal.ai/models/fal-ai/ltx-2.3/audio-to-video/api

#### 8.1.4 Ideogram v4 — **endpoint 修正说明（非新增，是改 slug）**

一行定位：项目当前 `fal-ai/ideogram/v3` 必须替换为 **`ideogram/v4`**（V4.0q）。accessVia=fal，复用 adapter，仅改 constants 里的 slug + 字段映射。

| 用途                 | method | slug                         | 同步模式   |
| -------------------- | ------ | ---------------------------- | ---------- |
| text-to-image        | POST   | `ideogram/v4`                | queue-poll |
| image-to-image       | POST   | `ideogram/v4/image-to-image` | queue-poll |
| text-to-image + LoRA | POST   | `ideogram/v4/lora`           | queue-poll |
| LoRA trainer         | POST   | `ideogram/v4/trainer`        | queue-poll |

关键字段差异（vs v3）：

| name                                            | type                     | 必填 | 说明                                                                               |
| ----------------------------------------------- | ------------------------ | ---- | ---------------------------------------------------------------------------------- |
| `prompt`                                        | string                   | ✓    | 无公开字符上限                                                                     |
| `image_size`                                    | enum \| `{width,height}` |      | 默认 `square_hd`；**v4 用 `image_size`，无独立 `aspect_ratio`**                    |
| `rendering_speed`                               | enum                     |      | 默认 `BALANCED`；`TURBO/BALANCED/QUALITY` —— **档位是 param，不是 slug 子路径**    |
| `expansion_model`                               | enum                     |      | 默认 `Medium`；`None/Medium/Large`（v4 把 v3 的 `expand_prompt` bool 改成此 enum） |
| `acceleration`                                  | enum                     |      | 默认 `none`；`none/low/regular/high`                                               |
| `output_format`                                 | enum                     |      | 默认 `jpeg`；`jpeg/png`                                                            |
| `num_images` / `seed` / `enable_safety_checker` | int/int/bool             |      | 常规                                                                               |

响应：`{ images:[{url,width,height,content_type}], prompt, seed, has_nsfw_concepts:bool[] }`；取 `output.images[0].url`。

示例 body：

```json
{
  "prompt": "vintage travel poster of Kyoto, bold typography",
  "image_size": "portrait_4_3",
  "rendering_speed": "BALANCED",
  "expansion_model": "Medium",
  "num_images": 1
}
```

坑：**slug 无 `fal-ai/` 前缀**——是 `ideogram/v4` 不是 `fal-ai/ideogram/v4`。**无 Turbo/Default/Quality 子路径**，档位靠 `rendering_speed`。v4 base schema **不再暴露** v3 的 `negative_prompt/style/style_preset/style_codes/color_palette/image_urls`——若项目依赖这些，**⚠ verify** live page 或改用变体 slug。**⚠ verify** v4 定价（约 TURBO ~$0.03 / BALANCED ~$0.06 / QUALITY ~$0.09 per image），项目现有 v3 cost 配置需重核。
来源：https://fal.ai/models/ideogram/v4/api ・ https://fal.ai/models/fal-ai/ideogram/v3/api

---

### 8.2 ElevenLabs `eleven_v3`（新建 adapter）

一行定位：ElevenLabs 表现力旗舰 TTS（research preview）。accessVia=direct，**需新建 `AI_ADAPTER_TYPES.ELEVENLABS` + `elevenlabs.adapter.ts`**，实现 `generateAudio`（同步，最接近 `fishAudioAdapter`）。

| 用途                                       | method | path                                   | 同步模式      |
| ------------------------------------------ | ------ | -------------------------------------- | ------------- |
| text-to-speech（整段 buffer）              | POST   | `/v1/text-to-speech/{voice_id}`        | sync          |
| TTS streaming（同 body）                   | POST   | `/v1/text-to-speech/{voice_id}/stream` | sync(chunked) |
| list-voices（声音库轴）                    | GET    | `/v2/voices`                           | sync          |
| voice-clone IVC（即时克隆，返回 voice_id） | POST   | `/v1/voices/add`（multipart）          | sync          |
| list models                                | GET    | `/v1/models`                           | sync          |

**Auth**：header `xi-api-key: <ELEVENLABS_API_KEY>`（**不是** `Authorization: Bearer`——与现有所有 adapter 不同）。建议 env var `ELEVENLABS_API_KEY`，key 前缀 `sk_...`。baseUrl `https://api.elevenlabs.io`（区域备选 `api.us/eu/in/sg.*`）。

| name             | type              | 必填 | 说明                                                                                                                                      |
| ---------------- | ----------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `text`           | string(body)      | ✓    | eleven_v3 硬上限 ~5000 字符/请求；写入 `maxPromptChars:5000` 做 gate                                                                      |
| `voice_id`       | string(**path**)  | ✓    | 取自 `/v2/voices` 或克隆返回值；映射 `ProviderAudioInput.voiceId`                                                                         |
| `model_id`       | string(body)      |      | 设 `eleven_v3`（省略默认 `eleven_multilingual_v2`）；来自 `externalModelId`                                                               |
| `voice_settings` | object(body)      |      | `{stability 0–1=0.5, similarity_boost 0–1=0.75, style 0–1=0, use_speaker_boost=true, speed=1.0}`；`speed` 映射 `ProviderAudioInput.speed` |
| `output_format`  | string(**query**) |      | 默认 `mp3_44100_128`；如 `mp3_22050_32/opus_48000_128/pcm_24000/wav_44100`；由 `format/sampleRate/mp3Bitrate` 推导                        |
| `language_code`  | string(body)      |      | ISO 639-1，可选（v3 自动检测 70+ 语言）                                                                                                   |
| `seed`           | integer(body)     |      | 0–4294967295                                                                                                                              |

响应：成功为 **raw audio bytes**（默认 mp3，无 duration 字段）。处理同 `fishAudioAdapter`：`response.arrayBuffer()` → 包成 `data:audio/mpeg;base64,...` 或上传 R2；**duration 按 buffer 估算**（mp3 ~16000 bytes/sec，复用 fish 的估算分支）。错误为 JSON（422/401），`humanizeProviderError` 已能解析 `{detail:[...]}`/`{message}`。`/v2/voices` 返回 `{voices:[{voice_id,name,category,labels,preview_url,settings}], next_page_token, ...}`。

示例 request：

```bash
curl -X POST 'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128' \
  -H 'xi-api-key: $ELEVENLABS_API_KEY' -H 'Content-Type: application/json' \
  -d '{"text":"The first move is what sets everything in motion.","model_id":"eleven_v3","voice_settings":{"stability":0.5,"similarity_boost":0.75,"style":0.0,"use_speaker_boost":true,"speed":1.0}}' --output out.mp3
```

坑：(1) auth header 是 `xi-api-key` 不是 Bearer。(2) `output_format` 在 **query**，`text/model_id/voice_settings` 在 **body**——易混。(3) 响应是二进制无 duration，必须估算。(4) **克隆轴用 IVC（`/v1/voices/add`），不要 PVC**——v3 下 PVC 未优化、质量差。(5) v3 字符上限 ~5000，长文需 chunk（可用 `previous_text`/`next_text` 续接）。(6) **⚠ verify** research preview 定价倍率（曾有「80% off」促销期），约 `$0.10/1k chars`（Flash/Turbo 半价）；PixelVault credit cost 建议 ~3（比 Fish 的 cost:2 贵）。
来源：https://elevenlabs.io/docs/api-reference/text-to-speech/convert ・ https://elevenlabs.io/docs/api-reference/voices/search ・ https://elevenlabs.io/blog/eleven-v3

---

### 8.3 MiniMax `speech-2.8-hd`（新建 adapter）

一行定位：MiniMax (Hailuo) HD TTS，最新 HD 档。accessVia=direct，**需新建 `AI_ADAPTER_TYPES.MINIMAX` + `minimax.adapter.ts`**，同步 `generateAudio`，模板 = `fishAudioAdapter`。**与现有 `volcengineAdapter`（VolcEngine/Doubao）是两家公司，绝不复用其 adapter 或 key。**

| 用途                                            | method | path                                                               | 同步模式 |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------ | -------- |
| text-to-speech（T2A v2，非流式）                | POST   | `/v1/t2a_v2?GroupId={MINIMAX_GROUP_ID}`                            | sync     |
| TTS streaming（body 设 `stream:true`，同 path） | POST   | `/v1/t2a_v2?GroupId=...`                                           | SSE      |
| voice-clone 上传 → file_id                      | POST   | `/v1/files/upload?GroupId=...`（multipart，`purpose=voice_clone`） | sync     |
| voice-clone 注册 → voice_id                     | POST   | `/v1/voice_clone?GroupId=...`                                      | sync     |
| list-voices                                     | POST   | `/v1/get_voice?GroupId=...`（body `{"voice_type":"all"}`）         | sync     |

**Auth（两段）**：(1) header `Authorization: Bearer <MINIMAX_API_KEY>` + `Content-Type: application/json`；(2) **每个 endpoint 都要 URL query `?GroupId=<MINIMAX_GROUP_ID>`**。两个 env var：`MINIMAX_API_KEY` + `MINIMAX_GROUP_ID`。baseUrl `https://api.minimax.io`（intl/USD；**⚠ CN 版 `api.minimaxi.com` key 不互通**，PixelVault 用 `.io`）。

| name             | type    | 必填 | 说明                                                                                                                                   |
| ---------------- | ------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `model`          | string  | ✓    | 设 `speech-2.8-hd`；同 adapter 可用 `speech-2.8-turbo/speech-2.6-hd/...`。**存进 `externalModelId`**，便于 2.6→2.8 一行升级            |
| `text`           | string  | ✓    | ≤10000 字符（>3000 建议 `stream:true`）；支持内联情感如 `(sighs)/(laughs)`                                                             |
| `voice_setting`  | object  | ✓    | `{voice_id(必填，如 'English_expressive_narrator'), speed 0.5–2.0=1, vol 0–10=1, pitch -12..12=0, emotion happy/sad/.../neutral/auto}` |
| `audio_setting`  | object  |      | `{sample_rate 8000–44100, bitrate 32000–256000(MP3), format mp3/pcm/flac/wav/opus, channel 1/2}`；默认 32000Hz/128000/mp3/mono         |
| `output_format`  | string  |      | 默认 `hex`（内联 hex bytes 在 `data.audio`）；`url` 则返回可下载 URL                                                                   |
| `language_boost` | string  |      | 32 语言偏置，`auto` 自动检测                                                                                                           |
| `stream`         | boolean |      | 默认 false；true → SSE，块以 `\n\n` 分隔，`status:1` 携带 hex，`status:2` 为汇总（忽略其 audio）                                       |

响应（非流式 JSON）：`{ data:{audio:<hex>, status:2}, extra_info:{audio_length(ms), usage_characters, ...}, base_resp:{status_code, status_msg} }`。**解码**：`data.audio` 是 **HEX 不是 base64**——`Buffer.from(json.data.audio,'hex')`，再包 `data:audio/mpeg;base64,${buf.toString('base64')}` 或上传 R2。`extra_info.audio_length` 给真实 duration（ms→s）。**`base_resp.status_code !== 0` 即失败（即使 HTTP 200）**：1004 auth、1008 余额不足、1039 限流、2013 参数错——必须显式检查。

示例 request：

```bash
curl -X POST 'https://api.minimax.io/v1/t2a_v2?GroupId=$MINIMAX_GROUP_ID' \
  -H 'Authorization: Bearer $MINIMAX_API_KEY' -H 'Content-Type: application/json' \
  -d '{"model":"speech-2.8-hd","text":"the real danger is the people who think machines can think.","stream":false,"output_format":"hex","language_boost":"auto","voice_setting":{"voice_id":"English_expressive_narrator","speed":1,"vol":1,"pitch":0,"emotion":"happy"},"audio_setting":{"sample_rate":32000,"bitrate":128000,"format":"mp3","channel":1}}'
```

坑：(1) **host 陷阱**——与 VolcEngine/Doubao 完全不同公司，勿复用 `volcengine.adapter.ts`。(2) intl(.io) vs CN(.minimaxi.com) key 不互通。(3) `GroupId` 是必填 query，key 在 header，易漏。(4) `data.audio` 是 hex，解错会得到双倍长度乱码。(5) 错误看 `base_resp.status_code` 不是 `response.ok`。(6) 版本漂移快（2.6→2.8），id 放 `externalModelId`。(7) 限流按账户/tier，`withRetry()` + 断路器包裹，`status_code 1039` 当 throttle。**⚠ verify** 定价（HD 约 `$100/1M chars`，turbo ~$50/1M；克隆约 `$3/voice` 一次性 + 按字符）。
来源：https://platform.minimax.io/docs/api-reference/speech-t2a-http ・ https://platform.minimax.io/docs/guides/speech-voice-clone

---

### 8.4 OpenAI `gpt-4o-mini-tts` + Gemini `2.5-flash-preview-tts`（复用现有 adapter，新增 TTS path）

两者都 **复用现有 adapter 的 auth + baseUrl**，但要在 `openai.adapter.ts` / `gemini.adapter.ts` 各加一个新方法（如 `generateSpeech`，挂到 `ProviderAdapter` 接口、capability flag 守门）——现有 `generateImage` 解析 JSON 图片数据，与 TTS 的二进制/PCM 输出不兼容，**不能复用 `generateImage` 路径**。

#### 8.4.1 OpenAI `gpt-4o-mini-tts`

一行定位：可 steer 语气的 OpenAI mini TTS。accessVia=direct，adapter=`openAiAdapter`（复用）。

| 用途           | method | path               | 同步模式 |
| -------------- | ------ | ------------------ | -------- |
| text-to-speech | POST   | `/v1/audio/speech` | sync     |

**Auth**：`Authorization: Bearer <OPENAI_API_KEY>`（同现有 image 调用）。baseUrl 用 `AI_PROVIDER_ENDPOINTS.OPENAI_CHAT`（`https://api.openai.com/v1`）+ `/audio/speech`——**注意现有 `AI_PROVIDER_ENDPOINTS.OPENAI` 指向 `/v1/images`，是 image-only**。

| name              | type   | 必填 | 说明                                                                                   |
| ----------------- | ------ | ---- | -------------------------------------------------------------------------------------- |
| `model`           | string | ✓    | `gpt-4o-mini-tts`                                                                      |
| `input`           | string | ✓    | ≤2000 input tokens；input + instructions 都计费                                        |
| `voice`           | string | ✓    | `alloy/ash/ballad/coral/echo/fable/marin/cedar/nova/onyx/sage/shimmer/verse`（无默认） |
| `instructions`    | string |      | 语气引导，如 "Speak in a cheerful tone."（仅 mini-tts 生效）                           |
| `response_format` | string |      | `mp3`(默认)/`opus/aac/flac/wav/pcm`；`pcm`=24kHz 16-bit mono 无头                      |
| `speed`           | number |      | 0.25–4.0 默认 1.0。**⚠ gpt-4o-mini-tts 实际忽略 `speed`**——改用 `instructions` 控节奏  |

响应：**raw audio bytes**（Content-Type 随 `response_format`，非 JSON）。处理：`response.ok` → `Buffer.from(await response.arrayBuffer())`；错误 body 是 JSON（`{error:{message}}`，走 `response.text()`）。

示例 request：

```bash
curl https://api.openai.com/v1/audio/speech -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini-tts","input":"Today is a wonderful day to build something people love!","voice":"coral","instructions":"Speak in a cheerful and positive tone.","response_format":"mp3"}' --output speech.mp3
```

坑：(1) 响应是二进制非 JSON，需新方法。(2) `speed` 不可靠，用 `instructions`。(3) 2000-token 上限，长文 chunk。(4) `instructions` token 计费。计价 `$0.60/1M input tokens + $12/1M audio output tokens`（~$0.015/min）。
来源：https://developers.openai.com/api/docs/guides/text-to-speech ・ https://platform.openai.com/docs/models/gpt-4o-mini-tts

#### 8.4.2 Gemini `gemini-2.5-flash-preview-tts`

一行定位：Gemini 廉价 TTS（单/双说话人），输出 base64 PCM。accessVia=direct，adapter=`geminiAdapter`（复用）。

| 用途                       | method | path                                     | 同步模式 |
| -------------------------- | ------ | ---------------------------------------- | -------- |
| TTS（via generateContent） | POST   | `/v1beta/models/{model}:generateContent` | sync     |

**Auth**：`x-goog-api-key: <GEMINI_API_KEY>`（同现有 image 调用）。baseUrl 直接用现有 `AI_PROVIDER_ENDPOINTS.GEMINI`（`https://generativelanguage.googleapis.com/v1beta/models`），全 URL = `${GEMINI}/${modelId}:generateContent`。

| name                                                          | type     | 必填 | 说明                                                                                                                                                                            |
| ------------------------------------------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contents`                                                    | array    | ✓    | `[{parts:[{text:'<要说的文本>'}]}]`；多说话人把含说话人名的整段转录放 text                                                                                                      |
| `generationConfig.responseModalities`                         | string[] | ✓    | **必须恰为 `['AUDIO']`**（image 用 `['TEXT','IMAGE']`，勿照抄）                                                                                                                 |
| `...speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`   | string   |      | 单说话人；30 预置音如 `Zephyr/Puck/Charon/Kore/Fenrir/...`                                                                                                                      |
| `...speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs` | array    |      | 双说话人（替代 voiceConfig，二选一）；`{speaker:'<与转录中名字匹配>', voiceConfig:{prebuiltVoiceConfig:{voiceName}}}`，**上限 2 人**。映射 `ProviderAudioInput.speakerVoiceIds` |
| `model`（path 段）                                            | string   | ✓    | `gemini-2.5-flash-preview-tts`（廉价）或 `gemini-2.5-pro-preview-tts`                                                                                                           |

响应：JSON。音频在 `candidates[0].content.parts[0].inlineData.data` = **base64 raw PCM（audio/L16: 16-bit LE, mono, 24000Hz, 无容器头）**，`inlineData.mimeType` 形如 `audio/L16;codec=pcm;rate=24000`。**处理（#1 集成坑）**：base64 解码后**必须前置 44-byte WAV header**（RIFF/WAVE, PCM=1, channels=1, sampleRate=24000, bitsPerSample=16, byteRate=48000, blockAlign=2）才能播放/存储，或用 ffmpeg `-f s16le -ar 24000 -ac 1` 重编码。

示例 body（单说话人）：

```json
{
  "contents": [
    { "parts": [{ "text": "Say cheerfully: Have a wonderful day!" }] }
  ],
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": {
      "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "Kore" } }
    }
  }
}
```

坑：(1) 输出 base64 PCM **无 WAV 头**，必须自合成 44-byte 头。(2) `responseModalities` 只能 `['AUDIO']`。(3) TTS **不支持 streaming**（单响应）。(4) 多说话人上限 2，且 text 里说话人标签须与 `speakerVoiceConfigs` 匹配。(5) 数分钟后音质漂移。**⚠ verify** 是否可用更 steerable 的 `gemini-3.1-flash-tts-preview`（同 endpoint+结构，支持 `[bracket]` 音频标签，但价 2x）。计价 flash-preview `$0.50/1M input + $10/1M audio output`（audio token = 25 token/秒）。
来源：https://ai.google.dev/gemini-api/docs/speech-generation ・ https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts

---

### 8.5 AivisSpeech / VOICEVOX（新建 adapter，self-host）

一行定位：自托管日语角色音 TTS 引擎；AivisSpeech 是 VOICEVOX ENGINE 的 fork，HTTP-API 兼容，**一个 adapter 同时打两者**（仅默认端口与少数字段不同）。accessVia=self-host，**需新建 `AI_ADAPTER_TYPES.VOICEVOX` + `voicevox.adapter.ts`**（server-only，无 fal/无 key/无官方云端点）。

| 用途                                | method          | path                                                   | 同步模式 |
| ----------------------------------- | --------------- | ------------------------------------------------------ | -------- |
| TTS step1：建 AudioQuery            | POST            | `/audio_query?text=<urlencoded>&speaker=<styleId>`     | sync     |
| TTS step2：合成 WAV                 | POST            | `/synthesis?speaker=<styleId>`（body=AudioQuery JSON） | sync     |
| list speakers + style ids           | GET             | `/speakers`                                            | sync     |
| （AivisSpeech-only）装/管 AIVM 模型 | POST/GET/DELETE | `/aivm_models[/install\|/{uuid}/load\|...]`            | sync     |

**Auth**：**无**——无 key/无 token/无 header。视为可信内网服务，勿公网暴露（CORS 默认仅 localhost）。env var `VOICEVOX_ENGINE_URL`（默认 `http://localhost:10101`，alias `AIVIS_ENGINE_URL`）；VOICEVOX 上游默认 `:50021`。

| name                            | type                                        | 必填 | 说明                                                                                                                       |
| ------------------------------- | ------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `text`                          | string(query on `/audio_query`)             | ✓    | URL-encode；建议 `--data-urlencode`                                                                                        |
| `speaker`                       | int **styleId**(query on **两个** endpoint) | ✓    | 是 **style id 不是 speaker UUID**；取自 `/speakers` → `styles[].id`。AivisSpeech 是大 32-bit int，VOICEVOX 是 0/1/2 小整数 |
| AudioQuery（`/synthesis` body） | object                                      | ✓    | 原样回传 `/audio_query` 的 JSON；含 `speedScale/pitchScale/intonationScale/volumeScale/outputSamplingRate/...`             |
| `outputSamplingRate`            | int(AudioQuery 内)                          |      | AivisSpeech 默认 44100Hz，VOICEVOX 默认 24000Hz；可在 body 覆写统一管线采样率                                              |

响应：`/audio_query` → AudioQuery JSON；`/synthesis` → **raw WAV bytes**（`audio/wav`，16-bit PCM，sampleRate=AudioQuery.outputSamplingRate）。直接 `response.arrayBuffer()` → 上传 R2 为 `audio/wav`，无 base64、无轮询。

示例（两步，styleId 取自 `/speakers`）：

```bash
STYLE=888753760
curl -s -X POST "http://localhost:10101/audio_query?speaker=$STYLE" --get --data-urlencode text='こんにちは、はじめまして。' > query.json
curl -s -H 'Content-Type: application/json' -X POST -d @query.json "http://localhost:10101/synthesis?speaker=$STYLE" --output out.wav
```

坑：(1) `speaker` 是 style id 不是 UUID，**运行时 `/speakers` 枚举，勿硬编码**。(2) **无 word/phoneme 时间戳**——AivisSpeech 把 per-mora pitch/length 置 0，无法从 query 派生字幕时间。(3) 采样率差异（44100 vs 24000），adapter 内归一。(4) AivisSpeech 复用 `intonationScale` 表「情感强度」（非音高）并新增 `tempoDynamicsScale`；`pauseLength/pauseLengthScale` 被忽略。(5) `/singers`、`/synthesis_morphing`、`/cancellable_synthesis` 在 AivisSpeech 不支持。(6) 首启下载 ~250MB 默认音模 + ~650MB BERT 模型，**Docker 必须 bind-mount 模型目录**否则每次重下。(7) CPU 足够；选 AivisHub 上 CC0/ACML（免署名、可商用）音模，避开 ACML-NC。
Docker：`docker run --rm -p 10101:10101 -v ~/.local/share/AivisSpeech-Engine:/home/user/.local/share/AivisSpeech-Engine-Dev ghcr.io/aivis-project/aivisspeech-engine:cpu-latest`
来源：https://github.com/Aivis-Project/AivisSpeech-Engine ・ https://aivis-project.github.io/AivisSpeech-Engine/api/ ・ https://github.com/VOICEVOX/voicevox_engine

---

### 8.6 BytePlus ModelArk — Seedance 2.0 direct（video cost 路由，复用现有 adapter）

一行定位：把 Seedance 2.0 从 fal 改走 BytePlus ModelArk 直连（USD），Fast/720p 档约比 fal 省 ~2x。accessVia=direct，**adapter 已存在**——`src/services/providers/volcengine.adapter.ts` 已说同款协议（create task / poll / `content.video_url` / status 映射 / 多模态 `content[]` / Fast 档 1080p→720p 降级）。**这是 config 改动不是新集成**。

> **路线决策见 §4.1**：BytePlus 是**官方备选**不是当前主接——其 2.0 仍 public beta（QPS 2 / 并发 3 / 429、model-id console(`seed-2-0-*`)≠docs(`seedance-2.0`)）。**当前主接是 fal**（§4.1 表），BytePlus 上短期只接 **1.5 pro GA**（`seedance-1-5-pro`）做官方稳定回退，等 2.0 转 GA + 命名收敛再切。**Seedance mini 暂不接**（零确认 model id，见 §4.1）。

| 用途                          | method | path                                    | 同步模式   |
| ----------------------------- | ------ | --------------------------------------- | ---------- |
| 创建生成任务（t2v/i2v/ref2v） | POST   | `/contents/generations/tasks`           | queue-poll |
| 轮询任务状态 → video_url      | GET    | `/contents/generations/tasks/{task_id}` | queue-poll |

**Auth**：`Authorization: Bearer <BYTEPLUS_API_KEY>` + `Content-Type: application/json`。env var `BYTEPLUS_API_KEY`（alias `MODELARK_API_KEY`；现有 adapter 注释称 `ARK_API_KEY`）。baseUrl **intl/USD = `https://ark.ap-southeast.bytepluses.com/api/v3`**（**⚠ CN/RMB = `https://ark.cn-beijing.volces.com/api/v3`**，即现有 `AI_PROVIDER_ENDPOINTS.VOLCENGINE`；该 host 与 Seedream image 共用，**勿全局翻转**，按模型 `providerConfig.baseUrl` override）。

| name                              | type    | 必填 | 说明                                                                                                                                                                                                                                                             |
| --------------------------------- | ------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`                           | string  | ✓    | intl id `dreamina-seedance-2-0-260128`（标准）/ `dreamina-seedance-2-0-fast-260128`（fast）；**CN id 是 `doubao-seedance-2-0-260128`**（项目当前在 `video.ts` 硬编码）。前缀 `dreamina-` vs `doubao-` 随路由变、`-260128` 是会漂移的 dated snapshot              |
| `content`                         | array   | ✓    | 类型化 parts：text `{"type":"text","text":...}`；image `{"type":"image_url","image_url":{"url":...},"role":"first_frame"\|"reference_image"}`；video/audio 同理。caps: ≤9 ref images / ≤3 ref videos / ≤3 ref audio。已由 `buildVolcEngineVideoQueueBody()` 实现 |
| `ratio`                           | string  |      | 顶层（非 content 内）；`16:9/9:16/1:1/4:3/3:4/21:9`                                                                                                                                                                                                              |
| `resolution`                      | string  |      | `480p/720p/1080p`(Pro 加 `2K`)；Fast 上限 720p（adapter 已降级）                                                                                                                                                                                                 |
| `duration`                        | number  |      | 秒，doc 4–15(默认5)，adapter clamp 2–12；无 `auto` 字面量                                                                                                                                                                                                        |
| `generate_audio`                  | boolean |      | 原生音频开关（免加价）；官方字段是 `generate_audio`（非 `audio`）                                                                                                                                                                                                |
| `return_last_frame` / `watermark` | boolean |      | adapter 设 true / false                                                                                                                                                                                                                                          |

响应：CREATE → `{ "id": "<task_id>" }`。POLL → `{ id, status, content, error, usage, ... }`，`status ∈ queued/running/succeeded/failed/expired/cancelled`。`succeeded` 时 `content` 是**扁平对象**：`content.video_url`（mp4，**~24h 临时签名 URL，必须转存 R2**）+ 可选 `content.last_frame_url`。`failed` 看 `error.code/error.message`。`VOLCENGINE_TASK_STATUS_SCHEMA` 已校验此 shape 并映射 `IN_QUEUE/IN_PROGRESS/COMPLETED/FAILED`。

示例 CREATE（t2v）：

```bash
curl -X POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks \
  -H "Authorization: Bearer $BYTEPLUS_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"dreamina-seedance-2-0-260128","content":[{"type":"text","text":"A quiet product demo shot, slow camera move, clean studio light"}],"ratio":"16:9","resolution":"720p","duration":5,"generate_audio":false,"return_last_frame":true,"watermark":false}'
```

坑：(1) **可用性**——intl Seedance 2.0 是 **public beta 非 GA**（2026-04-14 开放，被官方标 flaky），可能账户白名单门控；`video.ts` 两条 VOLC Seedance 当前 `available:false`，**确认 live 前别开**。(2) 路由直连只需四步：override baseUrl 到 bytepluses.com host / 设 intl model id（`dreamina-*` 而非现 `doubao-*`）/ 供 BytePlus（非 VolcEngine CN）key / 翻 `available:true`。(3) base-url 陷阱：`cn-beijing.volces.com`(RMB) vs `bytepluses.com`(USD) key 与计费都不同，勿混。(4) model-id 陷阱：`-260128` 是 snapshot，Ark 可能要求 console 创建的 endpoint id `ep-xxxx`（adapter 已对 404 给提示）。(5) **⚠ verify** 定价为 token-based（按 1M tokens，非固定 per-second），2x-vs-fal 优势在 Fast/720p 成立，需 metered 测试 clip 验证。(6) 勿与第三方代理 shape（`prompt/audio/aspect_ratio` 顶层、id `seedance-2.0`）混淆——官方是 `content[]` + `generate_audio` + `ratio`。
来源：https://docs.byteplus.com/en/docs/ModelArk/1520757 ・ `src/services/providers/volcengine.adapter.ts` ・ `src/constants/models/video.ts`

---

### 接入现有 adapter 约定（Codex 实现须遵守）

已对照 `src/services/providers/types.ts`、`providers.ts`、`registry.ts` 现状核实：

1. **adapter 位置与契约**：所有 adapter 放 `src/services/providers/`，导出实现 `ProviderAdapter`（`src/services/providers/types.ts`）的对象。音频走 `generateAudio(input: ProviderAudioInput): Promise<ProviderAudioResult>`（同步，模板 = `fish-audio.adapter.ts`）；video 走 `submitVideoToQueue` + `checkVideoQueueStatus`；image 走 `generateImage`。`ProviderAudioInput` 已带 `voiceId/speakerVoiceIds/referenceAudioUrl/referenceText/speed/volume/format/sampleRate/mp3Bitrate/withTimestamps` 等可复用字段——多说话人(Gemini)→`speakerVoiceIds`，克隆(Eleven/MiniMax)→`referenceAudioUrl`+`referenceText`；要暴露 ElevenLabs 的 `stability/similarity_boost/style` 等需给 `ProviderAudioInput` 加可选字段。`ProviderAudioResult` = `{audioUrl, duration, format, sampleRate, requestCount, timestamps?}`。
2. **外部调用包裹**：所有外部 fetch 用 `withRetry()`（`src/lib/with-retry.ts`）包裹，并配 per-provider circuit breaker（`src/lib/circuit-breaker.ts`）；日志用 `src/lib/logger.ts`，不要 `console.log`。错误抛 `ProviderError`（`humanizeProviderError` 已处理 `{detail:[...]}`/`{message}`/`{error:{message}}` 等格式 + 余额/限流/auth 模式）。
3. **注册**：把新 adapter 加进 `src/services/providers/registry.ts` 的 `PROVIDER_ADAPTERS`。
4. **新 `AI_ADAPTER_TYPES`（本次 3 个：`ELEVENLABS`/`MINIMAX`/`VOICEVOX`）必须同步**：
   - `src/constants/providers.ts` 的 **五个 exhaustive `Record<AI_ADAPTER_TYPES,...>`**：`DEFAULT_PROVIDER_CONFIGS`、`ADAPTER_KEY_HINTS`、`ADAPTER_DEFAULT_COSTS`、`ADAPTER_CUSTOM_MODEL_EXAMPLES`、`ADAPTER_API_GUIDES`（缺 key 即 type error）；
   - `AI_ADAPTER_TYPE_OPTIONS` 数组；
   - `models.ts` 的 `getProviderGroup` switch + `ProviderGroup` 联合类型 + `PROVIDER_GROUP_ORDER`（VOICEVOX 无 key → `ADAPTER_KEY_HINTS` 给空/占位，不进 QuickSetupDialog key-gate）；
   - `src/constants/config.ts` 加 `AI_PROVIDER_ENDPOINTS` 条目（如 `ELEVENLABS='https://api.elevenlabs.io'`、`MINIMAX='https://api.minimax.io'`、VOICEVOX 用 `VOICEVOX_ENGINE_URL` env 默认值）。
5. **模型注册**：`AI_MODELS` enum + audio/video ModelOption（`outputType`、`adapterType`、`externalModelId`、`cost`、`qualityTier`、`maxPromptChars`、`timeoutMs`）+ i18n 三文件同步。复用 adapter 的 TTS（OpenAI/Gemini）则在对应 adapter 加新 TTS 路径并加 capability flag，不动 `AI_ADAPTER_TYPES`。

**相关文件**：[types.ts](src/services/providers/types.ts)（adapter 契约）・[fish-audio.adapter.ts](src/services/providers/fish-audio.adapter.ts)（同步音频模板）・[volcengine.adapter.ts](src/services/providers/volcengine.adapter.ts)（Seedance 队列协议，已就绪）・[registry.ts](src/services/providers/registry.ts)・[providers.ts](src/constants/providers.ts)・[config.ts](src/constants/config.ts)（`AI_PROVIDER_ENDPOINTS` L388-403）。

---

## 9. 文本模型独立分类 + Qwen 接入 (供 Codex 实现)

> 本节把「文本/LLM 模型」升格为**独立于 `AI_MODELS` 生成 enum 的自管分类**，并接入 **Qwen（DashScope，OpenAI-compatible）**。动机：当前 capability 与默认模型都挂在 **adapter** 而非 **model** 上，导致**「不同地方用不同文本模型」做不到**——两个都路由到 OpenAI adapter 的 use-case 被强制共用同一个 `gpt-5.4-mini`，且 DeepSeek 这类强文本模型被整 adapter 排除在某些 scope 之外。本节给出 `TEXT_MODELS` 注册表 + per-use-case 路由表 + DashScope 接入规格 + 给 Codex 的按文件 change-list。所有 model id / env var / 字段名保留英文，说明用中文。基准 commit `3ebfecf0`，行号以当前源码为准（已核对）。标 **⚠ verify** 的项必须在 wire 前用 live 请求核对。
>
> **与既有章节的关系**：本节是 §2.1（Text-to-Text lineup）与 §5（LLM-text change-list）的**结构升级**——§2.1/§5 仍按 per-adapter 模型一刀切处理 LLM-text，本节把它改成 per-model + per-use-case。两者冲突时以本节为准（§2.1 的「保留 lineup」内容不变，只是承载结构从 `LLM_TEXT_MODEL_IDS` + `ADAPTER_CAPABILITIES` 换成 `TEXT_MODELS` + `TEXT_MODEL_CAPABILITIES`）。DashScope 新增 `AI_ADAPTER_TYPES.DASHSCOPE` 的同步规则沿用 §8 末尾「接入现有 adapter 约定」。

### 9.1 现状与痛点

文本模型今天散在 **4 层、全部 keyed on ADAPTER 而非 model**：(1) **模型 id 目录** `src/constants/config.ts:405-410` `LLM_TEXT_MODEL_IDS`（4 个裸字符串 id，无 per-model endpoint/能力元数据）+ endpoints `AI_PROVIDER_ENDPOINTS`（config.ts:388-403，仅 `GEMINI/OPENAI_CHAT/DEEPSEEK`）；(2) **adapter 能力图** `src/constants/llm-capability.ts:19-34` `ADAPTER_CAPABILITIES: Record<AI_ADAPTER_TYPES, ReadonlyArray<LlmCapabilityScope>>`（scope = `enhance|planner|assistant`，line 4；`OPENAI/GEMINI=[enhance,planner,assistant]`、`DEEPSEEK=[planner]`、其余 `[]`）+ helpers `getLLMCapabilityScope`/`adapterHasCapability`（36-53）+ `LLM_ENHANCE_ROUTE_MODELS`（6-17，per-adapter 单 tuple）；(3) **运行时引擎** `src/services/llm-text.service.ts`：`LLM_TEXT_ADAPTERS`（86-90）、`LLM_TEXT_MODELS: Record<adapter,modelId>`（98-102，**每 adapter 只钉一个默认模型**）、`resolveLlmTextRoute(userId,apiKeyId?)`（252-337）**返回 `{adapterType,providerConfig,apiKey}`——不含 modelId**（接口 47-51），per-call 只能靠可选 `LlmTextInput.modelId`（line 25）覆写；(4) **planner 子路由** `src/constants/script-breakdown.ts:41-57` `SCRIPT_PLANNER_MODELS` + `src/constants/node-studio.ts:101-112` `NODE_STUDIO_ASSISTANT_ROUTE_MODELS`（各自又一张 per-adapter 模型表）。

**核心痛点 = capability 与默认模型是 per-ADAPTER 不是 per-model**：`ADAPTER_CAPABILITIES` 的 key 是 adapter，类型系统**没有 model 维度**——写不出「`gemini-3.5-flash` 能 planner 但 `gemini-3.1-flash-lite` 不能」或「enhance 用 A、intent-parser 用 B（同 adapter）」。一旦选定 adapter，模型由 `LLM_TEXT_MODELS[adapter]` 固定；唯一逃生口是 per-call `modelId`，而**今天只有 planner 路径真的设了它**（`resolveNodePlannerRoute` 附 `SCRIPT_PLANNER_MODELS[provider].modelId`），其余所有 use-case 一律拿 `LLM_TEXT_MODELS[adapter]` 默认。净效果：**use-case 无法独立于其 provider key 选模型**，且强文本模型（DeepSeek）被整 adapter 挡在 enhance/assistant 之外。

**当前所有 use-site 及各自用什么**（已核对源码；「模型决定方式」三类见下表 A/B/C）：

| use-site                                             | 文件                                                          | 当前模型决定方式                                                                                               | 需要 vision | 名义 scope                  |
| ---------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------- |
| prompt-enhance（Studio enhance 钮）                  | `src/services/kernel/prompt-enhance.service.ts`               | A：`resolveLlmTextRoute`(无 modelId) → `LLM_TEXT_MODELS[adapter]` 默认                                         | 否          | enhance                     |
| prompt-assistant（助手 Dialog，含看图反推）          | `src/services/kernel/prompt-assistant.service.ts`             | A：同上，传 `imageData`（DeepSeek 路由会 throw）                                                               | **是**      | enhance                     |
| image-breakdown / 看图反推（`analyzeImage`）         | `src/services/image/image-analysis.service.ts`                | A：同上，恒传 `imageData`，必须 vision adapter                                                                 | **是**      | enhance                     |
| script-breakdown（分镜）                             | `src/services/node/script-breakdown.service.ts`               | B：`resolveNodePlannerRoute` → `SCRIPT_PLANNER_MODELS.modelId`，显式传 `route.modelId`，`json_object`          | 否          | planner                     |
| seedance prompt plan（视频分镜规划）                 | `src/services/prompts/seedance-prompt-plan.service.ts`        | B：同上，`json_object`                                                                                         | 否          | planner                     |
| node studio canvas assistant                         | `src/services/node/node-assistant.service.ts`                 | C：无 key+gateway 可用 → Vercel `streamText` + `NODE_STUDIO_ASSISTANT.gatewayModelId='openai/gpt-5.4'`；否则 A | 否          | assistant                   |
| recipe fusion / style-card compile                   | `src/services/kernel/card-recipe-compiler.service.ts:251`     | A：默认模型（`styleCard.modelId` 是 IMAGE 目标，非 LLM）                                                       | 否          | enhance（隐式）             |
| recipe compiler 视觉抽取（background/style attrs）   | `src/services/kernel/card-recipe-compiler.service.ts:537/573` | A：传 `imageData`，需 vision                                                                                   | **是**      | enhance（隐式）             |
| intent-parser（NL→image intent JSON）                | `src/services/intent-parser.service.ts:82`                    | A：平台 user，默认模型                                                                                         | 否          | enhance（隐式）             |
| image-3d-prep（3D 前分析图）                         | `src/services/image/image-3d-prep.service.ts`                 | A：传 `imageData`，需 vision                                                                                   | **是**      | enhance（隐式）             |
| prompt-feedback                                      | `src/services/prompts/prompt-feedback.service.ts`             | A：默认模型                                                                                                    | 否          | enhance（隐式）             |
| generation-feedback（出图后教练）                    | `src/services/generation-feedback.service.ts`                 | A：传 `imageData`，需 vision                                                                                   | **是**      | enhance（隐式）             |
| generation-evaluator（自动打分）                     | `src/services/generation-evaluator.service.ts`                | A：传 `imageData`，需 vision                                                                                   | **是**      | enhance（隐式）             |
| character-scoring（双图比对）                        | `src/services/cards/character-scoring.service.ts`             | A：传 `imageData[]`，需 vision                                                                                 | **是**      | enhance（隐式）             |
| character-card（多次调用，一处 `useGrounding:true`） | `src/services/cards/character-card.service.ts:84/121/213`     | A：部分传 `imageData`，一处 grounding（DeepSeek throw）                                                        | **是**      | enhance（隐式）             |
| character-refine                                     | `src/services/cards/character-refine.service.ts:188`          | A：默认模型（`model.modelId` 是 IMAGE 模型）                                                                   | 否          | enhance（隐式）             |
| story.service（Node Studio 故事扩写）                | `src/services/node/story.service.ts:292`                      | A：默认模型（注意：node studio 但走 enhance 而非 planner）                                                     | 否          | enhance（隐式）             |
| video-script.service（平台多 key fan-out）           | `src/services/video-script.service.ts:149-184`                | other：绕过 `resolveLlmTextRoute`，直接 `llmTextCompletion(key.adapterType)`，占位 modelId `'gemini-platform'` | 否          | other                       |
| LLM route picker（UI 选择器）                        | `src/hooks/use-llm-route-picker.ts:66-113`                    | filter by `adapterHasCapability(adapter,scope)` → `getRegistryEntry` 映射 adapter→单 modelId                   | 否          | enhance\|planner\|assistant |
| API key adapter gating                               | `src/constants/api-keys.ts:10-14`                             | `LLM_API_KEY_ADAPTERS` = `getLLMCapabilityScope` 并集 → `{OPENAI,GEMINI,DEEPSEEK}`                             | 否          | all                         |

> 三类模型决定方式：**A = DEFAULT-BY-ADAPTER**（大多数；模型完全由「哪个 adapter 赢」决定，use-case 无话语权）；**B = PLANNER OVERRIDE**（script-breakdown / seedance-plan；唯一真正附 modelId 的路径，但仍是 per-adapter 一个）；**C = GATEWAY BYPASS**（node-assistant；走 Vercel gateway 固定 `openai/gpt-5.4`）。

### 9.2 目标设计：独立文本模型分类

**思路**：把「文本模型」做成与 `AI_MODELS` 平行、独立自管的注册表 `TEXT_MODELS`，capability **下沉到 per-MODEL**，再加一张 **per-use-case 路由表** `TEXT_MODEL_ROUTES` 让每个 use-site 显式声明自己要的文本模型。`resolveLlmTextRoute` 升级为「能返回 modelId」，旧 per-adapter capability 逐步废弃。

**(1) `TEXT_MODELS` 注册表**（新建 `src/constants/text-models.ts`，独立于 `models/*` 与 `AI_MODELS`）：每个文本模型一个条目，**keyed on textModelId**（不是 adapter）。

```ts
// src/constants/text-models.ts （提案结构，字段名最终以 Codex 落地为准）
export const TEXT_MODEL_IDS = {
  GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite',
  GEMINI_3_5_FLASH: 'gemini-3.5-flash',
  OPENAI_GPT_5_4_MINI: 'gpt-5.4-mini',
  DEEPSEEK_V4_PRO: 'deepseek-v4-pro',
  QWEN_PLUS: 'qwen-plus',
  QWEN3_MAX: 'qwen3-max',
  QWEN_FLASH: 'qwen-flash',
  QWEN3_VL_PLUS: 'qwen3-vl-plus',
} as const

export interface TextModelEntry {
  id: TextModelId // 注册表 key（= TEXT_MODEL_IDS 值）
  adapterType: AI_ADAPTER_TYPES // GEMINI / OPENAI / DEEPSEEK / DASHSCOPE
  externalModelId: string // 发给 provider 的 wire id（与 id 可不同，便于 snapshot pin）
  provider: ProviderGroup | string
  capabilities: {
    vision: boolean // 能否吃 imageData（看图反推/视觉抽取）
    json: boolean // 是否支持 response_format json_object
    grounding?: boolean // 是否支持联网（google_search / web_search）
    contextWindow: number // 上下文窗口（token）
  }
  cost?: { inPer1M: number; outPer1M: number } // 仅记账/排序参考，非 credit
  label: string
}
```

**capability 改成 per-MODEL** 后，可以表达 §9.1 表达不了的事实：

| textModelId             | adapterType | vision | json | grounding | ctx  | 角色（呼应 §2.1）               |
| ----------------------- | ----------- | ------ | ---- | --------- | ---- | ------------------------------- |
| `gemini-3.1-flash-lite` | GEMINI      | ✓      | ✓    | ✓         | 1M   | 廉价 vision 主力                |
| `gemini-3.5-flash`      | GEMINI      | ✓      | ✓    | ✓         | —    | 高级推理 + vision               |
| `gpt-5.4-mini`          | OPENAI      | ✓      | ✓    | ✓         | —    | 跨厂商 vision 兜底              |
| `deepseek-v4-pro`       | DEEPSEEK    | **✗**  | ✓    | **✗**     | —    | 纯文本推理（强中文，剧本/分镜） |
| `qwen-plus`             | DASHSCOPE   | ✗      | ✓    | —         | 1M   | 中文文本默认主力（§9.4）        |
| `qwen3-max`             | DASHSCOPE   | ✗      | ✓    | —         | 262K | 旗舰中文剧本/分镜/recipe 融合   |
| `qwen-flash`            | DASHSCOPE   | ✗      | ✓    | —         | 1M   | 廉价档（关键词/快速改写）       |
| `qwen3-vl-plus`         | DASHSCOPE   | ✓      | ✓    | —         | 262K | 可选 vision 候选（拆解图片）    |

> 注意 `deepseek-v4-pro` 的 `vision:false` / `grounding:false` 是**第一类真实约束**——`deepseekTextCompletion`（llm-text.service.ts:481-487）对 `imageData` 与 `useGrounding` 均硬 throw。同理 Qwen 纯文本档 `vision:false`。把这些写进 per-model capability 后，路由器**在 `imageData` 存在时只允许选 `vision:true` 的模型**，从源头消除「选错 adapter 命中 throw」。

**(2) per-use-case 路由表 `TEXT_MODEL_ROUTES`**：`Record<TextUseCase, textModelId>`，每个 use-site 显式选自己的文本模型。`TextUseCase` 是一个枚举（取代今天「scope + 哪张表恰好被读」的隐式决定）：

```ts
export const TEXT_USE_CASES = {
  imageBreakdown: 'imageBreakdown', // 看图反推 → 需 vision
  scriptGen: 'scriptGen', // 剧本/分镜 → 中文文本
  enhance: 'enhance', // prompt 增强 → 廉价档
  assistant: 'assistant', // 助手 Dialog（含看图反推）→ vision
  intentParse: 'intentParse', // NL→intent JSON → 廉价 json
  recipeFusion: 'recipeFusion', // recipe 融合（文本）
  recipeVision: 'recipeVision', // recipe 视觉抽取 → vision
  evaluation: 'evaluation', // 出图打分/反馈 → vision
} as const

// 建议默认（可被 user BYOK key 覆盖；fallback 见下）
export const TEXT_MODEL_ROUTES: Record<TextUseCase, TextModelId> = {
  imageBreakdown: TEXT_MODEL_IDS.GEMINI_3_1_FLASH_LITE, // vision + 便宜
  scriptGen: TEXT_MODEL_IDS.QWEN3_MAX, // 强中文文本
  enhance: TEXT_MODEL_IDS.QWEN_FLASH, // 廉价档
  assistant: TEXT_MODEL_IDS.GEMINI_3_5_FLASH, // vision + 推理
  intentParse: TEXT_MODEL_IDS.QWEN_FLASH,
  recipeFusion: TEXT_MODEL_IDS.QWEN_PLUS,
  recipeVision: TEXT_MODEL_IDS.QWEN3_VL_PLUS, // 或 gemini-3.1-flash-lite
  evaluation: TEXT_MODEL_IDS.GEMINI_3_1_FLASH_LITE,
}
```

> **已拍板（2026-06-15）**：`scriptGen` = `qwen3-max`（中文剧本质量优先）；`imageBreakdown` 默认 = `gemini-3.1-flash-lite`（见下评估），DashScope 线 / 中文图内文字场景由 resolver 落到 `qwen3-vl-plus`；迁移 = **分批**。要点：每个 use-case 现在能独立指一个模型，且 vision use-case 默认指向 `vision:true` 模型。
>
> **imageBreakdown 评估（Gemini vs Qwen3-VL-Plus，已联网核实）**：两者画面理解都顶级（`gemini-3.5-flash` 84% MMMU-Pro；`qwen3-vl-plus` 持平/超 Gemini 2.5 Pro）。**Gemini 胜在**：已接好 + 是平台 fallback（免费/无 key 用户开箱即用）+ 结构化 JSON 最稳（`responseSchema` 服务端强制）——imageBreakdown 被约 7 个 vision use-site 高频调用，核心默认不该依赖一个还没建的 adapter。**Qwen3-VL-Plus 胜在**：中文/CJK 图内文字 + 动漫 danbooru 标注生态——故定位为 **DashScope 线 + 中文图专精的备选**，非默认。**两者都对 NSFW 偏保守**（Gemini 安全过滤、Qwen base 拒答）——重口参考图未来可能要自托管 tagger（呼应 [[project-lora-nsfw-tag-library]]）。

**(3) `resolveLlmTextRoute` 读新结构而非 per-adapter capability**：新增一个 **model-aware** 解析函数（不破坏旧签名，渐进迁移）：

```ts
// 新增（llm-text.service.ts），返回带 modelId 的 route
export async function resolveLlmTextModel(
  userId: string,
  useCase: TextUseCase,
  apiKeyId?: string,
): Promise<ResolvedLlmTextRoute & { modelId: string; externalModelId: string }>
```

实现要点：① 从 `TEXT_MODEL_ROUTES[useCase]` 取首选 textModelId → 查 `TEXT_MODELS` 得 `adapterType`；② 复用现有 `resolveLlmTextRoute` 的 key 选择逻辑（按 user 的 active key 选 adapter，无 key 兜底平台 Gemini，252-337），但 **adapter 候选集由「该 use-case 允许的模型集合」决定**而非固定 `LLM_TEXT_ADAPTERS`；③ 若该 use-case 需要 vision，**过滤掉 `vision:false` 的模型/adapter**；④ 返回 `externalModelId`，调用方把它当 `LlmTextInput.modelId` 传给 `llmTextCompletion`（现有 per-call override 机制 line 25 已存在，无需改 `llmTextCompletion` 主体）。

**向后兼容 / 渐进迁移**：

- **不删** `resolveLlmTextRoute` 旧签名（252-337）——`resolveLlmTextModel` 内部复用它的 key 选择；现有 use-site 可逐个迁移到新函数，未迁移者行为不变（仍拿 `LLM_TEXT_MODELS[adapter]` 默认）。
- `ADAPTER_CAPABILITIES`（llm-capability.ts:19-34）**保留为派生视图**：从 `TEXT_MODELS` 聚合「该 adapter 至少有一个模型支持 scope X」生成，使 `adapterHasCapability`/`use-llm-route-picker.ts` 不立即重写即可继续工作；待 UI picker 迁到 per-model 后再废弃。
- `LLM_TEXT_MODEL_IDS`（config.ts）暂留，`TEXT_MODELS` 的 `externalModelId` 引用它（或直接收编）；planner 表 `SCRIPT_PLANNER_MODELS` / `NODE_STUDIO_ASSISTANT_ROUTE_MODELS` 折叠为 `TEXT_MODEL_ROUTES` 的 `scriptGen`/`assistant` 行（中期目标），短期可让它们改读 `TEXT_MODELS`。
- **建议文件落点**：`src/constants/text-models.ts`（新建，承载 `TEXT_MODEL_IDS` + `TEXT_MODELS` + `TEXT_USE_CASES` + `TEXT_MODEL_ROUTES` + per-model capability helper）。它是 §2.1 lineup 的结构化承载，与 `models/*`（生成 enum）解耦。

### 9.3 Qwen 接入规格（DashScope，§8 风格）

一行定位：阿里 Qwen 系（DashScope）TTS-无关的**文本 + 视觉 LLM**，OpenAI chat-completions **drop-in 兼容**，几乎逐字复用现有 `deepseekTextCompletion` 形态。accessVia=direct，**需新建 `AI_ADAPTER_TYPES.DASHSCOPE`**（adapter 实现可由 `deepseekTextCompletion` 泛化而来，见下）。

**base url（region-locked，不可跨区互换）**：

- **INTL / Singapore（PixelVault 用这个）**：`https://dashscope-intl.aliyuncs.com/compatible-mode/v1` → 全路径 `POST .../chat/completions`
- CN / Beijing：`https://dashscope.aliyuncs.com/compatible-mode/v1`（**key 与 intl 不互通**）

**Auth**：HTTP Bearer。header `Authorization: Bearer <DASHSCOPE_API_KEY>` + `Content-Type: application/json`。env var `DASHSCOPE_API_KEY`（阿里官方命名），key 形如 `sk-...`。**header 机制与现有 DeepSeek/OpenAI adapter 完全一致，无新增 auth 接线**。

**是否复用 `openAiTextCompletion` 形态**：是。现有 `deepseekTextCompletion`（llm-text.service.ts:480-528）已是通用 OpenAI-compatible adapter——POST `<baseUrl>/chat/completions`、`Authorization: Bearer`、`messages` 数组、`max_tokens`、可选 `response_format:{type:'json_object'}`、`OpenAiChatResponseSchema` 解析。DashScope adapter = **同一函数** + (a) 新 `AI_ADAPTER_TYPES.DASHSCOPE`、(b) `AI_PROVIDER_ENDPOINTS.DASHSCOPE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'`、(c) 默认 externalModelId（`qwen-plus` / `qwen3-max`）。**关键差异**：① DashScope 接受 `enable_thinking`——开启时答案部分落在 `reasoning_content` 且 **JSON 模式被禁用**；结构化任务必须 `enable_thinking:false`；② 与 DeepSeek 不同，**Qwen-VL 系接受 image_url content parts**，所以 DashScope adapter **不应像 `deepseekTextCompletion`（481-483）那样硬拒 `imageData`**——有图时路由到 `qwen*-vl` 模型（按 §9.2 per-model vision flag 决定）。

**要 wire 的 Qwen model 列表**（flagship / cheap / vision 各一 + 备选；**⚠ verify** wire id 对照 live `/models` 页，阿里 alias 漂移快）：

| 角色                  | externalModelId（stable / 推荐 pin 的 snapshot）                        | vision | context（ctx / max in / max out）                   | 价格（intl，分层）                   | 用途                                                                     |
| --------------------- | ----------------------------------------------------------------------- | ------ | --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| flagship 文本         | `qwen3-max`（snapshot `qwen3-max-2026-01-23`；alias `qwen-max-latest`） | 否     | 262,144 / 258,048 / 32,768                          | $1.2–3.0 in / $6.0–15.0 out per 1M   | 最高质量中文剧本/分镜/recipe 融合                                        |
| balanced 默认主力     | `qwen-plus`（`qwen-plus-2025-12-01`；alias `qwen-plus-latest`）         | 否     | 1,000,000 / 995,904 / 32,768                        | $0.4–1.2 in / $1.2–3.6 out per 1M    | 多数文本任务默认（关键词/storyboard JSON/enhance）；1M ctx 优于 DeepSeek |
| cheap/fast            | `qwen-flash`（`qwen-flash-2025-07-28`）                                 | 否     | 1,000,000 / 995,904 / 32,768                        | $0.05–0.25 in / $0.4–2.0 out per 1M  | 高频近确定性任务（拆解关键词/快速改写）；取代 qwen-turbo                 |
| vision flagship       | `qwen3-vl-plus`（`qwen3-vl-plus-2025-12-19`）                           | **是** | 262,144 / 258,048 / 32,768（原生 256K，可向 1M 扩） | $0.2–0.6 in / $1.6–4.8 out per 1M    | 拆解图片首选（看图反推），亦支持视频                                     |
| vision cheap（可选）  | `qwen3-vl-flash`（`qwen3-vl-flash-2025-10-15`）                         | **是** | 262,144 / 258,048 / 32,768                          | $0.05–0.12 in / $0.4–0.96 out per 1M | 高频/低成本拆解图片                                                      |
| vision 上一代（兜底） | `qwen-vl-max`（`qwen-vl-max-2025-08-13`）                               | **是** | 131,072 / 129,024 / 8,192                           | ~$0.23 in / ~$0.574 out（CN 卡）     | 高分辨率细节兜底；默认仍首选 `qwen3-vl-plus`                             |

**结构化 JSON（拆解关键词/分镜）**：`response_format: {"type":"json_object"}` 在 compatible-mode 可用（正是 codebase 给 DeepSeek 已发的分支）；JSON Schema 模式（`{"type":"json_schema", json_schema:{...}}` strict）对 Max/Plus/Flash/Turbo/Coder + VL 系亦有文档。**三个硬坑**：(1) 用 `json_object` 时 **system 或 user 消息必须字面含 "json"（不区分大小写）**，否则 400 `'messages' must contain the word 'json'`；(2) **thinking 模式下结构化输出不可用**——必须 `enable_thinking:false`（或用非 thinking 模型）；(3) Qwen3.x + json_schema 时若没关 thinking，reasoning 内容会泄进 `message.content`。净结论：关键词/storyboard JSON 任务一律 `response_format:{type:'json_object'}` + thinking off + prompt 含 "JSON"。

**视觉（拆解图片）**：用 Qwen-VL 模型，首选 `qwen3-vl-plus`（便宜档 `qwen3-vl-flash`，兜底 `qwen-vl-max`）。图片输入用标准 OpenAI 多模态 message：`content` 是 `{"type":"text",...}` 与 `{"type":"image_url","image_url":{"url":"https://... 或 data:image/...;base64,..."}}` 混合数组，同 `/chat/completions` 端点 + Bearer。PixelVault 的 vision 路由 = 选 DASHSCOPE adapter + 一个 vl externalModelId + 建 content 数组（codebase 的 VolcEngine/Gemini vision 路径已有此构造）+ `OpenAiChatResponseSchema` 解析。

**示例 body**（文本结构化 + 视觉变体）：

```json
{
  "model": "qwen-plus",
  "messages": [
    {
      "role": "system",
      "content": "You are a precise extractor. Reply with JSON only."
    },
    {
      "role": "user",
      "content": "Extract keywords as JSON: {\"keywords\": string[]}. Input: 赛博朋克城市夜景，霓虹反光，下雨"
    }
  ],
  "response_format": { "type": "json_object" },
  "max_tokens": 1024,
  "enable_thinking": false
}
```

```json
// 视觉（拆解图片）变体 — 换 model + 多模态 content：
{
  "model": "qwen3-vl-plus",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Describe this image and return JSON {\"tags\": string[]}."
        },
        {
          "type": "image_url",
          "image_url": { "url": "https://example.com/ref.jpg" }
        }
      ]
    }
  ],
  "response_format": { "type": "json_object" },
  "enable_thinking": false
}
// POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
// Headers: Authorization: Bearer $DASHSCOPE_API_KEY ; Content-Type: application/json
```

**坑**：

1. **REGION KEY 隔离**：Singapore(intl)/China/US 是独立部署 + 独立 console + 独立 key，跨 host 用错 key 返回 401/InvalidApiKey；base url 也 region-locked。PixelVault 用 Singapore（`dashscope-intl`）host + Singapore key。免费新账户额度（≈1M tokens/model，90 天）仅 Singapore 端点。
2. **MODEL-ID 漂移**：`*-latest` alias 永远指最新 snapshot（行为会变），dated snapshot（如 `qwen3-max-2026-01-23`）才 pinned。营销文已提 Qwen3.5/3.6/3.7-Max，**这些 id 未必在 compatible-mode 上线**——把 id 当**可配置常量放 `TEXT_MODELS`（externalModelId），不硬编码**，wire 前对照 live `/models` 核对。**⚠ verify**。
3. **TIERED PRICING**：单价按**每次请求的输入大小**分层（如 qwen-plus 过 128K/256K 跳更高档），长上下文 storyboard 任务按高档预算。表内为 intl 卡价，promo 敏感。
4. **JSON 模式**：需消息字面含 "json" + thinking 关闭（见上）。
5. **max output 上限**：max/plus/flash/3-vl 为 32,768，`qwen-vl-max` 为 8,192——别超。
6. 与 memory `[Prefer direct API over FAL]` + `[Slim by scoping]` 一致：这是干净的直连官方集成，文本档作 planner/extractor、VL 档作 vision 路由。

**新增 `AI_ADAPTER_TYPES.DASHSCOPE` 的同步**（沿用 §8 末尾「接入现有 adapter 约定」第 4 条）：除 enum + `AI_ADAPTER_TYPE_OPTIONS` 外，必须补 `src/constants/providers.ts` 的**五个 exhaustive `Record<AI_ADAPTER_TYPES,...>`**（`DEFAULT_PROVIDER_CONFIGS`/`ADAPTER_KEY_HINTS`/`ADAPTER_DEFAULT_COSTS`/`ADAPTER_CUSTOM_MODEL_EXAMPLES`/`ADAPTER_API_GUIDES`）+ `getProviderGroup`(models.ts) switch + `ProviderGroup` 联合类型 + `PROVIDER_GROUP_ORDER` + `config.ts` 的 `AI_PROVIDER_ENDPOINTS.DASHSCOPE`。DASHSCOPE 是 LLM-text adapter（有 key），需进 `LLM_TEXT_ADAPTERS`（llm-text.service.ts:86-90）与 `LLM_API_KEY_ADAPTERS`（api-keys.ts:10-14），并出现在 `llmTextCompletion` switch（llm-text.service.ts:560-571，加 `case DASHSCOPE`）与 `getBaseUrlForAdapter`（150-159）。

> 注：DashScope **非** `AI_MODELS` 生成模型，不进 `models/*` enum/option/i18n×3——它只是 `TEXT_MODELS` 注册表 + adapter 接线。这与 §8 的 ELEVENLABS/MINIMAX（进 audio ModelOption）不同。

### 9.4 Qwen 在新分类里的定位

Qwen 全部进 `TEXT_MODELS` 注册表（§9.2），**不**进 `AI_MODELS`。各档挂载的 use-case：

| Qwen 档                  | capabilities               | 挂的 TextUseCase（建议默认）                                                 | 角色                                                  |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| `qwen3-max`              | text, json, ctx 262K       | `scriptGen`（剧本/分镜，强中文 flagship）                                    | 与 `deepseek-v4-pro` 同为中文文本档，质量优先时选 max |
| `qwen-plus`              | text, json, ctx 1M         | `recipeFusion`，`scriptGen` 兜底                                             | 中文文本默认主力；1M ctx 利于长剧本                   |
| `qwen-flash`             | text, json, ctx 1M         | `enhance`，`intentParse`                                                     | 廉价档，高频确定性任务（拆解关键词/快速改写）         |
| `qwen3-vl-plus`          | **vision**, json, ctx 262K | `recipeVision`，`imageBreakdown` **候选**（与 `gemini-3.1-flash-lite` 并列） | 可选拆解图片视觉路由；强中文图文理解                  |
| `qwen3-vl-flash`（可选） | **vision**, json           | `imageBreakdown` 高频低成本变体                                              | 仅在不需 Plus 级质量时                                |

**定位要点**：Qwen 文本档（max/plus/flash）的**强中文**是它进 lineup 的独占受众理由（服务 en/ja/**zh**），与 `deepseek-v4-pro` 形成「两家直连中文文本」并列——可由用户按 key 可得性选其一为 `scriptGen` 默认；`qwen3-vl-plus` 让 DashScope 也能吃「拆解图片」，使**绑了 DashScope key 的用户无需再绑 Gemini/OpenAI 也能跑全套**（补 §2.1「跨厂商 vision 兜底」位）。是否把 `imageBreakdown` 默认从 Gemini 切到 Qwen-VL 由用户拍板（§9.5）。

### 9.5 给 Codex 的 change-list

> 通用规则：本节是**结构重构 + 一个新 adapter**，不碰 `AI_MODELS` 生成 enum/i18n×3（DashScope 不是生成模型）。做完跑 `npx vitest run src/constants/ src/services/llm-text.service.test.ts` + `npm run typecheck`。标 **⚠ verify** 的接线前先核对。

**新建 `src/constants/text-models.ts`**

- `TEXT_MODEL_IDS`（收编 `LLM_TEXT_MODEL_IDS` 四项 + 新增 5 个 Qwen id）。
- `TextModelEntry` 接口 + `TEXT_MODELS: Record<TextModelId, TextModelEntry>`（per-model `adapterType/externalModelId/capabilities{vision,json,grounding,contextWindow}/cost/label`）。
- `TEXT_USE_CASES` enum + `TEXT_MODEL_ROUTES: Record<TextUseCase, TextModelId>`（默认见 §9.2，**用户拍板后定**）。
- helper：`getTextModel(id)`、`textModelHasVision(id)`、`resolveTextModelForUseCase(useCase, {requireVision})`。
- **验证点**：每个 vision use-case 的默认 model `capabilities.vision === true`；`TEXT_MODELS` 的 `adapterType` 都在 `AI_ADAPTER_TYPES`。

**`src/constants/config.ts`**

- `AI_PROVIDER_ENDPOINTS.DASHSCOPE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'`（388-403）。**⚠ verify** 区域（intl vs CN）。
- `LLM_TEXT_MODEL_IDS`（405-410）：保留或被 `TEXT_MODEL_IDS` 收编（渐进迁移：先保留，`text-models.ts` 引用它）。
- **验证点**：`grep AI_PROVIDER_ENDPOINTS.DASHSCOPE` 在 `getBaseUrlForAdapter` 被消费。

**`src/constants/llm-capability.ts`（改造或废弃）**

- 短期：`ADAPTER_CAPABILITIES`（19-34）改为**从 `TEXT_MODELS` 派生**（聚合「adapter 有模型支持 scope」）；新增 `[DASHSCOPE]:['enhance','planner']`（DashScope 文本+VL 都有，VL 走 assistant 的 vision 也成立，但建议先给 enhance/planner）。
- 中期：能力判断改读 per-model（`textModelHasVision` 等），`adapterHasCapability` 标 deprecated。
- **验证点**：`llm-capability.test.ts` + `llm-capability.contract.test.ts` 同步；`adapterHasCapability(DASHSCOPE,'planner')===true`。

**`src/services/llm-text.service.ts`**

- 新增 `resolveLlmTextModel(userId, useCase, apiKeyId?)`（返回 `ResolvedLlmTextRoute & {modelId, externalModelId}`），内部复用 `resolveLlmTextRoute`(252-337) 的 key 选择 + 按 use-case vision 需求过滤 `vision:false` 模型。
- `LLM_TEXT_ADAPTERS`(86-90) 加 `DASHSCOPE`；`LLM_TEXT_MODELS`/`LLM_TEXT_LABELS`(98-108) 加 `DASHSCOPE` 默认（`qwen-plus` / `'Qwen'`）。
- `getBaseUrlForAdapter`(150-159) 加 `case DASHSCOPE → AI_PROVIDER_ENDPOINTS.DASHSCOPE`。
- 新增 `dashscopeTextCompletion(input)`：以 `deepseekTextCompletion`(480-528) 为模板，但 **(a) 不硬拒 `imageData`**——有图时按 OpenAI 多模态 `content[]` 构造（参照 `openAiTextCompletion` 456 附近）；(b) body 加 `enable_thinking:false`（结构化任务）；(c) JSON 任务确保 prompt 含 "json"（调用方保证或 adapter 兜底注入）。
- `llmTextCompletion` switch(560-571) 加 `case AI_ADAPTER_TYPES.DASHSCOPE: return dashscopeTextCompletion(input)`。
- **验证点**：`resolveLlmTextRoute` 兜底平台 Gemini key 仍工作；vision use-case 不会解析到 `deepseek-v4-pro`；`llm-text.service.test.ts` 加 DASHSCOPE 文本 + VL 用例。

**`src/constants/providers.ts`**

- `AI_ADAPTER_TYPES` 加 `DASHSCOPE = 'dashscope'`（3-14）。
- 同步五个 `Record<AI_ADAPTER_TYPES,...>` + `AI_ADAPTER_TYPE_OPTIONS` + `getProviderGroup`(models.ts) + `ProviderGroup` + `PROVIDER_GROUP_ORDER`（缺 key 即 type error，顺 tsc 报错补）。`ADAPTER_KEY_HINTS[DASHSCOPE]` 提示 `DASHSCOPE_API_KEY`（`sk-...`）+ Singapore 区域。
- **验证点**：`npx vitest run src/constants/` 全绿；DASHSCOPE 进 `LLM_API_KEY_ADAPTERS`(api-keys.ts) 后出现在 ActiveApiKey 选项。

**各 use-site（迁移到 `resolveLlmTextModel`，可分批）**

- planner（`script-breakdown.service.ts` / `seedance-prompt-plan.service.ts`）：`SCRIPT_PLANNER_MODELS`(script-breakdown.ts:41-57) 折叠进 `TEXT_MODEL_ROUTES.scriptGen`，或加 `dashscope` 行（`qwen3-max`）。
- enhance/intent/recipe/feedback/evaluator/character/story 各 service：逐个把 `resolveLlmTextRoute(no modelId)` 换成 `resolveLlmTextModel(useCase)`，传 `externalModelId` 为 `LlmTextInput.modelId`。**vision use-site**（image-analysis/image-3d-prep/generation-feedback/evaluator/character-scoring/recipe-vision/prompt-assistant）声明 `requireVision`。
- `use-llm-route-picker.ts`(66-113)：UI 选项 re-key 到 textModelId（中期；短期靠派生 `ADAPTER_CAPABILITIES` 兼容）。
- **验证点**：每个迁移后的 use-site 在 `imageData` 存在时解析到 `vision:true` 模型；未迁移者行为不变。

**新增 adapter（可选实现位）**：DashScope 的 completion 逻辑放在 `llm-text.service.ts`（`dashscopeTextCompletion`，与 DeepSeek/OpenAI/Gemini 同层），**不**新建 `src/services/providers/dashscope.adapter.ts`——LLM-text 不走 `ProviderAdapter`/`registry.ts`（那是 image/video/audio 生成路径），与现有三个文本 provider 同构即可。

**用户需拍板（开放问题，呼应 §6 风格）**

1. **已定** — `scriptGen` = `qwen3-max`；`imageBreakdown` = `gemini-3.1-flash-lite`（默认）+ `qwen3-vl-plus`（DashScope/中文图备选，resolver 在可用 adapter=DASHSCOPE 时落它）。其余 use-case 默认沿用 §9.2 表。
2. DashScope 区域：确认 PixelVault 用 Singapore（`dashscope-intl`）+ Singapore key（**⚠ verify** 现有 BYOK 用户区域）。
3. Qwen wire id：`qwen3-max-2026-01-23` 等 snapshot 是否仍 live（**⚠ verify** `/models`），还是用 `*-latest` alias 换稳定性。
4. **已定：分批** — 先接 DashScope + 新 `TEXT_MODELS` 注册表 + `resolveLlmTextModel`，use-site 分批迁，未迁者行为不变。

---

## 10. Codex execution update - 2026-06-15

- Frontend model selectors were aligned with the slimmed catalog: API key creation now exposes only active adapters, while schema compatibility still keeps the full historical adapter enum.
- Studio image, video, audio, 3D, and Node workflow model pickers now reuse one saved-key matcher that requires both `modelId` and `adapterType` to match the target modality.
- LLM route pickers now register concrete text models for enhance/planner/assistant routes instead of falling back to provider ids. Saved LLM routes show the text model as the primary label and the API key label as metadata.
- All shared model picker triggers now default to model names as the primary label; API key labels remain searchable metadata. Studio command palette also switches model lists by the active image/video/audio mode.
- Node workflow model coverage is guarded by `src/constants/node-types.test.ts`: image/audio/video generative nodes must map to the matching model bucket; upload/merge utility video nodes are intentionally excluded from model selection.
- Validation run: targeted Vitest suite, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

---

## 11. 模型选择器 + BYOK 两步重构（厂商优先）

> 决策（2026-06-15）：选择器与 BYOK 都改成「**先选厂商（家）→ 再选模型 id**」。**配厂商级 key 一次，该厂商所有内建模型解锁**（不再 per-model 配置）。分工：UI + 展示逻辑 = Claude（配 frontend-design）；schema + service = Codex。这是设计已确认稿，可落地。

### 11.1 两步选择器（已确认 ①–④）

抽屉式下钻：**第 1 屏选家**（带 国内/海外 标 + key 状态 + 模型数 + `›`），点一下到**第 2 屏选具体 model id**（带 `←` 返回）。

- **① 搜索永远跳步**：顶部搜索框跨所有家直接出模型结果，老手输关键词即达。
- **② 只有 1 家时自动跳过第 1 步**：家少的模态（音频/3D）不强加一跳。
- **③ 旧 source 分组融进「家内部」**：原「你的 key / 平台额度 / 需配置」三组，改成在某一家内部——你的 key 模型排前（绿健康点）、平台额度次之、需配置灰显（点了走 `QuickSetupDialog`）。
- **④ 国内/海外标在第 1 屏（家级）**：承接 §4.2 的 provider 文字标注（`VOLCENGINE→国内`，其余→海外；纯展示常量 `ADAPTER_REGION_LABEL`）。
- **落点**：`src/components/business/studio-shared/pickers/BaseModelPickerPanel.tsx`（单层 Popover → 两屏下钻 + 一个 back 状态）。`MainModelPicker` 的 5 个模态（image/video/audio/model_3d/**llm_assist**，含 §9 文本模型）全复用同一 panel，**改一处全模态生效**。数据层已就绪：`groupModelsByProvider()` / `getProviderGroup()` / `getProviderLabel()`（`models.ts` / `providers.ts`）。心智与「API 路由」加 key 流程（`ApiKeyForm` 本就 adapter→model）一致。

### 11.2 BYOK 改为厂商级（⑤）

**现状（已核实源码）**：`UserApiKey` 唯一键 `(userId, adapterType, modelId)`（`prisma/schema.prisma:195`），`createApiKey` upsert on `userId_adapterType_modelId`（`apiKey.service.ts:200`），UI `apiKeyMatchesModelOption` 要求 `model.id === key.modelId`（`src/lib/model-options.ts:49`）——所以同一厂商 key 要为每个模型各存一行（截图里 `c67d…a8ae` 在 Flux 2 Pro 与 Seedream 4.5 各一份）。

**关键发现：后端其实已经是厂商级**——`findActiveKeyForAdapter(userId, adapter)`（`apiKey.service.ts:161`）`findFirst({where:{userId, adapterType, isActive}})` **忽略 modelId**，schema 专门建了 `@@index([userId, adapterType, isActive, createdAt])` 注释「without touching modelId」，`resolveGenerationRoute` 的 auto-key 分支走它。**即：存了任一 fal 模型的 key，所有 fal 模型生成时都已能用**——per-model 纯属「存储 + UI 展示」冗余。

**改法**：BYOK 升为厂商级，配 fal key 一次 → 覆盖该厂商所有内建模型。第 1 屏里有 active key 的家，其名下所有模型在第 2 屏显示「可用（绿）」，**"需配置"从 per-模型 变 per-厂商**。

| 分工                          | 改动                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Codex**（schema + service） | `UserApiKey.modelId` 改**可空**（NULL=厂商级 key 覆盖内建；非空=自定义模型条目）；唯一键放宽（厂商级 = `(userId, adapterType)` where modelId NULL）+ migration；`createApiKey` 内建 provider 不再要 modelId；**保留 custom-model 路径**（见 §11.3）。                                                                                                                        |
| **Claude**（UI + 展示逻辑）   | `apiKeyMatchesModelOption`：`model.id===key.modelId` → **`model.adapterType===key.adapterType`**（厂商级 key 覆盖该 adapter 所有内建模型；自定义条目仍按 modelId 精确匹配）；`ApiKeyForm.tsx`：内建 provider 去掉"选模型"步，只「选厂商 → 贴 key」（自定义模型作"高级"折叠项）；`ApiKeyManager.tsx`（API 路由面板）：按厂商分组，展示「fal.ai · 你的 key · 覆盖 N 个模型」。 |

### 11.3 唯一保留 per-model 的情况

自定义模型 id（VolcEngine `ep-xxx` 接入点 / 自定义 HuggingFace repo / 自定义 fal slug）——model id 由用户提供，需 per-`(adapter, customModelId)` 存（key + 自定义 model id 一起）。这是"高级"路径，不影响内建模型的厂商级简化；`apiKeyMatchesModelOption` 对自定义条目仍走精确 modelId 匹配。

> **验证点**：(1) 厂商级 key 迁移后，旧的 per-model 重复行需 dedup（同 `(userId, adapterType)` 留最新 active）；(2) `findActiveKeyForAdapter` 行为不变（已 per-adapter）；(3) UI 改 `adapterType` 匹配后跑 `model-options` 单测 + 选择器交互；(4) 自定义模型条目不被厂商级简化误删。

### 11.4 「API 路由」面板（ApiKeyManager）= 同一两步视觉（已确认）

`ApiKeyManager.tsx`（截图那个「API 路由」面板）与主选择器（§11.1）**对齐成同一套两步「厂商 → 模型」视觉，不做两套设计**。

- **主视图 = 厂商列表（家）**：每行一个家——名称 + 国内/海外标 + key 状态（已配/未配 + 健康点）+「覆盖 N 个模型」+ `›`。取代现在的 per-model 路由卡（截图里同一 fal key 在多个模型重复列的形态）。
- **添加 key = 厂商优先**：「添加路由」→ 选厂商 → 贴 key（内建无需选模型）；自定义模型作"高级"折叠。`ApiKeyForm` 与 picker 同样 adapter→model 心智。
- **下钻一个家**：展开看名下模型 + 各自健康（与 picker 第 2 屏同构）。
- **共享组件 / tokens（DRY）**：把 provider-row / model-row 抽成共享展示组件，picker 与 ApiKeyManager 复用，保证健康点 / 区域标 / 覆盖数三处口径与视觉完全一致。这是 frontend-design 落地的核心约束：**一套行组件，两处用**。

---

## 12. 实施进度（Claude 直接落地，2026-06-16）

> Owner 决定模型这条线由 Claude 端到端实现（不走 Codex）。本节记录已落地 + 验证的改动。

**已完成 + 已验证（full `tsc` 0 / eslint 0 / 相关单测通过）：**

- ✅ 审计确认：text / image / video / voice / 3d 五功能 API **运行时全部正确**（含新模型 flux-2-flash / happyhorse-1.0 / ltx-2.3 接好、gemini GA、ideogram v4）。`gemini-3.5-flash` 经核实由 planner 显式传 `modelId` 执行，非 bug。
- ✅ `src/constants/providers.ts`：新增 `ADAPTER_REGION_LABEL` + `getAdapterRegion`（纯展示，VolcEngine=cn，余 intl）。
- ✅ i18n `Common`（en/ja/zh）：`regionCn`/`regionIntl`/`savedKey`/`modelCount`/`backToProviders`。
- ✅ `BaseModelPickerPanel.tsx`：单步 → **两步（厂商→model id）**。搜索跳步、单厂商自动跳过、ref 守卫修复"点击退出" bug。**第 1 步配置**（未配厂商点击→`onRequestSetup`，行尾 `+`）/ **第 2 步只选**（隐藏 needsKey 组，无可用时兜底显示）。5 个模态全复用。
- ✅ `prisma/seed.ts`：弃用 inline 旧 catalog，改 `import { MODEL_OPTIONS } from '@/constants/models'` + re-seed 时 `deleteMany(notIn 现役 ids)` 清理死模型（修 §C1）。

**待做（最后一块）：**

- ⬜ `ApiKeyManager.tsx` / `ApiKeyForm.tsx` 对齐厂商优先视觉 + per-provider BYOK（§11.2/§11.4）。注意：`apiKeyMatchesModelOption` 改按 adapter + 选项装配让"一把 key 覆盖全厂商内建模型" + 可选 `UserApiKey.modelId` 改可空 + migration。属数据模型改动，需单独小心做 + 跑测试。
- ⬜（遗留 low）`prisma/seed.mjs` 是未被引用的孤儿旧 catalog，建议删除（`prisma db seed` 实际只跑 `seed.ts`）。`fal.adapter.ts` F5-TTS 死代码、`models.ts` RODIN family 缺项 等 low 项。
