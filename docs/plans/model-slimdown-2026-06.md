# PixelVault 模型精简实施报告 (Model Slimdown — Codex 执行版)

> 基准 commit: `3ebfecf0`。所有行号/字段名以当前 `src/constants/models/*` 为准。
> 本报告区分两种删除：**(a) 仅 `available:false`**（仍在 catalog 里占位，需彻底删 enum+option+i18n）与 **(b) 已在 `RETIRED_MODEL_IDS`**（运行时已屏蔽，但 enum/option/i18n 仍在，仍需物理删除）。两者对 Codex 都是"删干净"，但验证点不同——已 retired 的删起来零运行时风险，`available:true` 的删除要先确认无默认指向。
>
> 调研基准日期 2026-06-15，联网核实。标 medium/low 置信度与"verify before wiring"处务必在接线前核对 slug/价格。

---

## 1. 精简哲学

每一类 = **1 个旗舰**（覆盖 80% 主流需求的最强通用项）+ **少数不可替代的特色专精**（旗舰覆盖不到的独占能力：向量 SVG、开放权重 LoRA 生态、声音克隆、ZH 发音覆写、多说话人对话……），其余**冗余中间档全部物理删除**（不是 disable，是从 enum / option 数组 / i18n 三处一起删，避免 catalog 噪音与"看起来能选实际跑不通"）。判据是"删了之后有没有一个角色没人覆盖"——没有就删。直连官方 API 优先于 fal/Replicate，只有无官方直连或聚合器明确更优/唯一时才用 fal。

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

**定位**：生成，`gpt-image-2` 是旗舰，其余只留有**独占能力**的特色专精。精简后 **最终 13 个模型**（含 1 ADD `flux-2-flash` + ideogram v3→v4 就地升级），删 15。

> **删除清单复查记录（按"是否有独占特色"重过）**：早期草案删 18 个，复查后捞回 3 个有独占能力的——`gemini-3.1-flash-image`（唯一免费档 + Arena 第一）、`seedream-4.5`（中文语义/图内中文最强）、`nai-diffusion-4-5-curated`（干净数据集、更可控）。判据从"是否被旗舰压制"改成"删了之后是否有一个角色/能力没人覆盖"。

**最终保留 lineup**

| 角色/能力                 | model id (enum)                           | provider                 | 连接方式                | 成本(credits) | 理由                                                                                   |
| ------------------------- | ----------------------------------------- | ------------------------ | ----------------------- | ------------- | -------------------------------------------------------------------------------------- |
| 旗舰通用                  | `gpt-image-2`                             | OpenAI                   | direct                  | 3             | LLM-Stats 图像 arena #1；~99% 多语种文字准确、4K、推理驱动。最强全能。                 |
| 推理+多参考通用           | `gemini-3-pro-image-preview`              | Gemini (Nano Banana Pro) | direct                  | 3             | verified #2，独占 profile：SOTA 推理、多轮编辑、最多 14 张参考图、FID 12.4。           |
| 写实替代                  | `flux-2-pro`                              | fal (BFL)                | fal                     | 2             | FLUX 领先纯写实+提示词遵循，pro 是量产价值档。gpt 占绝对顶档，一个 FLUX 写实就够。     |
| 图内文字/排版             | `ideogram-3`(enum 名保留)                 | fal (Ideogram 4.0)       | fal — **升级 endpoint** | 2             | 文字渲染断层第一（90-95% vs 30-50%）。v4 = 9.3B、原生 2K。                             |
| 设计/原生矢量 SVG         | `recraft-v4-pro`                          | fal (Recraft)            | fal                     | 2             | 唯一能出真·可编辑 SVG 路径（真曲线/节点，非描摹）+ 品牌套件。独占角色。                |
| 闭源动漫旗舰              | `nai-diffusion-4-5-full`                  | NovelAI                  | direct                  | 2             | 从零训练的专有动漫模型，#1 闭源动漫，线稿/解剖 pro 级。                                |
| 开放动漫底模+Civitai LoRA | `illustrious-xl`(→`delta-lock/noobai-xl`) | Replicate                | Replicate               | 2             | 开放 SDXL 系动漫底模 + 海量 Civitai LoRA 生态，`supportsLora:true`。NovelAI 无法替代。 |
| LoRA 通道 (FLUX.1-D)      | `flux-lora`                               | fal                      | fal                     | 1             | 跑 Civitai FLUX.1-D LoRA 的规范 endpoint。                                             |
| 廉价/快速档               | **`flux-2-flash`** (NEW)                  | fal (BFL)                | fal                     | ~1            | BFL 最快 FLUX.2，亚秒、$0.005/MP、文字清晰。严格优于 FLUX.1 schnell。                  |
| 参考/局部编辑             | `flux-kontext-max`                        | fal (BFL)                | fal                     | 3             | 外科级 in-context 编辑（重绘/换姿势/扩展）不毁周边像素，Max 是多参考超集。             |

