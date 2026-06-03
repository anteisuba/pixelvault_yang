# Storyboard Page

Last updated: 2026-06-02

This document records current page-level facts for Storyboard. It is not a
redesign spec and not a request to change UI code.

## Current

### Route Surface

| Surface           | Route              | Current UI entry      | Notes               |
| ----------------- | ------------------ | --------------------- | ------------------- |
| Storyboard list   | `/storyboard`      | storyboard list route | client page         |
| Storyboard detail | `/storyboard/[id]` | story detail route    | editor/render route |

### Structure

List structure:

- editorial hero with create button
- create panel toggle
- title input
- `AssetSelectorDialog` for image assets
- selected asset grid
- create action
- story list loading/empty/grid states

Detail structure:

- loading state
- not-found state
- editorial hero with title, panel count, back, display-mode toggle, visibility
  toggle, export button
- `StoryImagePicker` for panel reorder
- narrative generation / regeneration controls
- `StoryScrollRenderer` or `StoryComicRenderer`
- error block

## Current State Matrix

| State      | Current fact                                                             |
| ---------- | ------------------------------------------------------------------------ |
| Loading    | route `storyboard/loading.tsx`; list and detail component loading states |
| Error      | route `storyboard/error.tsx`; detail component error block               |
| Empty      | list empty, no selected assets, detail no narrative, detail not found    |
| Signed-out | no route-level signed-out page found                                     |
| Signed-in  | story list/create/detail/editor/export flows                             |
| No credits | not page-owned                                                           |

## Page CSS / Layout Rules

Current CSS facts:

- list and detail use `editorial-page`, `editorial-container`,
  `editorial-hero`, and `editorial-panel`.
- create panel uses `bg-card/70`, dashed border, and direct shadcn primitives.
- selected assets use responsive grid and thumbnail square cards.
- no broad `storyboard-*` CSS family was found.

## Components

| Area   | Components                                                           |
| ------ | -------------------------------------------------------------------- |
| list   | `/storyboard/page.tsx`, `StoryCard`, `AssetSelectorDialog`           |
| detail | `/storyboard/[id]/page.tsx`, `StoryImagePicker`, `StoryExportButton` |
| render | `StoryScrollRenderer`, `StoryComicRenderer`                          |
| hooks  | `useStoryList`, `useStoryEditor`                                     |
| states | storyboard loading/error route files                                 |

## Interaction Details

Current page-internal interaction matrix:

| Interaction              | Current trigger / owner                                       | Current state / feedback                                                                                    | Design notes                                                                |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Create panel toggle      | Hero create button in `/storyboard`                           | Toggles `showCreate`; panel appears inline under hero                                                       | List page keeps create flow in the page, not a modal.                       |
| Story title input        | Create panel text input                                       | Updates local `title`; create remains disabled without title                                                | Title is required together with selected assets.                            |
| Asset picker open/select | Create panel select-assets button opens `AssetSelectorDialog` | Picker is locked to image assets; selecting a generation appends it if not already selected                 | Image-only constraint must remain visible.                                  |
| Selected asset removal   | Thumbnail remove buttons                                      | Removes selected generation from local `selectedGenerations`                                                | Removal is local until create submit.                                       |
| Create story             | Create button                                                 | Requires title and selected assets; calls `createStory`; on success resets title/assets and closes panel    | Successful create adds to list through hook state, not a full route reload. |
| Story card delete        | `StoryCard` delete button                                     | Calls `removeStory`, which deletes through API and prunes local story list                                  | No explicit confirmation was found in this pass.                            |
| Detail display mode      | Scroll/comic toggle button                                    | Updates `displayMode` between scroll and comic; swaps renderer component                                    | This is a view mode, not a persisted story update.                          |
| Public/private toggle    | Detail visibility button                                      | Calls `updateStory({ isPublic })` and updates story state                                                   | Visibility update shares the same hook path as other story updates.         |
| Panel reorder            | `StoryImagePicker` drag/drop                                  | Tracks drag/over indexes and calls `reorderPanels` with new panel id order                                  | Drag/drop currently has no separate keyboard reorder path recorded.         |
| Narrative generation     | Tone buttons when story has no narrative                      | Calls `generateNarrative(tone)`, sets generating state, refreshes story on success, stores error on failure | Tone choice is the primary generation control.                              |
| Narrative regeneration   | Compact tone buttons when narrative already exists            | Regenerates narrative with selected tone while keeping existing panels                                      | Regeneration is visually smaller than first-time generation.                |
| Renderer output          | `StoryScrollRenderer` or `StoryComicRenderer`                 | Renders panels and narrative/caption content in chosen layout                                               | Renderer is display-only; edit controls live outside it.                    |
| Export PNG               | `StoryExportButton`                                           | Uses `html2canvas` on exported ref, downloads PNG, shows exporting state and failure toast                  | Export depends on rendered DOM dimensions and needs browser/mobile QA.      |
| Detail error state       | `useStoryEditor.error`                                        | Error block renders after story content                                                                     | Error does not replace the whole detail view.                               |

## Responsive

Known source facts:

- selected asset grid uses responsive columns.
- story list grid uses `sm` and `lg` breakpoints.
- detail controls wrap.
- no fresh mobile/tablet screenshot pass was run for this page document.

## Empty / Loading / Error States

Current empty/loading states:

- list loading spinner;
- list empty with `BookOpen` icon and two text lines;
- create panel no selected assets state;
- detail loading spinner;
- detail not-found state;
- no narrative prompt state;
- detail error block after renderer.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- list empty;
- list with stories;
- create panel empty;
- create panel with selected assets;
- detail loading/not-found;
- detail scroll mode;
- detail comic mode;
- narrative generation controls;
- mobile 390 and tablet 768.

## i18n / Accessibility

- Page copy uses `StoryBoard`.
- Route layout/loading/error files need source review with messages before final
  design.
- Create form, asset picker, reorder controls, visibility toggle, and export
  require keyboard QA before redesign.

## Do Not Break

- Story creation from selected generation ids.
- Asset picker image-only constraint.
- Story detail panel ordering.
- Scroll/comic display mode toggle.
- Public/private toggle.
- Export behavior.

## Unresolved

- Should Storyboard be a lightweight editorial tool or a richer production
  workspace?
- Should list/detail use the same editorial visual system as Arena/Prompts?
- Which narrative states need screenshot evidence before redesign?

## Source Of Truth

- `src/app/[locale]/(main)/storyboard/page.tsx`
- `src/app/[locale]/(main)/storyboard/[id]/page.tsx`
- `src/app/[locale]/(main)/storyboard/layout.tsx`
- `src/app/[locale]/(main)/storyboard/loading.tsx`
- `src/app/[locale]/(main)/storyboard/error.tsx`
- `src/components/business/StoryCard.tsx`
- `src/components/business/StoryImagePicker.tsx`
- `src/components/business/StoryScrollRenderer.tsx`
- `src/components/business/StoryComicRenderer.tsx`
- `src/components/business/StoryExportButton.tsx`
- `src/components/business/AssetSelectorDialog.tsx`
- `src/hooks/use-storyboard.ts`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

## Last Verified

- Date: 2026-06-02
- Method: code inspection of Storyboard routes, list/detail components,
  renderer components, hooks, and source files listed above.
