# Current UI Inventory

Last updated: 2026-06-02

This file records the current UI structure as a factual inventory.
It does not define the future design direction, visual taste, page redesign plan,
or final design-system rules.

## Purpose

Use this file to understand the current UI surface before writing more detailed
design docs.

This inventory should answer:

- which routes and page surfaces exist,
- which layout shells are currently shared,
- where CSS and design tokens live,
- which component groups already exist,
- which screenshots are available as current-state evidence,
- and which areas need source inspection before any design direction is decided.

## Global UI Surface

Current route structure uses Next.js App Router with locale-prefixed routes
under `src/app/[locale]`.

Current locales are represented by message files:

- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

Current main user-facing surfaces include:

- marketing / home,
- auth pages,
- main app shell,
- Studio workspace,
- Studio edit tools,
- Studio Node workflow,
- Studio LoRA,
- Studio 3D,
- Assets,
- Gallery feed and detail,
- Profile,
- Cards,
- Prompts,
- Arena,
- Storyboard.

## Route / Page Inventory

Current inspected route facts:

- `src/app/[locale]` contains 34 `page.tsx` files.
- `src/app/[locale]` contains 8 `layout.tsx` files.
- `src/app/page.tsx` also exists outside the locale segment.
- Reusable route constants live in `src/constants/routes.ts`.
- Public route handling and locale middleware live in `src/proxy.ts`.
- In development, `src/proxy.ts` does not force `auth.protect()` for main routes,
  but individual pages can still render signed-out states through `auth()`.

Current page entries inspected:

| Surface                  | Route entry                                                                                          | Primary UI entry                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Home                     | `src/app/[locale]/page.tsx`                                                                          | `HomepageShell`                                                                           |
| Main app shell           | `src/app/[locale]/(main)/layout.tsx`                                                                 | `AppSidebar`, `MobileCollapsedRail`, `MobileHeader`, `MobileTabBar`                       |
| Assets                   | `src/app/[locale]/(main)/assets/page.tsx`                                                            | `KreaAssetBrowser`                                                                        |
| Gallery feed             | `src/app/[locale]/(main)/gallery/page.tsx`                                                           | `GalleryFeed`                                                                             |
| Gallery detail           | `src/app/[locale]/(main)/gallery/[id]/page.tsx`                                                      | `GalleryDetailVideoPlayer`, page-local detail layout                                      |
| Profile                  | `src/app/[locale]/(main)/u/[username]/page.tsx`                                                      | `CreatorProfileView`, `PrivateProfileView`                                                |
| Cards                    | `src/app/[locale]/(main)/cards/page.tsx`                                                             | `CardsPageContent`                                                                        |
| Prompts                  | `src/app/[locale]/(main)/prompts/page.tsx`                                                           | `PromptTemplateCreatePanel`, `PromptTemplateList`, `InspirationGrid`, `PromptLibraryTabs` |
| Prompt detail            | `src/app/[locale]/(main)/prompts/[id]/page.tsx`                                                      | `PromptTemplateDetailEditor`                                                              |
| Arena                    | `src/app/[locale]/(main)/arena/page.tsx`                                                             | `ArenaPageClient`                                                                         |
| Arena history            | `src/app/[locale]/(main)/arena/history/page.tsx`                                                     | `ArenaHistory`, `ArenaPersonalStats`                                                      |
| Arena leaderboard        | `src/app/[locale]/(main)/arena/leaderboard/page.tsx`                                                 | `ArenaLeaderboard`                                                                        |
| Storyboard               | `src/app/[locale]/(main)/storyboard/page.tsx`                                                        | `AssetSelectorDialog`, `StoryCard`                                                        |
| Storyboard detail        | `src/app/[locale]/(main)/storyboard/[id]/page.tsx`                                                   | `StoryScrollRenderer`, `StoryComicRenderer`, `StoryImagePicker`, `StoryExportButton`      |
| Studio base              | `src/app/[locale]/(main)/studio/page.tsx`                                                            | route-level redirect / entry behavior must be inspected before page design                |
| Studio image             | `src/app/[locale]/(main)/studio/(workspace)/image/page.tsx`                                          | `StudioModeSync`                                                                          |
| Studio video             | `src/app/[locale]/(main)/studio/(workspace)/video/page.tsx`                                          | `StudioModeSync`                                                                          |
| Studio audio             | `src/app/[locale]/(main)/studio/(workspace)/audio/page.tsx`                                          | `StudioModeSync`                                                                          |
| Studio 3D                | `src/app/[locale]/(main)/studio/3d/page.tsx`                                                         | `Studio3DWorkspace`                                                                       |
| Studio Node              | `src/app/[locale]/(main)/studio/node/page.tsx`                                                       | `StudioNodeWorkbench`                                                                     |
| Studio LoRA              | `src/app/[locale]/(main)/studio/lora/page.tsx`                                                       | `LoraWorkbench`                                                                           |
| Studio edit overview     | `src/app/[locale]/(main)/studio/edit/page.tsx`                                                       | `EditTaskGrid`                                                                            |
| Studio edit tasks        | `src/app/[locale]/(main)/studio/edit/*/page.tsx`                                                     | task components or `EditTaskPlaceholder`                                                  |
| Studio enhance / analyze | `src/app/[locale]/(main)/studio/enhance/page.tsx`, `src/app/[locale]/(main)/studio/analyze/page.tsx` | `ToolPlaceholder`                                                                         |

