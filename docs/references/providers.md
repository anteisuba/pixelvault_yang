# Providers 参考 — 接入契约与错误信息（现状事实）

> 定位：provider / model / API 集成的契约与现状。**慢改原则**：任何 endpoint、model id、payload、鉴权、轮询、webhook、限制、返回结构、key 验证方式的改动，必须先查当前官方文档（WORKFLOW 联网核验）；官方与代码不一致时停下问 owner。模型阵容与月度审计见 `model-catalog.md`。

## Hard rules（继承 2026-06 契约，仍有效）

1. Client 只能表达用户选择意图（如 `apiKeyId`）；key resolution、routing、解密、用量、存储全在 server/service/worker 层。
2. **显式 BYOK 失败不得静默 fallback 到 platform key**——同一请求不能偷偷改烧平台额度。
3. Provider 返回的临时 URL 只是 ingestion source；成功作品必须进 R2，R2 storageKey 才是平台内媒体事实源。
4. 生成执行目标是 **worker-only**：Next.js 只做 auth / validation / route+key resolution / job create / signed dispatch / callback finalization；provider submit / poll / 结果下载 / R2 上传在 Cloudflare Worker。
5. 官方文档打不开、要登录、只渲染 shell 时，**不能把字段写成已确认事实**。

## Adapter 架构（2026-08-24 复核：registry 实到 13 个）

