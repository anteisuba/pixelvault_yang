# Gallery Domain

最后更新：2026-06-02

本文档记录 Gallery 业务域的当前事实、已确认目标和未决边界。它不替代生成、存储、认证、Profile、Assets 或社交功能文档。

## Current

### Route Surface

Current Gallery route surface:

- `/gallery` renders the public gallery feed.
- `/gallery/[id]` renders a public generation detail page.
- `/gallery/loading` and `/gallery/error` provide route-level loading and error states.

`/gallery` is a locale-prefixed App Router page through `src/app/[locale]/(main)/gallery/page.tsx`.

`/gallery/[id]` is also public-facing, but it only resolves generations that are already public.

### Feed Page

`src/app/[locale]/(main)/gallery/page.tsx`:

- validates search params with `GallerySearchSchema`
- fetches the initial SSR page with `getPublicGenerationPage`
- passes the SSR result into `GalleryFeed`
- exports `revalidate = 60`
- uses translated metadata from the `Metadata` namespace

The feed supports these current filter dimensions:

- search
- model
- sort
- output type
- time range
- liked
- published
- projectId

The page itself does not directly query Prisma. It goes through `src/services/generation.service.ts`.

### Feed UI

`GalleryFeed` is the client composition layer for the public feed. It owns:

- filter state wiring
- URL query replacement
- loading/error display
- load-more trigger
- the empty state link back to Studio

`GalleryHeader` owns the visible filter controls:

- sort pill group
- media type pill group
- time range pill group
- search
- advanced filters

`GalleryAdvancedFilters` currently contains:

- model filter
- liked/favorites toggle

`GalleryGrid` owns the masonry/feed display behavior:

- progressive rendering in batches
- eager image measurement for near-viewport media
- keyboard spatial navigation
- empty state rendering
- `ImageCard` rendering

`ImageCard` owns the per-generation card UI and interaction surface:

- media display
- like action
- download action
- creator attribution
- prompt overlay when prompt is public
- copy prompt
- use prompt in Studio
- optional visibility controls when caller enables them
- optional detail modal when opened from card context

### Detail Page

`src/app/[locale]/(main)/gallery/[id]/page.tsx` uses `getPublicGenerationById`.

Current behavior:

- returns `notFound()` if the generation does not exist or is not public
- uses a slim public query that skips heavy JSON columns
- redacts prompt and negative prompt when `isPromptPublic` is false
- renders images through `getGenerationPreviewUrl`
- renders videos through `GalleryDetailVideoPlayer`
- exposes download and open-original actions
- links image outputs to Studio edit through `studioImageEditPath`
- generates Open Graph metadata through `/api/og`
- writes JSON-LD for public detail pages and escapes hostile inline-script sequences

### Data Source And Visibility

Gallery is backed by the shared `Generation` model.

Current public-list query behavior lives in `src/services/generation.service.ts`:

- if `userId` is not supplied, query condition defaults to `isPublic = true`
- if `userId` is supplied, the query returns that user's own generations, including private ones
- if public search is used, search is restricted to `isPromptPublic = true`
- public list and public detail redact prompt fields when `isPromptPublic = false`
- public detail also requires `isPublic = true`
- creator metadata is projected from the related `User`
- public/community responses include like count
- authenticated viewer responses can include `isLiked`

The current `Generation` visibility fields are:

- `isPublic`
- `isPromptPublic`
- `isFeatured`

### API Surface

Current Gallery-related API surface:

- `GET /api/images`: list generations for public gallery, liked filter, or owner-scoped listing.
- `GET /api/generations/[id]`: owner-scoped full generation fetch for private/detail-style consumers.
- `DELETE /api/generations/[id]`: owner-scoped generation deletion.
- `PATCH /api/generations/[id]/visibility`: owner-scoped visibility updates.
- `POST /api/generations/batch`: owner-scoped batch delete, visibility, like, and project actions.
- `GET /api/likes`: authenticated liked-id lookup.
- `POST /api/likes`: authenticated like toggle.

`GET /api/images` is the main list endpoint. Anonymous public responses can be cached because they are identical for every anonymous viewer. Signed-in, `mine`, and `liked` responses are viewer-specific and use private cache headers.

### Client Data Flow

`useGallery` is the shared client hook for listing generations.

Current responsibilities:

- call `fetchGalleryImages`
- maintain pagination, cursor, loading, error, and total state
- merge appended pages by generation id
- cache first-page snapshots by filter combination through `src/lib/gallery-cache.ts`
- expose local mutation helpers after delete, upload, visibility, like, or project changes

`fetchGalleryImages` is implemented in `src/lib/api-client/gallery.ts` and calls `API_ENDPOINTS.IMAGES`.

### Relationship To Assets

`/assets` is a separate signed-in asset management surface.

It currently reuses:

- `Generation`
- `GallerySearchSchema`
- `getPublicGenerationPage` with `userId`
- `useGallery({ mine: true })`
- gallery API client helpers
- asset section counts from `GET /api/assets/section-counts`

`KreaAssetBrowser` owns private asset browsing and management UX:

- private owner listing
- uploads
- folders/projects
- favorites
- published filter
- bulk delete
- bulk publish
- bulk favorite
- bulk project move
- detail sheet
- picker modes

This shared implementation means Gallery and Assets currently share listing primitives, but they are not the same product domain.

### Storage And Media

Gallery displays media URLs stored on `Generation` records:

- `url`
- `thumbnailUrl`
- `previewUrl`
- `modelUrl` for 3D GLB outputs

Current image/video display code prefers derivatives where available:

- `getGenerationThumbnailUrl`
- `getGenerationPreviewUrl`

Per storage architecture, provider URLs are not supposed to be the archive source of truth. Gallery should treat persisted `Generation` storage fields as display inputs and should not depend directly on provider URLs.