## Domain Docs Checked

Domain docs read for this inventory pass:

- `docs/domains/studio.md`
- `docs/domains/gallery.md`
- `docs/domains/profile.md`
- `docs/domains/cards.md`
- `docs/domains/projects.md`
- `docs/domains/node-workflow.md`
- `docs/domains/api-keys.md`

Domain facts that affect future UI design docs:

- Studio is the creation workspace, not the full asset-management system.
- Assets is the private saved-asset and project/folder management surface.
- Gallery is the public feed and public detail surface.
- Profile is creator identity and public creator homepage, not private asset management.
- Cards is a reusable creation-context layer for character/style/background cards.
- Node workflow is a Studio advanced canvas workspace, not a normal image/video/audio mode.
- API Keys owns BYOK lifecycle and selection intent; final key resolution stays server-side.

## Current Page Structure

Current structural observations from route and component source:

- Home:
  - route entry is `src/app/[locale]/page.tsx`;
  - primary shell is `HomepageShell`;
  - page-specific CSS is in `src/app/homepage.css`.
- Gallery:
  - server page validates `GallerySearchSchema`;
  - server page fetches initial public data through `getPublicGenerationPage`;
  - client structure is `GalleryFeed -> GalleryHeader -> GalleryGrid`;
  - cards are rendered through `ImageCard`.
- Assets:
  - server page has a signed-out preview/CTA state;
  - signed-in structure uses `KreaAssetBrowser`;
  - `KreaAssetBrowser` owns search, section filters, project/folder tree, density, upload, bulk actions, detail sheet, picker mode, and media-type lock behavior.
- Cards:
  - signed-out state renders an editorial sign-in panel;
  - signed-in structure is `CardsPageContent`;
  - card tabs are `characters`, `styles`, and `backgrounds`;
  - `CardRecipe` has services/API but no peer page tab in current `/cards`.
- Prompts:
  - server page validates create-prefill query params;
  - tabs are `mine` and `inspiration`;
  - signed-out `mine` tab renders a prompt-library empty/sign-in-adjacent panel.
- Studio image/video/audio:
  - `/studio` redirects to `/studio/image`;
  - visible workspace is mounted by `(workspace)/layout.tsx`, not the individual page files;
  - `StudioWorkspaceUI` renders `StudioCanvas`, `StudioBottomDock`, `StudioFlowLayout`, `StudioCommandPalette`, and onboarding;
  - individual pages only render `StudioModeSync`.
- Studio edit:
  - shared shell is `EditWorkspaceShell`;
  - overview uses `EditTaskGrid`;
  - task routes render task-specific pages or `EditTaskPlaceholder`.
- Studio Node:
  - `StudioNodeWorkbench` owns the React Flow canvas shell;
  - it includes top bar, bottom dock, mini map, add menu, assistant dock, project dialogs, and node registry.
- Studio LoRA:
  - route entry renders `LoraWorkbench`;
  - top-level Studio layout also exposes `ActiveLoraBar`.
