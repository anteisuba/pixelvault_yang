# Providers 参考 — 接入契约与错误信息（现状事实）

> 定位：provider / model / API 集成的契约与现状。**慢改原则**：任何 endpoint、model id、payload、鉴权、轮询、webhook、限制、返回结构、key 验证方式的改动，必须先查当前官方文档（WORKFLOW 联网核验）；官方与代码不一致时停下问 owner。模型阵容与月度审计见 `model-catalog.md`。

## Hard rules（继承 2026-06 契约，仍有效）

1. Client 只能表达用户选择意图（如 `apiKeyId`）；key resolution、routing、解密、用量、存储全在 server/service/worker 层。
2. **显式 BYOK 失败不得静默 fallback 到 platform key**——同一请求不能偷偷改烧平台额度。
3. Provider 返回的临时 URL 只是 ingestion source；成功作品必须进 R2，R2 storageKey 才是平台内媒体事实源。
4. 生成执行目标是 **worker-only**：Next.js 只做 auth / validation / route+key resolution / job create / signed dispatch / callback finalization；provider submit / poll / 结果下载 / R2 上传在 Cloudflare Worker。
5. 官方文档打不开、要登录、只渲染 shell 时，**不能把字段写成已确认事实**。
6. **缺 key 不禁用 UI**（CLAUDE.md Hard Rule 8）——2026-09-18 全站收口完成。3D 工作台是最后两处「死控件 + 解释」：模型卡下的缺 key 警告横幅、以及被禁用的多视角按钮。两者现在与生成键同形——仍可点，点了开对应 provider 的 `QuickSetupDialog`；多视角跑在自己的模型上，所以弹它自己那一个，不是 3D 那一个。四条横幅文案随之删除。
7. **「通盘管理 key」全站只有 `/settings/keys` 一个去处**（见 `pages/settings.md`）。旧的两个 key 抽屉（侧栏 / 画布）与它们共用的 `ApiKeyManager` 已整删。就地补录仍由 `QuickSetupDialog` 负责，两者不重叠。

## Adapter 架构（2026-09-20 复核：registry 实到 14 个）

