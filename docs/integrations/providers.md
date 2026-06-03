# Provider Integrations

最后更新：2026-06-03

本文件记录 provider / model / API 集成的当前事实、目标规则和未决项。它不是模型宣传页，也不是价格表。

Provider 相关开发必须慢一点做：任何 endpoint、model id、payload、鉴权、轮询、webhook、价格、限制、返回结构和 key 验证方式的变化，都必须先查当前官方文档。

## Hard Rules

- 修改 provider、model、API schema 或 key 验证前，必须先读本文件、`docs/architecture/generation.md`、`docs/architecture/credits.md`、`docs/architecture/storage.md` 和 `docs/domains/api-keys.md`。
- 必须查代码事实源：`src/constants/providers.ts`、`src/constants/config.ts`、`src/constants/models/**`、对应 `src/services/providers/*.adapter.ts`、生成 service 和 usage/storage service。
- 必须查 provider 官方当前文档。模型文档、API reference、payload 字段、错误状态和轮询规则不允许凭记忆或猜测。
- 如果官方文档和代码不一致，停止实现，先暴露不确定点并让 owner 确认方向。
- 如果官方文档不可访问、需要登录、只显示 shell、或无法确认具体字段，不能把字段写成已确认事实。
- Client 只能表达用户选择意图，例如 `apiKeyId`。最终 key resolution、provider routing、密钥解密、用量和存储都必须发生在 server/service/worker 层。
- 显式 BYOK 失败不得静默 fallback 到 platform key。同一请求不能偷偷改用 owner 的平台额度。
- Provider 返回的临时 URL 只是 ingestion source。成功作品必须进入 R2；R2 storage key / URL 才是平台内媒体事实源。
- 生成执行目标是 worker-only：Next.js 只能做 auth、validation、route/key resolution、job create、signed dispatch 和 callback finalization；provider submit/poll/result download/R2 artifact upload 必须在 Cloudflare Worker。

## Current

### Provider Registry

当前 adapter type 定义在 `src/constants/providers.ts`。

当前常规 media provider registry 在 `src/services/providers/registry.ts`：

- `huggingface`
- `gemini`
- `openai`
- `fal`
- `runway`
- `replicate`
- `novelai`
- `volcengine`
- `fish_audio`

`hyper3d_rodin` 没有进入常规 registry；3D Rodin 当前通过 `src/services/generate-3d.service.ts` 分发到 worker 路径。

`deepseek` 不是常规 media provider；当前主要在 text / planner / assistant 路径使用，例如 `src/services/llm-text.service.ts`。

### Model Catalog

模型目录事实源在 `src/constants/models/**`。

当前 `MODEL_OPTIONS` 覆盖 image、video、audio、3D。`ModelConfig` 可以覆盖运行时配置，但常量目录仍是本地 fallback 和 model id normalization 的主要事实源。

当前 status 快照记录：

- 57 个 model option
- 32 个 available
- 25 个 unavailable / retired
- 28 image
- 21 video
- 2 audio
- 6 3D

这些数字只代表本地代码状态，不代表 provider 当前可用性、价格或限流。

### Execution Routing

当前主要 routing 函数是 `resolveGenerationRoute()`，位于 `src/services/image/generate-image.service.ts`。

当前顺序：

1. 如果用户显式传入 `apiKeyId`，服务端读取该用户 active BYOK key。
2. 如果 key 不存在、不属于该用户、inactive 或 adapter 不匹配，请求失败。
3. 显式 `apiKeyId` 路径不会 fallback 到 platform key。
4. 如果没有显式 `apiKeyId`，服务端会寻找该用户对应 adapter 的最新 active BYOK key。
5. 如果没有 BYOK key 且模型 `freeTier` 可用，才尝试 platform key。
6. 如果没有 BYOK key 且不能走 free tier，请求失败并要求绑定 API key。

当前 `UserApiKey` schema 只有 `encryptedKey`、`maskedKey`、`isActive` 等字段；没有持久化的 `verificationStatus`、`lastVerifiedAt` 或 `verificationErrorCode`。

`verifyApiKey()` 当前会执行 server-side probes 并返回 transient result，但验证状态目标还没有完整落进数据库和自动路由规则。

### Worker-Only Execution Boundary

Current migrated execution scope:

- OpenAI image worker dispatch. Worker calls image generation for text-only requests and image edits for reference-image requests, uploads returned image bytes to R2, and callback finalizes with `imageR2Key`.
- FAL image worker dispatch. Worker submits/polls FAL image queue, passes model-supported `image_url` / `image_urls` reference fields, injects Civitai LoRA tokens through the signed internal key resolver when needed, downloads the completed provider image, uploads it to R2, and callback finalizes with `imageR2Key` without Next.js re-uploading the artifact.
- Gemini image worker dispatch. Worker calls Gemini `generateContent` with text plus optional inline reference images, uploads inline image bytes to R2, and callback finalizes with `imageR2Key`.
- Replicate image worker dispatch. Worker creates/polls predictions, applies FLUX/SDXL LoRA input fields, resolves Civitai LoRA download tokens through the signed internal key resolver when needed, passes the first supported reference image for img2img-style schemas, downloads the completed output with the required bearer auth, uploads it to R2, and callback finalizes with `imageR2Key`.
- NovelAI text-to-image and single-reference img2img worker dispatch. Worker calls `image.novelai.net/ai/generate-image`, extracts the returned ZIP image artifact, uploads it to R2, and callback finalizes with `imageR2Key`.
- VolcEngine Seedream image worker dispatch. Worker calls Ark image generations with text plus optional content image references, downloads the returned image URL, uploads it to R2, and callback finalizes with `imageR2Key`.
- Hugging Face text-to-image and single-reference image-to-image worker dispatch. Worker calls HF Inference Providers, uploads the binary image response to R2, and callback finalizes with `imageR2Key`.
- Independent multi-view image API. `POST /api/generate-multiview` no longer performs synchronous provider calls in Next.js; it creates a batch id and dispatches back/left/right reference-edit image jobs through the migrated image Worker path, while `GET /api/generate-multiview/status` aggregates child job state and returns completed R2-backed side-view `Generation` URLs.
- FAL video worker dispatch for migrated FAL video routes; Worker now downloads completed video artifacts and uploads them to R2 before callback finalization.
- FAL long-video worker workflow. Next.js now creates pipeline/clip records and dispatches the Worker; Worker owns provider submit, provider polling, completed clip download, R2 upload, and next-clip chaining. The signed Next.js long-video internal endpoint is DB-only for `clip-queued`, `clip-running`, `clip-completed`, `finalize`, and `fail` state updates.
- FAL F5-TTS worker dispatch; Worker now downloads completed audio artifacts and uploads them to R2 before callback finalization.
- Fish Audio TTS worker dispatch; Worker calls `/v1/tts` or `/v1/tts/stream/with-timestamp`, parses returned audio bytes/SSE chunks, uploads the audio artifact to R2, and sends callback finalization with the R2 key.
- Hyper3D Rodin and Hunyuan3D worker workflows.

Current fail-loud / not-yet-migrated scope:

- Image adapters outside `WORKER_MIGRATED_IMAGE_ADAPTERS`.
- NovelAI multi-reference Director image paths. Current UI caps NovelAI image references at one; the remaining provider-special path needs Worker-safe padding/normalization before it can be enabled.
- Disabled non-FAL video models are not worker-migrated and must stay unavailable until a provider-specific Worker handler exists: `seedance-2.0-volc`, `seedance-2.0-fast-volc`, `seedance-1.5-pro`, `seedance-1.0-pro`, `runway-gen4.5`, and `runway-gen4-turbo`. Current available video models are FAL-backed and Worker-dispatched.

Do not add Next.js provider fallback for these gaps. Add the Worker handler and callback contract first.

### Provider Map

| Adapter       | 当前用途                            | 当前代码路径                                                                               | Platform key                              |
| ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Hugging Face  | image                               | `src/services/providers/huggingface.adapter.ts`                                            | `HF_API_TOKEN`                            |
| Gemini        | image, LLM text                     | `src/services/providers/gemini.adapter.ts`, `src/services/llm-text.service.ts`             | `GEMINI_API_KEY`                          |
| OpenAI        | image, LLM text                     | `src/services/providers/openai.adapter.ts`, `src/services/llm-text.service.ts`             | `OPENAI_API_KEY`                          |
| FAL           | image, video queue, 3D queue        | `src/services/providers/fal.adapter.ts`                                                    | `FAL_API_KEY`                             |
| Runway        | video queue                         | `src/services/providers/runway.adapter.ts`                                                 | `RUNWAYML_API_SECRET` or `RUNWAY_API_KEY` |
| Replicate     | image, video, LoRA training helpers | `src/services/providers/replicate.adapter.ts`                                              | `REPLICATE_API_TOKEN`                     |
| NovelAI       | image                               | `src/services/providers/novelai.adapter.ts`                                                | `NOVELAI_API_TOKEN`                       |
| VolcEngine    | image, video queue, LLM text        | `src/services/providers/volcengine.adapter.ts`, `src/services/llm-text.service.ts`         | `VOLCENGINE_API_KEY`                      |
| Fish Audio    | audio, voice library                | `src/services/providers/fish-audio.adapter.ts`, `src/services/fish-audio-voice.service.ts` | no generic `getSystemApiKey()` mapping    |
| Hyper3D Rodin | 3D worker path                      | `src/services/generate-3d.service.ts`, worker execution services                           | no generic `getSystemApiKey()` mapping    |
| DeepSeek      | LLM text / planner                  | `src/services/llm-text.service.ts`                                                         | `DEEPSEEK_API_KEY`                        |