- Studio 3D:
  - route entry renders `Studio3DWorkspace`;
  - it includes source image selection, model/parameter controls, multi-view generation, 3D generation, model preview, and setup/help surfaces.
- Arena:
  - route entry renders `ArenaPageClient`;
  - additional history and leaderboard pages exist under `/arena`.
- Storyboard:
  - route entry owns story creation list state;
  - detail route owns story rendering, image picker, and export action.

## Layout Shell Inventory

Current layout shells:

- `src/app/[locale]/layout.tsx`
  - owns locale validation, Clerk provider, metadata, and marketing/auth message bundle.
- `src/app/[locale]/(main)/layout.tsx`
  - owns the main app chrome.
  - wraps children with the full `NextIntlClientProvider` message bundle.
  - renders `AppSidebar`, `MobileCollapsedRail`, `MobileHeader`, `SidebarInset`, `MobileTabBar`, and `Toaster`.
  - applies mobile offsets through `SidebarInset` classes: `pt-11 pb-12 pl-11 md:pt-0 md:pb-0 md:pl-0`.
- `src/app/[locale]/(main)/studio/layout.tsx`
  - wraps all Studio routes in `LoraStackProvider`.
  - renders `ActiveLoraBar` above Studio children.
- `src/app/[locale]/(main)/studio/(workspace)/layout.tsx`
  - wraps Studio image/video/audio in `StudioProvider`.
  - renders `StudioWorkspaceUI` once so image/video/audio route switches do not remount the shared workspace shell.
- `src/app/[locale]/(main)/studio/edit/layout.tsx`
  - wraps Studio edit pages in `EditWorkspaceShell`.
- `src/app/[locale]/(main)/arena/layout.tsx`
  - arena-specific layout exists and must be inspected before arena page design.
- `src/app/[locale]/(main)/arena/leaderboard/layout.tsx`
  - leaderboard-specific layout exists and must be inspected before leaderboard design.
- `src/app/[locale]/(main)/storyboard/layout.tsx`
  - storyboard-specific layout exists and must be inspected before storyboard design.

## CSS / Token Inventory

Current CSS entry files:

- `src/app/globals.css` has 1185 lines.
- `src/app/homepage.css` has 1302 lines.

Current global styling stack in `src/app/globals.css`:

- imports Tailwind CSS,
- imports `tw-animate-css`,
- imports `shadcn/tailwind.css`,
- imports `@xyflow/react/dist/style.css`,
- defines Tailwind 4 inline theme tokens,
- defines light and dark CSS variables,
- defines locale-specific font variables for Japanese and Chinese,
- defines base body and selection styling,
- defines an editorial page component layer,
- defines Studio generation/reveal animation classes,
- defines a global reduced-motion rule.

Current token groups visible in `src/app/globals.css`:

- app fonts: `--font-app-sans`, `--font-app-display`, `--font-app-serif`, `--font-hero`,
- radius scale: `--radius`, `--radius-sm` through `--radius-4xl`,
- content widths: `--max-width-content`, `--max-width-gallery`,
- Studio widths: `--width-studio-left`, `--width-studio-right`, `--width-studio-sidebar`,
- shadcn color tokens: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`,
- sidebar tokens: `--sidebar`, `--sidebar-foreground`, `--sidebar-border`, `--sidebar-accent`, and related values,
- app surface tokens: `--surface-elevated`, `--surface-soft`, `--surface-highlight`, `--page-border`,
- Node workflow tokens: `--node-canvas`, `--node-panel`, `--node-panel-inner`, `--node-panel-soft`, `--node-foreground`, `--node-muted`, `--node-subtle`, `--node-amber`, `--node-danger`, `--node-success`, `--node-lipsync`, `--node-shadow`.

Current homepage styling:

- `src/app/homepage.css` is a separate homepage-specific stylesheet.
- It defines homepage-specific variables, header, buttons, hero, feature bands, capability sections, model lineup, showcase rail, bottom CTA, footer, and responsive rules.
- It includes reduced-motion handling for homepage animations.

Current CSS structure observations:

- `globals.css` includes global tokens and multiple component-like class systems,
  including `.editorial-*`, `.studio-*`, command palette styles, and Studio generation animations.
- `homepage.css` is large enough to be treated as its own page-level styling system.
- Node workflow uses dedicated `--node-*` tokens plus React Flow stylesheet import.
- Assets and Cards use dark `bg-sidebar` / `text-sidebar-foreground` surfaces.
- Studio image/video/audio use dark canvas/workspace surfaces with a light prompt dock.
- Route-level loading/error states use a mix of `editorial-*`, hand-written skeletons, and page-specific dark skeletons.
- Current code contains some Tailwind arbitrary values. Many are structural or viewport-related,
  such as `h-[calc(...)]`, `max-h-[85vh]`, `w-[min(...)]`, `text-[10px]`,
  and media modal max-height rules. Their final acceptability belongs in
  `css-and-tokens.md`, not this inventory.

## Component Inventory

Current component counts from code inspection:

- `src/components/ui`: 55 TypeScript / TSX files.
- `src/components/layout`: 5 TypeScript / TSX files.
- `src/components/business`: 266 TypeScript / TSX files.

Current `src/components/layout` files:

- `AppSidebar.tsx`
- `LocaleSwitcher.tsx`
- `LocaleSwitcher.test.tsx`
- `MainProviders.tsx`
- `MobileTabBar.tsx`

Current `src/components/ui` includes primitives for:

- buttons, inputs, textareas, labels,
- dialogs, drawers, sheets, popovers, dropdown menus, tooltips,
- tabs, toggle groups, switches, sliders, selectors,
- cards, badges, avatars, separators,
- skeletons, progress, alerts, confirm dialogs,
- optimized images, image compare, image drop zone,
- audio player, markdown, code block, tree view,
- sidebar, command, sonner, responsive dialog,
- animation helpers such as blur fade, hyper text, number ticker, particles, pulsating button, animated collapse.

Current `src/components/business` groupings include:

- home components,
- gallery components,
- assets / media components,
- image card components,
- profile components,
- cards components,
- prompts components,
- Studio workspace components,
- Studio shared chrome / picker / workflow components,
- Studio edit components,
- Studio LoRA components,
- Studio 3D component,
- Node workflow components, inspectors, and node views,
- arena components,
- storyboard components,
- API key components.

## Interaction Shell Inventory

Current interaction shells and controls observed from source:

- Main app navigation:
  - desktop sidebar is `AppSidebar`;
  - mobile uses `MobileCollapsedRail`, `MobileHeader`, and `MobileTabBar`;
  - sidebar state is controlled through `SidebarProvider` and cookie-backed default state.
- Home:
  - has language switching, login/signup CTA, gallery CTA, showcase rail, media cards, and homepage reveal/motion components.
- Gallery:
  - has search, sort, media type, time range, advanced filters, progressive grid rendering, load more, and empty-state Studio handoff.
- Assets:
  - has search, density, section filters, project folder tree, upload, picker mode, detail sheet, batch delete/publish/favorite/project move, and asset-type filtering.
- Studio workspace:
  - has route-to-mode sync, model picker, prompt input, generation action, panels, references, transform/card/LoRA controls, command palette, onboarding, and result feedback.
- Studio edit:
  - has source selection, paste/upload/asset picker, pinned source/result area, task grid, and task-specific editors.
- Studio Node:
  - has canvas pan/zoom, add menu, connectable nodes, top bar, bottom dock, mini map, assistant dock, project dialog, delete confirmation, and node inspectors.
- Studio 3D:
  - has source selection, quick setup, model picker, parameter groups, generated side views, manual side-view uploads, model preview, and lightbox.
- Cards:
  - has tabbed managers, create forms, sorting/search, detail dialogs, selection state, and card-specific editors.
- Prompts:
  - has prompt-library tabs, create panel, inspiration grid, detail editor, and empty states.
- Arena and Storyboard:
  - have page-specific client flows and route-level loading/error shells.

## Loading / Error / Empty Inventory

Current route-level loading/error files found under `(main)`:

- `assets/loading.tsx`
- `gallery/loading.tsx`
- `gallery/error.tsx`
- `studio/loading.tsx`
- `studio/error.tsx`
- `storyboard/loading.tsx`
- `storyboard/error.tsx`
- `arena/loading.tsx`
- `arena/error.tsx`
- `arena/history/loading.tsx`
- `arena/leaderboard/loading.tsx`
- `u/[username]/loading.tsx`
- `u/[username]/error.tsx`
- `(main)/error.tsx`

Current state facts:

- Error pages mostly share the same `ErrorBoundary` namespace and editorial centered layout.
- Gallery loading uses a hand-written masonry/grid skeleton instead of the shared `Skeleton` component.
- Assets loading uses a dark asset-browser skeleton that mirrors `KreaAssetBrowser`.
- Studio loading uses a workspace-shaped skeleton with left rail and canvas/dock areas.
- Profile, Arena, Storyboard, and Arena subpages use `Skeleton`.
- Empty states are mostly inside business components, not route files:
  - `GalleryFeed` / `GalleryGrid` own public feed empty action back to Studio;
  - Assets has signed-out preview and Krea browser empty/list states;
  - Cards signed-out state lives in route page and signed-in empty/search states live in managers;
  - Prompts has signed-out and zero-template empty states;
  - Storyboard has inline loading/empty/list states in the page;
  - Node workflow uses first-node guide/help surfaces in the workbench.

## i18n Inventory

Current i18n facts:

- `src/messages/en.json`, `src/messages/ja.json`, and `src/messages/zh.json` each contain 80 top-level namespaces.
- Top-level namespace sets are currently aligned across the three locale files.
- `src/app/[locale]/layout.tsx` provides the marketing/auth message subset.
- `src/app/[locale]/(main)/layout.tsx` re-wraps with the full message bundle for main app client components.
- The main UI code broadly uses `useTranslations()` and `getTranslations()`.

Current namespace groups include:

- global: `Common`, `Metadata`, `Navbar`, `LocaleSwitcher`, `Toasts`, `Errors`, `ErrorBoundary`, `GlobalError`;
- home: `Homepage`;
- Studio: `StudioPage`, `StudioForm`, `StudioTools`, `StudioV2`, `StudioV3`, `StudioPanels`, `StudioToolbar`, `StudioPromptArea`, `StudioCommandPalette`, `StudioImageEdit`, `StudioResultFeedback`, `StudioImageAdvancedParams`, `StudioKeepChangePanel`;
- media generation: `VideoGenerate`, `Model3DGenerate`, `MultiViewGenerate`, `LongVideo`, `AudioPlayer`, `AudioTranscribe`;
- domains: `GalleryPage`, `AssetsPage`, `PromptLibrary`, `StoryBoard`, `ArenaPage`, `ArenaLeaderboard`, `ArenaHistory`, `ArenaPersonalStats`, `CreatorProfile`, `Projects`;
- cards and style assets: `CharacterCard`, `BackgroundCard`, `StyleCard`, `CardRecipe`, `CardSlot`, `Cardify`;
- Node workflow: `StudioNode`, `workflows`, `sceneFeedback`, `sceneProgress`;
- LoRA/training: `LoraStack`, `LoraPromptControl`, `LoraWorkbench`, `LoraTraining`, `UseLoraButton`.

Potential hardcoded user-facing strings found during this pass:

- `src/components/business/cards/StyleCardEditor.tsx`: `placeholder="LoRA URL (Civitai / HuggingFace)"`.
- `src/components/business/cards/SimpleCardManager.tsx`: `placeholder="https://civitai.com/api/download/models/..."`.
- `src/components/business/studio/lora/LoraWorkbench.tsx`: `aria-label="clear"`.
- `src/components/business/Studio3DWorkspace.tsx`: technical placeholders `auto`, `W`, `H`, `L`.
- `src/components/ui/dialog.tsx`: fallback visible text `Close`.
- `src/components/ui/sheet.tsx`: fallback sr-only text `Close`.
- `src/components/ui/sidebar.tsx`: fallback text/labels `Sidebar`, `Displays the mobile sidebar.`, `Toggle Sidebar`.

These are inventory findings only. Whether to rewrite them or keep them as
primitive fallbacks belongs in `i18n-accessibility.md` or page-specific docs.

## Screenshot Inventory

Current checked screenshots:

- `docs/screenshots/home.png`
- `docs/screenshots/studio-image.png`
- `docs/screenshots/studio-video.png`
- `docs/screenshots/studio-audio.png`
- `docs/screenshots/studio-node.png`
- `docs/screenshots/studio-3d.png`

Current inventory screenshot set:

Runtime screenshots from `http://localhost:3000/en` and related routes are
stored under `docs/screenshots/current-ui-inventory/`.

