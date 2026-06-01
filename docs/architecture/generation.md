# 生成架构

最后更新：2026-06-01

本文档记录生成链路的当前事实、owner 确认的目标契约和未决项。它不记录具体 provider 参数、模型能力或价格；这些必须在 `docs/integrations/providers.md` 中基于官方资料核验。

## Product Direction

生成架构必须服务第一主路径：

```text
选择模型 -> 输入 prompt/参考图 -> 生成 -> 持久保存 -> 管理/复用作品
```

当前主生成入口以 `Studio` 为中心。

`Node workflow` 的定位不是替代 Studio 的默认入口，而是长视频制作和高级编排层：通过画布节点连接角色、声音、剧本和视频生成步骤，尽可能减少“抽卡”，让用户更可控地生成自己想要的视频。

## Current State

### Entry Points

- Studio 图片生成入口：`src/app/api/studio/generate/route.ts` -> `src/services/studio-generate.service.ts`。
- 旧/通用图片生成入口：`src/app/api/generate/route.ts` -> image generation service。
- 视频生成入口：`src/app/api/generate-video/route.ts` -> `src/services/generate-video.service.ts`。
- 音频生成入口：`src/app/api/generate-audio/route.ts` -> `src/services/generate-audio.service.ts`。
- 3D 生成入口：`src/app/api/generate-3d/route.ts` -> `src/services/generate-3d.service.ts`。
- 长视频入口：`src/app/api/generate-long-video/route.ts` -> `src/services/video-pipeline.service.ts`。
- Node workflow 项目持久化入口：`src/app/api/node-workflow/projects/**` -> `src/services/node/node-workflow.service.ts`。

### Shared Generation Record

`prisma/schema.prisma` 中的 `Generation` 是生成结果的统一资产记录。

当前 `Generation` 已统一承载：

- `outputType`
- `status`
- `url` / `storageKey`
- `mimeType`
- thumbnail / preview metadata
- `width` / `height`
- `duration`
- `modelUrl` / `modelStorageKey` for 3D
- `referenceImageUrl`
- `prompt` / `negativePrompt`
- `model` / `provider`
- usage count and free-tier marker
- visibility flags
- ownership through `userId`
- project binding through `projectId`
- card / recipe / run group metadata

`src/services/generation.service.ts` owns creation, query, visibility, gallery/assets listing, project assignment, deletion, and related generation mutations.

### Job and Usage Tracking

`GenerationJob` records async or long-running work.

`ApiUsageLedger` records provider/API usage attempts and links to `Generation` and/or `GenerationJob`.

`src/services/usage.service.ts` provides:

- free-tier slot reservation
- generation job creation
- job completion
- job failure
- usage ledger creation
- usage-to-generation attachment

Current implementation records failed attempts through `failGenerationJob` and failed `ApiUsageLedger` rows. Whether failed platform-key generations should refund user-facing credits belongs in `docs/architecture/credits.md`.

### Route Resolution

`src/services/image/generate-image.service.ts` currently owns `resolveGenerationRoute`.

Current route priority is:

1. User explicitly provides `apiKeyId`: resolve that saved BYOK key and require adapter compatibility.
2. No explicit key: find active user key for the model adapter.
3. No user key and model supports free tier: reserve free-tier slot and use platform key.
4. No user key and no free-tier path: fail with missing API key.

This matches the target priority confirmed by owner, with one important rule: if the user explicitly selects `apiKeyId` and it is unavailable, the system must error and must not silently fall back to platform key.

### Media-Specific Execution

Execution is currently split by media type:

- Image: `src/services/image/generate-image.service.ts`
- Video: `src/services/generate-video.service.ts`
- Audio: `src/services/generate-audio.service.ts`
- 3D: `src/services/generate-3d.service.ts`
- Long video pipeline: `src/services/video-pipeline.service.ts`
- Node workflow project state: `src/services/node/node-workflow.service.ts`

This split is intentional for execution-level logic because different media types have different provider payloads, queue/polling behavior, worker paths, callbacks, storage outputs, and finalization rules.

### Provider Dispatch

Provider adapter types are defined in `src/constants/providers.ts`.

Provider adapter registry is `src/services/providers/registry.ts`.

Current normal adapter registry includes:

- HuggingFace
- Gemini
- OpenAI
- FAL
- Runway
- Replicate
- NovelAI
- VolcEngine
- Fish Audio

`HYPER3D_RODIN` exists as an adapter type but is not dispatched through the normal registry. The current code dispatches this path through 3D worker execution.

### Worker and Async Execution

`src/constants/execution.ts` defines execution worker paths, internal callback paths, signature headers, timeout defaults, and workflow IDs.

`src/services/execution-worker.service.ts` dispatches signed worker runs.

Current worker-backed or async areas include:

- FAL queue video runs
- long-video pipeline workflow
- Hyper3D Rodin workflow
- Hunyuan3D workflow
- audio queue/outbox paths
- internal execution callbacks and key resolution

