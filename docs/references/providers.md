# Providers 参考 — 接入契约与错误信息（现状事实）

> 定位：provider / model / API 集成的契约与现状。**慢改原则**：任何 endpoint、model id、payload、鉴权、轮询、webhook、限制、返回结构、key 验证方式的改动，必须先查当前官方文档（WORKFLOW 联网核验）；官方与代码不一致时停下问 owner。模型阵容与月度审计见 `model-catalog.md`。

## Hard rules（继承 2026-06 契约，仍有效）

1. Client 只能表达用户选择意图（如 `apiKeyId`）；key resolution、routing、解密、用量、存储全在 server/service/worker 层。
2. **显式 BYOK 失败不得静默 fallback 到 platform key**——同一请求不能偷偷改烧平台额度。
3. Provider 返回的临时 URL 只是 ingestion source；成功作品必须进 R2，R2 storageKey 才是平台内媒体事实源。
4. 生成执行目标是 **worker-only**：Next.js 只做 auth / validation / route+key resolution / job create / signed dispatch / callback finalization；provider submit / poll / 结果下载 / R2 上传在 Cloudflare Worker。
5. 官方文档打不开、要登录、只渲染 shell 时，**不能把字段写成已确认事实**。

## Adapter 架构（2026-07-11 更新：新增 runner）

- Registry `src/services/providers/registry.ts` 注册 **11 个 adapter**：huggingface · gemini · openai · fal · runway · replicate · novelai · volcengine · fish_audio · elevenlabs · **runner**（2026-07-11 新增，Comfy Runner / RunPod ComfyUI，见 `docs/plans/comfy-runner-HANDOFF-2026-07.md`）。
- `runner` 是 BYOK 六步之外的特例：无 API key 可配（`AI_ADAPTER_TYPE_OPTIONS` 故意不含它），`resolveGenerationRoute()` 命中它就走独立分支——系统 key（`RUNPOD_KEY`）+ 月度限额（`RUNNER_MONTHLY_LIMIT`），不占用户每日 FREE_TIER 额度。真正的 provider 调用（RunPod submit/poll + recipe→ComfyUI workflow 映射）在 Worker（`workers/execution/src/models/runner/`），adapter 侧 `generateImage()` 只是契约占位（同步路径不支持，冷启动太长）。
- `HYPER3D_RODIN` **故意不进 registry**——3D 走 `generate-3d.service.ts` 直发 Worker。
- `deepseek` 不是 media adapter——用于 text / planner / assistant 路径（`llm-text.service.ts`）。
- 契约 `types.ts`：`ProviderGenerationInput/Result`（图）、`ProviderVideoInput/Result`（视频，`fetchHeaders` 支持需鉴权下载的 provider 如 Sora）、`ProviderQueueSubmitInput`（队列型，duration 支持 `'auto'`）；`civitaiToken` 全链穿透（Civitai 下载 401 需鉴权）。

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

## 逐 provider 现状速览

| adapter           | 用途                                         | 错误/接入特点（已核验口径）                                                                                                   |
| ----------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| openai            | 图（gpt-image-2）                            | 参考图仅 JPEG/PNG/WebP；Worker 已迁移；adapter 无视频路径（Sora 仅存在于 types.ts fetchHeaders 契约注释，目录中无 Sora 模型） |
| gemini            | 图（generateContent + inline 参考图）        | 参考图 +HEIC/HEIF；Worker 已迁移                                                                                              |
| fal               | 图/视频/3D 最大聚合通道（queue submit/poll） | 参考图 URL 必须直接可达；**部分视频 schema 未逐字段核验**（改前查模型页）；Worker 已迁移（图+视频+长视频）                    |
| replicate         | 图（FLUX/SDXL LoRA 字段）                    | 结果下载需 bearer；Worker 已迁移                                                                                              |
| novelai           | 图（nai-diffusion-4.5）                      | 返回 ZIP 需解包；官方 Swagger 需实时查 schema；Worker 已迁移                                                                  |
| volcengine        | 图/视频国内直连（Ark）                       | 官方文档页需 JS 渲染，字段级改动去控制台 API Explorer / SDK 例子核；Worker 已迁移（图）                                       |
| huggingface       | 图（Inference Providers）                    | 二进制响应；Worker 已迁移                                                                                                     |
| runway            | 视频                                         | —                                                                                                                             |
| fish_audio        | 音频 TTS（s2-pro）                           | **无 getSystemApiKey 平台 key 映射**（BYOK-only 现状）                                                                        |
| elevenlabs        | 音频 TTS + SFX（eleven_v3 / eleven_sfx_v2）  | 2026-06 后新增 adapter；同样**无 getSystemApiKey 平台 key 映射**（BYOK-only）                                                 |
| （hyper3d_rodin） | 3D，不进 registry                            | Worker 直发                                                                                                                   |
| （deepseek）      | 文本 planner/助手                            | 不是 media adapter                                                                                                            |

## 未决项（继承自 2026-06 核验，仍未解决）

- `UserApiKey` 未持久化 verificationStatus / lastVerifiedAt；`verifyApiKey()` 只有瞬时探测结果。
- `deleteApiKey()` 硬删；目标软删/tombstone 未实现。
- fish_audio / elevenlabs / rodin 无平台 key 映射（`getSystemApiKey()` 无对应 case；fish_audio 仅有 voice library 专用 key）。
- `ModelOption.cost` 是平台额度单位，**不是** provider 计费真值。
- LLM text 路由 fallback（用户 BYOK 优先 → 平台 Gemini）在扩画布 planner/助手用量前需复核。

## Source of Truth

- `src/constants/{providers,config,generation-errors,provider-capabilities}.ts` · `src/constants/models/`
- `src/services/providers/`（registry / types / 10 adapter）· `src/services/{api-key-resolver,apiKey}.service.ts` · `src/services/image/generate-image.service.ts` · `src/services/llm-text.service.ts`
- `src/lib/{errors,api-error-message,platform-keys}.ts`
- 历史详版（含 worker 迁移逐条清单）：`git show cddc4384:docs/integrations/providers.md`

## Last Verified

- Date: 2026-07-10 · Method: registry（10 adapter）/ types 契约 / 错误码表与参考图分类正则读源码核验；BYOK 六步与 worker 边界沿用 2026-06-03 审计口径（当时对照过官方文档）。
- **payload 字段级事实一律以改动当时的官方文档为准**——本文件不承诺字段级新鲜度。
