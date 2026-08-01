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

| 模型                  | 状态                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seedance 2.5          | **仍未 GA（2026-07-31 复核，见下节 ⑨）**。fal 模型页 `bytedance/seedance-2.5/text-to-video` 存在但挂 early access 白名单，terms 写死 **B2B only**（须校验终端用户为企业、非个人消费者）——PixelVault 是个人消费者产品，**不符合准入**。火山方舟 / BytePlus 两条直连线均无 2.5 model id |
| ~~Gemini Omni Flash~~ | **已于 2026-07-26 接入**，见下节 ⑦                                                                                                                                                                                                                                                    |
| Seedream 5.0 edit     | Pro/Lite 都有 edit 端点，低幻觉可控编辑对编辑工作台是能力升级，未接                                                                                                                                                                                                                   |

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

### ⑨ Seedance 2.5 通道核查（2026-07-31，四条通道逐条实测）

起因：owner 看到即梦官方号发「Seedance 2.5 全球首发」，问能否升级。**结论：接不了，且不是「还没排期」而是「上游没开门」。**

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

⚠ **初稿说「视频执行面在 Next.js 侧、worker 零改动」——错的。** `generate-video.service.ts:114` 的 `adapter.submitVideoToQueue` 只是存在性守卫，真正的闸在 `canSubmitVideoViaExecutionWorker`，原本写死 `adapterType === FAL`，其余一律 `501 not migrated`。**这意味着火山 Seedance ×4 与 Gemini Omni Flash 至今都执行不了**（火山 adapter 自己的注释写着「service 走 worker-only，dead」）。所以原生视频要能跑，**必须进 execution worker**。

实际落地：

- **worker 新增 provider 派发缝**：`submitProviderQueue` / `pollProviderQueue` 两个包装函数，fal 保持 fallthrough；`CinematicShortVideoWorkflow` 的两个调用点改指向它们。请求构建器抽到 `workers/execution/src/models/minimax/video-request-builder.ts`（照 `models/fal/video-request-builders.ts` 的分工——builder 抽模块、submit/poll 留 index.ts）
- **两处白名单必须同步**：`generate-video.service.ts` 的 `WORKER_CAPABLE_VIDEO_ADAPTERS`（服务端受不受）与 `video-model-send-plan.ts` 的 `WORKER_READY_VIDEO_ADAPTERS`（UI 给不给发）。只加一处 = 要么 UI 藏着能跑的模型，要么点了发在 workflow 里 500
- **Next.js adapter 仍要写**（`minimax.adapter.ts`）：`submitVideoToQueue` 是服务端的存在性守卫，缺了直接 400；同时它是 worker 逻辑的可测镜像
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

⚠ 还有第二道闸：即便火山开了 API，**Seedance 2.5 仍跑不了** —— VolcEngine 至今没有 execution worker 分支（见 §⑩ 的更正）。要让它真能出片，得照 MiniMax 这次的做法给火山加 worker 分支 + 两处白名单。测试里 `execution` 断言为 `execution-not-migrated` 就是钉住这个事实。

已知的 2.5 计费与规格（火山口径）：

| 项                      | Seedance 2.5                             | 对比 Seedance 2.0          |
| ----------------------- | ---------------------------------------- | -------------------------- |
| token 单价（480p/720p） | 输入不含视频 70.00 元/百万；含视频 42.00 | 2.0 为 46.00 / 28.00       |
| 720p · 5s · 无输入视频  | 7.56 元（≈$1.06，$0.21/s）               | 4.97 元 → **2.5 贵约 52%** |
| 480p · 5s · 无输入视频  | 3.36 元（0.67 元/s）                     | 2.31 元                    |
| 分辨率档                | **只有 480p / 720p**                     | 2.0 有 480p/720p/1080p/4k  |
| 输入视频时长            | **2~30 秒**                              | 2.0 为 2~15 秒             |

复查节奏：模型列表页「视频生成能力」段出现 `doubao-seedance-2-5-*` 即为可调用。fal 侧仍用 §⑨ 那条 curl。

## 接入执行规范（指针）

- 加模型四件套：`AI_MODELS` enum + 模型配置 + i18n ×3 + provider adapter（`backend.md`）。
- 直连官方优先，FAL 仅在无直连或 FAL 唯一/更优时（owner 拍板规则）。
- 错误信息：接入时把 provider 错误码映射进 `constants/generation-errors`（→ i18nKey）；逐 provider 错误格式细化归 `providers.md`（批 2 待写）。

## Source of Truth

- `src/constants/models/{enum,image,video,audio,model-3d,types}.ts` · `src/constants/providers.ts`
- `.github/workflows/model-doc-monitor.yml` + `npm run models:check-docs`
- 官方资料（本次）：fal Seedream 5.0 模型页与文档、ByteDance Seed 官方页

## Last Audited

- Date: 2026-07-31 · 范围：**MiniMax H3 调查（§⑩）+ fal 与原生逐模型比价（§⑪）+ Seedance 2.5 状态修正（§⑫）**。三条结论：H3 三通道全开且原生比 fal 便宜一半，owner 拍板先 fal 验质量再上原生；fal 加价按厂商分化（字节系 1.6~2.2× / FLUX·HappyHorse 持平），「全部迁原生」不成立；火山已给 2.5 定价但未放 model id。另查实 MiniMax 国内外站账号与 key **不通用**（推翻三方说法）。**未改模型代码。**
- Date: 2026-07-31 · 范围：**Seedance 2.5 通道核查**——四条通道逐条实测，结论「上游未开门」写入 §⑨ 并修正 §⑥ 那行（fal 页面确实存在，卡点是 early access 白名单 + B2B only 条款，PixelVault 作为个人消费者产品不符合准入）。附带登记 2.0 三项欠账（mini 档 / 4K / 延长编辑），owner 拍板等 2.5 一并做。**未改模型代码。**
- Date: 2026-07-31 · 范围：**回写补登**——把 2026-07-30 业界升级审计的**已实现**结果登记为 §⑧（Fish s2.1-pro / Kling O3 Pro / EL Music v2 / FLUX.2 Pro Edit 四项已落地，Gemini Omni GA 被上游卡住）。同日复核 `models/audio.ts` 确认 `s2.1-pro`、`music_v2`、`eleven_v3: available:false`。**未改模型代码。**
- Date: 2026-07-26 · 范围：**首次全量**——全 provider 版本扫描 + 公开榜单主流度对账 + 生产库用量/成功率抽样。产出：修复 1 起线上失效（Gemini pro preview）、定位 1 起 CI 空转（周检脚本）、接入 4 个（Seedream 5.0 ×3 + Nano Banana 2 Lite）、升级 2 个（Recraft V4.1 / HappyHorse v1.1）、退役 7 个。下次月审：**2026-08 初**，重点跟进 Seedance 2.5 是否 GA 与 Gemini Omni Flash 接入排期。
- Date: 2026-07-30 · **LoRA 底模/工作流社区调研**写入 `docs/plans/research/LoRA/LoRA底模与工作流调研-2026-07.md`（2026-07-31 起按模块归入 `LoRA/` 子目录），并回写本节 §④ LoRA 表；未改模型代码。
