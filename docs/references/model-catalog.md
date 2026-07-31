# 模型目录月度审计 — model-catalog.md

> 定位：模型阵容的活文档——现役盘点 + 官方动态核验 + 添加/删除建议。**每月更新一次**；owner 点名（如 Seedream 5.0）随时插审。与每周 CI 分工：`model-doc-monitor` 查「接口还活着吗/文档漂移」，本文档管「阵容该怎么变」。
> ⚠ 本文档不豁免 WORKFLOW 联网核验规则：改模型代码前仍须查官方一手资料；本文档的建议表只是审计快照。

## 审计机制

| 周期     | 载体                                                                                              | 内容                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 每周一   | CI `.github/workflows/model-doc-monitor.yml`（cron `17 0 * * 1`，跑 `npm run models:check-docs`） | 模型文档/接口可用性自动检查，报告进 Actions job summary + artifact                                                                            |
| **每月** | 本文档                                                                                            | ①盘点 `src/constants/models/` ②逐 provider 官方页扫新版本/退役公告 ③接口与错误信息变更抽查 ④出添加/删除建议表交 owner 拍板 ⑤更新 Last Audited |
| 触发式   | 本文档「本月发现」节                                                                              | owner 点名的模型动态随时核验补录                                                                                                              |

月审步骤固定五问：现役哪些？官方出了什么新的？哪些该加（直连优先）？哪些该退（用量/被上位替代）？接口/错误格式变了吗？

## 现役阵容（2026-07-26 盘点，`available: true`）

### 图像（13 + 5 runner）

| enum                        | externalModelId                                   | 通道               |
| --------------------------- | ------------------------------------------------- | ------------------ |
| OPENAI_GPT_IMAGE_2          | （同 id）                                         | OpenAI 直连        |
| GEMINI_PRO_IMAGE            | gemini-3-pro-image                                | Gemini 直连        |
| GEMINI_FLASH_IMAGE          | gemini-3.1-flash-image                            | Gemini 直连        |
| **GEMINI_FLASH_LITE_IMAGE** | gemini-3.1-flash-lite-image                       | Gemini 直连        |
| FLUX_2_PRO / FLUX_2_FLASH   | fal-ai/flux-2-pro · fal-ai/flux-2/flash           | fal                |
| FLUX_KONTEXT_MAX            | fal-ai/flux-pro/kontext/max/multi                 | fal                |
| FLUX_LORA                   | fal-ai/flux-lora                                  | fal                |
| **SEEDREAM_50_PRO**         | bytedance/seedream/v5/pro/text-to-image（无前缀） | fal                |
| **SEEDREAM_50_LITE**        | fal-ai/bytedance/seedream/v5/lite/text-to-image   | fal                |
| **SEEDREAM_50_VOLCENGINE**  | doubao-seedream-5-0-260128                        | 火山方舟直连（cn） |
| RECRAFT_V4_PRO              | fal-ai/recraft/v4.1/pro/text-to-image             | fal                |
| ILLUSTRIOUS_XL              | delta-lock/noobai-xl                              | replicate          |

⚠ **`bytedance/seedream/v5/pro/...` 没有 `fal-ai/` 前缀**（同 `ideogram/v4` 的模式）——fal 上第三方 owner 的模型按 owner/model 直接寻址，照 4.5 的写法抄会 404。

Runner 族（`FEATURE_FLAGS.comfyRunner` 闸下）：ILLUSTRIOUS_RECIPE_CLONE · ANIMA_PENCIL_XL_RUNNER · PONY_DIFFUSION_V6 · SDXL_10_RUNNER · ANIMA_DIT_RUNNER。这一族是唯一真正吃用户 LoRA 的线。

### 视频（11）

| enum                                                | externalModelId                                  | 通道                                                          |
| --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| SEEDANCE_20(\_FAST)                                 | bytedance/seedance-2.0(/fast)/text-to-video      | fal                                                           |
| SEEDANCE_20(\_FAST)\_REFERENCE                      | bytedance/seedance-2.0(/fast)/reference-to-video | fal（画布视频汇点主力）                                       |
| SEEDANCE_20(\_FAST)\_VOLCENGINE + REFERENCE 变体 ×4 | doubao-seedance-2-0(-fast)-260128                | 火山方舟直连（cn）                                            |
| KLING_V3_PRO                                        | fal-ai/kling-video/v3/pro/text-to-video          | fal（唯一 native extend）                                     |
| HAPPYHORSE_10                                       | alibaba/happy-horse/v1.1/text-to-video           | fal                                                           |
| **GEMINI_OMNI_FLASH**                               | gemini-omni-flash-preview                        | Gemini 直连（**Interactions API**，非 generateContent，见 ⑦） |

