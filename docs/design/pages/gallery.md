# Gallery Page

Last updated: 2026-06-02

This document records current page-level facts for Gallery. It is not a
redesign spec and not a request to change UI code.

## Current

### Route Surface

| Surface        | Route           | Current UI entry              | Notes                        |
| -------------- | --------------- | ----------------------------- | ---------------------------- |
| Gallery feed   | `/gallery`      | `GalleryFeed`                 | public feed, `revalidate=60` |
| Gallery detail | `/gallery/[id]` | gallery detail route + player | public generation detail     |

### Structure

Feed structure:

- route page validates `GallerySearchSchema`
- `getPublicGenerationPage` fetches initial public page
- page container uses `max-w-gallery`
- `GalleryFeed` owns client filter/loading/load-more behavior
- `GalleryHeader` owns visible filter controls
- `GalleryGrid` owns masonry feed, empty state, progressive render, and spatial
  keyboard navigation

Detail structure:

- route loads public generation through cached `getPublicGenerationById`
- `notFound()` when missing or private
- redacts prompt fields when `isPromptPublic` is false
- image detail uses `img`; video detail uses `GalleryDetailVideoPlayer`
- metadata, reference image, download/open-original, and edit-in-Studio actions
  live in the detail card

## Current State Matrix

| State      | Current fact                                                           |
| ---------- | ---------------------------------------------------------------------- |
| Loading    | `gallery/loading.tsx`; feed also has load-more spinner                 |
| Error      | `gallery/error.tsx`; feed component can render error text              |
| Empty      | `GalleryGrid` dashed empty state with optional Studio CTA              |
| Signed-out | public feed/detail can be viewed anonymously                           |
| Signed-in  | viewer-specific like state can be included; public feed remains public |
| No credits | not page-owned                                                         |

## Page CSS / Layout Rules

Current CSS facts:

- feed route uses `max-w-gallery`.
- detail route uses `editorial-page`, `editorial-container`, and `bg-card`.
- empty feed uses dashed `border-primary/20` and `bg-primary/3`.
- detail image uses `max-h-[70svh]`.
- no broad `gallery-*` class family was found beyond component names.

## Components

| Area   | Components                                                                           |
| ------ | ------------------------------------------------------------------------------------ |
| feed   | `GalleryFeed`, `GalleryHeader`, `GalleryAdvancedFilters`, `GalleryGrid`, `ImageCard` |
| detail | gallery detail route, `GalleryDetailVideoPlayer`                                     |
| shared | `ImageDetailModal`, image-card components, generation media helpers                  |

## Interaction Details

Current page-internal interaction matrix:

| Interaction                 | Current trigger / owner                                                              | Current state / feedback                                                                                       | Design notes                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Filter state sync           | `GalleryFeed.handleFiltersChange` passes merged filters into `useGallery.setFilters` | Replaces URL query state and refetches/caches gallery pages by filter combination                              | Filter UI must remain URL-addressable.                                         |
| Sort/type/time filters      | `GalleryHeader` pill groups                                                          | Updates sort, output type, and time range; changing type also clears model filter                              | Pill groups are the primary public feed controls.                              |
| Search                      | Search toggle opens inline search input; text changes debounce before filter update  | Maintains local `searchInput`, updates `filters.search`, and supports clear/search-close behavior              | Search has two states: collapsed label and expanded input.                     |
| Advanced filters            | Advanced toggle in `GalleryHeader`                                                   | Opens advanced panel with model select and liked toggle; advanced active state is reflected in button styling  | Advanced is a low-frequency filter area, not a separate route.                 |
| Clear filters               | `GalleryHeader.clearAll`                                                             | Clears search/model/type/time/liked/published while preserving current sort and project id                     | Project id is intentionally preserved.                                         |
| Load more                   | Feed load-more button calls `useGallery.loadMore`                                    | Appends next page, shows loading spinner, and dedupes by generation id                                         | Infinite-scroll is not used; pagination is explicit.                           |
| Progressive grid rendering  | `GalleryGrid` increases `visibleCount` in batches                                    | Renders more items progressively and marks near-viewport indexes eager                                         | Redesign should preserve perceived-load behavior for large feeds.              |
| Spatial keyboard navigation | `GalleryGrid` listens for arrow keys on `role="feed"`                                | Finds the nearest visible card by DOM rect and moves focus spatially                                           | This is a notable accessibility feature; screenshots alone will not verify it. |
| Card detail open            | `ImageCard` primary media click                                                      | Opens `ImageDetailModal` and stores transition origin after first open                                         | Detail modal behavior differs from the route detail page.                      |
| Card like                   | `ImageCard.handleLike`                                                               | Optimistically toggles liked state and count, prevents concurrent duplicate like requests, rolls back on error | Public feed interaction depends on authenticated like API behavior.            |
| Card prompt actions         | Prompt overlay buttons                                                               | Copy prompt writes clipboard/toast; use-in-Studio stores prompt in sessionStorage and routes by output type    | Prompt actions only appear when prompt text is available/public.               |
| Card download               | `ImageCard.handleDownload`                                                           | Shows downloading state; uses remote download helper and fallback error toast                                  | Download behavior is per-card and per-detail.                                  |
| Creator attribution         | Creator link/button inside card                                                      | Stops card click propagation and routes to creator profile                                                     | Attribution must not accidentally open the image detail.                       |
| Route detail actions        | `/gallery/[id]` action buttons                                                       | Back to gallery, download/open original, edit image in Studio for image outputs                                | Route detail respects public-only generation access.                           |
| Reference preview           | `ImageDetailModal` reference image button                                            | Opens full reference overlay with manual close                                                                 | Reference preview is modal-like but separate from normal detail content.       |
| Prompt redaction            | Detail route and cards inspect prompt visibility                                     | Shows lock/private hints when prompt is not public                                                             | Prompt privacy must remain visually distinct from asset visibility.            |

## Responsive

Known source facts:

- feed uses responsive container padding and masonry columns.
- detail media caps height at `70svh`.
- no fresh mobile/tablet screenshot pass was run for this page document.

## Empty / Loading / Error States

Current empty state:

- `GalleryGrid` renders dashed rounded panel, `Sparkles` icon, title,
  description, and optional CTA to Studio.

Current error/loading:

- route-level loading/error exist;
- feed client error appears below grid;
- load-more button can show spinner.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- feed desktop 1440 and mobile 390;
- feed empty state;
- feed filtered/search-empty state;
- detail image and detail video;
- route loading/error states;
- prompt public vs prompt redacted detail.

## i18n / Accessibility

- Feed metadata uses `Metadata.gallery`.
- Feed and card copy use Gallery-related namespaces.
- `GalleryGrid` uses `role="feed"` and keyboard spatial navigation.
- Detail JSON-LD escapes hostile inline-script sequences.

## Do Not Break

- Public-only visibility for Gallery detail.
- Prompt redaction when `isPromptPublic` is false.
- Public feed query/cache behavior.
- Like state and creator attribution behavior.
- Gallery/Assets shared listing primitives.

## Unresolved

- Should public feed and detail share the same visual language?
- Should gallery empty state be creator-onboarding or community-empty?
- Which filter states need screenshot coverage before redesign?

## Source Of Truth

- `docs/domains/gallery.md`
- `src/app/[locale]/(main)/gallery/page.tsx`
- `src/app/[locale]/(main)/gallery/[id]/page.tsx`
- `src/app/[locale]/(main)/gallery/loading.tsx`
- `src/app/[locale]/(main)/gallery/error.tsx`
- `src/components/business/GalleryFeed.tsx`
- `src/components/business/GalleryGrid.tsx`
- `src/components/business/GalleryHeader.tsx`
- `src/components/business/gallery/GalleryAdvancedFilters.tsx`
- `src/components/business/ImageCard.tsx`
- `src/components/business/GalleryDetailVideoPlayer.tsx`
- `src/services/generation.service.ts`
- `src/hooks/use-gallery.ts`
- `src/lib/api-client/gallery.ts`

## Last Verified

- Date: 2026-06-02
- Method: documentation review and code inspection of Gallery domain, feed,
  detail, loading/error, and source files listed above.
