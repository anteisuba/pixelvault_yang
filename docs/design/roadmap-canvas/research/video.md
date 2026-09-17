# 视频模型能力矩阵 + 分镜/白模解法调研（2026-09-17）

一手来源：fal Queue OpenAPI（`fal.ai/api/openapi/queue/openapi.json?endpoint_id=…`，逐端点实拉）、fal 模型页计价段、
火山方舟文档中心、Google Gemini Omni 文档、MiniMax 国际站文档。Kling 官方开放平台文档站是 SPA，直取失败 → Kling 条目以 fal 一手 OpenAPI 为准，标注处写「未核实」。

---

## A · 六个家族能力矩阵

### A1 Seedance（2.5 / 2.0 / 2.0 fast，含 Reference）

| 能力               | 官方口径                                                                                                                                               | 仓库状态                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 输入模式           | 文生 / 首帧 / **首尾帧**（`role=first_frame`/`last_frame`）/ 全模态参考 / **编辑视频** / **延长视频** / 联网搜索工具 —— 火山能力表 2.5 与 2.0 全族均 ✓ | 部分：首帧/首尾帧/参考已接；**编辑与延长完全未接**                                                                                |
| 参考上限 2.5       | 图 1~30、视频 ≤10（单条 2–30s、合计 ≤30s）、音频 ≤10（单条 2–30s、合计 ≤30s）；音频可独立存在                                                          | ✅ 30/10/10 正确（`video-reference-limits.ts`）                                                                                   |
| 参考上限 2.0 系    | 图 1~9、视频 ≤3、音频 ≤3（合计 ≤15s），音频必须搭图/视频                                                                                               | ✅ 正确（`SEEDANCE_20_REFERENCE_SLOTS`）                                                                                          |
| 合计 50            | **fal** 明写「Total files across all modalities must not exceed 50」；火山**没有**公布合计上限                                                         | 仓库对两侧都写 total:50 → 火山侧那条未核实                                                                                        |
| 时长               | 2.5 `[4,30]` 或 `-1`；2.0 系 `[4,15]` 或 `-1`；编辑任务 2.5 只收 `-1`                                                                                  | ✅ 档位对；`-1`（智能时长）未暴露；编辑任务未接                                                                                   |
| 分辨率             | **2.5 = 480p/720p/1080p(10bit)**；2.0 = 480p/720p/1080p/4k；2.0 fast = 480p/720p。fal 2.5 三端点 enum 同为 `480p/720p/1080p`                           | ❌ **2.5 写死 480p/720p**，`video-model-capabilities.ts` + worker `buildSeedance25` 的 `['480p','720p']` 双重封顶，1080p 打不出去 |
| 比例               | 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16 / adaptive(fal 叫 `auto`)                                                                                         | ❌ 缺 21:9 与 auto/adaptive 档                                                                                                    |
| 原生音频/对白/口型 | `generate_audio` 默认 true，含音效+环境音+对口型台词                                                                                                   | ✅                                                                                                                                |
| 镜头/多镜头        | 无结构化字段；靠 prompt。**2.5 响应整数秒时间戳，2.0 只响应「镜头 N」序号**                                                                            | ❌ 未做任何分镜 prompt 支撑                                                                                                       |
| seed               | fal：只有 `reference-to-video` 有 `seed`，t2v/i2v **没有**；火山/BytePlus 有                                                                           | ⚠ 仓库把 fal 的 `SEEDANCE_25` / `SEEDANCE_25_REFERENCE` 都排除在 `SEED_CAPABLE_SEEDANCE` 外 → reference 端点少一个可用旋钮        |
| 未接参数           | fal 独有 `bitrate_mode`(standard/high)、`task`(reference/editing/extension)；火山 `watermark`、`return_last_frame`、`service_tier=flex`(离线推理半价)  | 只有 `return_last_frame` 在火山 builder 里发了                                                                                    |
| 价格               | **fal 2.5：480p $0.2205/s、720p $0.4730/s、1080p $1.164/s**（按 token 公式计，16:9 近似）。火山 2.5 1080p 促销价约 ¥2.7/s（2026-08-14~09-17）          | 目录一律 cost=8，与 fal 的 3 档差 5 倍无关联                                                                                      |
| 限制               | 参考图/视频**不得含真人人脸**（需走「便利创作含肖像视频」方案）；视频 URL 仅存 24h、限下载 100 次；图 ≤30MB、请求体 ≤64MB                              | 未在 UI 暴露                                                                                                                      |