### 音频（2）

FISH_AUDIO_S2_PRO（s2-pro，Fish 直连）· ELEVENLABS_SFX_V2（eleven_text_to_sound_v2，**唯一音效模型**）。

### 3D（5）

RODIN_GEN_2_5 · HUNYUAN3D_V31_PRO · HUNYUAN3D_V3 · TRELLIS_2 · TRIPOSR（全 fal 系）；HUNYUAN3D_2_1 已 false（被 v3.1 上位替代）。

## 本月发现（2026-07-26，首次全量 + 市场主流度审计）

### ① 生产事故：`gemini-3-pro-image-preview` 已被 Google 关停（已修）

`GEMINI_PRO_IMAGE.externalModelId` 一直是 preview 档，Google 停用表写明 **2026-06-25 关停**，GA 替代是 `gemini-3-pro-image`（GA 于 5-28）。同一模式的 flash 档在 2026-06 的精简报告 §310 里修过，pro 漏了。

修复面（只改 externalModelId 语义处，**enum 值不动**——它是 DB/i18n 稳定键）：

- `src/constants/models/image.ts` — GEMINI_PRO_IMAGE 执行 id
- `src/constants/providers.ts` — 自定义模型示例（原本给用户填的是已关停 id）
- `src/constants/edit-tasks.ts` + `canvas-image-edit-capabilities.ts` — **这两处是直发 id**：`image-edit.service.ts` 用 `params.modelId` 直接拼 URL，不走 `getExecutionModelId`，所以只改 models/image.ts 修不到 /studio/edit 链路

### ② 周检 CI 空转了约 2.5 个月（根因，修复补丁待应用）

`scripts/check-model-docs.mjs` 读 `src/constants/models.ts`，但目录已于 2026-05-11（`0c87b256`）拆进 `models/` 子目录。实跑 `models parsed: 0`——按模型的检查（含专门防 preview 残留的第 250 行、Gemini 生命周期交叉检查的第 586 行）全部静默失效。①之所以没被 CI 抓到就是这个原因。

修复要点：读 `models/enum.ts` + 四个 `*_OPTIONS` 子文件，并在**解析到 0 个模型时抛错**——原脚本的失败模式是空数组 + 报告一切正常，比直接报错危险得多。

### ③ 目录是 DB-first，但 ModelConfig 表当前为空

`getResolvedModelOption()` 先查 `ModelConfig` 表，命中就用 `config.externalModelId` **无条件覆盖**代码常量（`toResolvedModelOption` 不是 `??` 回退）。实测生产库 `ModelConfig` **0 行**，所以代码常量当前就是唯一事实源。⚠ 一旦有人往这张表写数据，改代码常量将不再生效。

### ④ 市场主流度对账（判据：公开榜单，非本项目内部用量）

图像 —— Artificial Analysis text-to-image arena（blind vote）：GPT Image 2 (high) 1338 居首，其后 Reve 2.1 · MAI-Image-2.5 · Nano Banana 2 Lite 1262 · Nano Banana 2 1261 · HiDream-O1 · **Seedream 5.0 Pro 1239（#8）** · Nano Banana Pro 1223（#9）· Recraft V4.1 1202（#13）· FLUX.2 [max] 1194（#15）。**Seedream 4.5 与 Ideogram 均未进前 15。**

视频 —— **Gemini Omni Flash 三榜通杀**（T2V 无音频 1325 / T2V 有音频 1244 / I2V 1375）；HappyHorse-1.0/1.1 与 Seedance 2.0 稳居前五；**Veo 3.1 与 Kling v3 均已跌出前五**。

TTS —— Fish Audio S2 Pro（#11，$15/1M 字符）对 ElevenLabs v3（$100/1M）性价比压倒，且 Inworld / Gemini 3.1 Flash TTS 在质量上已超过 v3。

LoRA 底模（2026-07-30 社区对账，详见 [`../plans/research/LoRA/LoRA底模与工作流调研-2026-07.md`](../plans/research/LoRA/LoRA底模与工作流调研-2026-07.md)）：

| 族                           | 社区角色（2026）                                                         | 本仓                                     |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| **Illustrious / NoobAI**     | 新默认质量 + 大量新角色/画风 LoRA；WAI-Illustrious 等 fine-tune 下载极高 | hosted NoobAI-XL；runner WAI-Illustrious |
| **Pony（V6 系）**            | **LoRA 库存与角色覆盖仍最深**；依赖 `score_9…` 方言                      | runner Pony V6（无单独 hosted 快通道）   |
| **FLUX.1**                   | 写实/提示服从 LoRA 生态成熟中                                            | `flux-hosted` / FLUX_LORA                |
| **Anima DiT**                | 动画向新热；与 Pencil XL **不同架构**                                    | runner + 来源图自动 checkpoint           |
| **Anima Pencil / 纯 SDXL**   | 存量与部分画风线                                                         | 已覆盖                                   |
| **SD 1.5**                   | 历史库；新训练少                                                         | 目录保留，runner 不主推                  |
| Krea2 / Z-Image / Qwen-Image | 本地新底观察项                                                           | **未**作 LoRA 插槽                       |