## Target

### Role

Gallery is the public browsing and public detail surface for generated works that the owner/user has chosen to publish.

It is secondary to the creation loop. It should support the primary path after generation:

```text
生成 -> 持久保存 -> 管理/复用作品 -> 选择性公开展示
```

Gallery should help users inspect, reuse, and share public works without turning the project into a social-expansion or leaderboard product in the short term.

### Responsibility

Gallery owns:

- public generation feed
- public generation detail pages
- public-safe prompt display
- creator attribution on public works
- public like display and like interaction
- public filters and pagination
- handoff back into Studio when reuse is safe and intentional

Gallery does not own:

- generation execution
- provider payloads or model API correctness
- credit/free allowance rules
- R2 upload or storage retention
- private asset management
- project/folder management
- API key management
- Profile identity policy
- social expansion strategy
- public ranking or leaderboard rules

### Public Visibility Contract

Future Gallery work must preserve these rules:

- Public feed must not show private generations.
- Public detail must not resolve private generations.
- Prompt text must be hidden when `isPromptPublic = false`.
- Public search must not search private prompts.
- Owner-scoped listing must remain separate from anonymous public listing.
- Client-side filters must not become authorization boundaries.
- Like actions must remain server-authorized.
- Deletion and visibility updates must remain owner-scoped.

### Relationship To Assets

Target boundary:

- Gallery: public presentation and public discovery of published generations.
- Assets: signed-in private library, management, folders/projects, uploads, bulk operations, and picker flows.

Shared hooks and service functions are acceptable only when their permission mode is explicit, such as `mine: true` for owner-scoped asset browsing.

Gallery should not absorb private asset management behavior just because it shares `useGallery` or `Generation` records.

### Relationship To Studio

Gallery may hand public work back into Studio for reuse.

Safe handoff examples:

- copy public prompt
- use public prompt in Studio
- edit public image in Studio

Gallery should not decide provider behavior, generation parameters, storage keys, ownership, or allowance usage during that handoff. Studio and generation services own those decisions.

### Stability Rules

Future Gallery work must not break:

- `/gallery` public feed route.
- `/gallery/[id]` public detail route.
- `isPublic` filtering for anonymous public views.
- `isPromptPublic` redaction for public views.
- `GallerySearchSchema` validation for URL/API query params.
- `fetchGalleryImages` through the API client layer.
- `useGallery` pagination and local mutation helpers used by both Gallery and Assets.
- public anonymous cache invalidation when public generations or visibility change.
- owner-only mutation routes for deletion, visibility, project assignment, and batch actions.
- translation readiness for visible UI text.

## Unresolved

- Whether Gallery should publicly support `AUDIO` and `MODEL_3D` in the same detail experience is unresolved. Current filters/types include those values in shared types, but public detail rendering is primarily image/video-oriented.
- `GalleryAdvancedFilters` currently selects image/video model lists; audio and 3D model filtering behavior needs review before expanding public Gallery media support.
- The final boundary between Gallery and Assets is mostly clear, but shared hook/service usage makes future drift possible. Any major private-library work should update an Assets domain document rather than overloading Gallery.
- Public detail currently shows `referenceImageUrl` when present. The intended privacy policy for reference inputs on public works needs explicit confirmation before changing behavior.
- Public download/open-original policy is not product-final. Future decisions may need rules for private media, watermarking, signed URLs, or disabling downloads.
- Public feed currently relies on generation creation paths to avoid exposing invalid records; this documentation pass did not prove every query explicitly filters `status = COMPLETED`.
- The meaning of `published` in public Gallery versus owner-scoped Assets needs cleanup. Public Gallery is already `isPublic = true`, while Assets uses `published` as an owner filter.
- Anonymous public cache behavior should be re-audited after any change to visibility, likes, prompt redaction, or public sorting.
- A complete browser QA pass for Gallery and Gallery detail has not been run in this documentation pass.

## Source of Truth

- User-confirmed product direction in the 2026-06-01 and 2026-06-02 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/storage.md`
- `docs/architecture/auth.md`
- `src/app/[locale]/(main)/gallery/page.tsx`
- `src/app/[locale]/(main)/gallery/[id]/page.tsx`
- `src/app/[locale]/(main)/gallery/loading.tsx`
- `src/app/[locale]/(main)/gallery/error.tsx`
- `src/components/business/GalleryFeed.tsx`
- `src/components/business/GalleryGrid.tsx`
- `src/components/business/ImageCard.tsx`
- `src/components/business/gallery/GalleryHeader.tsx`
- `src/components/business/gallery/GalleryAdvancedFilters.tsx`
- `src/components/business/GalleryDetailVideoPlayer.tsx`
- `src/hooks/use-gallery.ts`
- `src/hooks/use-generation-visibility.ts`
- `src/hooks/use-like.ts`
- `src/lib/api-client/gallery.ts`
- `src/lib/gallery-cache.ts`
- `src/lib/gallery-query.ts`
- `src/lib/generation-media.ts`
- `src/services/generation.service.ts`
- `src/services/like.service.ts`
- `src/app/api/images/route.ts`
- `src/app/api/generations/[id]/route.ts`
- `src/app/api/generations/[id]/visibility/route.ts`
- `src/app/api/generations/batch/route.ts`
- `src/app/api/likes/route.ts`
- `src/app/[locale]/(main)/assets/page.tsx`
- `src/components/business/KreaAssetBrowser.tsx`
- `src/app/api/assets/section-counts/route.ts`
- `src/constants/routes.ts`
- `src/constants/config.ts`
- `src/types/index.ts`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-02
- Method: owner direction confirmation plus route/component/hook/API/service/schema inspection
- External docs: not required for Gallery domain facts in this pass
- Runtime: not run
