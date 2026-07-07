# Storage Architecture

最后更新：2026-06-02

本文档记录生成资产、参考素材、衍生预览、视频、3D 文件和临时输入的存储生命周期。它不记录 Cloudflare R2 signed URL 的具体 API 用法；后续实现私有访问前必须核验 Cloudflare 官方文档。

## Product Direction

项目第一主路径要求生成结果可以被持久保存、管理和复用。

因此成功作品的 archive source of truth 必须是平台控制的存储对象和数据库记录，而不是 provider 临时 URL。

核心原则：

- 成功生成结果默认永久保存，直到用户主动删除。
- Provider 原始 URL 只能作为 ingestion source，不能作为 archive source of truth。
- R2 URL / `storageKey` 才是平台内事实源。
- 私有作品长期不能依赖 public R2 URL 作为权限边界。

## Current State

### R2 Service Boundary

`src/services/storage/r2.ts` owns the current R2 operations:

- `generateStorageKey`
- `uploadToR2`
- `streamUploadToR2`
- `uploadFromHttpToR2`
- `uploadBufferedHttpToR2`
- `createImagePreviewAssets`
- `createImageThumbnailAsset`
- `createVideoPosterAsset`
- `deleteFromR2`
- `deleteManyFromR2`

`generateStorageKey` scopes generated objects by user and output type:

```text
generations/{userId}/image/...
generations/{userId}/video/...
generations/{userId}/audio/...
generations/{userId}/model_3d/...
```

Current uploads return URLs based on `NEXT_PUBLIC_STORAGE_BASE_URL` and use long-lived immutable cache headers.

### Generation Storage Fields

`Generation` currently stores:

- `url`
- `storageKey`
- `mimeType`
- `thumbnailUrl`
- `thumbnailStorageKey`
- `previewUrl`
- `previewStorageKey`
- `modelUrl`
- `modelStorageKey`
- `referenceImageUrl`

For normal image/video/audio outputs, `url` and `storageKey` represent the primary stored output.

For `MODEL_3D`, current schema comments define:

- `modelUrl` / `modelStorageKey`: actual GLB file
- `url` / `storageKey`: poster image used for display

### Derivatives

Image thumbnail and preview assets are generated as WebP derivatives:

- thumbnail: max size 384
- preview: max size 1280

Video poster assets are generated as WebP thumbnails:

- poster max size 768

Generated image previews may be produced through `ExecutionOutbox` via `src/services/image/image-preview-derivative.service.ts`.

Extracted elements can generate preview assets synchronously during persistence.

#### User uploads (local files)

Local-file uploads (`POST /api/upload-image/file`, multipart/form-data) stream
the **raw bytes** — no base64 data URL in a JSON body, so there is no ~33%
inflation and no need to pre-crush quality to fit a request-body cap. The
original is stored in R2 **as-is** (no server re-encode / downscale) up to
`USER_UPLOAD_MAX_BYTES` (15 MB); the client only compresses a file that exceeds
`CLIENT_UPLOAD_MAX_BYTES` before sending. Unlike generated images, an upload
derives **only a 384px thumbnail** (`createImageThumbnailAsset`) — the detail
view serves the full original, so the 1280px preview is skipped. The legacy
`POST /api/upload-image` JSON route remains for importing a remote/`data:` URL.

### Deletion

`deleteGeneration` and `batchDeleteGenerations` return R2 keys for:

- `storageKey`
- `thumbnailStorageKey`
- `previewStorageKey`
- `modelStorageKey`

API routes call `deleteManyFromR2` best-effort after DB deletion.

Current generation deletion does not clean up `referenceImageUrl`, because there is no separate `referenceImageStorageKey` field and references may be reused.

### Provider URL Handling

Successful image, video, audio, and 3D paths generally download or stream provider output into R2 before creating or finalizing platform `Generation` records.

Some provider URLs may still be kept in snapshots or metadata for debugging or workflow continuity.

Current architecture does not yet have a strict rule preventing UI surfaces from depending on provider URLs in every domain. That rule is defined below as the target contract.

### Access Control

Current stored URLs are public-style URLs derived from `NEXT_PUBLIC_STORAGE_BASE_URL`.

Application-level routes check ownership and visibility for DB records, but a public object URL is not itself a private permission boundary.

This is acceptable only as current implementation fact, not as the long-term target for creator/general-user private works.

## Target Contract

### Permanent Assets

The following should be permanent by default until the user deletes them:

- successful image generations
- successful video generations
- successful audio generations
- successful 3D GLB outputs
- user-uploaded assets
- assets promoted into projects
- assets used by LoRA workflows
- assets used by cards
- assets used as Node workflow references
- references required to replay a generation

