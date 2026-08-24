# 模型目录月度审计 — model-catalog.md

> 定位：模型阵容的活文档——现役盘点 + 官方动态核验 + 添加/删除建议。**每月更新一次**；owner 点名（如 Seedream 5.0）随时插审。与每周 CI 分工：`model-doc-monitor` 查「接口还活着吗/文档漂移」，本文档管「阵容该怎么变」。
> ⚠ 本文档不豁免 WORKFLOW 联网核验规则：改模型代码前仍须查官方一手资料；本文档的建议表只是审计快照。

## 审计机制

| 周期     | 载体                                                                                              | 内容                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 每周一   | CI `.github/workflows/model-doc-monitor.yml`（cron `17 0 * * 1`，跑 `npm run models:check-docs`） | 模型文档/接口可用性自动检查，报告进 Actions job summary + artifact                                                                            |
| **每月** | 本文档                                                                                            | ①盘点 `src/constants/models/` ②逐 provider 官方页扫新版本/退役公告 ③接口与错误信息变更抽查 ④出添加/删除建议表交 owner 拍板 ⑤更新 Last Audited |
| 触发式   | 本文档「本月发现」节                                                                              | owner 点名的模型动态随时核验补录                                                                                                              |

月审步骤固定**六问**：现役哪些？官方出了什么新的？哪些该加（直连优先）？哪些该退（用量/被上位替代）？接口/错误格式变了吗？**这一档是价钱不同还是能力不同？**

> 第六问是 2026-08-21 新增的，判据与理由见 §⑮。一句话：**价钱不同 → 走参数或路由，不进目录；能力不同 → 才配一条目录条目。**

## 现役阵容（⚠ 下方逐条表格是 2026-07-26 快照，已过期）

> **2026-08-24 从代码实测的真实计数**（`available: true`）：**图像 20 + 5 runner** · **视频 26** · **音频 3** · **3D 5**，合计 54 条在售；另有 8 条 `available: false` 的退役存档（图 4 / 视频 2 / 音频 1 / 3D 1）。`RESERVED_MODEL_IDS` 当前为空。2026-08-24 把 NovelAI V4.5 Full/Curated 从退役捞回，并加上 V5 Full/Curated（四档均 BYOK-only）。
>
> ⚠ **下面四张逐条表停在 2026-07-26，视频那栏与代码差了 15 条**（Seedance 2.5 六变体、BytePlus 四变体、MiniMax H3 四变体、Kling O3 Pro 都是 07-26 之后加的），音频栏漏了已落地的 ElevenLabs Music v2。**别直接引用这些表**——事实源是 `src/constants/models/{image,video,audio,model-3d}.ts`。表格重建挂在下次月审。
>
> 📊 视频那 26 条的结构（2026-08-21 盘点）：**只有 8 个真模型**，其余 14 条是站点克隆（火山 / BytePlus / MiniMax CN）、4 条是端点克隆（reference）。即约 69% 的条目与「档位」无关，是渠道与端点的展开——讨论「模型是不是太多」之前先做这个切分。

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

## 本月发现（2026-08-24 · NovelAI V5）

owner 拍板把 NovelAI 从 `RETIRED_MODEL_IDS` 捞回，接到 **Image**（不是 LoRA），四档全开、只 BYOK：

| enum                            | externalModelId           | 备注                               |
| ------------------------------- | ------------------------- | ---------------------------------- |
| `NOVELAI_V5_FULL`               | `nai-diffusion-5-full`    | 2026-08-21 发布；Opus 计入用量电池 |
| `NOVELAI_V5_CURATED`            | `nai-diffusion-5-curated` | 同上；Curated inpaint 仍回落到 4.5 |
| `NOVELAI_V45_FULL` / `_CURATED` | `nai-diffusion-4-5-*`     | 捞回。Opus 默认尺寸仍无限          |

出图契约：提示词必填（Danbooru tag 方言，V5 也能吃短自然语言）；参考图**可选**，最多 1 张，worker 按 img2img 发。V5 当天没有 Director / Vibe Transfer / Precise Reference。不能挂 Civitai LoRA。

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

| 退役                       | 理由                                                      |
| -------------------------- | --------------------------------------------------------- |
| SEEDREAM_45 / \_VOLCENGINE | 被 5.0 取代                                               |
| IDEOGRAM_3                 | 未进前 15；文字排版位已被 GPT Image 2 / Seedream 5.0 覆盖 |
| VEO_31                     | 跌出视频前五且单价最高（8 credit）                        |
| LTX_23                     | 未上榜；budget 位由 SEEDANCE_20_FAST 承担                 |
| ELEVENLABS_V3              | 约 6.7 倍于 Fish S2 Pro 的价格，质量不占优                |

**退役 ≠ 删除**：条目保留在 enum / MODEL_OPTIONS / i18n 里，只是从选择器消失。永久归档是产品承诺，历史 Generation 记录的 `model` 字段引用着这些 id，物理删除会让旧作品失去模型标签与所属族。

保留的独占能力（删除前必查）：Recraft = 唯一矢量/SVG 输出；ELEVENLABS_SFX_V2 = 唯一音效模型；KLING_V3_PRO = 退役 Veo 后唯一 native video extend；火山方舟五变体 = 唯一国内直连线。

### ⑥ 待接（本轮未做，各有明确阻塞）

| 模型                  | 状态                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seedance 2.5          | **已 GA（2026-08-07 火山上线 API，见下节 ⑬）**——唯一剩余阻塞是带日期 model id 未证实。以下为 07-31 复核时的 fal 侧结论，仍然成立：fal 模型页 `bytedance/seedance-2.5/text-to-video` 存在但挂 early access 白名单，terms 写死 **B2B only**（须校验终端用户为企业、非个人消费者）——PixelVault 是个人消费者产品，**不符合准入**。火山方舟 / BytePlus 两条直连线均无 2.5 model id |
| ~~Gemini Omni Flash~~ | **已于 2026-07-26 接入**，见下节 ⑦                                                                                                                                                                                                                                                                                                                                            |
| Seedream 5.0 edit     | Pro/Lite 都有 edit 端点，低幻觉可控编辑对编辑工作台是能力升级，未接                                                                                                                                                                                                                                                                                                           |

### ⑦ Gemini Omni Flash 接入笔记（2026-07-26）

> ⚠ **2026-08-24 更新（死执行链删除）**：本节描述的实现从上线起就没进过 `canSubmitVideoViaExecutionWorker` 白名单，一直卡在 501（生产从未跑通）。死执行链清理已把 `src/services/providers/gemini.adapter.ts` 里的 `generateVideo`/`submitVideoToQueue`/`checkVideoQueueStatus` 三方法连同 `generate-video.service.ts` 的存在性守卫整块删除——**这套代码现在哪儿都不存在**，既不在 src/ 也从未进过 `workers/execution`。下文保留原始 API 形态笔记作历史记录（如果哪天要把 Gemini 视频真正迁进 worker，这仍是最详细的 Interactions API 调研），但别再照着找 `submitVideoToQueue`/`checkVideoQueueStatus` 这两个方法名——它们已经不是任何活代码的一部分。