**新增表**

| model id                                        | provider  | connection | 置信度                                                                                                                                            |
| ----------------------------------------------- | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flux-2-flash` (endpoint `fal-ai/flux-2/flash`) | fal (BFL) | fal        | high — **wire 前确认 fal credit 成本 + 是否 `supportsLora`/`maxPromptChars`**，对照 live `fal-ai/flux-2/flash` schema。占位设 1 credit / budget。 |

**就地升级（非新增非删除）**：`IDEOGRAM_3` 的 `externalModelId` 从 `fal-ai/ideogram/v3` → `fal-ai/ideogram/v4`（image.ts:115）。enum 名/i18n key 不变，仅换 endpoint 字符串。**wire 前确认 v4 默认 tier（Turbo/Default/Quality = $0.03/$0.06/$0.10）及 `maxPromptChars:1000` 是否仍成立**。

**删除表**

| model id                                                                | 当前状态                  | 理由                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `flux-2-max`                                                            | available:true            | 冗余 FLUX 顶档孪生；gpt 占绝对顶档，flux-2-pro 占写实，一个就够。                                                            |
| `flux-2-dev`                                                            | available:true            | 冗余中间：flux-lora 占 LoRA、flux-2-pro 占质量、flux-2-flash 占便宜。                                                        |
| `flux-2-schnell`                                                        | available:true            | 被 flux-2-flash 取代（更新更快更便宜文字更好）。                                                                             |
| `gemini-3.1-flash-image-preview`                                        | available:true (freeTier) | 冗余廉价档；flux-2-flash 占便宜、Gemini Pro Image 占 Gemini 高档。**注意它是 `PROVIDER_FALLBACK_MAP` 多条目标，删前改 §5**。 |
| `seedream-4.5`                                                          | available:true            | 4K/文字/鲜艳/多变体全被 gpt+ideogram+flux-2-pro 覆盖。                                                                       |
| `seedream-5.0-lite`                                                     | available:true            | 轻量档与 flux-2-flash 重叠，不够特色。                                                                                       |
| `seedream-4.0`                                                          | available:true            | 中档被 flux-2-pro+gpt 压制。                                                                                                 |
| `seedream-3.0`                                                          | available:false           | 已 retired，入门级，全档压制。彻底删。                                                                                       |
| `recraft-v3`                                                            | available:false           | 被 recraft-v4-pro 完全取代。                                                                                                 |
| `animagine-xl-4.0`                                                      | available:true            | 开放动漫位被 Illustrious/noobai 压制（LoRA 生态更大）。                                                                      |
| `nai-diffusion-4-5-curated`                                             | available:true            | NovelAI V4.5 Full 的子集，留 Full。                                                                                          |
| `flux-kontext-pro`                                                      | available:true            | 单参考子集，留多参考 Max。                                                                                                   |
| `sd-3.5-large`                                                          | available:false           | 开源基线全面被压制。                                                                                                         |
| `gemini-2.5-flash-image`                                                | available:false           | 上一代，被 Gemini 3 Pro Image + flux-2-flash 取代。                                                                          |
| `sdxl` / `playground-v2.5` / `nai-diffusion-4-full` / `nai-diffusion-3` | available:false           | 已 retired 死重，本轮一并物理删（enum+option+i18n+各 map）。                                                                 |

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

| model id                                                 | 理由                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `seedance-2.0-volc` / `seedance-2.0-fast-volc`           | VolcEngine-direct 与 seedance-2.0 同模型，CN account+实名+接入点墙劣于 BytePlus；冗余。                   |
| `seedance-pro` / `seedance-1.5-pro` / `seedance-1.0-pro` | legacy v1/1.5，被 2.0 + Kling v3 native extend 取代。                                                     |
| `minimax-video` (Hailuo 2.3)                             | 中档，无独占角色。                                                                                        |
| `luma-ray-2`                                             | Ray-2 无音频，被 Kling v3/LTX 压制。                                                                      |
| `pika-v2.5`                                              | 无 KEEP 集缺的独占能力。                                                                                  |
| `kling-video` (v2.1)                                     | 被 kling-v3-pro 严格取代。                                                                                |
| `runway-gen4.5` / `runway-gen4-turbo` / `runway-gen3`    | 独立 RUNWAY adapter 开销，Veo/Kling/Seedance i2v 全覆盖；删 3 个可顺带砍掉 RUNWAY adapter 依赖（§6-Q5）。 |
| `wan-video` (2.6) / `hunyuan-video`                      | 被 LTX-2.3 取代（开放、更便宜、更好）。                                                                   |
| `vidu-q3-pro`                                            | 无高于 HappyHorse/Kling 的角色。                                                                          |

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

---

## 5. 给 Codex 的落地 change-list

> 通用规则：每删/加一个 `AI_MODELS` 模型，必须同步 7 处：**enum.ts → 对应 option 数组 → `models.ts` 的 `MODEL_MESSAGE_KEYS` + `MODEL_FAMILIES`（+ 若涉及 `RETIRED_MODEL_IDS`/`PROVIDER_FALLBACK_MAP`/`VIDEO_MODEL_PRIORITY`）→ i18n en/ja/zh 三个 `models.*` 块**。LLM-text 模型不在 enum，改 config.ts + node-studio.ts + script-breakdown.ts + llm-text.service.ts + llm-capability.ts。做完跑 `npx vitest run src/constants/`。

### `src/constants/models/enum.ts`

- **[KEEP]** `OPENAI_GPT_IMAGE_2`, `GEMINI_PRO_IMAGE`, `FLUX_2_PRO`, `IDEOGRAM_3`, `RECRAFT_V4_PRO`, `NOVELAI_V45_FULL`, `ILLUSTRIOUS_XL`, `FLUX_LORA`, `FLUX_KONTEXT_MAX`；视频 `SEEDANCE_20/_FAST/_REFERENCE/_FAST_REFERENCE`, `KLING_V3_PRO`, `VEO_31`；音频 `FISH_AUDIO_S2_PRO`；`ANIMA_PENCIL_XL`（占位不动）。
- **[ADD]** image: `FLUX_2_FLASH = 'flux-2-flash'`；video: `HAPPYHORSE_10 = 'happyhorse-1.0'`, `LTX_23 = 'ltx-2.3'`。
- **[ADD]** audio: `ELEVENLABS_V3 = 'eleven-v3'`, `MINIMAX_SPEECH_28_HD = 'minimax-speech-2.8-hd'`；可选 `OPENAI_GPT_4O_MINI_TTS`, `GEMINI_25_FLASH_TTS`；（若本轮做 §3）`VOICEVOX_AIVIS = 'voicevox-aivis'`。
- **[DELETE]** image: `SDXL`, `ANIMAGINE_XL_4`, `GEMINI_FLASH_IMAGE`, `FLUX_2_DEV`, `FLUX_2_SCHNELL`, `RECRAFT_V3`, `SEEDREAM_45`, `SEEDREAM_50_LITE`, `SEEDREAM_40`, `SEEDREAM_30`, `SD_35_LARGE`, `NOVELAI_V45_CURATED`, `NOVELAI_V4_FULL`, `NOVELAI_V3`, `GEMINI_25_FLASH_IMAGE`, `FLUX_2_MAX`, `FLUX_KONTEXT_PRO`, `PLAYGROUND_V25`。
- **[DELETE]** audio: `FAL_F5_TTS`。
- **[DELETE]** video: `KLING_VIDEO`, `MINIMAX_VIDEO`, `LUMA_RAY_2`, `WAN_VIDEO`, `HUNYUAN_VIDEO`, `SEEDANCE_20_VOLC`, `SEEDANCE_20_FAST_VOLC`, `SEEDANCE_PRO`, `SEEDANCE_15_PRO`, `SEEDANCE_10_PRO`, `VIDU_Q3_PRO`, `PIKA_V25`, `RUNWAY_GEN45`, `RUNWAY_GEN4_TURBO`, `RUNWAY_GEN3`。
- **验证点**：删 enum 成员会让 `MODEL_MESSAGE_KEYS`/`MODEL_FAMILIES`/`RETIRED_MODEL_IDS` 里的 `[AI_MODELS.X]` 引用编译失败——这是好事，顺着 tsc 报错逐处删干净。

### `src/constants/models/image.ts`

- **[REPLACE]** `IDEOGRAM_3.externalModelId`: `'fal-ai/ideogram/v3'` → `'fal-ai/ideogram/v4'`（验证点：v4 默认 tier + `maxPromptChars:1000` 是否仍准）。
- **[ADD]** `FLUX_2_FLASH` ModelOption：`adapterType: FAL`, `externalModelId:'fal-ai/flux-2/flash'`, `outputType:'IMAGE'`, `available:true`, `qualityTier:'budget'`, `styleTag:'general'`, `cost:1`（占位）。验证点：confirm fal credit 成本 + `supportsLora`/`maxPromptChars`。
- **[DELETE]** 上述所有 image 删除项的 ModelOption 块。
- **[KEEP]** `FLUX_2_PRO`, `GPT_IMAGE_2`, `GEMINI_PRO_IMAGE`, `RECRAFT_V4_PRO`, `NOVELAI_V45_FULL`, `ILLUSTRIOUS_XL`, `FLUX_LORA`, `FLUX_KONTEXT_MAX`, `ANIMA_PENCIL_XL`(false)。

### `src/constants/models/video.ts`

- **[ADD]** `HAPPYHORSE_10` ModelOption：`FAL`, `'alibaba/happy-horse/text-to-video'`, `i2vModelId:'alibaba/happy-horse/image-to-video'`, `available:true`, `qualityTier:'premium'`, `timeoutMs:300_000`, `videoDefaults:{generateAudio:true,resolution:'720p'}`, `cost` 按 §6-Q3 由 USD 反推。
- **[ADD]** `LTX_23` ModelOption：`FAL`, `'fal-ai/ltx-2.3/text-to-video'`, `i2vModelId:'fal-ai/ltx-2.3/image-to-video'`, `available:true`, `qualityTier:'budget'`, `videoDefaults.resolution` 按选定 tier。
- **[ADD]**（medium 置信）`SEEDANCE_20` 的 BytePlus direct 路由：不是新 ModelOption，而是 adapter 层备选路由 + feature flag；wire 前确认 ModelArk endpoint/ID。
- **[DELETE]** 上述所有 video 删除项的 ModelOption 块。
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
- **验证点**：删 DeepSeek/Doubao 前 grep `DEEPSEEK_V4_PRO`/`VOLCENGINE_DOUBAO`——`node-studio.ts:114`、`script-breakdown.ts:48`、`llm-text.service.ts:101/104` 会编译失败，逐处删（见下）。

### `src/constants/llm-capability.ts`

- **[REPLACE]** `ADAPTER_CAPABILITIES`：`[DEEPSEEK]: ['planner']`（**去掉 `assistant`**——assistant 含看图反推需要 vision，DeepSeek 文本版进不去会 throw；planner=剧本/分镜文本规划是它的强项，**保留**）、`[VOLCENGINE]: []`（doubao 文本退出 LLM-text）。核心修复 = `assistant` scope 不再混入 vision-blind adapter。
- **验证点**：确认 `assistant`/看图反推只路由到 vision adapter（Gemini/OpenAI），且 route resolver 在 `imageData` 存在时跳过 DeepSeek（否则命中 `deepseekTextCompletion` 的 imageData throw，`llm-text.service.ts:487`）；`llm-capability.test.ts` 同步更新断言。

### `src/constants/providers.ts`

- **[ADD]** `AI_ADAPTER_TYPES`：`MINIMAX = 'minimax'`, `ELEVENLABS = 'elevenlabs'`，（§3）`VOICEVOX = 'voicevox'`。三处同步：enum + `AI_ADAPTER_TYPE_OPTIONS` + 五个 `Record<AI_ADAPTER_TYPES, …>`（`DEFAULT_PROVIDER_CONFIGS`/`ADAPTER_KEY_HINTS`/`ADAPTER_DEFAULT_COSTS`/`ADAPTER_CUSTOM_MODEL_EXAMPLES`/`ADAPTER_API_GUIDES`）+ `getProviderGroup`(models.ts) + `ProviderGroup` 联合类型 + `PROVIDER_GROUP_ORDER`。VOICEVOX 无 key → `ADAPTER_KEY_HINTS` 给空/占位，**不进 QuickSetupDialog key-gate**（服务端自有 endpoint）。
- **[REPLACE]** `PROVIDER_FALLBACK_MAP`（L214-225）：删掉所有以 `gemini-3.1-flash-image-preview` 为 **value** 的兜底（`gpt-image-2`/`flux-2-pro`/`ideogram-3`/`recraft-v4-pro` 那几条）和以它为 **key** 的条目，以及 `flux-2-dev → flux-2-schnell`（两端都删）。**重指向**到保留模型（如 `gpt-image-2 → flux-2-pro`，`ideogram-3 → gpt-image-2`）。**这是删 `GEMINI_FLASH_IMAGE`/`FLUX_2_DEV`/`FLUX_2_SCHNELL` 的硬前置**，否则运行时兜底指向不存在的模型。
- **[KEEP]** 是否删 `RUNWAY`/`VOLCENGINE`/`DEEPSEEK` adapter type 本身——**先不删**，因为 enum 删除是 model 层；adapter type 删除影响 BYOK custom-model 路径，单列为 §6-Q5/Q6/Q10。

### `src/messages/{en,ja,zh}.json`

- **[DELETE]** 三文件 `models.*` 块里所有删除模型的 key（image：`sdxl`,`animagineXl4`,`geminiFlashImage`,`flux2Dev`,`flux2Schnell`,`recraftV3`,`seedream45`,`seedream50Lite`,`seedream40`,`seedream30`,`sd35Large`,`novelaiV45Curated`,`novelaiV4Full`,`novelaiV3`,`gemini25FlashImage`,`flux2Max`,`fluxKontextPro`,`playgroundV25`；audio：`falF5Tts`；video：`klingVideo`,`minimaxVideo`,`lumaRay2`,`wanVideo`,`hunyuanVideo`,`seedance20Volc`,`seedance20FastVolc`,`seedancePro`,`seedance15Pro`,`seedance10Pro`,`viduQ3Pro`,`pikaV25`,`runwayGen45`,`runwayGen4Turbo`,`runwayGen3`）。
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
5. **RUNWAY adapter 去留**：三个 Runway video 全删后，是否还有 BYOK custom-model 路径用 `AI_ADAPTER_TYPES.RUNWAY` / `RUNWAY_API`？无则可顺带砍掉整个 adapter 依赖。
6. **是否运营 CN/ByteDance 主体**：是 → VolcEngine-direct(~$0.13/s) 值得保留；否（默认假设）→ 删 `-volc` 重复，用 BytePlus 省钱。
7. **ElevenLabs PVC 路由**：PVC 尚未对 `eleven_v3` 完全优化。高保真专业克隆是否让 adapter 把 PVC voice 路由到 `eleven_multilingual_v2` 兜底、`eleven_v3` 只用于即时/库声音？这是真实质量悬崖，wire 前定。
8. **Voice 最小 vs 全量 + credit 跨度**：要绝对最小 3（Fish+Eleven+MiniMax），还是含两个近零成本工具合成（gpt-4o-mini-tts/gemini-flash-tts）？且 Fish ~$15/M vs MiniMax&Eleven ~$100/M 是 ~6-7x 跨度——`audio.ts` 的 per-model credit 是否反映该跨度（如 Fish=2、MiniMax/Eleven=5-6）还是保持平价？
9. **删 VolcEngine `enhance` 授权前**：确认无 enhance-only 流程依赖它（`llm-capability.ts:12`），且 VolcEngine 仍服务 Seedream/Doubao IMAGE 模型——确认从 LLM_TEXT 摘除 `doubao-1.5-pro-32k` 不影响图像路径（它们引用不同 externalModelId，应独立，但需验 config.ts + i18n 三语清理）。
10. **VOICEVOX/AivisSpeech 本轮是否做**：这是基础设施级工作（自托管引擎容器 + Worker→provider→R2→callback），远重于加 hosted model。本轮做还是单独排期？做的话只暴露 CC0/ACML 免署名声音。
11. **是否有用户把 DeepSeek/VolcEngine key 绑为唯一 LLM key**：`resolveLlmTextRoute` 会兜底到平台 Gemini key 保活，但需确认 `script-breakdown.ts`/`node-studio.ts` 里的 per-call modelId override 不会 pin 到已删 model id。

---

## 7. 精简前后对比（净数量）

| 类别            | 精简前 available | 精简后                             | 删除                          | 新增                                                |
| --------------- | ---------------- | ---------------------------------- | ----------------------------- | --------------------------------------------------- |
| Text→Text (LLM) | 6                | **4**                              | 2 (doubao, deepseek-v4-flash) | 0                                                   |
| Text→Image      | 20               | **11** (10 旧 KEEP + 1 ADD)        | 18 (含 retired 死重)          | 1 (flux-2-flash) + ideogram v4 升级                 |
| Text→Video      | 6                | **8** (6 KEEP + 2 ADD)             | 15 (全 retired)               | 2 (happyhorse, ltx-2.3)                             |
| Text→Voice      | 1                | **3 必加 + 2 可选 (+AivisSpeech)** | 1 (fal-f5-tts)                | 2 必 (eleven_v3, minimax) + 2 选 + 可选 AivisSpeech |

**新增 adapter 清单**：`MINIMAX`、`ELEVENLABS`、（可选）`VOICEVOX`；`OPENAI`/`GEMINI` 需补 TTS 代码路径；（可选）`BYTEPLUS_MODELARK` 视频 direct 路由。