Permanent means:

- owned by a DB record
- stored in platform-controlled storage
- addressable by storage key
- restorable or reusable through product flows

### Reference Inputs

Reference images are not automatically independent permanent assets.

Retention rules:

- `Asset / Project / LoRA / Card / Node reference`: permanent until user deletion.
- `Generation reference`: follows the generation lifecycle.
- `Temporary input`: request-local or TTL-based; not permanent.
- `Generation replay required input`: persisted because replay depends on it.

The target implementation should distinguish these categories explicitly instead of relying on a single `referenceImageUrl` string.

### Derivative Assets

Thumbnail, preview, and poster assets are derivative caches.

Rules:

- They may be regenerated from the primary asset.
- Final products must not depend only on derivative existence.
- They should generally follow the primary asset lifecycle.
- They should be deleted when the owning primary asset is deleted.
- Missing derivative files should degrade gracefully or enqueue regeneration.

3D poster PNG follows the GLB lifecycle and does not independently represent a work.

### Video Clips

Intermediate video clips are not permanent works by default.

They become persistent assets only if:

- the clip is visible to the user,
- the clip is reusable,
- the clip is needed to recover or continue an edit chain, or
- the final workflow depends on it.

Long-video and Node workflow domains need explicit clip lifecycle rules before major implementation changes.

### 3D Files

For 3D:

- GLB is the permanent primary asset.
- poster PNG is a display cover.
- deleting the 3D work should delete both GLB and poster.
- poster must not be treated as the actual work.

### Provider URLs

Provider URLs are ingestion sources only.

Target rules:

- Successful generation must download or stream provider output into R2.
- Only R2 persistence makes an output a platform work.
- Gallery, assets, project, and profile views must not directly depend on provider URLs.
- Provider URLs may be stored in snapshot or metadata for debugging.
- Provider URLs should not be exposed as user-facing archive URLs.

If provider succeeds but R2 persistence fails, the platform work is not successfully archived. This is a platform persistence failure and should be handled with the usage/allowance policy defined in `docs/architecture/credits.md`.

BYOK follows the same rule: user-owned provider keys still produce platform-archived works only after R2 persistence succeeds.

### Failed Tasks

Hidden temporary files from failed tasks should be cleaned up immediately on a best-effort basis.

User-visible or recoverable partial outputs should not be deleted automatically without a product decision.

Audit records may remain even when temporary storage is cleaned up.

### Private Media Access

Public R2 URL is not a private permission boundary.

Target access model:

```text
public generation
-> public R2 / CDN URL

private generation
-> private R2 object
-> short-lived signed URL
or
-> authenticated proxy route
```

Minimum viable target:

- private media is not exposed as a permanent public URL
- client requests media through an API route such as `/api/media/:id`
- route verifies Clerk user and generation ownership or public visibility
- route returns a short-lived signed URL or streams through an authenticated proxy
- public works may continue to use public CDN URLs

Implementation details require current Cloudflare R2 documentation verification before code changes.

## Non-Goals

- Do not make provider URLs a durable product dependency.
- Do not treat thumbnails or previews as primary assets.
- Do not silently delete user-visible partial outputs without a product rule.
- Do not implement signed URL or private bucket changes in this documentation pass.
- Do not change storage behavior during UI-only tasks.

## Unresolved

- Exact private media implementation is unresolved: signed URL, authenticated proxy, or hybrid.
- Whether public and private objects should use separate buckets, prefixes, or metadata is unresolved.
- `Generation.referenceImageUrl` lacks a paired storage key and lifecycle type.
- Reference ownership and reference reuse need an explicit data model before aggressive cleanup.
- Long-video clip lifecycle needs a domain-specific document.
- Node workflow reference lifecycle needs a domain-specific document.
- Existing public R2 URLs need a migration plan before private media access can be enforced.
- Cloudflare R2 signed URL and private object implementation details have not been checked against official docs.

## Source of Truth

- User-confirmed storage direction in the 2026-06-02 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/credits.md`
- `src/services/storage/r2.ts`
- `src/services/generation.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/services/image/image-preview-derivative.service.ts`
- `src/services/upload-image.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/video-pipeline.service.ts`
- `src/services/generate-3d.service.ts`
- `src/services/generation-poster.service.ts`
- `src/services/extracted-element.service.ts`
- `src/app/api/generations/[id]/route.ts`
- `src/app/api/generations/batch/route.ts`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-02
- Method: owner direction confirmation plus code inspection
- External docs: not checked; Cloudflare R2 signed URL/private access details intentionally deferred until implementation planning
- Runtime validation: not run
