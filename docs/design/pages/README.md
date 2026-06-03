# Page Design Structure

Last updated: 2026-06-02

This directory holds page-by-page UI design documents.

Page design docs must be written one at a time after discussion.
Do not create detailed page direction without confirmation.

Current files:

- `home.md`
- `studio.md`
- `assets.md`
- `gallery.md`
- `profile.md`
- `cards.md`
- `node-workflow.md`
- `3d.md`
- `prompts.md`
- `arena.md`
- `storyboard.md`

## Current Page Split Map

This map records the page-level split before detailed page design starts. It is
not a final design direction.

| Page doc           | Current route surface                                                                          | Primary current UI entry                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `home.md`          | `/[locale]`                                                                                    | `HomepageShell`                                                                                    |
| `studio.md`        | `/studio`, `/studio/image`, `/studio/video`, `/studio/audio`, `/studio/edit`, `/studio/edit/*` | `StudioWorkspaceUI`, `StudioModeSync`, `EditWorkspaceShell`, `EditTaskGrid`                        |
| `assets.md`        | `/assets`                                                                                      | `KreaAssetBrowser`                                                                                 |
| `gallery.md`       | `/gallery`, `/gallery/[id]`                                                                    | `GalleryFeed`, gallery detail layout, `GalleryDetailVideoPlayer`                                   |
| `profile.md`       | `/u/[username]`                                                                                | `CreatorProfileView`, `PrivateProfileView`                                                         |
| `cards.md`         | `/cards`                                                                                       | `CardsPageContent`                                                                                 |
| `node-workflow.md` | `/studio/node`                                                                                 | `StudioNodeWorkbench`                                                                              |
| `3d.md`            | `/studio/3d`                                                                                   | `Studio3DWorkspace`                                                                                |
| `prompts.md`       | `/prompts`, `/prompts/[id]`                                                                    | `PromptTemplateCreatePanel`, `PromptTemplateList`, `InspirationGrid`, `PromptTemplateDetailEditor` |
| `arena.md`         | `/arena`, `/arena/history`, `/arena/leaderboard`                                               | `ArenaPageClient`, `ArenaHistory`, `ArenaPersonalStats`, `ArenaLeaderboard`                        |
| `storyboard.md`    | `/storyboard`, `/storyboard/[id]`                                                              | storyboard list page, `StoryScrollRenderer`, `StoryComicRenderer`, `StoryImagePicker`              |

Studio sub-workspaces that are not expanded in `studio.md`:

- `/studio/node` belongs in `node-workflow.md`.
- `/studio/3d` belongs in `3d.md`.
- `/studio/lora` is a Studio advanced capability and should get its own page
  note only after LoRA page direction is discussed.
- `/studio/enhance` and `/studio/analyze` currently render placeholders and
  should not drive the main Studio page design yet.

## Current Page State Matrix

This matrix is an index-level fact map. It marks where states are visible in
source today, not whether the state has passed visual QA.

Legend:

- `route`: route-level `loading.tsx`, `error.tsx`, `notFound()`, or redirect.
- `component`: state is rendered by the page's primary component or hook.
- `none found`: no dedicated page-level state was found in the inspected source.
- `not page-owned`: state belongs to an API/service/component flow, not the page
  shell.