| Surface      | Desktop 1440                                                                                  | Mobile 390                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Home         | ![Home desktop](../../screenshots/current-ui-inventory/home-desktop-1440.png)                 | ![Home mobile](../../screenshots/current-ui-inventory/home-mobile-390.png)                 |
| Gallery      | ![Gallery desktop](../../screenshots/current-ui-inventory/gallery-desktop-1440.png)           | ![Gallery mobile](../../screenshots/current-ui-inventory/gallery-mobile-390.png)           |
| Assets       | ![Assets desktop](../../screenshots/current-ui-inventory/assets-desktop-1440.png)             | ![Assets mobile](../../screenshots/current-ui-inventory/assets-mobile-390.png)             |
| Cards        | ![Cards desktop](../../screenshots/current-ui-inventory/cards-desktop-1440.png)               | ![Cards mobile](../../screenshots/current-ui-inventory/cards-mobile-390.png)               |
| Prompts      | ![Prompts desktop](../../screenshots/current-ui-inventory/prompts-desktop-1440.png)           | ![Prompts mobile](../../screenshots/current-ui-inventory/prompts-mobile-390.png)           |
| Studio image | ![Studio image desktop](../../screenshots/current-ui-inventory/studio-image-desktop-1440.png) | ![Studio image mobile](../../screenshots/current-ui-inventory/studio-image-mobile-390.png) |
| Studio video | ![Studio video desktop](../../screenshots/current-ui-inventory/studio-video-desktop-1440.png) | ![Studio video mobile](../../screenshots/current-ui-inventory/studio-video-mobile-390.png) |
| Studio audio | ![Studio audio desktop](../../screenshots/current-ui-inventory/studio-audio-desktop-1440.png) | ![Studio audio mobile](../../screenshots/current-ui-inventory/studio-audio-mobile-390.png) |
| Studio edit  | ![Studio edit desktop](../../screenshots/current-ui-inventory/studio-edit-desktop-1440.png)   | ![Studio edit mobile](../../screenshots/current-ui-inventory/studio-edit-mobile-390.png)   |
| Studio Node  | ![Studio Node desktop](../../screenshots/current-ui-inventory/studio-node-desktop-1440.png)   | ![Studio Node mobile](../../screenshots/current-ui-inventory/studio-node-mobile-390.png)   |
| Studio LoRA  | ![Studio LoRA desktop](../../screenshots/current-ui-inventory/studio-lora-desktop-1440.png)   | ![Studio LoRA mobile](../../screenshots/current-ui-inventory/studio-lora-mobile-390.png)   |
| Studio 3D    | ![Studio 3D desktop](../../screenshots/current-ui-inventory/studio-3d-desktop-1440.png)       | ![Studio 3D mobile](../../screenshots/current-ui-inventory/studio-3d-mobile-390.png)       |
| Arena        | ![Arena desktop](../../screenshots/current-ui-inventory/arena-desktop-1440.png)               | ![Arena mobile](../../screenshots/current-ui-inventory/arena-mobile-390.png)               |
| Storyboard   | ![Storyboard desktop](../../screenshots/current-ui-inventory/storyboard-desktop-1440.png)     | ![Storyboard mobile](../../screenshots/current-ui-inventory/storyboard-mobile-390.png)     |