### Connection Matrix

This table records provider-level connection facts. It does not mean every model payload under that provider has been fully audited.

| Provider       | Official / current endpoint shape                                                                                                                                                | Auth shape                                                          | Current local connection                                                                                             | Result handling                                                                                                           | Per-model audit                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| OpenAI         | Image: `POST /v1/images/generations`, `POST /v1/images/edits`; text: `POST /v1/chat/completions`                                                                                 | `Authorization: Bearer <key>`                                       | `openai.adapter.ts` builds sync image calls; `llm-text.service.ts` builds chat calls                                 | Image API returns base64 or URL; platform must persist final media to R2                                                  | Required before changing model id, image params, edits, Responses API, or GPT Image behavior                        |
| Gemini         | `POST /v1beta/models/{model}:generateContent`                                                                                                                                    | `x-goog-api-key: <key>`                                             | `gemini.adapter.ts` sends text plus optional `inlineData`; `llm-text.service.ts` uses same generateContent family    | Image output is parsed from candidate parts; text output is parsed from candidate text                                    | Required before changing model id, `responseModalities`, image limits, grounding, or preview/stable model use       |
| Hugging Face   | Current code: `https://router.huggingface.co/hf-inference/models/{model}`                                                                                                        | `Authorization: Bearer <token>`                                     | `huggingface.adapter.ts` sends a sync image request to HF Inference                                                  | Binary image response is converted to a data URL, then should be persisted by the generation/storage layer                | Required because HF Inference Providers availability changes by model/provider                                      |
| FAL            | Queue: `POST https://queue.fal.run/{model_id}`, then status/result URLs                                                                                                          | `Authorization: Key <key>`                                          | `fal.adapter.ts` handles image queue, video queue, and FAL 3D queue paths                                            | Provider media URLs are ingestion sources only; final artifacts must be uploaded to R2                                    | Required for every FAL model page because payload fields vary heavily by model                                      |
| Runway         | `POST /v1/image_to_video`; status via `GET /v1/tasks/{id}`; API version header required                                                                                          | `Authorization: Bearer <key>` plus `X-Runway-Version`               | `runway.adapter.ts` submits async video tasks and polls task status                                                  | Output URL is returned after task success and must be archived to R2                                                      | Required before changing Runway model ids, ratio/duration rules, or adding text/image/video endpoints               |
| Replicate      | Current code: `POST /v1/predictions`; some official models document `POST /v1/models/{owner}/{name}/predictions`                                                                 | `Authorization: Bearer <token>`                                     | `replicate.adapter.ts` creates predictions, polls prediction status, resolves community model versions when needed   | Replicate output files/URLs are temporary enough that final files must be copied to R2                                    | Required, especially where current code endpoint style differs from official model docs                             |
| NovelAI        | Image: `POST https://image.novelai.net/ai/generate-image`; user probe uses `https://api.novelai.net/user/subscription`                                                           | `Authorization: Bearer <token>`                                     | `novelai.adapter.ts` builds sync image requests and unpacks returned ZIP image data                                  | ZIP image is extracted to a data URL, then should be persisted by the generation/storage layer                            | Required because Swagger/OpenAPI details must be checked directly for field-level changes                           |
| VolcEngine Ark | Image: `POST /api/v3/images/generations`; video: `POST /api/v3/contents/generations/tasks`, `GET /api/v3/contents/generations/tasks/{id}`; text: `POST /api/v3/chat/completions` | `Authorization: Bearer <key>`                                       | `volcengine.adapter.ts` handles Seedream image and Seedance video; `llm-text.service.ts` handles text                | Image/video provider URLs must be ingested into R2; task status maps to local queue status                                | Required before changing Seedream/Seedance model ids, reference media fields, duration, resolution, or endpoint IDs |
| Fish Audio     | TTS: `POST /v1/tts`; timestamp stream: `POST /v1/tts/stream/with-timestamp`; model library: `/model`                                                                             | `Authorization: Bearer <token>` plus `model: s2-pro` header for TTS | `generate-audio.service.ts` dispatches signed worker runs; `fish-audio-voice.service.ts` manages voice library calls | Worker converts audio bytes/SSE chunks into a final audio artifact, uploads it to R2, and callback finalizes `Generation` | Required before changing TTS fields, timestamp parsing, voice clone/model library behavior, or model header         |
| Hyper3D Rodin  | Official Rodin Gen-2 endpoint: `POST /api/v2/rodin` multipart; current 3D flow dispatches worker jobs                                                                            | `Authorization: Bearer <token>`                                     | `generate-3d.service.ts` routes Rodin to worker execution instead of normal provider registry                        | Worker owns polling/upload/callback; GLB is the permanent main asset and poster follows GLB lifecycle                     | Required before changing Rodin tier, mesh-first, texture-only, file format, subscription, or worker payload         |
| DeepSeek       | `POST /chat/completions` under `https://api.deepseek.com`                                                                                                                        | `Authorization: Bearer <key>`                                       | `llm-text.service.ts` uses OpenAI-compatible chat completion for planner/text paths                                  | Text output is parsed and validated by caller-specific services                                                           | Required before changing model ids, thinking mode, JSON output, tool calling, or beta endpoints                     |