| Page doc           | Loading                                                                               | Error / not found                                               | Empty / no data                                                              | Signed-out                                                                           | Signed-in / success                                             | No credits / quota                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `home.md`          | component auth CTA placeholder while Clerk loads                                      | none found                                                      | not applicable                                                               | component CTA shows Sign in / Sign up                                                | component CTA links to Studio                                   | not page-owned                                                                      |
| `studio.md`        | route `studio/loading.tsx`; component generation/loading states                       | route `studio/error.tsx`; component preview/dialog errors       | component empty preview and edit empty-source states                         | no route-level signed-out page for Image/Video/Audio/Edit found                      | shared workspace, generated result preview, edit result actions | component generation error reason includes `insufficient_credits`; no separate page |
| `assets.md`        | route `assets/loading.tsx`; component grid skeleton/upload loading                    | component toast/error paths; no route `assets/error.tsx` found  | component `EmptyState` in `KreaAssetBrowser`                                 | route page renders blurred browser preview plus sign-in CTA                          | `KreaAssetBrowser` with private assets                          | not page-owned                                                                      |
| `gallery.md`       | route `gallery/loading.tsx`; component load-more state                                | route `gallery/error.tsx`; detail route uses `notFound()`       | component empty grid state in `GalleryFeed` / `GalleryGrid`                  | public page, no sign-in gate                                                         | public feed/detail success states                               | not page-owned                                                                      |
| `profile.md`       | route `u/[username]/loading.tsx`; component loader while client data is missing       | route `u/[username]/error.tsx`; page uses `notFound()`          | component `PolaroidGrid` empty profile state                                 | public/private profile visibility state, not a sign-in gate                          | `CreatorProfileView` or `PrivateProfileView`                    | not page-owned                                                                      |
| `cards.md`         | component card-manager loading states                                                 | component card-manager error/toast paths; no route error found  | component card manager empty/search-empty states                             | route page renders editorial sign-in panel                                           | `CardsPageContent` tabs for characters/styles/backgrounds       | not page-owned                                                                      |
| `node-workflow.md` | component/workflow loading and save/generation pending states                         | component toasts and node-level error states                    | component empty canvas/default workflow state                                | no route-level signed-out page found; hook parks server calls until Clerk loads      | React Flow workbench success state                              | node generation errors; no separate page                                            |
| `3d.md`            | component upload/generation/model preview loading states                              | component toast/error states and wireframe preview error state  | signed-out or no-image state receives empty initial generations              | route passes empty initial generations to `Studio3DWorkspace` when signed out        | `Studio3DWorkspace` with prefetched user image sources          | provider/key/quota prompts are component-owned, not page-owned                      |
| `prompts.md`       | component inspiration/list loading states                                             | detail route uses `notFound()` for signed-out or missing recipe | route `MineTab` empty saved-template state; detail no-generated-assets state | `MineTab` shows editorial empty/open-Studio panel; inspiration tab remains available | create panel, template list, inspiration grid, detail editor    | not page-owned                                                                      |
| `arena.md`         | route loading files for arena/history/leaderboard; component generating-entry loading | route `arena/error.tsx`; component error blocks                 | component personal stats/history/leaderboard empty states                    | no route-level signed-out page found                                                 | battle form, generating, voting, revealed, history, leaderboard | generation/API errors; no separate page                                             |
| `storyboard.md`    | route `storyboard/loading.tsx`; component list/detail loaders                         | route `storyboard/error.tsx`; detail component not-found state  | component list empty, no selected assets, no narrative states                | no route-level signed-out page found                                                 | story list, story detail, comic/scroll render, export           | not page-owned                                                                      |

State-matrix gaps to close during each page doc:

- route loading/error visual screenshots are still not captured for every page;
- signed-out behavior needs real browser checks where the route does not branch
  on `auth()`;
- no-credit / quota states should be verified from the exact generation flow
  before page redesign decisions rely on them.
- page-internal interactions such as model pickers, asset pickers, prompt input,
  upload/paste, tabs, panels, dialogs, and sheets should be expanded inside the
  relevant page file instead of this index.

## Current Empty State Inventory

This is a source-level empty-state inventory. It records where empty UI exists
today, not whether the design is good or complete.

| Surface                      | Empty trigger found in source                                     | Current owner                                 | Current treatment                                                               | Follow-up owner               |
| ---------------------------- | ----------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| Studio Image / Video / Audio | no current generation, not generating, no preview error           | `GenerationPreview` -> `XiaoheiGuideCarousel` | modality-specific guide carousel inside the shared canvas area                  | `studio.md`                   |
| Studio Edit overview         | no source image on `/studio/edit`                                 | `EditWorkspaceShell`                          | compact row with source-copy plus asset and upload actions                      | `studio.md`                   |
| Studio Edit task page        | no source image on `/studio/edit/*`                               | `EditWorkspaceShell`                          | larger source-empty panel with icon, asset picker, upload, and paste helper     | `studio.md`                   |
| Studio Edit placeholder task | task route exists but implementation is not wired                 | `EditTaskPlaceholder`                         | dashed card with construction icon, provider pills, and back-to-grid affordance | `studio.md`                   |
| Gallery feed                 | `generations.length === 0`                                        | `GalleryGrid`                                 | dashed `primary` panel with icon, title, description, optional Studio CTA       | `gallery.md`                  |
| Assets                       | not loading and `generations.length === 0`                        | `KreaAssetBrowser.EmptyState`                 | centered icon/title/description plus CTA to Image Studio                        | `assets.md`                   |
| Creator profile              | `PolaroidGrid` receives `isEmpty`                                 | `PolaroidGrid`                                | centered profile empty state with image icon and Studio CTA                     | `profile.md`                  |
| API Keys sheet/account menu  | no displayed built-in group, or a model group has no saved routes | `ApiKeyManager`                               | dashed `bg-background/60` message blocks using `emptyModel` copy                | `layout-shell.md` or settings |
| Cards                        | manager-level no cards or filtered search empty                   | card manager components                       | component-owned empty/search-empty states; not expanded in this pass            | `cards.md`                    |
| Node workflow                | default/empty canvas or no saved workflow state                   | `StudioNodeWorkbench` and node components     | domain-owned canvas state; not expanded in this pass                            | `node-workflow.md`            |
| 3D                           | signed-out or no-image/no-generation initial state                | `Studio3DWorkspace`                           | component-owned setup/upload/generation empty states; not expanded in this pass | `3d.md`                       |
| Prompts / Arena / Storyboard | saved list, history, selected assets, or narrative data missing   | route-specific page components                | editorial/component empty blocks exist in source; not expanded in this pass     | page-specific docs            |

