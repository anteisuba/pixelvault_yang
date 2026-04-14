# Studio Workbench Redesign Plan

> Status note (2026-04-13): keep this file as the layout-direction document, but use `./studio-feature-map.md` as the source of truth for shipped behavior. The current Studio route already ships the canvas shell, project history, compare/variant runs, video mode, and audio mode.

> Status: draft plan aligned to the current `studio` codebase as of 2026-04-04

## Background

`studio` has recently moved toward a sidebar plus vertical workspace layout, but the current result is still between two modes:

- it has a stronger “workspace” feel than the old editorial layout
- it lost the fixed preview and retry surface that made generation feedback trustworthy
- history has been promoted too far up the hierarchy and is now competing with the active result
- the visual system still borrows too much from landing-page/editorial styling instead of creator-tool styling

This plan defines the next step: a more ComfyUI-like workbench without copying node-based UI.

## Current State

### Current desktop structure

- left sidebar: projects and API routes
- center column: model/prompt/generate/toolbar panels
- bottom history strip inside the same center column
- no fixed right preview panel

### Current UX gaps

- current result, loading, failure, and retry are no longer anchored on screen
- history filmstrip is trying to do both “history” and “main feedback”
- top bar still behaves like page-level controls instead of workbench chrome
- prompt input feels improved, but status visibility is still weak
- advanced controls are still grouped as one long expansion flow
- mobile is still a stacked desktop adaptation, not a mobile-first workbench

## Goals

1. Restore a fixed right preview area for current result, loading, failure, and retry.
2. Keep `StudioGallery` as a bottom filmstrip only.
3. Keep `StudioSidebar` for project/resource/route management without letting it replace the preview surface.
4. Turn the center column into a focused compose surface: model, prompt, reference, ratio, advanced, generate.
5. Make the top chrome show current workspace state at a glance.
6. Make generate status readable in one scan: ready, missing model, missing reference, generating, failed.
7. Make the draft direction visible in a standalone route before touching production `studio`.

## Non-Goals

- no replacement of the existing Studio context architecture
- no new backend contracts
- no node graph editor
- no destructive rewrite of the production `/studio` page in the same step
- no full visual system rewrite across the rest of the app

## Constraints

- preserve existing App Router locale structure
- all new visible text must be translation-ready
- do not introduce a second data-fetching pattern
- do not move business logic into presentation components
- keep the draft route isolated from the production studio route

## Target Layout

### Desktop

```text
[ Top chrome: project | route | model | free quota | references ]

[ Sidebar ] [ Compose column ] [ Fixed preview ]
[ Sidebar ] [ Filmstrip      ] [ Filmstrip     ]
```

### Mobile

```text
[ Preview first ]
[ Prompt + generate status ]
[ Horizontal filmstrip ]
[ Bottom sheet for project/model/reference/advanced ]
```

## Workstreams

### Workstream 1: Preview hierarchy recovery

- restore `StudioRightColumn` or equivalent fixed preview region in desktop layout
- keep `GenerationPreview` as the primary result surface
- ensure current result, generating state, failed state, and retry remain visible without scrolling into history

### Workstream 2: Filmstrip demotion

- keep `StudioGallery` as a horizontal history strip
- support:
  - single click to select preview
  - double click to open detail
  - drag to reference
- remove fake filters until real filtering exists

### Workstream 3: Compose surface tightening

- center column should present:
  - model command menu
  - prompt
  - reference dropzone
  - aspect ratio
  - advanced groups
  - generate status panel
- prompt height must respond to programmatic updates

### Workstream 4: Workbench chrome

- top bar should become workspace chrome, not navigation chrome
- show:
  - current project
  - current route
  - current model
  - free quota
  - reference count

### Workstream 5: Visual language correction

- reduce editorial-page feel inside studio
- use thinner borders, flatter surfaces, lighter shadows, denser information blocks
- keep the warm palette, but shift typography in tool areas toward `font-sans`
- reserve display/serif usage for sparse emphasis only

### Workstream 6: Mobile-first adaptation

- avoid a direct stacked copy of desktop
- preview remains first
- tools move into bottom sheet groups
- history stays horizontally scrollable

## Implementation Plan

### Phase 1: Draft and alignment

- write this plan into `docs/plans/`
- create a standalone draft route at `/:locale/studio/draft`
- use mock data only to validate:
  - top chrome
  - sidebar
  - center compose
  - fixed preview
  - bottom filmstrip
  - mobile ordering

### Phase 2: Production layout recovery

- update `StudioWorkspace` to restore a three-region desktop layout
- bring `StudioRightColumn` back as the fixed preview region
- move `StudioGallery` into a filmstrip role below compose + preview

### Phase 3: Status and command flow

- turn the generate area into a status panel
- improve model selector density and route metadata
- make reference intake visually explicit

### Phase 4: Advanced panel restructuring

- group advanced controls into:
  - Composition
  - Reference
  - Quality
  - Provider-specific

### Phase 5: Mobile adaptation and polish

- redesign mobile order and bottom-sheet behavior
- perform visual density, spacing, and state polish

## Risks

- restoring the preview region without clarifying ownership between `StudioGallery` and `StudioRightColumn` could duplicate selection logic
- overusing the current editorial utility classes in the draft may blur the design direction
- if the draft route borrows too many production components, reviewers may confuse draft UI with real behavior
- mobile may regress if desktop components are reused without deliberate adaptation

## Validation

### Draft validation

- route renders under locale-prefixed path
- no production `studio` behavior changes
- strings resolve in `en`, `ja`, and `zh`
- desktop draft shows all five key regions:
  - chrome
  - sidebar
  - compose
  - preview
  - filmstrip

### Production follow-up validation

- fixed preview remains visible while browsing history
- retry is accessible from the active result surface
- filmstrip interaction is discoverable and consistent
- prompt textarea resizes after remix/reverse/enhance writes
- mobile order matches preview -> compose -> history -> tools

## Deliverables

- `docs/plans/frontend/studio-workbench-redesign.md`
- draft review route at `src/app/[locale]/(main)/studio/draft/page.tsx`
- supporting draft component and translations