工作流骨架：Checkpoint → 多 LoRA 栈 → 采样（参数跟 checkpoint 页）；配方还原用源图 meta → Runner 忠实 / hosted 快。Pony↔IL 勿默认互通。

### ⑤ 本轮退役（`available: false` + 进 RETIRED_MODEL_IDS，不物理删除）

| 退役                         | 理由                                                      |
| ---------------------------- | --------------------------------------------------------- |
| SEEDREAM_45 / \_VOLCENGINE   | 被 5.0 取代                                               |
| IDEOGRAM_3                   | 未进前 15；文字排版位已被 GPT Image 2 / Seedream 5.0 覆盖 |
| NOVELAI_V45_FULL / \_CURATED | 本部署 46% 成功率（42/91 次）+ 榜单垫底                   |
| VEO_31                       | 跌出视频前五且单价最高（8 credit）                        |
| LTX_23                       | 未上榜；budget 位由 SEEDANCE_20_FAST 承担                 |
| ELEVENLABS_V3                | 约 6.7 倍于 Fish S2 Pro 的价格，质量不占优                |

**退役 ≠ 删除**：条目保留在 enum / MODEL_OPTIONS / i18n 里，只是从选择器消失。永久归档是产品承诺，历史 Generation 记录的 `model` 字段引用着这些 id，物理删除会让旧作品失去模型标签与所属族。

保留的独占能力（删除前必查）：Recraft = 唯一矢量/SVG 输出；ELEVENLABS_SFX_V2 = 唯一音效模型；KLING_V3_PRO = 退役 Veo 后唯一 native video extend；火山方舟五变体 = 唯一国内直连线。

### ⑥ 待接（本轮未做，各有明确阻塞）

| 模型                  | 状态                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seedance 2.5          | **未 GA**。fal 原话「announced, not yet released」；模型页 `bytedance/seedance-2.5/text-to-video` 存在但为 early access，需申请且限美国境外 B2B + 身份验证 |
| ~~Gemini Omni Flash~~ | **已于 2026-07-26 接入**，见下节 ⑦                                                                                                                         |
| Seedream 5.0 edit     | Pro/Lite 都有 edit 端点，低幻觉可控编辑对编辑工作台是能力升级，未接                                                                                        |

### ⑦ Gemini Omni Flash 接入笔记（2026-07-26）

**它不走 `:generateContent`。** Gemini 视频跑在 **Interactions API** 上——一个 create/poll 面，正好对上项目的 `submitVideoToQueue` + `checkVideoQueueStatus` 契约。

| 环节 | 形态                                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提交 | `POST /v1beta/interactions`，body = `{ model, input[], response_format:{type:'video',aspect_ratio,delivery:'uri'}, video_config:{task} }`                                        |
| 轮询 | `GET /v1beta/interactions/{id}`，状态机 `queued / in_progress / requires_action / completed / failed / cancelled / incomplete / budget_exceeded`                                 |
| 取件 | `delivery:'uri'` 落到 Files API。**必须先等 `GET /v1beta/files/{id}` 的 `state` 变 `ACTIVE`**，否则下载 403；最终 URL = `…/files/{id}:download?alt=media`，需带 `x-goog-api-key` |

`input` 是新格式（旧 `contents[].parts[].inlineData` 的替代）：`[{type:'text',text}, {type:'image',mime_type,data}]`。带参考图时 `video_config.task` 自动切 `image_to_video`。

选 `delivery:'uri'` 而非默认的 inline base64，是因为 720p 片段会变成几 MB 的 JSON；URL 需要鉴权下载，正好用 `ProviderVideoResult.fetchHeaders`（OpenAI Sora 同款路径）。

**三点已知限制**（都在代码注释里标了）：