依据文件：`src/constants/models/video.ts`、`src/constants/video-model-capabilities.ts`、`src/constants/video-model-send-plan.ts`、`workers/execution/src/models/fal/video-request-builders.ts`（`buildSeedance25`/`buildSeedanceReference`）、`workers/execution/src/models/volcengine/video-request-builder.ts`
URL：https://www.volcengine.com/docs/82379/2298881 ・ https://docs.volcengine.com/docs/82379/2607689 ・ https://fal.ai/models/bytedance/seedance-2.5/text-to-video ・ https://docs.byteplus.com/en/docs/ModelArk/1330310

### A2 Kling（O3 Pro / V3 Pro，fal）

| 能力                        | 官方口径（fal OpenAPI 一手）                                                                                                                                                                                                                                | 仓库状态                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **多镜头 prompt**           | **V3 Pro 与 O3 Pro 全部 t2v/i2v/r2v 端点都有 `multi_prompt`（数组 of `{prompt, duration 1–15s}`）+ `shot_type: customize \| intelligent`**                                                                                                                  | ❌ **完全未接** —— 这是目录里唯一原生 shot list 的模型                                                                   |
| 首尾帧                      | O3 i2v / O3 r2v / V3 i2v 均有 `end_image_url`                                                                                                                                                                                                               | ❌ 契约写死 `keyframeSlots: 1`                                                                                           |
| Elements                    | V3 i2v、O3 r2v / v2v 有 `elements[]`：每个 element = 正面图 + 1–3 张多角度参考图，或 1 段视频；可绑 `voice_id`（`fal-ai/kling-video/create-voice` 生成）；prompt 里用 `@Element1`。O3 r2v 另有 `image_urls`（`@Image1`），element+参考图合计 ≤4（用视频时） | ❌ 未接，**音色克隆通道也因此缺失**                                                                                      |
| 视频到视频                  | `o3/pro/video-to-video/edit`（`@Video1`，`keep_audio`）、`o3/pro/video-to-video/reference`、4K 版同名端点                                                                                                                                                   | ❌ 未接                                                                                                                  |
| 运动控制                    | `v3/pro/motion-control`：`image_url`+`video_url`+`character_orientation(image\|video)`，可选 1 个面部 element、`keep_original_sound`。$0.168/s                                                                                                              | ❌ 未接（B② 的现成解）                                                                                                   |
| 延长                        | **fal 上不存在 kling extend 端点**（`extend` 关键词全量列表里只有 veo3.1 / ltx / pixverse / flux-3 / grok）                                                                                                                                                 | ❌ **目录里 `KLING_V3_PRO.videoExtension.extendEndpointId = 'fal-ai/kling-video/v3/pro/extend-video'` 指向不存在的端点** |
| 时长/比例/分辨率            | 3–15s 整数；16:9 / 9:16 / 1:1；无 `resolution` 字段（Pro 固定 1080p，4K 是独立端点 `v3/4k/*`、`o3/4k/*`）                                                                                                                                                   | ✅ 与现状一致                                                                                                            |
| negative_prompt / cfg_scale | **V3 有，O3 没有**                                                                                                                                                                                                                                          | ❌ 契约给 kling 家族统一 `negativePrompt: true` → O3 上发了会被忽略                                                      |
| 音频                        | V3 `generate_audio` 默认 **true**；O3 默认 **false**                                                                                                                                                                                                        | ⚠ 目录对两者都 default true                                                                                              |
| seed                        | 两者均无                                                                                                                                                                                                                                                    | ✅                                                                                                                       |
| 价格                        | O3 Pro $0.112/s（音频关）/ $0.14/s（开）；V3 Pro $0.112 / $0.168 / **$0.196（用 voice control）**；v2v edit $0.168/s；motion-control $0.168/s                                                                                                               | 目录 O3=7、V3=6 credit                                                                                                   |

URL：https://fal.ai/models/fal-ai/kling-video/o3/pro/text-to-video ・ …/v3/pro/image-to-video ・ …/v3/pro/motion-control ・ https://fal.ai/models/fal-ai/kling-video/create-voice