**它不走 `:generateContent`。** Gemini 视频跑在 **Interactions API** 上——一个 create/poll 面，当时对上了 Next.js adapter 层（已删除）的 `submitVideoToQueue` + `checkVideoQueueStatus` 契约。

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
3. **⚠ 从未真机验证过，且实现已删** —— 当年完全按官方文档写，单测覆盖了提交/轮询/Files 三态/失败分支，但从没用真 API key 跑过一次真实生成，一直卡在 501。2026-08-24 死执行链清理时作为死代码整块删除（见本节顶部更新）——如果以后要重接，`Unrecognised video URI` 这类 uri 形态校验错误是当年笔记留下的唯一线索，实现要重写。

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

### ⑨ Seedance 2.5 通道核查（2026-07-31，四条通道逐条实测）

起因：owner 看到即梦官方号发「Seedance 2.5 全球首发」，问能否升级。**结论：接不了，且不是「还没排期」而是「上游没开门」。**

> 本节只管**通道**。2.5 的**能力事实**（参数上限 / 四种模式 / 提示词公式）与它对画布节点、助手 ScriptDoc 的设计输入，见 seedance-25-capability.md（已删，见 git 历史）——那篇也记着 GA 当天的改动清单与一处待裁决的参数冲突。

| 通道                      | 当前最新可用 model id                                                      | 2.5 状态                                                                      |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 火山方舟 Ark（cn，已接）  | `doubao-seedance-2-0-260128` / `-fast-260128` / **`-mini-260615`（未接）** | **无 model id**。模型列表页更新于 2026.07.20，视频段仍只列 2.0 三档 + 1.5/1.0 |
| BytePlus ModelArk（国际） | `seedance-2-0-mini-260615` 为列表最新一条                                  | **无 model id**                                                               |
| fal.ai（已接 4 档）       | `bytedance/seedance-2.0/*`，索引 15 条，最新 mini（2026-06-23）            | 页面存在但 **early access 白名单 + B2B only**，见 §⑥                          |
| 即梦 C 端                 | —                                                                          | **2026-07-31 上线**，仅网页/App 会员，无 API                                  |

**「7/16 全量开放 API」是没兑现的预告**（07-09 多家媒体口径：企业客户 7/13、全量 7/16）。反证：方舟模型列表 07-20 更新过一次仍无 2.5；即梦官方 07-31 才发首发且措辞是「作为官方体验入口」。按 2.0 的先例（体验中心 + 豆包/即梦先行 → 方舟 API 数周后 GA，最终 id `doubao-seedance-2-0-260128`），2.5 的 API 大概率会来，但**无公开时间表**。

**即梦 API 是另一条线，别拿它当 Seedance 替身。** 即梦确有开放 API（2025-09 起），但走**火山视觉智能**而非方舟：`https://visual.volcengineapi.com` + `Action=CVSync2AsyncSubmitTask` / `CVSync2AsyncGetResult`，`Version=2022-08-31`，签名 `Region=cn-north-1` / `Service=cv`，视频线 `req_key=jimeng_ti2v_v30_pro`。给的是**即梦自有「视频生成 3.0 Pro」**——5s/10s 两档（`frames` 121/241）、无原生音频、仅单张首帧图、最高 1080p，文档停在 2025-12-01。**弱于项目已接的 Seedance 2.0，接入是倒退**；即梦 API 目录内无任何 Seedance 命名条目。

**顺带记下的 2.0 欠账（owner 2026-07-31 拍板：先都不做，等 2.5 一并重排能力矩阵）：**