1. **时长不可控** —— Interactions API 没有 duration 参数，官方只说输出 3–10 秒。能力矩阵故意只声明 `[8]` 单值，而不是给一个假的选择器。
2. **轮询拿不到方向** —— `checkVideoQueueStatus` 的入参只有 `statusUrl/responseUrl/apiKey`，看不到请求时的 aspect ratio，响应里也没有像素尺寸。所以竖屏片段会被标成 1280x720（文件本身是对的，只是元数据不准）。
3. **⚠ 未经真机验证** —— 实现完全按官方文档写，单测覆盖了提交/轮询/Files 三态/失败分支，但没有用真 API key 跑过一次真实生成。首次真机调用要盯 `submitVideoToQueue` 的 4xx 和 `checkVideoQueueStatus` 里 `Unrecognised video URI` 这条错误——如果 uri 形态和文档不一致，会命中它。

`gemini-omni-flash-preview` 是 preview 档，enum 值特意写成 `gemini-omni-flash`（不含 `-preview`），GA 时只改一行 externalModelId——这是①那次事故的直接教训。

### ⑧ 2026-07-30 业界升级审计 — **已实现清单（别再当 backlog 排期）**

> 来源：[`../plans/research/模型接入/全站模型升级审计-2026-07-30.md`](../plans/research/模型接入/全站模型升级审计-2026-07-30.md) §9。
> **回写理由**：那份调研文首是「优先级/建议」口吻，但 §9 记着当天已落地——只读文首会把这五项重新排一遍期。

| 项                         | 状态             | 代码事实（2026-07-31 复核）                                                                                                 |
| -------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Fish TTS 升 s2.1-pro**   | ✅ 已实现        | `models/audio.ts` `externalModelId: 's2.1-pro'`；**稳定 key 仍是 `fish-audio-s2-pro`**（只换 external id，不动 enum）       |
| **Kling O3 Pro**           | ✅ 已实现        | 新模型条目 + fal builder 与 V3 同形                                                                                         |
| **ElevenLabs Music v2**    | ✅ 已实现        | `externalModelId: 'music_v2'` + `audioKind: MUSIC` + `generateMusic` + service 分支 → **speech / sfx / music 三档矩阵补齐** |
| **FLUX.2 Pro Edit**        | ✅ 已实现        | catalog + fal 多参考分支 + 编辑能力 `object-replace` / `style-transfer`                                                     |
| **Gemini Omni 去 preview** | ⏸ **被上游卡住** | 官方文档仍只有 `gemini-omni-flash-preview`；**未改 id**。enum 已预留（见 ⑦ 末段），GA 时改一行                              |

**剩余待办（真 backlog）：** ①Gemini Omni GA id（等 Google）②火山 Seedream/Seedance endpoint 月审（下次 2026-08）③3D 目录增量 —— 但 **产品优先于模型**：GLB 下游用途未定前不优先堆 Meshy / 完整 Tripo（`product.md` 3D 节已重述）。

## 接入执行规范（指针）

- 加模型四件套：`AI_MODELS` enum + 模型配置 + i18n ×3 + provider adapter（`backend.md`）。
- 直连官方优先，FAL 仅在无直连或 FAL 唯一/更优时（owner 拍板规则）。
- 错误信息：接入时把 provider 错误码映射进 `constants/generation-errors`（→ i18nKey）；逐 provider 错误格式细化归 `providers.md`（批 2 待写）。

## Source of Truth

- `src/constants/models/{enum,image,video,audio,model-3d,types}.ts` · `src/constants/providers.ts`
- `.github/workflows/model-doc-monitor.yml` + `npm run models:check-docs`
- 官方资料（本次）：fal Seedream 5.0 模型页与文档、ByteDance Seed 官方页

## Last Audited

- Date: 2026-07-31 · 范围：**回写补登**——把 2026-07-30 业界升级审计的**已实现**结果登记为 §⑧（Fish s2.1-pro / Kling O3 Pro / EL Music v2 / FLUX.2 Pro Edit 四项已落地，Gemini Omni GA 被上游卡住）。同日复核 `models/audio.ts` 确认 `s2.1-pro`、`music_v2`、`eleven_v3: available:false`。**未改模型代码。**
- Date: 2026-07-26 · 范围：**首次全量**——全 provider 版本扫描 + 公开榜单主流度对账 + 生产库用量/成功率抽样。产出：修复 1 起线上失效（Gemini pro preview）、定位 1 起 CI 空转（周检脚本）、接入 4 个（Seedream 5.0 ×3 + Nano Banana 2 Lite）、升级 2 个（Recraft V4.1 / HappyHorse v1.1）、退役 7 个。下次月审：**2026-08 初**，重点跟进 Seedance 2.5 是否 GA 与 Gemini Omni Flash 接入排期。
- Date: 2026-07-30 · **LoRA 底模/工作流社区调研**写入 `docs/plans/research/LoRA/LoRA底模与工作流调研-2026-07.md`（2026-07-31 起按模块归入 `LoRA/` 子目录），并回写本节 §④ LoRA 表；未改模型代码。