### A3 Wan 3.0（含 Reference，fal）

| 能力            | 官方口径                                                                                                                                                                         | 仓库状态                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 输入模式        | t2v / i2v（`start_image_url` + `end_image_url`）/ r2v（`reference_image_urls` ≤10、`reference_video_urls` ≤5 合计 ≤15s 且 ≥16fps、`reference_audio_urls` ≤5 合计 ≤15s）          | ✅ 10/5/5 与首尾帧都正确                                             |
| 位置引用语法    | `Image 1` / `Video 1`（空格 + 首字母大写），与 Seedance 的 `@Image1` 不同                                                                                                        | ✅ 仓库已单独处理（`positionalImageTokens: false` + builder 自前缀） |
| 时长            | `[2,30]`，`null` = 智能时长                                                                                                                                                      | ✅（智能时长未暴露）                                                 |
| 分辨率/比例     | 480p/720p/1080p（fal 默认 1080p）；adaptive/16:9/4:3/1:1/3:4/9:16                                                                                                                | ✅（目录钉 720p 以对齐报价）                                         |
| 音频            | 字段名是 **`audio`**（不是 `generate_audio`），默认 true                                                                                                                         | ✅ builder 已对                                                      |
| negative_prompt | 三端点均**无**                                                                                                                                                                   | ✅ 仓库已核实                                                        |
| seed            | 三端点均有                                                                                                                                                                       | ✅                                                                   |
| 未接参数        | `enable_thinking`、`enable_prompt_expansion`（关掉省 20–60s 但掉质量）、`enable_safety_checker`、r2v 的 `web_url` / `file_url`（从网页/文档直接成片，需 `enable_thinking=true`） | ❌ 全未接                                                            |
| 上位档          | **存在 `alibaba/wan-3.0-prime/{text,image,reference}-to-video`**，字段同构                                                                                                       | ❌ 目录无 Prime                                                      |
| 价格            | $0.05/$0.10/$0.20 每秒（480p/720p/1080p），三端点同价                                                                                                                            | 目录 cost=5                                                          |

URL：https://fal.ai/models/alibaba/wan-3.0/reference-to-video ・ https://fal.ai/models/alibaba/wan-3.0-prime/text-to-video

### A4 HappyHorse 1.1（fal）

