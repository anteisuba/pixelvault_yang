# Assets Page

Last updated: 2026-06-02

This document records current page-level facts for Assets. It is not a redesign
spec and not a request to change UI code.

## Current

### Route Surface

| Surface | Route     | Current UI entry   | Notes                                      |
| ------- | --------- | ------------------ | ------------------------------------------ |
| Assets  | `/assets` | `KreaAssetBrowser` | signed-in private asset management surface |

`/assets` is locale-prefixed through the main app shell. It reads search params,
validates them with `AssetsPageSearchSchema`, and uses user-scoped generation
data when signed in.

### Structure

Current signed-in structure:

- route page
  - validates filters from search params
  - resolves Clerk user and DB user
  - optionally fetches selected `generationId`
  - fetches initial generation page with `getPublicGenerationPage({ userId })`
  - renders `KreaAssetBrowser`

Current signed-out structure:

- full-height blurred asset grid preview
- disabled right-sidebar preview
- centered glass CTA panel with sign-in and Studio links

## Current State Matrix

| State      | Current fact                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Loading    | route `assets/loading.tsx`; component grid/upload/detail loading states                         |
| Error      | upload/bulk/detail errors mostly surface through toast; no route-level `assets/error.tsx` found |
| Empty      | `KreaAssetBrowser.EmptyState` when not loading and `generations.length === 0`                   |
| Signed-out | route page renders blurred preview and centered sign-in CTA                                     |
| Signed-in  | private asset browser with folders, filters, grid, upload, bulk actions, and detail sheet       |
| No credits | not page-owned                                                                                  |

## Page CSS / Layout Rules

Current CSS facts:

- route signed-out shell uses `h-[calc(100svh-3rem)]`, `bg-background`, and
  direct Tailwind/shadcn primitives.
- `KreaAssetBrowser` also uses `h-[calc(100svh-3rem)]` as its main shell.
- no broad `assets-*` CSS class family was found.
- page uses `bg-background`, `bg-card`, `border-border`, `text-muted-*`, and
  direct utility classes.
- small labels use `text-[10px]` in signed-out sidebar preview.

## Components

| Area         | Components                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| page         | `src/app/[locale]/(main)/assets/page.tsx`, `assets/loading.tsx`                |
| browser      | `KreaAssetBrowser`                                                             |
| detail       | `AssetDetailSheet`                                                             |
| projects     | `ProjectCreateDialog`, `ProjectChipFilter`, project/folder tree inside browser |
| shared media | `ImageCard`, `MediaCardTile`, generation media helpers                         |

## Interaction Details

Current page-internal interaction matrix:

| Interaction                  | Current trigger / owner                                                                   | Current state / feedback                                                                                                       | Design notes                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Initial filters              | Route page validates URL search params and passes initial filters into `KreaAssetBrowser` | `useGallery` receives the initial filter set; default view falls back to image when no active filter/deeplink is present       | URL/state coupling must stay visible when redesigning filters.                   |
| Section navigation           | Desktop sidebar, mobile rail, and mobile section picker call `setSection`                 | Switches all/favorites/published/uploads/unassigned/project folders; some sections prefetch on hover/focus-like intent         | Desktop and mobile section controls should remain equivalent.                    |
| Media type filter            | `MediaTypeToggle` calls `setMediaTypeFilter`                                              | Filters image/video/audio/model_3d and updates query-backed gallery state                                                      | Media type is separate from folder/section state.                                |
| Density toggle               | `DensityToggle` changes normal/compact density                                            | Persists preference in `localStorage` through `DENSITY_STORAGE_KEY`                                                            | Any visual redesign should decide whether density remains a user setting.        |
| Upload from Local assets     | Upload button and hidden file input in uploads section                                    | Validates accepted types, may compress images, shows uploading state, toasts success/failure, refreshes list/counts            | Upload is section-specific today; paste-to-upload is also restricted to uploads. |
| Paste-to-upload              | Window paste listener when viewing uploads and not typing in a field                      | Extracts pasted image file, uploads, and avoids intercepting normal input/rename fields                                        | Keyboard paste behavior is useful but needs mobile/browser QA.                   |
| Tile primary click           | Tile click in normal browser mode                                                         | Opens `AssetDetailSheet` and stores origin rect for transition context                                                         | Picker mode and selection mode deliberately override this behavior.              |
| Picker mode tile click       | `AssetSelectorDialog` mounts browser with picker props                                    | Single-select calls `onSelect`; multi-select toggles selected ids and hides bulk action bars                                   | Picker behavior must not expose private asset-management bulk controls.          |
| Selection mode               | Toolbar select button, tile context menu, or picker multi-select                          | Maintains `selectedIds`; shows bottom action bar; supports select all visible and clear selection                              | Selection mode changes tile semantics from open-detail to select.                |
| Bulk delete/publish/favorite | Bottom action bar buttons open shared `AlertDialog` confirmation                          | Performs batch API actions; updates local list/counts; clears selection or removes hidden items from current section           | Confirmation copy and destructive affordance need screenshots.                   |
| Bulk move                    | Bottom action bar project dropdown                                                        | Moves selected assets to unassigned or a project; removes assets from current list when section no longer matches              | Move feedback is mostly list mutation and toast; no separate undo path found.    |
| Folder/project create        | `ProjectCreateDialog` from desktop sidebar or mobile surfaces                             | Refreshes projects/counts and selects the new project section                                                                  | Project creation is integrated into Assets, not a separate settings page.        |
| Folder rename                | Inline project rename form in sidebar tree                                                | Uses editing/renaming ids, submit/cancel controls, and refreshes project data                                                  | Rename form must preserve keyboard access inside the sidebar tree.               |
| Folder delete                | Sidebar delete action opens shared confirmation flow                                      | Deletes folder, refreshes counts/projects, and returns to all assets if current folder is deleted                              | Folder delete shares confirmation machinery with bulk asset actions.             |
| Detail sheet actions         | `AssetDetailSheet` buttons                                                                | Remix routes to Studio, move/delete/publish/favorite/download/open original/save prompt template; each has local pending state | Detail actions are the main single-asset management surface.                     |
| Publish scope sheet          | Detail publish button opens nested Sheet                                                  | Chooses private, asset-only, or asset+prompt visibility; prevents closing while publishing                                     | Prompt privacy and asset visibility must remain separate.                        |
| Audio preview fallback       | Audio preview image errors are tracked per URL                                            | Failed preview URLs are recorded so alternate preview candidates can be tried                                                  | This is a media-resilience interaction, not just visual polish.                  |

## Responsive

Known source facts:

- signed-out right sidebar preview is hidden below `lg`.
- main browser height is tied to `100svh - 3rem`.
- component uses dense grid/sidebar layout that still needs real mobile QA.

No fresh 375 / 390 / 430 / 768 / 1024 / 1440 screenshot pass was run for this
page document.

## Empty / Loading / Error States

Current empty state:

- `KreaAssetBrowser.EmptyState` shows centered icon, title, description, and CTA
  to Image Studio.

Current loading/error:

- route-level loading exists;
- upload shows local loading state;
- grid/list requests use `useGallery` loading/error state;
- many destructive or async failures are toast-based.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- signed-out `/assets` desktop and mobile;
- signed-in non-empty grid;
- signed-in empty grid;
- selected asset detail sheet;
- project/folder sidebar;
- upload loading;
- 390 and 768 layout checks.

## i18n / Accessibility

- Route metadata uses `Metadata.assets`.
- Page/browser copy uses `AssetsPage`.
- Signed-out CTA and browser controls use translated text.
- Bulk operations, buttons, detail sheet, and folder tree need keyboard/screen
  reader QA before redesign.

## Do Not Break

- Auth boundary: private assets must remain user-scoped.
- `generationId` deeplink behavior.
- Project/folder ownership boundaries.
- Batch delete/publish/favorite/move behavior.
- Asset detail actions.
- Shared Gallery/Assets listing primitives.

## Unresolved

- Should Assets keep the Krea-style dense browser, or become quieter and more
  file-manager-like?
- Should empty, signed-out, and search-empty states share one visual language?
- Which asset-management interactions need canonical screenshots first?

## Source Of Truth

- `docs/domains/projects.md`
- `docs/domains/gallery.md`
- `src/app/[locale]/(main)/assets/page.tsx`
- `src/app/[locale]/(main)/assets/loading.tsx`
- `src/components/business/KreaAssetBrowser.tsx`
- `src/components/business/AssetDetailSheet.tsx`
- `src/components/business/ProjectCreateDialog.tsx`
- `src/components/business/ProjectChipFilter.tsx`
- `src/hooks/use-gallery.ts`
- `src/hooks/use-projects.ts`
- `src/lib/api-client/gallery.ts`
- `src/lib/api-client/projects.ts`
- `src/services/generation.service.ts`
- `src/services/project.service.ts`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

## Last Verified

- Date: 2026-06-02
- Method: documentation review and code inspection of the route, loading file,
  asset browser, project docs, gallery docs, and source files listed above.