- Registry `src/services/providers/registry.ts` 注册 **14 个 adapter**：huggingface · gemini · openai · fal · replicate · novelai · **pixai** · volcengine · **byteplus** · fish_audio · elevenlabs · **minimax** · **minimax_cn** · **runner**（Comfy Runner / RunPod ComfyUI，见 `domains/runner.md`）。⚠ **名册的事实源是 `registry.ts` 里的 `PROVIDER_ADAPTERS` 那张表**，不是这里的数字——加/删 adapter 时以文件为准，别照抄本行。
- **Replicate 2026-09-17 起没有任何在售模型**：`ILLUSTRIOUS_XL` 退役后它的两条目录条目（另一条是 `ANIMA_PENCIL_XL`）全是 `available: false`。`ACTIVE_API_KEY_ADAPTER_OPTIONS` 由「可用模型 ∪ LLM 能力域」推导，所以 key 选择器**自动**把 Replicate 排除掉了（与 HuggingFace / Runway 同处境，无需改代码）。⚠ **adapter 保留在 registry，不照 Runway 先例整删**——Runway 目录里从来没有过条目，Replicate 有两条归档条目、历史 Generation 记录引用着它，且 HuggingFace 就是「registry 在册、key 选择器不在册」的既有形状。`PROVIDER_ADAPTERS` 2026-09-20 起是 **14 个**（进度表 26 加入 pixai）。
- `runway`（Runway gen4.5）2026-08-24 随死执行链清理**整删**：`runway.adapter.ts` 文件、registry 条目、`ADAPTER_PROMPT_HINTS`/`provider-capabilities.ts` 里的死细节全部移除。目录里从来没有过一个可选的 Runway 模型，adapter 本身在 registry 里存在的全部意义只剩 `healthCheck`——删除前已确认 `AI_ADAPTER_TYPES.RUNWAY` 枚举保留（退役≠删除）且 `apiKey.service.ts` 的 key 校验是自包含 switch（不依赖 registry），已有 Runway key 的用户仍能查看/校验/删除该 key，只是不能再新建。
- **同一份实现挂多个 adapter type** 是既有形状，不是漏写：`byteplus` = `{ ...volcengineAdapter, adapterType: BYTEPLUS }`（BytePlus ModelArk 国际站 vs 火山 Ark 国内站）；`minimax` / `minimax_cn` 同理（`api.minimax.io` vs `api.minimaxi.com`）。分成两个 type 而不是一个 config flag 的原因只有一个——**两站账号独立、key 不可互换**，而 key 存储按 adapterType 分槽。
- `runner` 是 BYOK 六步之外的特例：无 API key 可配（`AI_ADAPTER_TYPE_OPTIONS` 故意不含它），`resolveGenerationRoute()` 命中它就走独立分支——系统 key（`RUNPOD_KEY`）+ 月度限额（`RUNNER_MONTHLY_LIMIT`）。真正的 provider 调用（RunPod submit/poll + recipe→ComfyUI workflow 映射）在 Worker（`workers/execution/src/models/runner/`），adapter 侧 `generateImage()` 只是契约占位（同步路径不支持，冷启动太长）。
- `HYPER3D_RODIN` **故意不进 registry**——3D 走 `generate-3d.service.ts` 直发 Worker。
- `deepseek` 不是 media adapter——用于 text / planner / assistant 路径（`llm-text.service.ts`）。
- 文本响应异常（2026-09-09）：`llm-text.service.ts` 为 OpenAI / DeepSeek / Grok / Gemini / Claude 保留空回复、拒绝、输出截断及上游错误分类。流式完成须有正文和结束事件（OpenAI 兼容线路 `[DONE]`、Gemini `finishReason=STOP`、Claude `message_stop`）；损坏事件、提前 EOF 或读流失败不能视为完整回复。已输出部分正文后发生拒绝或截断也会抛错；助手保留错误码，不进入 JSON 格式纠错重试，不执行该轮工具。非流式也检查异常停止原因，GPT 推理耗尽但无正文的既有专用错误保留。核验：[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[DeepSeek 返回契约](https://api-docs.deepseek.com/api/create-chat-completion/)、[JSON 模式空回复说明](https://api-docs.deepseek.com/guides/json_mode/)、[Claude 流式错误](https://platform.claude.com/docs/en/build-with-claude/streaming)。
- 契约 `types.ts`：`ProviderGenerationInput/Result`（图）、`ProviderVideoInput/Result`（视频，`fetchHeaders` 支持需鉴权下载的 provider 如 Sora）、`ProviderQueueSubmitInput`（队列型，duration 支持 `'auto'`）；`civitaiToken` 全链穿透（Civitai 下载 401 需鉴权）。

### Assistant LLM 媒体契约（2026-08-05）

- 助手 LLM 是同步 text/vision 会话路径，不属于媒体生成 adapter，也不改 worker-only 的媒体生成边界。
- 默认 OpenAI 助手模型为原生 `gpt-5.6-sol`；无媒体引用时画布可走 AI Gateway 的
  `openai/gpt-5.6-sol`。当前 PixelVault OpenAI 助手只声明文本与图片输入，不接收原生视频；与
  [OpenAI GPT-5.6 Sol 模型能力页](https://developers.openai.com/api/docs/models/gpt-5.6-sol) 一致。
- Gemini 助手支持真实视频理解：小视频可用 inline data，大视频经 Gemini Files API
  resumable upload → 状态轮询 → `fileData` 输入；稳定附件 URL 仅由服务端受控抓取。实现依据
  [Gemini 视频理解](https://ai.google.dev/gemini-api/docs/video-understanding) 与
  [Files API](https://ai.google.dev/api/files)。
- DeepSeek 的 `deepseek-v4-pro` 继续按纯文本路由处理；视觉档是 `deepseek-flash`，
  可在同一 OpenAI-compatible Chat Completions 接口中接收 `text + image_url` 内容块，
  PixelVault 将它作为独立助手档位暴露，不能把 DeepSeek adapter 整体翻成视觉能力。
  图片只允许进入该视觉档，V4 Pro 仍在能力闸和请求构造器两层拒绝。⚠ **2026-09-17 换型号**：
  官方模型列表已把 `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 标为 legacy
  并写明「对应模型已退役」（旧名仍被接受但由 DeepSeek-V4.1-Flash 承接），现行 id 是
  `deepseek-flash`——1M 上下文、384K 最大输出、Vision ✓、非高峰 $0.15/$0.6 每 MTok
  （高峰 $0.3/$1.2），缓存命中 $0.003–0.006。依据：
  [DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/) 与
  [定价 / 模型列表](https://api-docs.deepseek.com/quick_start/pricing)。Claude 厂商 API
  本身支持图片输入（见 [Claude vision](https://platform.claude.com/docs/en/build-with-claude/vision)），但当前
  PixelVault Claude 助手调用尚未接入该图片内容块，所以菜单如实标为“仅文本”。
- ⚠ **Qwen 文字线已于 2026-09-17 整体退役**（owner「文字路由合一」拍板）：`AI_ADAPTER_TYPES.DASHSCOPE`
  枚举、`qwen3-max` / `qwen-plus` / `qwen-flash` / `qwen3-vl-plus` 四个文本模型 id、
  DashScope 的 completion / stream 分支、enhance 与 planner 路由候选、key 校验与
  三语文案全部删除。Qwen 只作为**图像 / LoRA 底模**（Qwen-Image 家族）与 Comfy Runner 的
  Anima 工作流文本编码器继续存在，那条线与本节无关、未受影响。
  能力不匹配时服务端和客户端都必须拒绝，不得丢弃附件、传 URL 文本或以视频封面静默降级。
- 交互、模型清单和最多 8 个稳定 URL 附件契约见 [`pages/assistant-shell.md`](pages/assistant-shell.md)。

## BYOK 路由（`resolveGenerationRoute()`，五步顺序）

1. 显式 `apiKeyId` → 服务端读该用户 active BYOK key。
2. key 不存在 / 不属于该用户 / inactive / adapter 不匹配 → **直接失败**。
3. 显式路径**永不** fallback 平台 key。
4. 无显式 keyId → 找该用户对应 adapter 最新 active BYOK key。
5. 都没有 → `MISSING_API_KEY`，要求绑 key（UI 侧走 QuickSetupDialog，不禁用）。

⚠ **生成类（图 / 视 / 音 / 3D）没有「平台额度 / 免费额度」这一档**（owner 2026-09-17 拍板）：
`ModelOption.freeTier` 字段、`FREE_TIER` 常量、每日 slot 预留（`atomicReserveFreeTierSlot` /
`FreeTierSlot` 计数）、选择器里的「平台免费额度」分组与额度徽章全部删除，
`resolveModelChannel` 的档位从 `userKey › freeQuota › cheapest` 收成 `userKey › cheapest`。
生成一律走用户自己的 key，缺 key 直接 `MISSING_API_KEY`。

⚠ **唯一保留的平台 key 用法是 Gemini 的文本 / 视觉 LLM 路由**（`llm-text.service.ts` 的
`getSystemApiKey(GEMINI)` 分支，以及经它转发的 `vision-route.service.ts` /
`research-route.service.ts` / `node-planner-route.service.ts` / `video-script.service.ts`）——
那条线不经过 BYOK 路由，也不进模型选择器。另一个平台掏钱的特例是 `runner`（见上方
`RUNNER_MONTHLY_LIMIT`），它本来就没有 BYOK 通道。

## 错误信息机制（全链路）

```text
adapter / Worker 抛错
  → src/lib/errors.ts 错误类层次（GenerationError 基类：ProviderError / RateLimitError /
    AuthError / SafetyFilterError…，各类自带 SCREAMING_SNAKE errorCode + httpStatus + i18nKey）
  → src/lib/api-route-factory.ts handleRouteError() 统一序列化为
    { success:false, error, errorCode, i18nKey }
    （GenerationError 直接 toJSON；legacy GenerateImageServiceError 才现场调
     getGenerationErrorI18nKey(message) 补 i18nKey；未知错误收敛为 INTERNAL_ERROR 500，
     仅"临时上游故障"白名单以 PROVIDER_TRANSIENT 原文透出、故意不带 i18nKey）
  → 异步失败路径（轮询/回调）由 generation-failure-response.service.ts 组装同形 payload
    （normalizeErrorCode + parseGenerationErrorCode 归一到 17 个小写标准码 + i18nKey）
  → 客户端 src/lib/api-error-message.ts：i18nKey 优先 → errorCode/message 归一到 17 码
    → Errors.generation.{code} 三语文案 → 原文兜底
```

注意：17 个小写标准码是**客户端分类字典**；服务端错误类用 SCREAMING_SNAKE 码（PROVIDER_TIMEOUT、RATE_LIMIT_EXCEEDED…），两套由 `normalizeErrorCode()` 的 BACKEND_ERROR_CODE_MAP 桥接。

**标准错误码（17）**：provider_timeout · provider_rate_limit · provider_overloaded · invalid_api_key · content_filtered · model_unavailable · provider_no_output · callback_timeout · storage_upload_failed · provider_insufficient_balance · insufficient_credits · unsupported_reference_image_format · reference_image_too_large · reference_image_unreachable · reference_image_limit_exceeded · invalid_reference_image_dimensions · unknown。

- **参考图错误分类**：`REFERENCE_IMAGE_ERROR_PATTERNS` 五类正则（格式 / 过大 / 不可达 / 数量超限 / 尺寸不合）扫 provider 原始 message；`PROVIDER_REFERENCE_FORMAT_GUIDANCE` 按 provider 给用户格式指引，共 4 条（OpenAI=JPEG/PNG/WebP · Gemini=+HEIC/HEIF · fal=+GIF 且 URL 须直接可达 · VolcEngine/Seedream=常见格式且 URL 须直接可达）。
- **新接 provider 的义务**：把该 provider 的错误码/message 特征映射进标准码表 + i18n 三语文案；**raw provider error 不许直达用户**。

## 原生 vs 聚合（调研指针）

各模型走 **厂商原生 API** 还是 **fal/Replicate 等合法聚合**、以及「中转是否有更好原生」的取舍结论出自《模型接入原生与中转调研-2026-07》（调研文档已随任务包清理，git 历史可取）；原则 = 官方直连优先（owner 拍板）。

本文件仍以契约与错误处理为权威；路由类型以 `AI_PROVIDER_ENDPOINTS` 为准。

### 新模型接入的默认路由策略（2026-07-31 从调研升格为规则）

| 情形                                            | 默认走                        | 说明                                                                   |
| ----------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| 厂商有官方 HTTP API **且**可 BYOK               | **原生**（A 类）              | OpenAI / Gemini / Ark / NovelAI / Fish / ElevenLabs / Hyper3D 都是这条 |
| 只有聚合能买 / 要 day-0 上线 / 冷启动想让平台扛 | **fal（或现有双轨）**（B 类） | Kling / Happy Horse / Hunyuan3D 现状；**合法聚合，不是灰色反代**       |
| 社区 checkpoint + LoRA 配方要忠实还原           | **Runner**（C 类）            | 自托管；「更好」是扩 workflow/checkpoint，不是换 fal 假装社区底模      |
| 未授权转发官方 key/账号的「中转站」             | **禁止**                      | ToS、稳定性、封号、无法 BYOK 审计                                      |

推论（避免反复重开这个话题）：

- ~~**不要**为「去掉中转」再造第三条字节通道——fal + 火山 Ark 双轨够了~~ **本条已被现实推翻（2026-08-24 记录）**：BytePlus（字节国际线）adapter 已于 2026-08-12 前后接入 registry 并在生产跑着，Seedance 2.5 现为 **fal / 火山 / BytePlus 三轨**（三轨定位见上方速览表；BytePlus 是海外正解，不是 fal 的替身）。当时反对的理由（多一个 adapter 的运维面）被三站 key 互不通用、海外线需独立通道的事实压过。保留原句划掉而非删除，防止下一轮有人按旧结论把 BytePlus 当「违规第三通道」提退役。
- **不要**为「全部原生」拆散统一的 fal 队列与 credit 抽象——代价是更多 adapter 与运维面。
- FLUX 走 fal 是合理默认；仅当 BFL 官方有明确价差或合规需求才开 `bfl` adapter spike。
- Kling 换原生 = **新 provider 工程**（区域/资质/API 形态都不同），不是改 endpoint 字符串。

## 逐 provider 现状速览

| adapter           | 用途                                                                         | 错误/接入特点（已核验口径）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| openai            | 图（gpt-image-2 / 2.5 Flare / Sunburst）                                     | 参考图仅 JPEG/PNG/WebP；Worker 已迁移；adapter 无视频路径（Sora 仅存在于 types.ts fetchHeaders 契约注释，目录中无 Sora 模型）                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| gemini            | 图像（generateContent）+ Omni 1.1 视频（Interactions）                       | 视频已接 Worker：文字/参考图 → Files 轮询 → 带 key 下载 → R2；REST 从 steps 提取视频 URI，固定 Google 文件来源。应用与 Worker 须一同发布，真实生成未验证。                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| fal               | 图/视频/3D 最大聚合通道（queue submit/poll）                                 | 参考图 URL 必须直接可达；**部分视频 schema 未逐字段核验**（改前查模型页）；Worker 已迁移（图+视频+长视频+3D）。`fal.adapter.ts` 的 `submitModel3DToQueue`/`checkModel3DQueueStatus` 内联实现已整删（2026-08-25）——3D 提交侧对 FAL/Hyper3D Rodin 无条件短路进 Worker，legacy 内联任务早被 execution-sweeper 清空，`generate-3d.service.ts` 同步删掉了 PR3-α 的 mesh-first 分阶段调用                                                                                                                                                                                                                   |
| replicate         | 图（FLUX/SDXL LoRA 字段）                                                    | 结果下载需 bearer；Worker 已迁移                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| novelai           | 图（nai-diffusion-5 / 4.5，Full+Curated）                                    | **BYOK-only**（无平台 key）。返回 ZIP 需解包；V5 payload 是 `params_version: 4` 且不发 `skip_cfg_above_sigma`；Worker 已迁移（t2i + 单图 img2img + **V5 遮罩重绘**）。V5 发布当天无 Director / Vibe Transfer。**V4/4.5 多图 Director 模式随 src 死链删除，实现只存于 git 历史（worker 从未实现过它），能力已收 `maxReferenceImages:1`（`d2c664bd`）**。2026-09-20（进度表 26）补三颗控件 + inpaint，见下方「NovelAI V5 专属控件」节                                                                                                                                                                   |
| pixai             | 暂时下架（Tsubaki.2 / Haruka v2 / Hoshino v2）                               | **BYOK-only**，A 类原生，**仅文生图**（无 i2i / 参考图 / 编辑 / 视频，能力表如实写 `maxReferenceImages: 0`）。队列型：`POST /v2/image/create` → `GET /v1/task/{id}` 轮询（⚠ 官方下限 1.5s/次；状态 waiting/running/completed/failed/cancelled）。**图不永久保留**——worker 拿到 `outputs.mediaUrls[0]` 立刻下载进 R2，⛔ 不存 PixAI 的临时 URL。账号级并发闸：同时最多 10 个 `waiting` 任务（running 不计），429 时给出这句话而不是「key 无效」。`batchSize` 官方收 1\|4，本仓只发 **1**（worker 图片结果契约是单张）；比例逐字透传（本仓 5 种是官方 11 种的子集）。**价目未核实**——见下方「未核实项」 |
| volcengine        | 图/视频国内直连（Ark，`ark.cn-beijing.volces.com/api/v3`）                   | 官方文档页需 JS 渲染，字段级改动去控制台 API Explorer / SDK 例子核；Worker 已迁移（图）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| byteplus          | 图/视频国际线（BytePlus ModelArk，`ark.ap-southeast.bytepluses.com/api/v3`） | 与 volcengine **同一份实现**（`byteplusAdapter = { ...volcengineAdapter, adapterType: BYTEPLUS }`），只换 adapterType / baseUrl / key 槽；账号与 key **与国内 Ark 不通用**。有平台 key（`BYTEPLUS_API_KEY`）。Worker 侧共用 `models/volcengine/video-request-builder.ts`（`isVolcEngineProviderId` 同时认 `byteplus`）                                                                                                                                                                                                                                                                                |
| minimax           | 视频（MiniMax-H3，国际站 `api.minimax.io/v2`）                               | 队列型 submit → poll；`generateImage()` 直接抛 400（**video only**）。轮询的 `status` 故意用 string 不用 `z.enum`——未文档化的中间态按「仍在排队」处理，不炸掉在飞的 poll。参考图/视频/音频上限 9 / 3 / 3 且总数 ≤12（超任一条 provider 返 400，发送前 clamp）。有平台 key（`MINIMAX_API_KEY`）；Worker 侧 `models/minimax/video-request-builder.ts`                                                                                                                                                                                                                                                   |
| minimax_cn        | 同上，国内站 `api.minimaxi.com/v2`（域名多一个 `i`）                         | 与 `minimax` 是同一份实现的两个 adapterType 标签；两站账号独立、**key 不可互换**，key 存储按 adapterType 分槽所以不能合成一个 config flag。平台 key 走 `MINIMAX_CN_API_KEY`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| huggingface       | 图（Inference Providers）                                                    | 二进制响应；Worker 已迁移                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| fish_audio        | 音频 TTS（`s2.1-pro` / `s2.1-pro-free`）                                     | Owner 2026-09-06 选择双档；均为 BYOK-only。默认付费档 $15 / 百万 UTF-8 字节，免费档 $0（Fair Use）。目录 ID 分别为 `fish-audio-s2-pro` / `fish-audio-s2-pro-free`；单人、多人对话和音色卡沿用同一 API。                                                                                                                                                                                                                                                                                                                                                                                               |
| elevenlabs        | 音频 SFX + **Music**（`eleven_text_to_sound_v2` / `music_v2`）               | 2026-06 后新增 adapter；同样**无 getSystemApiKey 平台 key 映射**（BYOK-only）。⚠ 语音 `eleven_v3` 已 `available: false`（价高退役），别按「EL 是 TTS 供应商」排期                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| runner            | 图（Comfy Runner / RunPod ComfyUI 自托管）                                   | **无 BYOK 槽**（`ADAPTER_KEY_HINTS` 写 `n/a (platform-managed)`，`AI_ADAPTER_TYPE_OPTIONS` 故意不含它）；系统 key + 月度限额。adapter 侧 `generateImage()` 只是契约占位，真实 submit/poll 在 Worker——细节见上方「Adapter 架构」与「Runner recipe contract」                                                                                                                                                                                                                                                                                                                                           |
| （hyper3d_rodin） | 3D，不进 registry                                                            | Worker 直发                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| （deepseek）      | 文本 planner/助手                                                            | 不是 media adapter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| （runway）        | 曾经的视频（gen4.5）                                                         | **2026-08-24 整删**（死执行链清理）：`runway.adapter.ts` 文件+registry 条目已删，`AI_ADAPTER_TYPE_OPTIONS`/`ADAPTER_CAPABILITIES` 等类型层记录按「退役≠删除」保留但已不可被新选中——目录从未有过一个 Runway 模型，`ACTIVE_API_KEY_ADAPTER_OPTIONS` 早已自动排除它                                                                                                                                                                                                                                                                                                                                      |

### fal · Kling O3 video-to-video/edit（2026-09-17 接入）

`fal-ai/kling-video/o3/{standard,pro}/video-to-video/edit` 两条端点已进目录
（`KLING_O3_STANDARD_V2V_EDIT` / `KLING_O3_PRO_V2V_EDIT`）。它们是**编辑**端点，
不是 O3 Pro 那条生成线的第三个 mode：输入必须带一段参考视频，产出是被改写的同一段
镜头。

- worker builder `buildKlingO3VideoEdit`（`workers/execution/src/models/fal/video-request-builders.ts`）：
  body = `{ prompt, video_url, image_urls?, keep_audio? }`，其余字段 schema 里不存在
- 输入视频复用既有的 `videoUrls` 通道（不新造字段），只取第一条；prompt 若未出现
  `@VideoN` 自动前置 `Edit @Video1: `
- 发送契约 `referenceMode: 'video-edit'`，参数旋钮全 false；校验层与请求 Zod
  schema 都把参考视频列为必填
- 字段、限制与价格逐条见 model-catalog.md「视频」节
- ⚠ **未接 UI**，动作按钮在设计阶段 D4 之后另派；也**未做真实付费生成**

## 未决项（继承自 2026-06 核验，仍未解决）

- `UserApiKey` 未持久化 verificationStatus / lastVerifiedAt；`verifyApiKey()` 只有瞬时探测结果。
- `deleteApiKey()` 硬删；目标软删/tombstone 未实现。
- fish_audio / elevenlabs / rodin 无平台 key 映射（`getSystemApiKey()` 无对应 case；fish_audio 仅有 voice library 专用 key）。
- `ModelOption.cost` 是平台额度单位，**不是** provider 计费真值。
- LLM text 路由 fallback（用户 BYOK 优先 → 平台 Gemini）在扩画布 planner/助手用量前需复核。

## Runner recipe contract (2026-07-14)

- `AdvancedParams` uses `runnerSeed` as a decimal string so ComfyUI uint64 seeds are not rounded by JavaScript. The fork validates and converts it to a Python integer immediately before the official handler.
- Civitai sampler labels are normalized into explicit allowlisted `runnerSampler` / `runnerScheduler` values; the Worker validates both again. Exact `runnerWidth` / `runnerHeight` use source `meta.Size`, with Anima constrained to 512–1536 per side and multiples of 8.
- The LoRA workbench base selector has two Anima meanings: source checkpoint auto mode forwards the applied recipe's checkpoint; fixed Anima Base v1.0 ignores that override. SDXL Anima Pencil remains a separate incompatible family.
- The Runner accepts an empty LoRA list. Pure Anima Base generation therefore uses `UNETLoader → ModelSamplingAuraFlow` directly, without creating `LoraLoaderModelOnly` nodes.
- Optional `runnerUpscaler = 4x-AnimeSharp` adds `UpscaleModelLoader → ImageUpscaleWithModel` after VAE decode. The fork accepts only the pinned `Kim2091/AnimeSharp` file and verifies SHA-256 before caching it under `models/upscale_models/`.
- The RunPod fork keeps an 8GiB free-space reserve by evicting only managed dynamic `civitai-*`, `hf-*`, and `civitai-ckpt-*` files in LRU order. Unknown/manual/preloaded files are never eviction candidates. It persists a physical snapshot to `/runpod-volume/pixelvault-cache-manifest.json` and secret-free append-only events to `/runpod-volume/pixelvault-download-history.jsonl`.

## Hugging Face LoRA discovery (2026-07-14)

- `/api/lora-assets/huggingface` is a public **image-generation LoRA adapter** discovery endpoint, not a base-model catalog. The default feed spans all recognized image families; language-model, audio, video, ControlNet, IP-Adapter, T2I-Adapter, private, and gated repositories are excluded before import.
- Pagination follows Hugging Face's `Link: rel=next` cursor instead of slicing a fixed first result set. The UI exposes All / Anima / Illustrious / Pony / SDXL / Flux / SD 1.5 / Qwen Image / Z-Image / Other family filters and retains the cursor for back/forward navigation.
- Anima uses the Hub's exact `base_model:adapter:circlestone-labs/Anima` relation and also pins `circlestone-labs/Anima-Official-LoRAs`, whose card lacks a normal `lora` tag. Missing trigger metadata remains empty; repository names are never invented as trigger words.
- A repository may contain weights for several architectures. File-name metadata is used to refine the family per SafeTensors file; a family-filtered page exposes only matching files, and import persists the selected file's family instead of blindly reusing the repository-level family.
- Every accepted repository must expose a concrete SafeTensors file with a verified size. Files larger than 2 GiB are excluded, removing the 4.18 GB (3.90 GiB) `LyliaEngine/anima_baseV10` checkpoint that is incorrectly tagged as `lora` while retaining adapter weights.
- The client bypasses stale browser HTTP responses so a server-side reclassification is reflected immediately. Imported families without a compatible PixelVault base can be stored in My Library but are not presented as locally generatable. Base models remain owned by the separate Runner/base catalog.

### RunPod volume inventory (verified 2026-07-14)

- Volume `rk3t3mb1ko`, datacenter `US-CA-2`: 22 objects, 50,572,049,990 bytes (~47.09 GiB) via RunPod S3 API.
- Anima runtime is complete: `models/unet/anima-base-v1.0.safetensors`, `models/clip/qwen_3_06b_base.safetensors`, and `models/vae/qwen_image_vae.safetensors`.
- No `models/upscale_models/` directory existed at the last S3 inspection. The local Worker/fork now has a hash-pinned 4x-AnimeSharp download/workflow path, but it is not live until deployment and the first requesting job.
- Cached Civitai LoRAs by official model-version metadata:

| Base        | Version IDs and models                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Illustrious | `1463317` Enchanting Eyes; `2212079` Hands Illu; `2819970` Nivora; `2889186` Feranmut Proxy; `2933454` Silver Wolf LV.999 |
| Anima       | `2946543` Aemeath; `2982337` Denia; `3026574` Little Aemeath; `3042035` Xinyuehu; `3116881` Phrolova                      |

- Dynamic checkpoints: `2940478` Nova Anime XL IL v19.0 (Illustrious, checkpoints); `3108589` Anima Turbo v1.0 (currently in `models/checkpoints/`, not the Anima UNET path); `3107122` MiaoMiao Harem Anima 1.4 (in `models/unet/`). Do not expose Turbo as a fixed Anima option until it is in the UNET path or fixed selections can self-fetch.

## Source of Truth

- `src/constants/{providers,config,generation-errors,provider-capabilities}.ts` · `src/constants/models/`
- `src/services/providers/`（registry / types / adapter 实现——**adapter 名册与个数一律以 `registry.ts` 的 `PROVIDER_ADAPTERS` 为准**）· `src/services/{api-key-resolver,apiKey}.service.ts` · `src/services/image/generate-image.service.ts` · `src/services/llm-text.service.ts`
- `src/lib/{errors,api-error-message,platform-keys}.ts`
- HF LoRA discovery: `src/services/huggingface-lora.service.ts` · `src/app/api/lora-assets/huggingface/route.ts` · `src/hooks/use-huggingface-lora-library.ts` · `src/constants/lora.ts`
- 历史详版（含 worker 迁移逐条清单）：`git show cddc4384:docs/integrations/providers.md`

## Last Verified

- Date: 2026-08-24 · Method: `registry.ts` 的 `PROVIDER_ADAPTERS` 逐条清点——**实到 13 个**（此前本文件写的 14 / 11 / 10 都已过期；14→13 是同日晚些时候死执行链清理整删 `runway` 造成的）；byteplus / minimax / minimax_cn 三行的通道、key 槽与错误处理读 `volcengine.adapter.ts`、`minimax.adapter.ts`、`src/lib/platform-keys.ts`、`src/constants/{providers,config}.ts` 核验，Worker 落点对照 `workers/execution/src/models/`。仅核 adapter 名册与这三条的接入形状，**payload 字段级未重验**。
- Date: 2026-07-14 · Method: official Hub cursor response plus live local API page 1/page 2 and Anima-family requests; focused service/hook/component tests verify modality filtering, file-size hydration, cursor continuity, family switching, exact file import, and overflow containment.

- Date: 2026-07-10 · Method: registry（**当时** 10 adapter，名册已被上面 2026-08-24 条目取代）/ types 契约 / 错误码表与参考图分类正则读源码核验；BYOK 六步与 worker 边界沿用 2026-06-03 审计口径（当时对照过官方文档）。
- **payload 字段级事实一律以改动当时的官方文档为准**——本文件不承诺字段级新鲜度。
- Date: 2026-09-20 · Method: 进度表 26。NovelAI 的 [qualitytags](https://docs.novelai.net/en/image/qualitytags/) / [undesiredcontent](https://docs.novelai.net/en/image/undesiredcontent/) / [textrendering](https://docs.novelai.net/en/image/textrendering/) / [inpaint](https://docs.novelai.net/en/image/inpaint/) 四页与 PixAI 的 [createImage](https://platform.pixai.art/en/docs/api-v2/image/createImage) / [quick start](https://platform.pixai.art/en/docs/quick-start/first-api-call) / models 三页逐条读取；registry 名册按 `PROVIDER_ADAPTERS` 重新清点，**实到 14 个**。⚠ NovelAI `ucPreset` 的数字含义与 inpaint 模型名的完整清单在官方页上**没有**，前者按「不猜」处理（改发标签串），后者只收了本轮要用的两个。PixAI **价目未核实、真实 API 未联调**。

## NovelAI V5 character composition (verified 2026-09-14)

- Image 内按 V5 Full / Curated 展开角色控件，默认普通生成；不属于 LoRA 权重。应用参数为 `advancedParams.novelAiLayout`：`positioning` 是 auto/manual，`characters` 包含独立 prompt、negativePrompt 和 0–1 的 position.x/y，最多 22 人。非 V5 请求拒绝此配置；多模型生成只发给支持模型。
- Worker 将角色顺序映射到 `v4_prompt.caption.char_captions` 与 `v4_negative_prompt.caption.char_captions`，每项为 `char_caption` 与 `centers: [{x,y}]`。仅 manual 开启 `use_coords`，`use_order=true`；无角色保持空数组。生成快照、Image 草稿及图库复用传递此配置，图库仍需选择对应模型，长参数沿用 URL 回填存在长度局限。
- 依据：[官方多人文档](https://docs.novelai.net/en/image/multiplecharacters/)、[V5 模型文档](https://docs.novelai.net/en/image/models/)。公开 Swagger 不含完整 V5 字段；映射补核官方 image 页所载 `2952-0b37f4043b37a3af.js` 客户端 serializer。客户端是实现证据，不是稳定 API 承诺。
- V5 支持自然语言；文字使用末尾 `Text:`，质量标签中的 `no text` 需要协调。现有增强器只输出 NovelAI 标签的规则尚待修正。透明背景属于提示词标签，不沿用 OpenAI `background` 字段。文字页和模型页对 Full 750 / Curated 374 的单位分别写 characters / tokens——**2026-09-20 起这两个数只作前端护栏**（计数器 + 明显越界时拒），⛔ 仍不当成 provider 的精确契约。
- [Precise Reference 文档](https://docs.novelai.net/en/image/precisereference/)当前针对 V4.5；[V5 发布公告](https://journal.novelai.net/image-generation-novelai-diffusion-v5-is-here-c2df7c6b8d2d/)中的 Vibe / Precise / Curated inpaint 发布状态不能替代当前 V5 支持证据。**Full inpaint 与质量标签 / UC 预设 / `Text:` 三颗控件已于 2026-09-20 接入（下一节）**；透明背景标签与助手角色结构仍未接入。

## NovelAI V5 专属控件与遮罩重绘（verified 2026-09-20，进度表 26）

三颗控件全部走第 11 项的**能力表派生**，⛔ UI 里没有模型名分支：

| 控件             | 能力键          | 官方口径                                                                                                                                                                                          | 发给 provider 的形状                                                                                                                                                                                 |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 质量标签         | `qualityToggle` | [qualitytags](https://docs.novelai.net/en/image/qualitytags/)：V5 Full 与 Curated 同串，Light = `, very aesthetic, amazing quality, no text`，Standard = `, very aesthetic, masterpiece, no text` | ⚠ **不是 API 字段**，是追加到 prompt 末尾的标签串。payload 里的 `qualityToggle` 保持 `false`（与 NAI 网页端同做法）。缺省档 `off` = 一个字都不追加，与接入前逐字等价                                 |
| UC 预设          | `ucPreset`      | [undesiredcontent](https://docs.novelai.net/en/image/undesiredcontent/)：Heavy / Light / Furry Focus / Human Focus / None，各自一串 UC 标签                                                       | ⚠ 同样按标签串拼 —— 作为**前缀**接在用户自己的 UC 前面。payload 里那个数字 `ucPreset` 原样保持（V4/V5 发 4、V3 发 3，都是 None）：⛔ **数字档在各代之间的含义没有官方口径，社区 SDK 互相矛盾，不猜** |
| `Text:` 文字渲染 | `textRendering` | [textrendering](https://docs.novelai.net/en/image/textrendering/)：放 prompt **最末**，V5 支持 EN/JA/ZH                                                                                           | `prompt` → 质量标签 → `, Text: …`（所以质量标签先拼）。上限 Full 750 / Curated 374 只作护栏，见上一节的单位说明                                                                                      |

- `Text:` 与 Light 质量标签仅限 V5；V4.5 也支持标准质量标签（2026-09-21 补核，见下节）。`ucPreset` 挂在 adapter 默认。服务端按逐模型能力声明校验，不支持的值返回 400。
- **遮罩重绘（inpaint）**：NovelAI 的 infill 是**换模型 + 换 action**，不是加参数。`model` 换成 `nai-diffusion-5-full-inpainting`，`action` 换成 `infill`，`mask` 是与底图同规格的黑白 PNG（白 = 重画），并发 `add_original_image: true`。**V5 Curated 没有自己的 inpaint 模型，回落 `nai-diffusion-4-5-full-inpainting`**——界面上说出这句话（`StudioInpaintMaskChip`），⛔ 不让用户以为重绘还跑在 Curated 上。
- 遮罩传输：客户端画布导出的是 data URL，`submit-image.service` 在建 job 之前把它换成 R2 的 http URL，之后才进 DB 与 worker（worker 解不了 `data:`，而 DB 里也不该躺几十 KB 的 base64）。前置校验：恰好 1 张参考图，且模型在能力表里声明了 `inpaint`。
- 画板复用编辑域那块 `StudioInpaintEditor`（画笔 / 拉框 / 橡皮 / 撤销 / 清空，导出与源图**逐像素同尺寸**的黑白 PNG），生成工作台把它那条重绘指令关掉 —— 那一枪的提示词就是工作台里那条。⛔ 没做羽化 / 反选 / 图层。

## NovelAI 官方标签建议（verified 2026-09-21）

- Source：[官方 Swagger](https://image.novelai.net/docs/doc.json) 的 `GET /ai/generate-image/suggest-tags`。参数 `model`、`prompt` 必填；`lang` 支持 `en` / `jp`，默认 `en`。文档声明 Bearer API key；本仓服务端使用用户自己的 NovelAI key，不把密钥交给浏览器，不走平台线路。
- Method：读取公开契约并对官方端点实际查询 `model=nai-diffusion-5-curated&prompt=denia&lang=en`；本地标签台通过已登录用户的服务端代理再次验收。实际响应是 `{tags: [{tag, count, confidence}, ...]}`（Swagger 的 `tags` schema 漏标了数组）；两条 Denia 候选分别为 `denia (breakdown) (wuthering waves)` / `denia (wuthering waves)`，当次均为 `count=10000, confidence=0`。不将这些数值解释为训练样本数、角色准确率或效果保证。
- 桌面与手机的正负标签栏、角色标签编辑共用官方补全。支持现有 V4.5 / V5 的 Full / Curated；多选时查询首个已选 NAI 型号并明确显示型号。保留官方顺序与标签拼写，不混入本地热度圆点。其余模型继续使用本地词库。
- 输入至少 2 字符、最多 200 字符，250ms 防抖；换词、换模型或失焦时取消旧请求并隐藏旧结果。无 key、上游失败、空结果均有明确状态，仍可手动输入；不悄悄改用本地推荐，不自动重试限流。查询不发生成请求、不扣本站生成额度。
- Denia：官网与本站固定 seed 对照均生成错误的棕色短发角色；接入补全只解决标签查询，尚未解决角色外观准确性。未追加付费出图。

## NovelAI 基础参数与精确角色参考（verified 2026-09-21）

- Sources：[官方 Swagger](https://image.novelai.net/docs/doc.json)、[Precise Reference](https://docs.novelai.net/en/image/precisereference/)、[Quality Tags](https://docs.novelai.net/en/image/qualitytags/)。Method：逐字段核对公开契约；本地请求测试不等于线上联调。
- 基础参数：`cfgRescale` → `cfg_rescale`；`img2imgNoise` → 图生图 `noise`。本仓开放 0–1，默认 0；没有参考图时隐藏参考强度与噪声。`noise_schedule` 保留既有 karras，未核实完整可选值集，不新增猜测选项。
- V4.5 质量标签提供 off / standard：Full 追加 `, location, very aesthetic, masterpiece, no text`；Curated 追加 `, location, masterpiece, no text, -0.8::feet::, rating:general`。V5 保留既有 Light / Standard；缺省 off 不改提示词。
- 精确参考本轮仅接 **V4.5 Full / Curated、单张角色参考**。`advancedParams.novelAiReferenceMode=precise`，`preciseReferenceStrength` 与 `preciseReferenceFidelity` 为 0–1（本仓默认 1）。不与遮罩重绘组合；V5 不显示该模式，服务端与 Worker 拒绝不支持的请求。Vibe 不接入，也不保留禁用占位。
- 服务端将图片旋正、等比缩放并补黑边到官方允许的 `1472×1472` PNG，再存 R2。Worker 用 `action=generate`，发送 `director_reference_images`、`director_reference_descriptions`（`caption.base_caption=character`）、`director_reference_information_extracted=[1]`、`director_reference_strength_values`、`director_reference_secondary_strength_values`（Fidelity）。不发送图生图 `image` / `strength` / `noise`。
- 官方费用：每张生成、每张精确参考额外 **5 Anlas**。界面明示额外费用，精确参考不显示 Opus 免费提示。不承诺角色复现必然准确。
- 状态：代码与本地契约验证已接通；尚未部署新版 execution Worker，未做精确参考真实付费生成。需部署 Worker 后再验收真实链路。

## PixAI 接入（2026-09-20 暂时下架；历史契约已核实）

Owner 决定暂时移除 PixAI 接入。三个模型标记 unavailable 并加入既有退役名单：模型选择器、可用目录与新增 key 配置入口不再出现 PixAI，旧 DB 配置不能重新启用它；服务端拒绝三个型号及以 PixAI key 指定的自定义型号的新生成。已有 key、作品、模型标签和运行记录不删除，已提交任务的 Worker 处理保留。本轮未提交的 style / LoRA 架、链接输入与相关扩展已撤回；下方是历史契约，不代表当前产品入口。

- 端点：`POST https://api.pixai.art/v2/image/create`（⚠ v2）→ `GET https://api.pixai.art/v1/task/{id}`（⚠ v1，两代不同）。鉴权 `Authorization: Bearer <key>`。
- 请求体：`modelVersionId`（必填）· `prompt`（必填）· `negativePrompt` · `aspectRatio`（11 档，默认 `1:1`）· `size`（`1k`\|`1.5k`）· `mode`（**仅 Tsubaki**：lite/standard/pro/ultra）· `style`（仅 Tsubaki）· `batchSize`（1\|4）· `seed` · `loras`（≤5）· `sampling`（SDXL 档的扩散旋钮）· `promptHelper` · `callbackUrl`。
- 三个型号与 `modelVersionId`：Tsubaki.2 `1983308862240288769`（DiT）· Haruka v2 `1861558740588989558`（SDXL）· Hoshino v2 `1954632828118619567`（SDXL）。⚠ **beta API，版本号随发布会变**——目录里的 `externalModelId` 就是这串数字。
- 能力表：历史 adapter 默认含 `negativePrompt` / `seed` / `pixaiSize`；`guidanceScale` / `steps` 逐模型挂在 SDXL 两条上（Tsubaki 是 DiT，收的是 `mode` / `style`，不收扩散旋钮）。`maxReferenceImages: 0` 是如实声明。
- 健康检查打一个必定不存在的 task id，判据是「**不是 401/403、不是 5xx**」——PixAI 没有公开的 `/me` 或余额端点，⛔ 别改成 `response.ok`（好 key 也会被判成不可用）。

### PixAI 契约补核（verified 2026-09-20，当前不继续接入）

官方来源：[REST v2 createImage](https://platform.pixai.art/en/docs/api-v2/image/createImage)、[LoRA 使用与架构兼容](https://docs.pixai.art/docs/lora/lora-usage)、[公开 API 文档索引](https://platform.pixai.art/llms.txt)、[官方 JS SDK 查询定义](https://github.com/pixai-art/pixai-client-js/blob/main/graphql/query.graphql)。Method：读取官方正文及页面交付的完整请求 schema；旧记录漏读了折叠的 `style.oneOf` 和 `loras.items.properties`。

- `mode`：仅 Tsubaki.2 / .3，lite / standard / pro / ultra；`size`：1k / 1.5k。已有声明随模型下架而退出当前产品入口。
- `style`：Tsubaki 专属，收 `{type:'preset',key:枚举}` 或 `{type:'custom',custom:字符串}`。官方 schema 列出 35 个预设；本轮实现已按 owner 指令撤回。
- `loras`：最多 5 项，每项 `{modelId:string,weight?:number,triggerWords?:string}`；权重 0–1、默认 1，不发 triggerWords 时用版本默认触发词。`modelId` 实际是 PixAI LoRA 版本 ID（版本页 URL 最后一段），不是本仓 LoRA 资产 ID 或文件 URL。当前公开 REST 文档未发布列举/搜索接口，旧 SDK 的 GraphQL 查询不等于 REST v2 列表接口。
- 兼容性：Tsubaki.2 使用专属 LoRA，Haruka / Hoshino 使用 SDXL LoRA；不能凭 ID 声称已经验证架构兼容。网页默认权重或会员挂载数不覆盖 REST schema。
- 保留的既有执行契约：batchSize 只发 1；未改 promptHelper、比例、费用或平台回落策略。官方 sampling 的步数字段为 `steps`，既有 Worker 写 `samplingSteps`，未改动且不宣称联调通过。
- 未核实 API credits 价目与换算；未做真实付费生成。本轮取消接入不作已完成 PixAI 联调的记录。

## 图片专属能力核验（2026-09-18，进度表 61）

第 11 项把工作台「专属 chip 行」改成只从 `provider-capabilities.ts` 派生后，设计画板上四家模型的 9 颗专属 chip 逐颗对照一手 schema（OpenAI `/images/edits` 参考、Google image-generation 文档、fal OpenAPI、火山 Ark 图片生成 API）：

- **OpenAI**：`input_fidelity: "high" | "low"` 已接（能力键 `inputFidelity`，`select`，只在 `/v1/images/edits` 即带参考图时发）。**gpt-image-2.5 专属**——gpt-image-2 官方要求省略该参数（始终高保真处理输入）。
- **Gemini 3 Pro Image**：对话式改图 = 会话历史（`contents`），多图融合 = 多个 image part，角色 / 物体槽只是条数上限（≤5 角色 / ≤6 物体）且无标注机制——三者都**不是请求字段**，不进能力表。
- **fal `fal-ai/flux-2-pro{,/edit}`**：入参只有 `prompt · image_size · image_urls · seed · output_format · safety_tolerance · enable_safety_checker`；`@image1` 与 JSON prompt 都是提示词写法，**没有「图层」**。
- **Seedream 5.0 Pro（火山 Ark，文档 2026-09-09）**：支持 `layer_decomposition`（1 底图 + ≤16 张带 alpha 的 PNG 图层，任一图层失败整体报错）、`background: transparent | opaque`（仅 5.0 Pro · 图生图 · 单张透明通道输入 · 输出 png）、交互编辑（bbox）；**不支持**组图、联网搜索、流式输出。组图 `sequential_image_generation` + `max_images`（1–15，参考数 + 生成数 ≤15）只在 **5.0 Lite / 4.5 / 4.0**；`tools[].type = web_search` 只在 **5.0 Lite**。fal 侧 `bytedance/seedream/v5/pro/*` 无以上任一字段。
- 两颗真实参数已接（2026-09-18，进度表 62 · 63，owner 拍板）：能力表 override 只挂两条原生 5.0 Pro model id（火山 / BytePlus），校验层做前置，worker 不满足前置就不发字段。
  - `background: transparent`：仅图生图 · 只支持 1 张带透明通道的输入 · 输出默认 png 且**配 `output_format: jpeg` 会报错** → worker 把输出钉成 png。
  - `layer_decomposition: true`：仅单张待拆分图（多张报错）· 开了以后 `image` 必选 · 任一图层失败整体报错。响应 `data[]` 每项 `url / size / output_format` + `z_index`（底图固定 0，图层从 1 递增）/ `name` / `description` / `bounding_box`；`bounding_box.normalized` 是 **0–1000 整数**，两个数组都是 `[left, top, right, bottom]`；`output_format` 只控制底图，图层恒 png；此场景 `size` 默认 `auto`（可选 1K / 1.5K / 2K / auto），底图尺寸必须读响应。文档未写两颗互斥，按各自前置独立判。
  - 落库形状：底图 = `Generation` 本身；图层 = `GenerationLayer`（z_index ≥ 1），与 Generation 同事务写入；worker 先把每个图层传 R2（Ark URL 24 小时失效）再回调，回调契约加可选 `layers[]`（≤16）；`outputImageCount` = 底图 + 图层数，计费 `requestCount` 不变。