| 能力      | 官方口径                                                                                                                  | 仓库状态               |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 输入模式  | t2v / i2v（`image_url` 首帧，**无 end_image_url**）/ **`v1.1/reference-to-video`** / **`alibaba/happy-horse/video-edit`** | 部分：只接了 t2v + i2v |
| 时长      | 3–15s 整数                                                                                                                | ✅                     |
| 分辨率    | 720p / 1080p（默认 1080p）                                                                                                | ✅（目录钉 720p）      |
| 比例      | 16:9/9:16/1:1/4:3/3:4/**21:9/9:21/5:4/4:5**                                                                               | ⚠ 后四档未暴露         |
| 音频/口型 | v1.1 宣称同步原生音频 + 多语言口型；**输入 schema 无 `generate_audio` 开关**                                              | ✅ 仓库注释已核实一致  |
| seed      | 有（0–2147483647）                                                                                                        | ✅                     |
| 其他      | prompt ≤2500 字符；i2v 图 ≥300px、比例 1:2.5–2.5:1、≤20MB；`enable_safety_checker`                                        | 未暴露                 |
| 价格      | 约 $0.14/s（720p）与 $0.18/s（1080p）—— 模型页计价段                                                                      | 目录 cost=5            |

URL：https://fal.ai/models/alibaba/happy-horse/v1.1/text-to-video ・ https://fal.ai/models/alibaba/happy-horse/v1.1/reference-to-video

### A5 Gemini Omni 1.1 Flash（Interactions API）

| 能力       | 官方口径                                                                                                                                                                   | 仓库状态                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 任务类型   | `video_config.task` ∈ `text_to_video / image_to_video / reference_to_video / **edit** / **extend**`；不传则模型自行推断                                                    | ❌ 只当文生/图生用                                                                              |
| 首尾帧     | 官方「First and last frame interpolation」：`input` 里放两张图 + 描述过渡                                                                                                  | ❌ `keyframeSlots: 1`                                                                           |
| 多图参考   | Subject reference，多张图；官方**未公布硬上限**                                                                                                                            | ✅ 仓库诚实写 `images: undefined`                                                               |
| 参考视频   | 最多 3 段、每段 ≤3s；**参考音频当前版本不支持**                                                                                                                            | ❌ 未接                                                                                         |
| 有状态编辑 | `previous_interaction_id` 多轮改片，不用重传视频；也可用 Files API 传自己的视频编辑（输入 ≤10s）                                                                           | ❌ 未接（这是 Omni 的核心卖点）                                                                 |
| 延长       | 用原片最后 10s 作上下文续写，画面/动作/角色/音频连贯，会改写尾部若干帧做无缝过渡                                                                                           | ❌ 未接                                                                                         |
| 分辨率     | 360p / **720p(默认)** / 1080p(上采样) / 4k(上采样)                                                                                                                         | ❌ 契约 `resolution:false`，只有 720p                                                           |
| 时长       | 官方文档正文无 duration 参数；**fal 的 `google/gemini-omni-flash/v1.1/*` 暴露 `duration` 3–10（默认 8）**                                                                  | 契约 `duration:false` + 名义 8s，与 Google 侧一致                                               |
| 比例       | 16:9 / 9:16                                                                                                                                                                | ✅                                                                                              |
| 音频       | 默认自带音轨，可在 prompt 里描述音乐/音效/时间点（「5s 时副歌进入」）                                                                                                      | ✅                                                                                              |
| 执行链路   | 仓库走 GEMINI adapter；**fal 上同款模型已有完整端点族**（`v1.1/{text,image,reference}-to-video`、`v1.1/edit`），价格 360p $0.03 / 720p $0.10 / 1080p $0.15 / 4K $0.30 每秒 | ⚠ 契约标 `execution: 'ready'`，但 GEMINI 不在 `WORKER_READY_VIDEO_ADAPTERS` —— 两处口径自相矛盾 |

URL：https://ai.google.dev/gemini-api/docs/omni ・ https://fal.ai/models/google/gemini-omni-flash/v1.1/reference-to-video

### A6 MiniMax H3（国际站 platform.minimax.io / 国内站 platform.minimaxi.com）

| 能力        | 官方口径                                                                                                                                                                   | 仓库状态                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 输入模式    | t2v / i2v（`role=first_frame` 和/或 `last_frame`，**0、1 或 2 张**）/ r2v（`reference_image` ≤9、`reference_video` ≤3、`reference_audio` ≤3）。**i2v 与 r2v 互斥，不能混** | ❌ **首尾帧未接**（builder 只发 `first_frame`）；互斥规则已对 |
| 参考细则    | 视频单条 2–15s、合计 ≤15s；音频单条 2–15s、合计 ≤15s；图 256–5760px、≤30MB；视频 ≤50MB；音频 ≤15MB。**官方未给「合计 12 个」这种跨模态总数**                               | ⚠ 仓库 `total: 12` 未核实                                     |
| 时长        | 4–15s 整数                                                                                                                                                                 | ✅                                                            |
| 分辨率      | **768P / 2K**（H3-Max 为 480P/768P，不支持 2K）                                                                                                                            | 只发 2K（仓库已注明是产品选择）                               |
| 比例        | 常见比例 + `adaptive`；**i2v 下 ratio 恒为 adaptive，传别的被忽略**                                                                                                        | ⚠ 无 adaptive 档                                              |
| 音色克隆    | r2v 的 `reference_audio` 可参考音色/台词/剪辑节奏                                                                                                                          | ✅ 已接为 audio reference                                     |
| Prompt 增强 | **H3-Context-IR 任务**：跨模态深度解读后返回结构化增强 prompt（不出片）                                                                                                    | ❌ 未接                                                       |
| 2K 重生成   | **Video Regeneration**：把 768P 成片 + 原 content + `role=base_video` 重投，产出 2K                                                                                        | ❌ 未接（可省一半钱：先 768P 试、满意再升 2K）                |
| seed        | 官方参数表无                                                                                                                                                               | ✅                                                            |
| 价格        | H3：768P **$0.08/s**、2K **$0.13/s**；H3-Max：480P $0.05/s、768P $0.08/s。**输入另计**：音频免费，图片前 5 张免费、之后 $0.04/张，输入视频按输入时长 × 输出分辨率计        | ⚠ 仓库 cost=5，且从不提「输入视频也计费」                     |
| 姊妹模型    | **MiniMax-H3-Max**（MiniMax × fal 联合，后训练提速）                                                                                                                       | ❌ 目录无                                                     |

URL：https://platform.minimax.io/docs/guides/video-generation ・ https://platform.minimax.io/docs/api-reference/video-generation-v2-create ・ https://platform.minimax.io/docs/guides/pricing-paygo

---

## 最该补的 8 个缺口（按性价比排序）

1. **Kling `multi_prompt` + `shot_type`** —— 目录里唯一原生 shot list（每镜带独立 duration），是「分镜镜头怎么放」的现成答案，四个端点都支持，只需扩 `VideoModelSendContract`。
2. **Seedance 2.5 的 1080p 被双重封顶** —— `video-model-capabilities.ts` 与 worker `buildSeedance25` 都写死 `['480p','720p']`，fal 与火山两侧官方都给 1080p。目前卖点档位用户拿不到。
3. **`KLING_V3_PRO.videoExtension` 指向不存在的 fal 端点** —— `fal-ai/kling-video/v3/pro/extend-video` 在 fal 全量 `extend` 列表里没有；点延长必失败。要么删这块，要么改走 Seedance/Omni 的原生延长。
4. **Seedance 编辑 + 延长完全未接** —— 火山能力表 2.5/2.0 全族 ✓，fal 侧是 `reference-to-video` 的 `task: editing | extension` 一个字段的事。延长官方口径包含「多个视频片段串联成一个连贯视频」，直接服务分镜拼接。
5. **首尾帧覆盖不全** —— Kling O3/V3 i2v、MiniMax H3、Gemini Omni 三家官方都支持，仓库契约里 `keyframeSlots` 全是 1，用户填了尾帧被静默丢弃（正是注释里警告过的那类缺陷）。
6. **Kling `elements` + `create-voice`** —— 角色/道具跨镜一致性 + 音色绑定，是「多镜同一个人」的唯一结构化通道，也是目录里唯一的视频侧音色克隆。
7. **Gemini Omni 的有状态编辑（`previous_interaction_id`）与 4 档分辨率** —— 契约现在把 duration/resolution 都关掉、execution 又标 `ready` 与 `WORKER_READY_VIDEO_ADAPTERS` 打架，等于把这个模型的全部差异化能力关在门外。
8. **MiniMax 768P 档 + Regeneration 升 2K** —— 768P $0.08/s 对 2K $0.13/s，先低档试镜再升，单这一条就砍约 40% 试错成本；顺带补上「输入视频也计费」的提示。

（次级：Wan 3.0 Prime、HappyHorse reference/video-edit、Seedance `-1` 智能时长、21:9 与 adaptive 比例档、Seedance `service_tier=flex` 离线半价。）

---

## B① 分镜镜头怎么放、转场怎么切

1. **模型原生 shot list（可直接用现有 provider）** —— Kling V3/O3 Pro 的 `multi_prompt: [{prompt, duration}]` + `shot_type`。一次请求出多镜，镜间衔接由模型负责，`intelligent` 还能让模型自己切分镜数。上限 15s 总长。**现有 fal adapter 只需加字段，不用新 provider。** https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video
2. **时间戳分镜 prompt（可直接用现有 provider）** —— Seedance 2.5 官方提示词指南明写：用「时间区间」或「镜头 N」切分，逐段写画面/运镜/动作/台词/音效；**2.5 响应整数秒时间戳，2.0 只响应镜头序号**。转场要写清触发点与方式（官方例：「第 5s 快速向左横移转场（向左擦除 + 自然叠化）」）。这是零改动就能提质的路径——只要 prompt 模板改。https://docs.volcengine.com/docs/82379/2607689
3. **多宫格分镜图 / 故事板参考（可直接用现有 provider）** —— 把多格线稿分镜合成一张图作为参考图投进 Seedance 2.5 R2V。官方口径：**≤15 格**，推荐火柴人/线稿、别写太多字；**生成不严格对齐分镜图**，只给大致剧情。适合「快速定调」。同上 URL。
4. **多关键帧严格对齐（可直接用现有 provider）** —— 需要严格按分镜时，把每张分镜图作为独立参考图按顺序传入，prompt 第一句写「以图片 1 至图片 7 的顺序作为关键帧」。官方明示这条比宫格图对齐度高。仓库已有 30 张图槽位，缺的只是这句 prompt 约定和 UI 的「顺序」语义。
5. **逐镜生成 + 尾帧续接 + 拼接（部分要新接）** —— 火山 builder 已经发 `return_last_frame: true`，拿到尾帧当下一镜首帧即可保连续性；跨镜转场有两条模型侧解法：Seedance 2.5 的**「视频无缝转场」**（输入两段视频，模型补中间）与**「一键成片」**（多图/视频 → 短片，可加文字/贴纸/转场）。两者都在 R2V 端点上，属于「要新接一个任务模式」而非新 provider。剪辑侧兜底（ffmpeg 硬切/叠化）是纯概念，仓库目前没有任何视频合成层。

## B② 转白膜：用 3D 灰模 / blockout 控制动作与分镜

1. **Seedance 2.5 白模参考/渲染（可直接用现有 provider，最强解）** —— 官方 R2V 能力表独立列出「白模参考/渲染 —— 输入粗粒度或细粒度白模视频参考其动态信息、进行渲染」，支持白模参考 / 白模+主体 / 白模+主体+场景三档组合，白模视频可含**切镜、运镜、光照**。官方给的 prompt 范式是「以白模参考视频 `<video1>` 作为整支视频唯一的运镜、镜头节奏、景别变化、主体运动轨迹和镜头调度参考，严格保持镜头顺序、机位变化、运动方式和节奏，不改变镜头结构，不新增镜头」，再配各阶段关键帧图。**限制**：当前版本建议只用简单几何体拼接；白模主体建议只保留躯干，含四肢/翅膀时必须补全动作序列，否则渲染出来四肢僵化。成本 = 一次 R2V（fal 720p $0.473/s，输入视频在火山侧另有最低 token 用量）。**仓库已有视频参考槽位（10 段/30s），缺的是 prompt 范式与「白模」这个语义档。** https://docs.volcengine.com/docs/82379/2607689
2. **Kling `v3/pro/motion-control`（要新接一个 fal 端点，同一 adapter）** —— `image_url`（外观）+ `video_url`（动作源）+ `character_orientation` 选朝向跟图还是跟视频，可另绑 1 个面部 element 保脸。官方描述要求动作源是「写实风格角色」，所以更适合真人 previz（动捕/手机自拍）而非纯几何白模。$0.168/s。https://fal.ai/models/fal-ai/kling-video/v3/pro/motion-control
3. **Wan VACE 深度/控制族（要新接，且是老一代模型）** —— fal 上有 `fal-ai/wan-22-vace-fun-a14b/{depth,inpainting,outpainting,reframe}`、`fal-ai/wan-vace-apps/video-edit`、`fal-ai/wan/v2.2-14b/animate/{move,replace}`。`depth` 端点收 `video_url` + `ref_image_urls` + 首尾帧 + `num_frames(17–241)`，是最接近「深度图/灰模驱动」的显式控制。代价：**Wan 2.2 代、分辨率上限 720p、无原生音频**，与目录里的 Wan 3.0 不是同一条线，接了会多一个质量档次断层。
4. **Gemini Omni 的 `reference_to_video` + 参考视频（要新接）** —— 官方支持最多 3 段、每段 ≤3s 的参考视频（「video references work best with likenesses，视频里的音频被忽略」）。3s × 3 的额度对整片白模太短，更适合单镜姿态锚定；且**参考音频当前不支持**。
5. **纯概念（尚无官方 API 路径）** —— Runway Act-Two 这类「表演迁移」在本次调研的 fal 目录里搜不到对应端点（`act` 关键词只命中 `fal-ai/bytedance/dreamactor/v2` 与 lipsync 类），Runway 官方 API 是否开放 Act-Two 本轮**未核实**。「先出 3D 白模再渲染」的完整 previz 流水线（Blender/UE blockout → 导出 → 投模型）没有任何 provider 提供工具链，属于自建。

---

未核实项汇总：Kling 官方开放平台文档站（SPA）的一手字段口径；火山侧是否存在与 fal 相同的「跨模态合计 50」上限；MiniMax「合计 12 个参考」；HappyHorse v1.1 精确分档价；Runway Act-Two 的 API 可用性。