Internal endpoints under `src/app/api/internal/**` are Clerk-bypassed at middleware and must verify their own signatures or internal rules.

### Storage and Persistence

`src/services/storage/r2.ts` owns R2 storage key generation, upload, download/fetch normalization, and media upload helpers.

`generateStorageKey` currently scopes output keys by user and output type:

- image
- video
- audio
- model_3d

Generated outputs are persisted to R2 before or during `Generation` finalization depending on media path.

## Target Contract

### Product Layer

User-facing product language should treat all generated assets as `Generation`.

The product and data layer should be unified around:

- Generation record
- Generation status
- Generation visibility
- Generation storage metadata
- Generation ownership
- Generation project binding
- Generation gallery/assets display

This gives users one mental model for generated work regardless of media type.

### Execution Layer

Execution should stay media-specific.

Do not force these into a single generic pipeline:

- `generateImage()`
- `generateVideo()`
- `generateAudio()`
- `generate3D()`
- provider-specific payloads
- polling/webhook/worker execution

The correct direction for this project is:

```text
Product and data layer: unified as Generation
Execution layer: split by media type and provider behavior
```

This preserves consistent asset management without hiding real provider/media complexity behind an over-generalized abstraction.

### Studio and Node Workflow

`Studio` remains the main generation center for the default creation flow.

`Node workflow` is a core advanced capability for long video and directorial workflows. Its purpose is to let the user compose roles, voices, scripts, references, and generation steps through a canvas so output is more controllable and less dependent on repeated random attempts.

Node workflow should integrate with the shared `Generation` asset model for outputs, but it does not need to share the same execution service as simple Studio generation.

### BYOK and Platform Key Priority

Target key resolution order:

1. If user explicitly selects `apiKeyId`, use that BYOK key.
2. If selected `apiKeyId` is unavailable or incompatible, fail loudly.
3. If user does not explicitly select a key but has an active matching BYOK key, auto-use the user key.
4. If no matching BYOK key exists and the model supports free tier, use platform key.
5. If no BYOK key exists and the model does not support free tier, prompt the user to bind an API key.

The system must not silently switch from explicit BYOK selection to platform key.

### Failure and Credit Policy

Owner-confirmed direction: platform key and BYOK should be treated differently.

Target policy:

- Platform-key generation failure should not make the user pay for platform failure.
- BYOK should prioritize using the user's provider account when selected or available.
- Exact deduction/refund ledger behavior belongs in `docs/architecture/credits.md`.

This document does not define the final credit implementation details.

## Non-Goals

- Do not make Arena or Storyboard part of the near-term generation architecture direction.
- Do not make 3D a main-line generation priority in the short term.
- Do not collapse all media execution into one abstract service for aesthetic consistency.
- Do not document provider-specific model parameters here.
- Do not infer provider capabilities from memory. Provider facts require official documentation verification.

## Unresolved

- Final credit/refund implementation for failed generations is unresolved and belongs in `docs/architecture/credits.md`.
- Whether `resolveGenerationRoute` should remain inside image generation service or move to a media-neutral service is unresolved.
- Whether all API routes should use `src/lib/api-route-factory.ts` consistently is unresolved.
- The final boundary between Studio workspace routes and Node workflow route needs `docs/domains/studio.md`.
- Long-video Node workflow should be specified in a future domain document before major implementation changes.
- Provider/model currentness has not been checked against official docs in this pass.
- `package.json` still has model-doc scripts pointing to deleted `docs/reference/api/model-doc-monitor.snapshot.json`; replacement artifact location is unresolved.
- 3D stays a branch for now, but existing code still contains active 3D services and routes. Future work should avoid expanding it unless explicitly prioritized.

## Source of Truth

- User-confirmed generation direction in the 2026-06-01 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/architecture/overview.md`
- `src/app/api/studio/generate/route.ts`
- `src/app/api/generate/route.ts`
- `src/app/api/generate-video/route.ts`
- `src/app/api/generate-audio/route.ts`
- `src/app/api/generate-3d/route.ts`
- `src/app/api/generate-long-video/route.ts`
- `src/app/api/internal/execution/callback/route.ts`
- `src/app/api/internal/execution/resolve-key/route.ts`
- `src/services/studio-generate.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/generate-audio.service.ts`
- `src/services/generate-3d.service.ts`
- `src/services/video-pipeline.service.ts`
- `src/services/node/node-workflow.service.ts`
- `src/services/generation.service.ts`
- `src/services/usage.service.ts`
- `src/services/storage/r2.ts`
- `src/services/providers/registry.ts`
- `src/services/execution-worker.service.ts`
- `src/constants/execution.ts`
- `src/constants/providers.ts`
- `src/constants/models.ts`
- `src/constants/models/`
- `src/types/index.ts`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-01
- Method: owner direction confirmation plus code inspection
- External docs: not checked; provider/model details intentionally deferred to `docs/integrations/providers.md`
- Runtime validation: not run