- Registry `src/services/providers/registry.ts` 注册 **13 个 adapter**：huggingface · gemini · openai · fal · replicate · novelai · volcengine · **byteplus** · fish_audio · elevenlabs · **minimax** · **minimax_cn** · **runner**（Comfy Runner / RunPod ComfyUI，见 `docs/plans/comfy-runner-HANDOFF-2026-07.md`）。⚠ **名册的事实源是 `registry.ts` 里的 `PROVIDER_ADAPTERS` 那张表**，不是这里的数字——加/删 adapter 时以文件为准，别照抄本行。
- `runway`（Runway gen4.5）2026-08-24 随死执行链清理**整删**：`runway.adapter.ts` 文件、registry 条目、`ADAPTER_PROMPT_HINTS`/`provider-capabilities.ts` 里的死细节全部移除。目录里从来没有过一个可选的 Runway 模型，adapter 本身在 registry 里存在的全部意义只剩 `healthCheck`——删除前已确认 `AI_ADAPTER_TYPES.RUNWAY` 枚举保留（退役≠删除）且 `apiKey.service.ts` 的 key 校验是自包含 switch（不依赖 registry），已有 Runway key 的用户仍能查看/校验/删除该 key，只是不能再新建。
- **同一份实现挂多个 adapter type** 是既有形状，不是漏写：`byteplus` = `{ ...volcengineAdapter, adapterType: BYTEPLUS }`（BytePlus ModelArk 国际站 vs 火山 Ark 国内站）；`minimax` / `minimax_cn` 同理（`api.minimax.io` vs `api.minimaxi.com`）。分成两个 type 而不是一个 config flag 的原因只有一个——**两站账号独立、key 不可互换**，而 key 存储按 adapterType 分槽。
- `runner` 是 BYOK 六步之外的特例：无 API key 可配（`AI_ADAPTER_TYPE_OPTIONS` 故意不含它），`resolveGenerationRoute()` 命中它就走独立分支——系统 key（`RUNPOD_KEY`）+ 月度限额（`RUNNER_MONTHLY_LIMIT`），不占用户每日 FREE_TIER 额度。真正的 provider 调用（RunPod submit/poll + recipe→ComfyUI workflow 映射）在 Worker（`workers/execution/src/models/runner/`），adapter 侧 `generateImage()` 只是契约占位（同步路径不支持，冷启动太长）。
- `HYPER3D_RODIN` **故意不进 registry**——3D 走 `generate-3d.service.ts` 直发 Worker。
- `deepseek` 不是 media adapter——用于 text / planner / assistant 路径（`llm-text.service.ts`）。
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
- DeepSeek 当前 Chat Completion 的用户内容契约是字符串，因此共享助手按文本路由处理；见
  [DeepSeek Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)。Claude 厂商 API
  本身支持图片输入（见 [Claude vision](https://platform.claude.com/docs/en/build-with-claude/vision)），但当前
  PixelVault Claude 助手调用尚未接入该图片内容块，所以菜单如实标为“仅文本”。Qwen 不进入共享助手模型注册表。
  能力不匹配时服务端和客户端都必须拒绝，不得丢弃附件、传 URL 文本或以视频封面静默降级。
- 交互、模型清单和最多 8 个稳定 URL 附件契约见 [`pages/assistant-shell.md`](pages/assistant-shell.md)。

## BYOK 路由（`resolveGenerationRoute()`，六步顺序）

1. 显式 `apiKeyId` → 服务端读该用户 active BYOK key。
2. key 不存在 / 不属于该用户 / inactive / adapter 不匹配 → **直接失败**。
3. 显式路径**永不** fallback 平台 key。
4. 无显式 keyId → 找该用户对应 adapter 最新 active BYOK key。
5. 无 BYOK 且模型 `freeTier` 可用 → 才试 platform key。
6. 都没有 → 失败并要求绑 key（UI 侧走 QuickSetupDialog，不禁用）。

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

各模型走 **厂商原生 API** 还是 **fal/Replicate 等合法聚合**、以及「中转是否有更好原生」见：

[`../plans/research/模型接入/模型接入原生与中转调研-2026-07.md`](../plans/research/模型接入/模型接入原生与中转调研-2026-07.md)

本文件仍以契约与错误处理为权威；路由类型以该调研 + `AI_PROVIDER_ENDPOINTS` 为准。

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

| adapter           | 用途                                                                         | 错误/接入特点（已核验口径）                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| openai            | 图（gpt-image-2）                                                            | 参考图仅 JPEG/PNG/WebP；Worker 已迁移；adapter 无视频路径（Sora 仅存在于 types.ts fetchHeaders 契约注释，目录中无 Sora 模型）                                                                                                                                                                                                                                                       |
| gemini            | 图（generateContent + inline 参考图）                                        | 参考图 +HEIC/HEIF；Worker 已迁移                                                                                                                                                                                                                                                                                                                                                    |
| fal               | 图/视频/3D 最大聚合通道（queue submit/poll）                                 | 参考图 URL 必须直接可达；**部分视频 schema 未逐字段核验**（改前查模型页）；Worker 已迁移（图+视频+长视频+3D）。`fal.adapter.ts` 的 `submitModel3DToQueue`/`checkModel3DQueueStatus` 内联实现已整删（2026-08-25）——3D 提交侧对 FAL/Hyper3D Rodin 无条件短路进 Worker，legacy 内联任务早被 execution-sweeper 清空，`generate-3d.service.ts` 同步删掉了 PR3-α 的 mesh-first 分阶段调用 |
| replicate         | 图（FLUX/SDXL LoRA 字段）                                                    | 结果下载需 bearer；Worker 已迁移                                                                                                                                                                                                                                                                                                                                                    |
| novelai           | 图（nai-diffusion-5 / 4.5，Full+Curated）                                    | **BYOK-only**（无平台 key）。返回 ZIP 需解包；V5 payload 是 `params_version: 4` 且不发 `skip_cfg_above_sigma`；Worker 已迁移（t2i + 单图 img2img）。V5 发布当天无 Director / Vibe Transfer。**V4/4.5 多图 Director 模式随 src 死链删除，实现只存于 git 历史（worker 从未实现过它），能力已收 `maxReferenceImages:1`（`d2c664bd`）**                                                 |
| volcengine        | 图/视频国内直连（Ark，`ark.cn-beijing.volces.com/api/v3`）                   | 官方文档页需 JS 渲染，字段级改动去控制台 API Explorer / SDK 例子核；Worker 已迁移（图）                                                                                                                                                                                                                                                                                             |
| byteplus          | 图/视频国际线（BytePlus ModelArk，`ark.ap-southeast.bytepluses.com/api/v3`） | 与 volcengine **同一份实现**（`byteplusAdapter = { ...volcengineAdapter, adapterType: BYTEPLUS }`），只换 adapterType / baseUrl / key 槽；账号与 key **与国内 Ark 不通用**。有平台 key（`BYTEPLUS_API_KEY`）。Worker 侧共用 `models/volcengine/video-request-builder.ts`（`isVolcEngineProviderId` 同时认 `byteplus`）                                                              |
| minimax           | 视频（MiniMax-H3，国际站 `api.minimax.io/v2`）                               | 队列型 submit → poll；`generateImage()` 直接抛 400（**video only**）。轮询的 `status` 故意用 string 不用 `z.enum`——未文档化的中间态按「仍在排队」处理，不炸掉在飞的 poll。参考图/视频/音频上限 9 / 3 / 3 且总数 ≤12（超任一条 provider 返 400，发送前 clamp）。有平台 key（`MINIMAX_API_KEY`）；Worker 侧 `models/minimax/video-request-builder.ts`                                 |
| minimax_cn        | 同上，国内站 `api.minimaxi.com/v2`（域名多一个 `i`）                         | 与 `minimax` 是同一份实现的两个 adapterType 标签；两站账号独立、**key 不可互换**，key 存储按 adapterType 分槽所以不能合成一个 config flag。平台 key 走 `MINIMAX_CN_API_KEY`                                                                                                                                                                                                         |
| huggingface       | 图（Inference Providers）                                                    | 二进制响应；Worker 已迁移                                                                                                                                                                                                                                                                                                                                                           |
| fish_audio        | 音频 TTS（**s2.1-pro**，2026-07-30 升级）                                    | **无 getSystemApiKey 平台 key 映射**（BYOK-only 现状）。稳定 key 仍是 `fish-audio-s2-pro`，只换 `externalModelId`                                                                                                                                                                                                                                                                   |
| elevenlabs        | 音频 SFX + **Music**（`eleven_text_to_sound_v2` / `music_v2`）               | 2026-06 后新增 adapter；同样**无 getSystemApiKey 平台 key 映射**（BYOK-only）。⚠ 语音 `eleven_v3` 已 `available: false`（价高退役），别按「EL 是 TTS 供应商」排期                                                                                                                                                                                                                   |
| runner            | 图（Comfy Runner / RunPod ComfyUI 自托管）                                   | **无 BYOK 槽**（`ADAPTER_KEY_HINTS` 写 `n/a (platform-managed)`，`AI_ADAPTER_TYPE_OPTIONS` 故意不含它）；系统 key + 月度限额。adapter 侧 `generateImage()` 只是契约占位，真实 submit/poll 在 Worker——细节见上方「Adapter 架构」与「Runner recipe contract」                                                                                                                         |
| （hyper3d_rodin） | 3D，不进 registry                                                            | Worker 直发                                                                                                                                                                                                                                                                                                                                                                         |
| （deepseek）      | 文本 planner/助手                                                            | 不是 media adapter                                                                                                                                                                                                                                                                                                                                                                  |
| （runway）        | 曾经的视频（gen4.5）                                                         | **2026-08-24 整删**（死执行链清理）：`runway.adapter.ts` 文件+registry 条目已删，`AI_ADAPTER_TYPE_OPTIONS`/`ADAPTER_CAPABILITIES` 等类型层记录按「退役≠删除」保留但已不可被新选中——目录从未有过一个 Runway 模型，`ACTIVE_API_KEY_ADAPTER_OPTIONS` 早已自动排除它                                                                                                                    |

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