1. **mini 档未接** —— fal `bytedance/seedance-2.0/mini/*` 与火山 `doubao-seedance-2-0-mini-260615` 都在，项目 8 个 seedance 变体全是 base/fast
2. **4K 未露出** —— 火山 `doubao-seedance-2-0-260128` 官方标 480p/720p/1080p/**4k（10bit）**，`video-model-capabilities.ts` 里 `SEEDANCE_20_VOLCENGINE` 的 `supportedResolutions` 只到 `1080p`。⚠ 4K 限流是独立档（RPM 15 / 并发 1，企业个人同值），不能直接塞进现有分辨率数组
3. **延长/编辑未配** —— 火山 2.0 能力表含「编辑视频 / 延长视频 / 图生视频-首尾帧」，项目 `videoExtension` 目前只有 KLING_V3_PRO

**复查 2.5 是否 GA 的最省事办法**（免登录，fal 公开索引；注意 fal 的 HTML 页对脚本直连返 429，只有这个 JSON 面能打）：

```bash
curl -s "https://fal.ai/api/models?keywords=seedance&total=100&page=1" | python -c "import sys,json;[print(m['id']) for m in json.load(sys.stdin)['items']]"
```

出现 `bytedance/seedance-2.5/*` 即为已 GA。火山侧则查[模型列表](https://docs.volcengine.com/docs/82379/1330310)「视频生成能力」段。

### ⑩ MiniMax H3 调查（2026-07-31 发布当天）

**和 Seedance 2.5 正好相反：三条通道全开，没有任何白名单。** owner 拍板：**先用 fal playground 花几美元验质量（重点试音频参考 + 动作迁移），过关直接上原生 adapter**——不走「先接 fal 再迁原生」的双份工。

**模型事实**：Hailuo 家族继任者，2026-07-31 发布。Artificial Analysis **视频编辑 #1**、T2V（有音频）#2、I2V（无音频）#2。4~15 秒 / 2K / 24fps / 原生立体声。多模态统一输入（文·图·视频·音频），能力含 t2v、首尾帧、参考生成、**动作迁移**、生成式视频编辑。权重承诺按 MiniMax Community License 开源（<$20M 营收可商用 + 显著署名），官方说法 "coming days" —— 若兑现是最强开源视频模型（超过 LTX-2.3），届时可进 RunPod runner 线，成本结构完全改写。

**原生比 fal 便宜整整一倍**（这是选原生的硬理由，与 owner「直连优先」规则同向）：

|            | 原生直连                                     | fal 转售                         |
| ---------- | -------------------------------------------- | -------------------------------- |
| 2K 单价    | **$0.13 / 秒**                               | $0.26 / 秒                       |
| 超额参考图 | $0.04 / 张（前 5 张免费）                    | $0.08 / 张（前 5 张免费）        |
| 15 秒一条  | **$1.95**                                    | $3.90                            |
| 其他       | 另有 768P $0.09/s（closed beta，需联系销售） | 三端点 2026-07-31 05:54 UTC 上线 |

音频参考两边都免费；参考视频按输出同价计费。

**原生 API 形态**：提交 `POST https://api.minimax.io/v2/video_generation` → `task_id`；轮询 `GET https://api.minimax.io/v2/query/video_generation/{task_id}`（建议 10s 间隔），成功取 `task.content.url`。`model: "MiniMax-H3"`，认证 `Authorization: Bearer <api_key>`。入参核心是 **`content` 多模态数组**（元素类型 text / image_url / video_url / audio_url，role 取 `first_frame` / `last_frame` / `reference_image` / `reference_video` / `reference_audio`）+ `duration`(4~15 整数) + `resolution: "2K"` + `ratio`(含 `adaptive`)。**与 Gemini Omni Flash 同属 content-数组 范式**（见 §⑦），`video-model-send-plan.ts` 的三形态建模能容纳。

**fal 端点**：`minimax/h3/{text-to-video,image-to-video,reference-to-video}`。入参 `prompt`(必填) + `duration`(默认5) + `resolution`(仅 2K) + `aspect_ratio`(adaptive/21:9/16:9/4:3/1:1/3:4/9:16) + `reference_{image,video,audio}_urls`。⚠ **页面描述与 schema 约束不一致**：描述写「9 图 + 3 视频 + 3 音频」，schema 写「三类合计 ≤ 12 个文件」（9+3+3=15 对不上）——按「分项上限 + 总额 12 同时生效」理解。另：音频不能是唯一参考（须至少配一图或一视频）；参考视频/音频每段 2~15s 且合计 ≤15s。

**✅ 已实现（2026-08-01）。** 下面保留施工事实，因为其中一条纠正了本节初稿的错误判断。

⚠ **初稿说「视频执行面在 Next.js 侧、worker 零改动」——错的。** 当时 `generate-video.service.ts:114` 的 `adapter.submitVideoToQueue` 只是存在性守卫，真正的闸在 `canSubmitVideoViaExecutionWorker`，原本写死 `adapterType === FAL`，其余一律 `501 not migrated`。**这意味着火山 Seedance ×4 与 Gemini Omni Flash 至今都执行不了**（火山 adapter 自己的注释写着「service 走 worker-only，dead」）。所以原生视频要能跑，**必须进 execution worker**。

> ⚠ **2026-08-24 更新**：`adapter.submitVideoToQueue` 存在性守卫本身已作为死执行链删除（不是改成常量判据——它和 `canSubmitVideoViaExecutionWorker` 本来就查的同一个常量，守卫是纯冗余）。今天路由**只看** `canSubmitVideoViaExecutionWorker`，Next.js 侧 adapter 不再有任何 `submitVideoToQueue`/`checkVideoQueueStatus`/`generateVideo` 方法可守卫——这套方法名已随 fal/gemini/volcengine/minimax 四个 adapter 的死代码清理一起消失，只活在 `workers/execution` 里。

实际落地：

- **worker 新增 provider 派发缝**：`submitProviderQueue` / `pollProviderQueue` 两个包装函数，fal 保持 fallthrough；`CinematicShortVideoWorkflow` 的两个调用点改指向它们。请求构建器抽到 `workers/execution/src/models/minimax/video-request-builder.ts`（照 `models/fal/video-request-builders.ts` 的分工——builder 抽模块、submit/poll 留 index.ts）
- **两处白名单必须同步**：`generate-video.service.ts` 的 `WORKER_CAPABLE_VIDEO_ADAPTERS`（服务端受不受）与 `video-model-send-plan.ts` 的 `WORKER_READY_VIDEO_ADAPTERS`（UI 给不给发）。只加一处 = 要么 UI 藏着能跑的模型，要么点了发在 workflow 里 500
- ~~**Next.js adapter 仍要写**（`minimax.adapter.ts`）：`submitVideoToQueue` 是服务端的存在性守卫，缺了直接 400；同时它是 worker 逻辑的可测镜像~~ —— **2026-08-24 起不再成立**：这份「可测镜像」当时就已经和 worker 活版漂移（见 backend.md 的 fal/volcengine/minimax 三对 fork 记录），死执行链清理把 `minimax.adapter.ts` 的 `buildMiniMaxContent`/`isMiniMaxReferenceModel`/`buildMiniMaxVideoQueueBody`/`generateVideo`/`submitVideoToQueue`/`checkVideoQueueStatus` 全部删除。服务端存在性守卫也已删（见上一条注记）。`minimax.adapter.ts` 现在只剩 `healthCheck`（`minimaxAdapter`/`minimaxCnAdapter` 两个 adapterType 共用同一份实现，形态不变）。
- **一个实现两个 adapterType**：`minimaxAdapter` / `minimaxCnAdapter` 共享同一份实现，只换 `adapterType` 标签 —— 两站线材格式相同，差的只是 baseUrl 与 key 槽
- 分辨率：`VIDEO_RESOLUTIONS` 加了 `'2k'`，同时新建 `DEFAULT_VIDEO_RESOLUTIONS`（不含 2k）供 `DEFAULT_VIDEO_MODEL_CAPABILITIES` 用 —— 否则每个没显式声明的模型都会白捡 2K
- 测试：`minimax.adapter.test.ts` 15 例（2K 固定 / 时长夹取 / 首帧 vs 参考角色 / 顺序保序 / 9-3-3-封顶-12 / 音频不得独存 / 目录接线 / execution ready）。⚠ vitest 配置 `exclude: ['workers/**']`，worker 那份是镜像、测不到，改一边要手动同步另一边
- 文件足迹：19 个（config · providers · video-options · video-model-capabilities · provider-capabilities · reference-image-capabilities · video-model-send-plan · models/enum · models/video · models.ts · llm-capability · platform-keys · validate-api-key · apiKey.service · registry · minimax.adapter + test · worker index + builder · i18n ×3）

**两个真障碍：**

1. **只出 2K**，而项目分辨率枚举是 `480p | 720p | 1080p`，需扩档 + UI 档位。⚠ 别留 `supportedResolutions: []`，那会让服务端 400 硬失败（不只是 UI 掉档）
2. **成本量级不同**：$1.95 一条 15 秒，与现有 credit 档位（Seedance 2.0 = 6 credits）不在一个数量级，接之前要先定档

**画布契合度（本次调查最大价值点）**：画布视频汇点主力是 Seedance reference 族，而 H3 的参考体系正好补上项目**已建模但无 provider 支撑**的两块——`reference_audio` 对上角色卡的「听觉身份 / 音色 donor」（且免费），`reference_video` 的动作迁移是当前完全没有的能力。prompt 里 `Image 1 / Video 1 / Audio 1` 的按序引用与既有 `buildShotReferenceLegend`（@名字 / @特写N / @视频N 绑实到送图N/视N/音N 槽）是同构的，图例注入逻辑基本可平移。

**国内站 / 国际站是完全分开的两套（2026-07-31 查实，推翻「同后端可互换」的三方说法）：**

|            | 国内                                      | 国际                       |
| ---------- | ----------------------------------------- | -------------------------- |
| 控制台     | `platform.minimaxi.com`（当中多一个 `i`） | `platform.minimax.io`      |
| API 基址   | `api.minimaxi.com`                        | `api.minimax.io`           |
| 账号 / key | **分别注册，key 不通用**（跨用被拒）      | 同左                       |
| 服务区域   | `cn`（在国内平台下单）                    | `global`（在国际平台下单） |

对项目的含义：接原生要么像 Seedance 那样做**国内线 + 国际线双条目**，要么选一条。**部署在 Vercel 海外 → `api.minimax.io` 是自然选择**；国内线只在真要服务国内用户时才有必要，且需单独实名注册。

### ⑪ fal 相对原生的加价倍率（2026-07-31 逐模型比价）

> **价格的唯一的家是 [`model-pricing.md`](model-pricing.md)** —— 全站 33 个模型（图 14 / 视频 11 / 音频 3 / 3D 5 + 2 个待接）的 fal 与原生逐条单价、火山 Seedance 计费公式、行动清单都在那份。本节只留结论，改价格请改那份、别在这里维护第二套数字。

**结论：「fal 一定更贵」不成立，按厂商分化。** 规律是**纯转售 vs 一级发行合作**——字节系是转售，加价 1.6~2.2 倍；FLUX / Recraft / Kling 是 fal 的一级发行渠道，持平；HappyHorse 1080p 与混元 3D 白模档 fal 反而更便宜。

人民币按 7.1 折算；火山 / 阿里取官方文档的价格示例。

| 模型 · 档位                    | 原生                           | fal            | 倍率                    |
| ------------------------------ | ------------------------------ | -------------- | ----------------------- |
| Seedance 2.0 · 720p            | 火山 $0.140/s（4.97 元 / 5s）  | $0.3034/s      | **2.17×**               |
| Seedance 2.0 fast · 720p       | 火山 $0.113/s（4.00 元 / 5s）  | $0.2419/s      | **2.14×**               |
| Seedance 2.0 · 1080p           | 火山 $0.349/s（12.39 元 / 5s） | $0.682/s       | **1.95×**               |
| MiniMax H3 · 2K                | $0.130/s                       | $0.260/s       | **2.00×**               |
| Seedream 5.0 Pro · ≤236 万像素 | 火山 $0.042/张（0.30 元）      | $0.0675/张     | **1.61×**               |
| Seedream 5.0 Pro · >236 万像素 | 火山 $0.085/张（0.60 元）      | $0.135/张      | **1.59×**               |
| HappyHorse · 720p              | 阿里 ~$0.127/s（0.9 元/s）     | $0.14/s        | 1.10×                   |
| FLUX.2 Pro · 1024²             | BFL $0.03/张                   | $0.03/张       | **1.00×**               |
| HappyHorse · 1080p             | 阿里 ~$0.225/s（1.6 元/s）     | $0.18/s        | **0.80×（fal 更便宜）** |
| Kling v3 / O3 Pro              | **未查实**                     | $0.112~0.196/s | ?                       |

⚠ 两处数据限制：HappyHorse 原生价取自 **1.0-I2V** 档，项目接的是 **v1.1**，可能有出入；Kling 官方是灵感值积分制，网上能搜到的全是第三方中转报价，**不能当官方价用**——要准确数字得登录可灵开发者平台。

**顺带查出的成本敞口**：`src/lib/video-model-resolver.ts:167` 的 `pickDefaultProvider` 是「用户持有 key 的 provider 优先 → 否则取该品牌第一个选项 → 兜底 FAL」，而 `VIDEO_MODEL_OPTIONS` 里 seedance 品牌第一个是 fal 的 `SEEDANCE_20_FAST`。**凡是没有火山 key 的路径默认走 fal，每条多付约 2.1 倍。** BYOK 优先本身是对的设计，但若该路径用的是平台自有 key，成本直接翻倍——把火山条目排到 fal 前面即可，是一行顺序的事（未改，待 owner 拍板）。

### ⑫ Seedance 2.5 状态更新（2026-07-31 当天，修正 §⑨）

§⑨ 说「上游没开门」需要收窄一档：**火山方舟的模型价格页当天 12:51 更新，已列出 `doubao-seedance-2.5` 的定价**，还配了专用的「Seedance 2.5 系列价格计算器」和最低 token 用量表。而**模型列表页仍停在 07-20、仍无可调用的 model id**（当天复核过）。

准确状态：**定价与计费口径已落进公开文档，model id 未公布** —— 比「没开门」更接近「门把手已装好」。

**官方原话（「创建视频生成任务」API 文档，2026-07-31 12:51 更新）**：

> Doubao Seedance 2.5 模型信息已公开，欢迎前往模型详情页查阅。该模型的**在线体验与 API 调用即将上线，敬请期待**。

那个「模型详情页」链接泄露了族 id：`console.volcengine.com/ark/…/model/detail?Id=`**`doubao-seedance-2-5`**（控制台要登录，规格拿不到）。

**代码侧已预留（2026-08-01）**，照 §⑦ Gemini Omni 的做法：`SEEDANCE_25_VOLCENGINE` / `SEEDANCE_25_REFERENCE_VOLCENGINE` 两个 enum 值 + 目录条目 + 能力矩阵 + 参考槽位 + i18n×3 全部就位，`available: false` 挂着。**GA 时要改三件事，别只改第一件：**

1. `externalModelId` → 真实带日期 id（形如 `doubao-seedance-2-5-YYMMDD`），当前占位是官方族 id `doubao-seedance-2-5`
2. `available` → `true`
3. **重新核对 `supportedDurations`** —— 现在那份是从 2.0 抄的占位值（4~15）。2.5 的卖点是原生直出 30 秒、输入视频可达 30s，真实档位大概率超出。**宁可少给（用户选不到 30s）也别多给（直接 400）**

`seedance-25-reservation.test.ts` 是这道闸的绊线：**只要 `available: true` 与占位 id 同时出现就红**，防的正是①那次 `gemini-3-pro-image-preview` 事故的复现路径。

**顺带补了一条目录状态**：`available: false` 原本只有两种合法理由（RETIRED 已退役 / RUNNER 特性开关），`models.test.ts` 有个不变量钉着这点。「预留」是第三种，所以新增了 `RESERVED_MODEL_IDS` + `isReservedModelId`（`constants/models.ts`），与 `RETIRED_MODEL_IDS` 并列。**三者互斥**，测试同时钉住「不能既退役又预留」。往里加 id = 承诺有人会回来收尾，模型一上线或计划一死就删掉那行。

~~⚠ 还有第二道闸：即便火山开了 API，**Seedance 2.5 仍跑不了** —— VolcEngine 至今没有 execution worker 分支（见 §⑩ 的更正）。要让它真能出片，得照 MiniMax 这次的做法给火山加 worker 分支 + 两处白名单。测试里 `execution` 断言为 `execution-not-migrated` 就是钉住这个事实。~~

> **↑ 这条已作废（2026-08-01 被 `b4ecf638` 推翻，2026-08-08 复核时发现文档没跟上）。** 该 commit「接 MiniMax H3 原生双线 + 火山 Seedance 迁进 worker」把 VolcEngine 加进了 `generate-video.service.ts` 的 `WORKER_CAPABLE_VIDEO_ADAPTERS`，`workers/execution/src/models/volcengine/video-request-builder.ts` 一并落地；同日 `seedance-25-reservation.test.ts` 的断言从 `execution-not-migrated` 翻成 `execution: 'ready'`。**第二道闸已经不存在，2.5 现在只剩 model id 一道闸。** 详见 §⑬。

已知的 2.5 计费与规格（火山口径）：

| 项                      | Seedance 2.5                             | 对比 Seedance 2.0          |
| ----------------------- | ---------------------------------------- | -------------------------- |
| token 单价（480p/720p） | 输入不含视频 70.00 元/百万；含视频 42.00 | 2.0 为 46.00 / 28.00       |
| 720p · 5s · 无输入视频  | 7.56 元（≈$1.06，$0.21/s）               | 4.97 元 → **2.5 贵约 52%** |
| 480p · 5s · 无输入视频  | 3.36 元（0.67 元/s）                     | 2.31 元                    |
| 分辨率档                | **只有 480p / 720p**                     | 2.0 有 480p/720p/1080p/4k  |
| 输入视频时长            | **2~30 秒**                              | 2.0 为 2~15 秒             |

复查节奏：模型列表页「视频生成能力」段出现 `doubao-seedance-2-5-*` 即为可调用。fal 侧仍用 §⑨ 那条 curl。

### ⑬ Seedance 2.5 已 GA（2026-08-08 月审复核，修正 §⑫）

**火山引擎 2026-08-07 正式上线 Seedance 2.5 API 服务**（多家媒体同日通稿）。§⑫ 那句「在线体验与 API 调用即将上线」的官方原话已被这次上线取代；文档站导航现已出现「Doubao Seedance 2.5 教程 / 提示词指南」章节，与 2.0 系列并列。⚠ 火山文档站是 SPA，`curl` 只抓得到侧边栏，**正文必须真浏览器打开**——这也是本次没能直接取到 model id 的原因。

官方通稿口径的能力：单次原生直出 **30 秒**（无需分段）、最多 **50 个全模态素材参考**、更精准稳定的视频编辑、支持十余种语言。与 §⑫ 表里的计费/规格不冲突。

**闸的现状：三道剩一道。**

| 闸                      | 状态                                                |
| ----------------------- | --------------------------------------------------- |
| 上游 API 是否开放       | ✅ 08-07 已开                                       |
| execution worker 分支   | ✅ 08-01 已通（§⑫ 那条作废说明）                    |
| 可调用的带日期 model id | ✅ **`doubao-seedance-2-5-260628`**（官方文档实读） |

**三道闸全开，2.5 现在零阻塞。**

model id 与下列字段约束均取自火山方舟官方文档 `https://docs.volcengine.com/docs/82379/2298881`（旧 URL `www.volcengine.com/docs/82379/1366799` 301 到此），页脚更新时间 **2026.08.07 13:46:03**。⚠ **该站是 SPA，`curl` / WebFetch 只能抓到侧边栏导航**，正文必须真浏览器打开——这是 07-31 那次「拿不到规格」的真正原因，不是登录墙。

**§⑫ 立案的「冲突 A」已裁决**（手册的 30/10/10 是对的，代码注释那份 9/3/3 描述的其实是 2.0 的契约）：

| 字段            | Seedance 2.5                          | Seedance 2.0 系列                |
| --------------- | ------------------------------------- | -------------------------------- |
| 时长            | **[4,30] 或 -1**                      | [4,15] 或 -1                     |
| 多模态参考图    | **1~30 张**                           | 1~9 张                           |
| 参考视频        | 单个 [2,30]s，**最多 10 个**，总 ≤30s | 单个 [2,15]s，最多 3 个，总 ≤15s |
| 参考音频        | 单个 [2,30]s，**最多 10 段**，总 ≤30s | 单个 [2,15]s，最多 3 段，总 ≤15s |
| 纯音频参考      | **✓ 支持**                            | ✗ 需搭配图片/视频                |
| 分辨率          | 480p / 720p（无 1080p/4K）            | 480p / 720p / 1080p / 4K         |
| 离线推理 `flex` | ✗                                     | ✗                                |

30+10+10=50，与官方通稿「最高 50 个全模态素材」自洽。**另有三条既有文档里没有的约束**（ratio 在首帧/编辑/延长场景仅支持 `adaptive`、不接受含真人人脸的参考图/视频、2.5 与 2.0 的 480p 像素尺寸不同），见任务包 §3.3b / §3.7。

**三条通道当天全部 GA（08-08 实读），§⑨ 那张四通道表整体作废：**

|           | 火山方舟 · cn                | BytePlus ModelArk · 国际                                                          | fal                                                      |
| --------- | ---------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Model ID  | `doubao-seedance-2-5-260628` | **`dreamina-seedance-2-5-260628`**（前缀 `dreamina-`）                            | `bytedance/seedance-2.5/{text,image,reference}-to-video` |
| 720p 成本 | ≈ $0.213/秒                  | ≈ $0.231/秒（单价比推算）                                                         | **$0.4730/秒 = BytePlus 的 2.06 倍**                     |
| 个人用户  | ✅                           | ✅ 文档明确列个人档 180 RPM / 并发 3                                              | ⚠ B2B 措辞未澄清                                         |
| 区域      | 北京                         | **仅 `ap-southeast-1` 有视频模型**（控制台显示 Asia Pacific / Johor），欧洲区没有 | —                                                        |

> **2026-08-08 BytePlus 已端到端跑通**（真实生成 480p/4s，任务 `cgt-20260808075608-thsls` succeeded）：响应体与火山**逐字段同构**（`content.video_url` / `usage.total_tokens` / `status` / `seed` / `resolution`）→ 现有 volcengine request builder 可直接复用，已验证非推断。**实测成本 480p/4s = 38,830 tokens ≈ $0.42**（⚠ 比早前按火山定价的换算贵，credit 定价按实测走）。耗时 110s；`generate_audio` 上游默认 `true`；`video_url` 是 TOS 预签名，**24 小时 / 100 次下载上限**，落 R2 必须在窗口内完成。
>
> ⚠ **Seedance 全系在 BytePlus 的激活是硬门槛**：必须先买任一 Seedance 资源包且有余额才能激活（绑信用卡不构成条件），激活后才启用按量付费。见官方[资源包规则](https://docs.byteplus.com/en/docs/ModelArk/2191775)。2.5 最小包 5M token / $32 / 90 天，且**每个包只抵扣对应模型**。详见任务包 §3.9.1–3.9.2。

**海外用户的正解是 BytePlus，不是 fal** —— 便宜一半，且 BytePlus 把个人用户写进了限流表（07-31 被 fal 的 B2B only 挡住就是卡在这）。fal 加价 2.06× 与 §⑪ 记的「字节系 1.6~2.2×」吻合。

⚠ **fal 的准入只查清了一半**：early-access 白名单看来解除了（三条 `status: "public"`、`licenseType: "commercial"`，与已接的 2.0 字段值相同），但模型页 `end_user_id` 参数仍写「Required for B2B access」，**terms 全文没读**，无法判断 B2B only 是否仍在。owner 08-08 拍板三站全接，fal 那一站的第一步是读完 terms——若条款真变过，影响的不止 2.5，我们在 fal 上已接的四个 2.0 变体也要重新对照。

⚠ **顺带暴露一个比 2.5 大的问题**：项目现接的四个火山 Seedance 2.0 变体全部指向 `ark.cn-beijing.volces.com`，**海外用户现在用的就是国内线**。BytePlus 侧 2.0 全系也在（`dreamina-seedance-2-0-260128` / `-fast-` / `-mini-`）。所以真正的问题是「整条火山线要不要开国际站」，2.5 只是让它显形。

> **2026-08-10 已补齐 Seedance 2.0 国际线**：Base / Fast 及各自 reference 形态已注册为独立
> BytePlus 模型，使用独立 `BYTEPLUS_API_KEY` 与 `https://ark.ap-southeast.bytepluses.com/api/v3`；
> 请求/轮询复用已由 2.5 真机证明同构的 Ark builder，但 adapter、provider 配置和 Key 槽不与国内火山混用。
> 因此模型选择器同一型号下稳定显示 fal.ai、火山方舟（国内）、BytePlus ModelArk（国际）三条通道。
> 本轮只做契约测试，未新增真实扣费 smoke；上方 2026-08-08 的 BytePlus 2.5 smoke 仍是当前真实链路证据。

> **2026-08-11 已将同一三渠道结构扩展到 Seedance 2.5**：fal 使用公开的
> `bytedance/seedance-2.5/{text,image,reference}-to-video` 三端点；火山国内继续使用
> `doubao-seedance-2-5-260628`；BytePlus 国际使用 `dreamina-seedance-2-5-260628`。
> fal 与 Ark 的 2.5 均为 4–30 秒、480p/720p、参考素材 30 图 / 10 视频 / 10 音频 / 合计 50；
> 但 fal 公开 OpenAPI 要求参考音频必须搭配图片或视频，Ark 原生线允许纯音频参考，发送契约已分开表达。
> 目录、模式解析、应用/Worker fal builder 与 Ark builder 均有回归测试；本轮未执行新的付费生成。

**接入任务包**：`docs/plans/seedance-25-ga-integration-2026-08.md`（已按三站扩容）。⚠ §⑫ 说「GA 时要改三件事」实际是**五件**——漏了 `video-model-send-plan.ts` 的 slots 按代分叉（2.0/2.5 现共用一个分支）和 tripwire 测试自身的改写（它第 79-85 行把 2.0 的 slots 钉死了，分叉后必挂，那是预期行为）。另有一个**待 owner 定的设计问题**：2.5 选了首帧图之后宽高比只能是 `adaptive`，UI 是锁死还是按 Hard Rule 8 给提示不禁用。

### ⑭ 按模态重做的三线调查（2026-08-21，全量上网核实）

口径：按 **LLM / 语音 / 视频** 三条模态线重做，共 55 条动作建议，每条带来源 URL + 查证日期。拿不准、来源自相矛盾、或只有二手转述的一律标「待验证」，未做任何推断。

⚠ **本轮两块盲区（如实登记，别当已核）**：① 火山方舟文档站实测仍是 SPA，WebFetch 只拿到侧边栏，**所有火山口径的 Seedance 2.5 细节一律待验证**；② Artificial Analysis 榜单同样是 JS 渲染，仓内「跌出前五」这类退役理由本轮**无法复核**。

#### owner 点名两项

- **Wan 3 是真的、已发布，但现在还调不到。** 阿里 `wan3.0-video` 自 2026-08-06 起在百炼公测/邀测，30 秒直出、官方能力表原生写着「图生视频（首帧/首尾帧）」、0.3/0.6/1.2 元每秒（480P/720P/1080P）。但 **fal 官方页原文「Wan 3 is not live on fal yet」**，无价格无日期，fal 自己引导先用 2.7。⚠ **能真调到的最新代是 Wan 2.7**（`fal-ai/wan/v2.7/*`，$0.10/s，`end_image_url` 是官方参数）——别把 3.0 当「已可接入」写进任何施工图。三处口径打架已记：模型信息页说「邀测」、API 参考页说 preview、官方博客说公测，**能不能自助申到 key 无官方确认**。接百炼要新写 DashScope adapter（本仓无阿里直连，happy-horse 走 fal 转售），按原则 3 建议先挂盯梢、等 fal 上线可零新 adapter 接入。
  ⚠ **打假**：wan27.org / wan3api.com 一类站点声称「Wan 2.7 权重已按 Apache 2.0 开源」，但 HF 上 Wan-AI 组织 27 个 repo **无任何 2.5 以上权重**，fal 的 LoRA trainer 也停在 2.2 —— **Wan 开源线止于 2.2**，那批 SEO 农场数字一律不采信。（ModelScope 是否另有 2.7 权重本轮未取到官方页，标待验证，别当「确认没有」。）
- **Grok 有两条独立的线，别混为一谈。** 文本线 `grok-4.6`（2026-08-12）走 `https://api.x.ai/v1` 的 OpenAI 兼容接口，500k 上下文、text+image、$2/$6 每百万 token，比 `gpt-5.6-sol` 便宜 2.5 倍且**有视觉**（不像 DeepSeek 被排除在 enhance 之外）。⚠ 接它要一起改四处：新增 `AI_ADAPTER_TYPES.XAI` + `AI_PROVIDER_ENDPOINTS` + `ADAPTER_CAPABILITIES`（穷举无兜底）+ `LLM_TEXT_ADAPTERS`，且 `llm-text.service.ts:352` 的 `/^(gpt-5|o[134])/` 正则匹配不到 grok id，会走非 reasoning 分支。视频线是 fal 上的 `xai/grok-imagine-video/v1.5`（480p $0.08/s），但**违规请求照样计费**且只给 16:9 一种比例（本仓是五档），优先级排在其它候选之后。
  仓内现状：模型目录零命中；Grok 仅出现在未拍板的规划文档里，定位是「研究检索的候选数据源」而非生成模型。

#### LLM / 文本线

- ✅ **2026-08-23 已落地（owner 拍板）**：`gpt-5.5` 整退（官方现价 $5/$30 比新旗舰 sol 还贵——sol 已降到 **$4/$20**，08-21 审计里的 $5/$30 过时）；三条路由线全部换上 **GPT-5.6 三档**（sol/terra/luna，spec 全同只差价），助手默认 sol、规划默认 terra、增强默认 luna。Gemini 同步：助手/规划 `3.5-flash → 3.7-flash`，增强线 `3.1-flash-lite → 3.5-flash-lite`（2027-05-07 停机的止损迁移）+ `3.7-flash` 两档并列。
- ✅ **路由结构改造（同日）**：三张路由表主键从 `adapterType` 改为 `(adapterType, modelId)`，同一家可挂多档；客户端选档经 `llmModelId` 字段过网，服务端 `resolveAssistantModelId`（`constants/node-studio.ts`）对表校验、不认识就落该家**第一条**（=默认档）。⚠ 增强线与规划线**今天没有选择器 UI**（增强注册表零 UI 消费者、规划硬编码 auto），表已备好多档，露出留给工作台重设计那条线。
- ⏰ 遗留提醒：`gemini-3.7-flash` 是 2026 年内促销价（$0.75/$3.75），**2027-01-01 起翻倍**——成本预估要标生效期。
- ✅ **xAI (Grok) 已接入（2026-08-23，owner 拍板「只接 4.6」）**：新增 `AI_ADAPTER_TYPES.XAI`，`grok-4.6` 一个型号，进 **enhance + assistant** 两条线（不进 planner——那条线的 provider 枚举串在三个 Zod schema 里，是独立改动）。500k 上下文、`text, image → text`、$2/$6 每百万 token（**≥200k 上下文翻倍到 $4/$12**）。
  - ⚠ **官方模型汇总表的 Modalities 栏是错的**：它把每个 Grok 都写成 Text，而每个型号的**专属页**都写 `text, image → text`（grok-4.6 另有图片理解指南佐证）。**以专属页为准**。08-21 审计据汇总表推测「4.3 可能无视觉」，已被推翻。
  - ⚠ **不要复用 `buildOpenAiChatRequest`**：虽然 xAI 官方称与 OpenAI REST 完全兼容，但那个 helper 的 base URL 走 `getOpenAiChatBaseUrl()`（缺省回落到 **OpenAI 的域名**），且 `useGrounding` 时会把 modelId 换成 `gpt-5-search-api`——等于把 Grok 的请求计到 OpenAI 账上。已按 DeepSeek/DashScope 的形自建 `xaiTextCompletion`，顺带绕开 `isOpenAiReasoningModel` 那条 `/^(gpt-5|o[134])/` 正则（匹配不到 grok id，会给出过低的 token 预算）。
  - ⚠ `ADAPTER_KEY_HINTS` 里的 `xai-...` 是**观察值不是官方口径**（xAI 文档只给 `<YOUR_XAI_API_KEY_HERE>` 占位符）。因此 `validate-api-key.ts` **故意没有加 xAI 前缀规则**——真校验交给 `verifyAdapterKey` 打 `GET /v1/models`。
  - 未接的档：`grok-4.5`（与 4.6 同价更旧，被严格支配）、`grok-4.3`（1M 上下文、$1.25/$2.50，是便宜档候选，owner 本轮决定不接）、`grok-4.20-*` 三变体、`grok-build-0.1`。
  - ⛔ 视频线 `xai/grok-imagine-video/v1.5`（fal，480p $0.08/s）仍未接：**违规请求照样计费**且只给 16:9 一种比例（本仓是五档）。
- `qwen3-vl-plus` 是**死常量**：无任何路由表引用，唯一非测试消费者是一句 enhanceHint 文案。
- 能力声明复核：DeepSeek V4 两变体经官方确认**确实纯文本无视觉**（仓内 no-enhance 判断成立）；但 Claude 官方明写全系支持 vision，所以仓内把 Sonnet 5 限成 `['assistant']` 是**策略选择而非能力限制**，注释里「无视觉」式的暗示不成立。

#### 语音 / 音频线

- 4 条目录条目**上游 id 全部无需改动**（`s2.1-pro` / `eleven_text_to_sound_v2` / `music_v2` 都是当前在售型号；ElevenLabs 没有 v4，Fish 没有比 s2.1-pro 更新的）。
- ⚠ **「6.7 倍」这个退役理由只在拉丁字母下成立**：Fish 官方计价单位是 `$15 / 1M UTF-8 **bytes**`（不是字符），中日文每字 3 bytes，等效约 $45/1M 字，对 ElevenLabs v3 的 $100 只剩约 **2.2 倍**。本站是 en/ja/zh 三语，`audio.ts:57-59` 那条注释不能当普适结论读。**退役结论沿用，但理由要改写。**
- ⏰ Fish 免费档 `s2.1-pro-free` 官方免费期写到 **2026-08-31**（此前已延期至少两次），要么接、要么明确不接。
- 音乐/音效线无更好替代：Suno 至今无公开自助 API（2026-07-01 CPO 领英称仅「探索中、限定合作伙伴」），Udio 走 UMG/WMG 和解后的封闭消费端。唯一值得排期的是把 `fal-ai/stable-audio-25` 作为**唯一音效模型的第二来源**（容灾，不是省钱）。

#### 视频线

- ⚠ **可能有个空承诺**：退役 Veo 3.1 时写下的「native extend 由 `KLING_V3_PRO` 接手」很可能落空——`fal-ai/kling-video/v3/pro/extend-video` 两个 URL 都 **404**，且不在 Kling v3 API 页那份 33 项请求类型清单里；而 `fal-ai/veo3.1/extend-video` 反倒还活着（$0.20/$0.40 每秒）。**须复核后修正退役理由。**
- ⭐ **从未实现的首尾帧切片，现在有四条几乎零成本的落点**（按改动面从小到大）：MiniMax-H3（协议里已有 `first_frame`/`last_frame` role，adapter 已在用 `first_frame`）→ Seedance 2.5 i2v（`end_image_url`，且 fal 侧 `aspect_ratio` 固定 auto，正好绕开仓内注释担心的 ratio=adaptive 400 问题）→ Kling O3 standard i2v（官方描述即 start+end frame，$0.084/s 最便宜）→ Wan 2.7 i2v。
- 各家没有想象中动：Google 官方文档只有 Veo 3.1 与 Gemini Omni Flash，**没有 Veo 4**（此前的自相矛盾到此终结）；Runway 仍停在 Gen-4.5（2025-12-11）；Seedance 无 3.0；**OpenAI 官方弃用页写死 Videos API 与全部 Sora 2 模型 2026-09-24 从 API 移除且无替代**——仓里没接是对的。
- 与 LoRA 双核相关的两条开源权重线：MiniMax-H3（HF 2026-07-28，3.3M 下载）与 LTX-2.5（HF 2026-07-23，611.8K 下载，官方 IC-LoRA 生态、标 comfyui）。

### ⑮ 档位判据：这一档是价钱不同，还是能力不同？（2026-08-21 立）

**结论：厂商档位 95% 是「同一件事的不同价钱」，所以多档的价值在成本优化（路由问题），不在能力覆盖（目录问题）。**

硬证据 —— OpenAI 自己的 spec 卡，`gpt-5.6` 的 sol / terra / luna **三张卡逐项相同**：1,050,000 上下文 / 922,000 最大输入 / 128,000 最大输出 / text+image 入 / 六级 reasoning effort / streaming + structured outputs + function calling + web search + prompt caching 全支持 / 知识截止同为 2026-02-16。唯一变量是价格：$5/$30 · $2/$12 · $0.20/$1.20 —— **25 倍价差，零能力差**。Claude 前三档同理（fable-5 $10/$50、opus-5 $5/$25、sonnet-5 $2/$10，均 1M 上下文 / 128k 输出 / adaptive thinking）。DeepSeek 更纯：v4-flash 与 v4-pro 同为 1M/384K，价格恰好 3 倍，差的是**并发配额**（2500 vs 500）不是能力面。

**唯一真正「不同的事」是 Claude Haiku 4.5**：200k 上下文（其余 1M）、64k 输出（其余 128k）、Adaptive thinking = No、不在 effort 支持列表、知识截止停在 2025-02。但它是能力**减法**——本仓三条路由没有只有它能做的事，故也不构成加档理由。

#### 判据（月审第六问用这个答）

| 情形                                              | 处理                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| 档之间只差价钱/延迟（spec 卡逐项相同）            | **不进目录**。走参数（见 Rodin 先例）或走路由选型，用户不该为此多面对一个选项   |
| 档之间差能力边界（上下文/输出上限/模态/思考能力） | 才配一条独立目录条目                                                            |
| 同一模型经多个站点转售（fal / 火山 / BytePlus）   | 这是**渠道**不是档位，折进选择器第三层「比价」，不在第二层露出                  |
| 上游有档但我们不发那个参数                        | ⛔ **不是零成本**——见 GPT Image 2 反例，会变成「算不出钱 + 选不到便宜档」的暗亏 |

⚠ **加一条目录条目的成本是永久的**（退役≠删除，`available: false` + `RETIRED_MODEL_IDS`，enum 绝不动），且边际成本 ≥ 8 个源文件 + 3 份 i18n。所以默认答案是「不加」，加要给理由。

#### 两个仓内先例

- ✅ **正面 —— Rodin Gen-2.5**：5 个 tier 做成**一条目录条目 + 一个 API 参数**，credits 随档变，还带每档预估耗时（`src/constants/model-3d-generation.ts:141-169`）。天然绕开 i18n / family / variant / 单价四张表的乘法。**新档默认走这个形态。**
- ⛔ **反面 —— GPT Image 2**：上游有 low/medium/high，1024² 下 $0.006 / $0.053 / $0.211（**35 倍价差**），但 adapter 根本不发 `quality`，落在 OpenAI 的 auto，官方又未公开 auto 映射到哪档 —— 结果既选不了便宜档，也填不出单价（`src/constants/models/unit-prices.ts:284-291` 记着「三个数里挑一个就是猜」）。

#### LLM 侧的结构约束（动手前必读）

三张路由表（enhance / assistant / planner）都是「一个 adapter 对一个模型」，取法是 `.find(m => m.adapterType === adapterType)`（`src/hooks/use-llm-route-picker.ts:47` / `:53` / `:59`）。**往同一家加第二档，第二条会静默消失**——不报错、选择器只显示第一个、闸门全绿。想给 LLM 上多档，先改数据结构，不是改 UI。

而省钱的第一顺位其实不是换档，是 **effort**：两家都把权衡做进了单模型内部（Anthropic 文档原话可以「with a single model」做权衡，Sonnet 5 的 medium effort 被官方描述为「Comparable to Claude Sonnet 4.6 at high effort」——一格 effort ≈ 一整代模型）。而 `src/services/llm-text.service.ts:1372` 明写 `we never set effort`。⚠ **但这条不能顺手改**：同一段注释解释了为什么把 thinking 整个关掉——`max_tokens` 把 thinking 与回答**一起**算上限，而所有调用方的 token 预算都是按「不思考」量的。**接 effort 是一个要重新核算 token 预算的独立任务。**

## 接入执行规范（指针）

- 加模型四件套：`AI_MODELS` enum + 模型配置 + i18n ×3 + provider adapter（`backend.md`）。
- 直连官方优先，FAL 仅在无直连或 FAL 唯一/更优时（owner 拍板规则）。
- 错误信息：接入时把 provider 错误码映射进 `constants/generation-errors`（→ i18nKey）；逐 provider 错误格式细化归 `providers.md`（批 2 待写）。

## Source of Truth

- `src/constants/models/{enum,image,video,audio,model-3d,types}.ts` · `src/constants/providers.ts`
- `.github/workflows/model-doc-monitor.yml` + `npm run models:check-docs`
- 官方资料（本次）：fal Seedream 5.0 模型页与文档、ByteDance Seed 官方页

## Last Audited

- Date: 2026-08-21 · 范围：**按模态重做的全量调查（§⑭）+ 档位判据立案（§⑮）+ 月审五问扩为六问**。三条模态线（LLM / 语音 / 视频）共 55 条动作建议，全部上网核实并附来源 URL + 查证日期。owner 点名两项已查实：**Wan 3 真已发布但 fal 未上线**（能真调的最新代是 2.7），**Grok 分文本线 `grok-4.6` 与视频线 `grok-imagine-video/v1.5` 两条**。查出四条待办：`gemini-3.1-flash-lite` 2027-05-07 停机须排期、enhance 线超配 25 倍、Fish 免费档 08-31 到期、Kling v3 extend 端点疑似 404（退役 Veo 3.1 的理由可能落空）。修正两条既有断言：Fish「6.7 倍」只在拉丁字母下成立（UTF-8 bytes 计价，中日文等效 2.2 倍）、Claude 限成 assistant 是策略非能力限制。⚠ 两块盲区如实登记：火山文档站 SPA、AA 榜单 JS 渲染，本轮均未复核。同时把「现役阵容」标为过期并补上代码实测计数（图 16+5 / 视频 26 / 音频 3 / 3D 5），逐条表格重建挂下次月审。**未改模型代码。**
- Date: 2026-08-08 · 范围：**2026-08 月审（owner 口头交办四问）**——① Seedance 2.5 状态复核 → **已 GA 且零阻塞**（08-07 火山上线 API；当日用真浏览器读官方文档钉死 model id `doubao-seedance-2-5-260628` + 时长 [4,30] + 素材 30/10/10 + 纯音频可独存，**§⑫ 立案的冲突 A 就此裁决**），写入新 §⑬ 并作废 §⑫ 那条「第二道闸」（`b4ecf638` 08-01 已把火山 Seedance 迁进 execution worker，文档没跟上）；⚠ 顺带确认 07-31「拿不到规格」的真因是**文档站 SPA 挡住了 curl**，不是登录墙——下次复查直接开浏览器；② Krea 2 权重可下载性复核（HF 官方 Raw/Turbo + `Comfy-Org/Krea-2` 单文件档，许可 <$1M 且 <50 席位免费商用），③ Civitai 确认 `Krea 2` 是一级 baseModel 枚举 + 独立生态页；④ **Krea2 vs Anima 热度实测推翻「Krea2 全面更好」的说法**（LoRA 月榜 52/35 Krea2 领先，但周榜 35/47、checkpoint 24/38 均 Anima 领先，社区口碑是分工不是高下）；⑤ worker-comfyui 仍无新 tag，但 **upstream main 已于 07-30 把 ComfyUI 钉到 0.29.0**，Krea2 的版本闸从「时间不可控」变成「只差发版」。owner 拍板优先级 **Seedance 2.5 > r4a LRU 转正 > Krea2(r4b)**。产出任务包 `docs/plans/seedance-25-ga-integration-2026-08.md`，runner 侧结论回写 `docs/plans/runner-r4-krea2-multiref-2026-07.md` §2.5。**未改模型代码。**
- Date: 2026-07-31 · 范围：**MiniMax H3 调查（§⑩）+ fal 与原生逐模型比价（§⑪）+ Seedance 2.5 状态修正（§⑫）**。三条结论：H3 三通道全开且原生比 fal 便宜一半，owner 拍板先 fal 验质量再上原生；fal 加价按厂商分化（字节系 1.6~2.2× / FLUX·HappyHorse 持平），「全部迁原生」不成立；火山已给 2.5 定价但未放 model id。另查实 MiniMax 国内外站账号与 key **不通用**（推翻三方说法）。**未改模型代码。**
- Date: 2026-07-31 · 范围：**Seedance 2.5 通道核查**——四条通道逐条实测，结论「上游未开门」写入 §⑨ 并修正 §⑥ 那行（fal 页面确实存在，卡点是 early access 白名单 + B2B only 条款，PixelVault 作为个人消费者产品不符合准入）。附带登记 2.0 三项欠账（mini 档 / 4K / 延长编辑），owner 拍板等 2.5 一并做。**未改模型代码。**
- Date: 2026-07-31 · 范围：**回写补登**——把 2026-07-30 业界升级审计的**已实现**结果登记为 §⑧（Fish s2.1-pro / Kling O3 Pro / EL Music v2 / FLUX.2 Pro Edit 四项已落地，Gemini Omni GA 被上游卡住）。同日复核 `models/audio.ts` 确认 `s2.1-pro`、`music_v2`、`eleven_v3: available:false`。**未改模型代码。**
- Date: 2026-07-26 · 范围：**首次全量**——全 provider 版本扫描 + 公开榜单主流度对账 + 生产库用量/成功率抽样。产出：修复 1 起线上失效（Gemini pro preview）、定位 1 起 CI 空转（周检脚本）、接入 4 个（Seedream 5.0 ×3 + Nano Banana 2 Lite）、升级 2 个（Recraft V4.1 / HappyHorse v1.1）、退役 7 个。下次月审：**2026-08 初**，重点跟进 Seedance 2.5 是否 GA 与 Gemini Omni Flash 接入排期。
- Date: 2026-07-30 · **LoRA 底模/工作流社区调研**写入 `docs/plans/research/LoRA/LoRA底模与工作流调研-2026-07.md`（2026-07-31 起按模块归入 `LoRA/` 子目录），并回写本节 §④ LoRA 表；未改模型代码。