### Official Docs Checked

Provider-level links checked on 2026-06-02. Fish Audio TTS and timestamp stream endpoints were rechecked on 2026-06-03 for the Worker migration. FAL queue, FAL image output shape, FAL image reference fields, and Veo 3.1 extend docs were rechecked on 2026-06-03 for the Worker migrations; current official docs did not expose `fal-ai/kling-video/v3/pro/extend-video`, so that endpoint remains a local model-config fact rather than a newly verified provider fact. OpenAI image edits, Gemini image generation/editing, Replicate predictions and LoRA model schemas, NovelAI image generation/img2img docs and Swagger entry, VolcEngine Seedream 4.0-5.0, and Hugging Face HF Inference text-to-image / image-to-image docs were also checked on 2026-06-03 for the image Worker migration.

These links confirm provider-level integration surfaces, not a full per-model payload audit.

- OpenAI: [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation), [image edits API reference](https://developers.openai.com/api/reference/resources/images/methods/edit), [API authentication overview](https://developers.openai.com/api/reference/overview), [models](https://developers.openai.com/api/docs/models).
- Google Gemini: [image generation](https://ai.google.dev/gemini-api/docs/image-generation), [models](https://ai.google.dev/gemini-api/docs/models), [API reference](https://ai.google.dev/api).
- Hugging Face: [Inference Providers](https://huggingface.co/docs/inference-providers/en/index), [HF Inference provider](https://huggingface.co/docs/inference-providers/providers/hf-inference), [image-to-image task](https://huggingface.co/docs/inference-providers/tasks/image-to-image).
- FAL: [async queue inference](https://fal.ai/docs/documentation/model-apis/inference/queue), [Ideogram v3 image reference fields](https://fal.ai/models/fal-ai/ideogram/v3/api).
- Replicate: [create a prediction](https://replicate.com/docs/topics/predictions/create-a-prediction), [official models](https://replicate.com/docs/topics/models/official-models), [prediction lifecycle and file retention](https://replicate.com/docs/reference/how-does-replicate-work/).
- Runway: [API getting started](https://docs.dev.runwayml.com/guides/using-the-api/), [available models](https://docs.dev.runwayml.com/guides/models/), [API reference](https://docs.dev.runwayml.com/api/).
- NovelAI: [image generation models](https://docs.novelai.net/en/image/models/), [FAQ / storage behavior](https://docs.novelai.net/en/faq/), [image API Swagger](https://image.novelai.net/docs/index.html).
- VolcEngine Ark: [image generation API](https://www.volcengine.com/docs/82379/1541523?lang=zh), [Seedream 4.0-5.0 tutorial](https://www.volcengine.com/docs/82379/1824121?lang=zh), [Seedance 2.0 API](https://www.volcengine.com/docs/82379/1520757?lang=zh), [query video task](https://www.volcengine.com/docs/82379/1521309?lang=zh).
- Fish Audio: [TTS stream with timestamps](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech-stream-with-timestamps), [TTS quickstart](https://docs.fish.audio/developer-platform/getting-started/quickstart), [API introduction](https://docs.fish.audio/api-reference/introduction).
- Hyper3D Rodin: [Rodin Gen-2 generation API](https://developer.hyper3d.ai/api-specification/rodin-generation-gen2).
- DeepSeek: [first API call](https://api-docs.deepseek.com/), [chat completion API](https://api-docs.deepseek.com/api/create-chat-completion).

## Target

Provider integration should be managed as a verified contract layer.

Before adding or changing a model:

1. Identify product intent and output type.
2. Inspect existing model constants and adapter patterns.
3. Open the provider official model/API page.
4. Confirm exact `externalModelId`, endpoint, auth header, request body, response body, status values, media URL retention, safety/moderation behavior, limits, and pricing unit.
5. Record the official URL in `officialUrl`.
6. Expose anything unclear before implementation.
7. Implement the smallest slice.
8. Run validation.
9. Update `docs/integrations/providers.md` only for durable facts.

Provider adapters should stay media-execution specific:

- image execution can have image-specific request/response normalization
- video execution can have queue/polling/webhook-specific logic
- audio execution can have TTS/ASR-specific logic
- 3D execution can have worker-specific queue, file, and GLB persistence logic
- Generation record / ownership / visibility / storage metadata stay unified above execution

Key validation target:

- Server-side verification action exists for every supported adapter.
- Verification uses provider-documented safe endpoints only.
- UI displays `verified`, `failed`, or `unverified`.
- `verificationStatus`, `lastVerifiedAt`, and safe `verificationErrorCode` should be persisted before automatic BYOK routing depends on verification.
- Failed or unverified keys should not participate in automatic BYOK routing unless a provider-specific rule is explicitly documented.

## Unresolved

- The current model catalog has not been fully audited model-by-model against official model pages in this pass.
- FAL video request bodies include code comments warning that some schemas are unverified. Before changing any FAL video model, check its exact model page and payload.
- VolcEngine docs were accessible as official document shells/search snippets, but several pages require JavaScript for full body extraction. Any field-level change must be checked in the official page, PDF, console API Explorer, or official SDK examples before implementation.
- NovelAI image Swagger pages are official but rendered as Swagger UI with limited text extraction here. Field-level NovelAI changes need the live Swagger/OpenAPI schema checked directly.
- Current `UserApiKey` schema does not persist verification status.
- Current `deleteApiKey()` hard-deletes user API key rows. Target soft revoke / tombstone behavior from `docs/domains/api-keys.md` is not implemented yet.
- Fish Audio and Hyper3D Rodin do not currently have generic platform key mappings in `getSystemApiKey()`.
- Provider pricing, rate limits and cost units are not guaranteed by `ModelOption.cost`. Current `cost` is a platform allowance unit, not provider billing truth.
- Private media access still must align with `docs/architecture/storage.md`; provider URLs must not become gallery/assets/profile source of truth.
- LLM text route fallback currently uses user BYOK providers first and then platform Gemini if available. This should be rechecked before expanding Node workflow planner/assistant costs.
- Some `officialUrl` values in constants may point to product/model pages instead of exact API reference pages. Exact API docs should be preferred when changing execution.

## Source of Truth

Local code:

- `src/constants/providers.ts`
- `src/constants/config.ts`
- `src/constants/models.ts`
- `src/constants/models/`
- `src/constants/provider-capabilities.ts`
- `src/lib/platform-keys.ts`
- `src/services/providers/registry.ts`
- `src/services/providers/openai.adapter.ts`
- `src/services/providers/gemini.adapter.ts`
- `src/services/providers/huggingface.adapter.ts`
- `src/services/providers/fal.adapter.ts`
- `src/services/providers/runway.adapter.ts`
- `src/services/providers/replicate.adapter.ts`
- `src/services/providers/novelai.adapter.ts`
- `src/services/providers/volcengine.adapter.ts`
- `src/services/providers/fish-audio.adapter.ts`
- `src/services/apiKey.service.ts`
- `src/services/api-key-resolver.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/generate-audio.service.ts`
- `src/services/generate-3d.service.ts`
- `src/services/llm-text.service.ts`
- `prisma/schema.prisma`

Related docs:

- `docs/architecture/generation.md`
- `docs/architecture/credits.md`
- `docs/architecture/storage.md`
- `docs/domains/api-keys.md`
- `docs/domains/node-workflow.md`

## Last Verified

- Date: 2026-06-02
- Method: local code inspection plus official provider documentation search/open
- Runtime provider calls: not run
- Typecheck/tests/build: not run, because this pass only updates documentation