Runtime evidence files:

- `docs/screenshots/current-ui-inventory/mobile-390-evidence.json`
- `docs/screenshots/current-ui-inventory/responsive-representative-evidence.json`

Screenshot notes:

- Screenshots were captured in local development mode.
- `src/app/layout.tsx` loads `LocatorSetup` in development, so screenshots can
  show the LocatorJS development overlay. This overlay is not product UI.
- Signed-out pages reflect the current local anonymous runtime state.
- Studio workspace screenshots show the current onboarding tooltip when it is active.
- Runtime mobile 390 evidence reported no horizontal overflow for all 14 captured surfaces.
- Representative responsive checks at 375, 390, 430, 768, 1024, and 1440 reported no horizontal overflow for Home, Gallery, Assets, Cards, Studio image, and Studio Node.

Current screenshot gaps after this pass:

- no runtime screenshot captured for a public profile URL because no known username was selected in this inventory pass.
- no runtime screenshot captured for Gallery detail because no generation ID was selected in this inventory pass.
- no runtime screenshot captured for Prompt detail because no prompt ID was selected in this inventory pass.
- no runtime screenshots captured for Arena history or leaderboard in this inventory pass.
- no runtime screenshots captured for Storyboard detail in this inventory pass.

## Known Structure Facts

These are structural facts only, not design judgments:

- The main app uses a shared sidebar-based shell on desktop.
- The main app has separate mobile rail, mobile header, and mobile bottom tab components.
- Home has its own large stylesheet outside the global component layer.
- Studio image/video/audio share one mounted workspace shell through `StudioWorkspaceUI`.
- Studio edit uses a separate `EditWorkspaceShell`.
- Studio Node workflow uses separate Node canvas/workbench components and separate Node color tokens.
- Studio LoRA and Studio 3D are separate Studio sub-surfaces.
- Many business components already exist by domain; future page design docs should inspect existing components before proposing new ones.
- i18n is already active and all page design docs must account for `en`, `ja`, and `zh`.
- Local development screenshots may include LocatorJS overlay unless the runtime is disabled or hidden for screenshot capture.

## What To Preserve

Current facts that future design docs should preserve unless explicitly changed:

- locale-prefixed route compatibility,
- `src/constants/routes.ts` as the reusable route source,
- the main app shell boundary in `(main)/layout.tsx`,
- Studio image/video/audio shared workspace mounting behavior,
- Studio-wide LoRA bar/provider behavior,
- Studio edit shell boundary,
- existing `components/ui` primitives before creating new UI primitives,
- existing `components/business` domain groupings,
- translation-ready user-facing text through `src/messages/*`,
- reduced-motion support already present in global/home CSS.
- page/domain boundaries documented in `docs/domains/*.md`.
- route-level loading/error boundaries where they already exist.
- signed-out states for private surfaces such as Assets, Cards, and Prompts.

## What Not To Decide Here

This file intentionally does not decide:

- the final visual direction,
- color or typography changes,
- sidebar redesign direction,
- homepage redesign direction,
- Studio workspace redesign direction,
- mobile navigation redesign direction,
- component API changes,
- CSS token cleanup strategy,
- screenshot approval criteria.
- whether current hardcoded primitive fallback text should be translated.
- whether arbitrary Tailwind values should be normalized.
- whether LocatorJS should be disabled for future screenshot capture.

Those decisions belong in later files such as:

- `docs/design/system/css-and-tokens.md`,
- `docs/design/system/layout-shell.md`,
- `docs/design/system/components.md`,
- `docs/design/system/responsive.md`,
- `docs/design/pages/studio.md`,
- and other page-specific design docs.

## Source of Truth

- `docs/README.md`
- `docs/status.md`
- `docs/design/README.md`
- `docs/design/system/README.md`
- `docs/product/scope.md`
- `docs/domains/studio.md`
- `docs/domains/gallery.md`
- `docs/domains/profile.md`
- `docs/domains/cards.md`
- `docs/domains/projects.md`
- `docs/domains/node-workflow.md`
- `docs/domains/api-keys.md`
- `src/constants/routes.ts`
- `src/proxy.ts`
- `src/app/page.tsx`
- `src/app/[locale]/page.tsx`
- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/(main)/layout.tsx`
- `src/app/[locale]/(main)/studio/layout.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/layout.tsx`
- `src/app/[locale]/(main)/studio/edit/layout.tsx`
- `src/app/globals.css`
- `src/app/homepage.css`
- `src/components/layout/`
- `src/components/ui/`
- `src/components/business/`
- `src/messages/`
- `docs/screenshots/`
- `docs/screenshots/current-ui-inventory/`

## Last Verified

- Date: 2026-06-02
- Method: document reading, domain doc reading, route file inspection, component directory inspection, CSS inspection, route constant inspection, proxy inspection, message file inspection, screenshot file inspection, and local Playwright runtime inspection.
- Runtime validation: local `http://localhost:3000` was checked with desktop 1440 screenshots, mobile 390 screenshots, and representative 375/390/430/768/1024/1440 overflow checks.
- Application code validation: not run. This was a documentation and screenshot inventory task and did not change application code.