Empty-state design questions to resolve per page:

- whether the empty state is a first-run onboarding surface or a simple no-data
  state;
- whether the CTA should route to Studio, open a picker, or stay local;
- whether signed-out, signed-in empty, and search-empty should share one visual
  treatment;
- whether the copy lives in the correct i18n namespace and can survive
  `en`/`ja`/`zh` length changes.

## Current Page CSS / Token Usage Map

This is a page-level usage map for the current CSS/token structure. It should be
expanded inside each page doc before proposing a visual direction.

| Page doc           | Current surface language                        | Page-private classes or token families observed                           | Arbitrary / high-risk dependencies observed                                      | Notes                                                                |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `home.md`          | homepage-specific marketing surface             | `homepage-*`, `--home-*`, homepage reveal and feature tone classes        | arbitrary tracking on homepage labels and footer copy                            | page-local CSS; do not promote without a second use case             |
| `studio.md`        | Studio workspace plus shadcn edit bench         | `.studio-layout-v2`, `.studio-canvas`, `.studio-dock`, prompt custom vars | prompt max-height vars, `max-h-[70svh]`, `max-w-[88rem]`, edit grid arbitrary    | Image / Video / Audio share tokens; Edit has no edit-specific family |
| `assets.md`        | shadcn app surface inside main shell            | `bg-background`, `bg-card`, `border-border`, sidebar-like asset nav       | `h-[calc(100svh-3rem)]`, `text-[10px]`, media preview max-height calculations    | asset browser uses direct primitives rather than page token family   |
| `gallery.md`       | gallery width plus editorial/detail surfaces    | `max-w-gallery`, `editorial-count-pill`, `bg-primary/3` empty panel       | `max-h-[70svh]`, media detail object-fit constraints                             | feed grid is component-owned; detail leans on editorial pattern      |
| `profile.md`       | profile/polaroid surface plus shadcn primitives | `max-w-content`, Polaroid component classes, `bg-primary/5` empty state   | Polaroid modal viewport max widths/heights                                       | public profile empty state is component-owned                        |
| `cards.md`         | dark sidebar-colored work surface               | `dark bg-sidebar text-sidebar-foreground`, card manager primitives        | many `text-[10px]`, dialog `max-h-[85vh]`, fixed chip widths                     | cards currently borrow shell/sidebar tokens for page background      |
| `node-workflow.md` | node canvas domain surface                      | `node-*`, `bg-node-*`, `text-node-*`, `shadow-node-panel`                 | `h-[calc(100svh-3rem)]`, grid arbitrary values in node controls                  | valid domain-scoped token family                                     |
| `3d.md`            | shadcn primitives plus dense editor controls    | `bg-background`, `bg-card`, `border-border`, direct Tailwind controls     | many `text-[10px]`/`text-[11px]`, viewport height calculations, max-width values | no broad 3D page token family was found in this pass                 |
| `prompts.md`       | editorial recipe/list surface                   | `editorial-*`, shadcn primitives                                          | route-specific panel/list sizing not expanded here                               | needs page doc before extraction                                     |
| `arena.md`         | editorial competition surface                   | `editorial-*`, shadcn primitives                                          | leaderboard grid arbitrary columns in loading state                              | needs page doc before extraction                                     |
| `storyboard.md`    | editorial/story rendering surface               | `editorial-*`, story renderer/component classes                           | selected asset/render panel sizing not expanded here                             | needs page doc before extraction                                     |

Each page file should cover:

- Current UI
- Current problems
- Future UI target
- Page-specific CSS / layout rules
- Reusable components
- Interaction details
- Responsive behavior
- Empty/loading/error states
- i18n and accessibility
- Do Not Break
- Source of Truth
