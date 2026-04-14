# Studio 功能地图

> Last updated: 2026-04-13
> Scope: current implemented Studio behavior only.
> Historical redesign/planning docs are still useful, but should be read together with this file:
>
> - `docs/plans/frontend/studio-v3-redesign.md`
> - `docs/plans/frontend/studio-workbench-redesign.md`
> - `docs/plans/product/unified-development-plan.md`

## Purpose

This document is the fastest way to understand the current `studio` without
re-reading the codebase from scratch.

It answers four questions:

1. What the current Studio actually does
2. Which features are fully wired vs partially wired
3. Which files own each part of the behavior
4. Where to start when debugging or extending a Studio feature

## Primary Entry Points

- Route entry: `src/app/[locale]/(main)/studio/page.tsx`
- Main shell: `src/components/business/StudioWorkspace.tsx`
- Shared state: `src/contexts/studio-context.tsx`
- Shared generation orchestrator: `src/hooks/use-unified-generate.ts`
- Image workbench entry:
  - `src/components/business/studio/StudioTopBar.tsx`
  - `src/components/business/studio/StudioSidebar.tsx`
  - `src/components/business/studio/StudioCanvas.tsx`
  - `src/components/business/studio/StudioBottomDock.tsx`
  - `src/components/business/studio/StudioGallery.tsx`
- Video entry: `src/components/business/VideoGenerateForm.tsx`

## One-Sentence Summary

Studio is now a multi-mode workbench with:

- image generation
- video generation
- audio generation
- project-scoped history
- card-based workflows
- compare and variant runs
- prompt/reference tooling
- voice selection and voice cloning

## Top-Level Modes

| Mode    | Current UI shape                                            | Main files                                                                                 |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `image` | Canvas-centric workbench                                    | `StudioWorkspace.tsx`, `StudioPromptArea.tsx`, `StudioCanvas.tsx`                          |
| `video` | Standalone form flow                                        | `VideoGenerateForm.tsx`                                                                    |
| `audio` | Canvas-centric workbench with audio-specific toolbar/panels | `StudioPromptArea.tsx`, `StudioToolbarPanels.tsx`, `VoiceSelector.tsx`, `VoiceTrainer.tsx` |

## Shared Workbench Shell

### Top bar

Owned by `src/components/business/studio/StudioTopBar.tsx`.

Implemented:

- output type toggle: image / video / audio
- workflow toggle for image mode: quick / card
- selected route indicator
- API key health dot
- free quota display
- sidebar open/close trigger

### Sidebar

Owned by `src/components/business/studio/StudioSidebar.tsx`.

Implemented:

- project tree with nested names via `name = "Parent / Child"`
- create / rename / delete project
- "All Generations" unassigned history scope
- drag generation onto a project to assign it
- drag generation onto "All Generations" to unassign it
- compact API route list
- workspace/free route quick-select
- saved API key route quick-select
- health coloring for saved routes

### Shared state model

Owned by `src/contexts/studio-context.tsx`.

Current context split:

- `StudioFormContext`
  - prompt
  - aspect ratio
  - output type
  - workflow mode
  - selected route option
  - open panel state
  - selected voice
- `StudioDataContext`
  - cards
  - projects
  - upload state
  - prompt enhance state
  - Civitai token state
  - onboarding
  - usage summary
- `StudioGenContext`
  - generating state
  - elapsed time
  - error
  - last generation
  - `activeRun`

### Command palette and shortcuts

Owned by:

- `src/components/business/studio/StudioCommandPalette.tsx`
- `src/hooks/use-studio-shortcuts.ts`

Implemented:

- `Cmd/Ctrl + Enter` generate
- `Cmd/Ctrl + Shift + Enter` generate 4 variants
- `Cmd/Ctrl + E` open prompt enhance
- `Esc` close all panels
- command palette can switch output mode
- command palette can switch quick/card workflow
- command palette can switch image models
- command palette can toggle some panels

Current caveat:

- `Cmd/Ctrl + K` is overloaded:
  - command palette listens for it
  - shortcut hook also uses it to focus/select the prompt field

## Image Mode

### Quick mode

Primary files:

- `StudioPromptArea.tsx`
- `useImageModelOptions.ts`
- `StudioDockPanelArea.tsx`

Implemented:

- workspace route and saved route selection
- free-form prompt input
- aspect ratio pills
- reference images
- advanced parameters
- project assignment on generate
- prompt assistant panel
- prompt enhancement
- reverse engineer panel
- layer decomposition panel
- Civitai token panel

### Card mode

Primary files:

- `StudioCardSection.tsx`
- `CharacterCardManager`
- `SimpleCardManager`
- `StyleCardManager`
- `buildStudioCardUsageMap` in `src/lib/studio-history.ts`

Implemented:

- character card selection
- background card selection
- style card selection
- card manager sheet
- project-aware card creation
- card last-used metadata in Studio
- style cards that can carry model-specific setup

### Image generation run types

Primary files:

- `use-unified-generate.ts`
- `CompareGrid.tsx`
- `VariantGrid.tsx`
- `/api/studio/generate`
- `/api/studio/select-winner`

Implemented:

- single generation
- compare generation across 2-3 models
- 4-variant generation with random seeds
- `activeRun` state for single / compare / variant
- winner selection for compare and variant runs
- optimistic winner selection in UI

### Canvas and preview actions

Primary files:

- `StudioCanvas.tsx`
- `GenerationPreview.tsx`
- `StudioLightbox.tsx`

Implemented:

- single latest-result preview
- compare grid canvas
- variant grid canvas
- drag image from gallery/history into canvas to use as reference
- use as reference
- remix from an existing generation
- "edit with Kontext" flow
- zoom in / zoom out / reset
- download
- copy/share URL
- detail modal
- mobile action drawer

### Tool panels rendered in dock

Owned by `StudioDockPanelArea.tsx`.

Implemented:

- prompt assistant panel
- advanced settings panel
- Civitai token panel
- reference image panel
- reverse engineer panel
- layer decompose panel
- aspect ratio panel

## Video Mode

Primary file: `src/components/business/VideoGenerateForm.tsx`

Implemented:

- video model selection
- built-in and saved route selection
- duration selection
- aspect ratio selection
- resolution selection
- reference image upload
- prompt enhancer
- negative prompt
- character-card-assisted video prompt flow
- long video toggle for supported models
- pipeline progress display for long video flow
- normal queued/generating/uploading progress display
- result playback

Important note:

- video mode uses a separate form layout instead of the image/audio canvas shell

## Audio Mode

Primary files:

- `StudioPromptArea.tsx`
- `useAudioModelOptions.ts`
- `StudioToolbarPanels.tsx`
- `VoiceSelector.tsx`
- `VoiceTrainer.tsx`
- `GenerationPreview.tsx`

Current built-in audio routes:

- `Fish Audio S2 Pro`
- `FAL F5-TTS`

Implemented:

- audio mode toggle in Studio top bar
- audio model route selection
- TTS prompt input inside the shared Studio prompt area
- selected voice state in Studio form context
- voice library browser
- public voices tab
- my voices tab
- voice search
- pagination
- delete my voice
- create private cloned voice from uploaded audio
- optional transcript during voice cloning
- optional audio enhancement during voice cloning
- audio result playback inside Studio preview

Supporting APIs:

- `POST /api/generate-audio`
- `POST /api/generate-audio/status`
- `GET/POST /api/voices`
- `GET/DELETE /api/voices/[id]`

## Projects and History

Primary files:

- `use-projects.ts`
- `StudioSidebar.tsx`
- `StudioGallery.tsx`
- `/api/projects`
- `/api/projects/[id]/history`
- `/api/generations/[id]/project`

Implemented:

- project CRUD
- active project selection
- unassigned history scope
- paginated project history
- API-level output type filtering for project history
- drag-and-drop generation assignment
- Studio gallery showing latest result merged into project history
- masonry and grid gallery layouts
- lightbox browsing
- load more history

## APIs That Directly Support Studio

### Image workbench

- `POST /api/studio/generate`
- `POST /api/studio/select-winner`

### Video workbench

- `POST /api/generate-video`
- `GET /api/generate-video/status`
- long-video endpoints via `api-client/generation.ts`

### Audio workbench

- `POST /api/generate-audio`
- `POST /api/generate-audio/status`
- `GET/POST /api/voices`
- `GET/DELETE /api/voices/[id]`

### Project workbench

- `GET/POST /api/projects`
- `PUT/DELETE /api/projects/[id]`
- `GET /api/projects/[id]/history`
- `PATCH /api/generations/[id]/project`

### Extra Studio-adjacent foundations

- `GET/POST /api/lora-training`
- `GET /api/lora-training/[id]/status`

## What Is Fully Shipped vs Partial

### Fully shipped in the current Studio route

- image quick workflow
- image card workflow
- compare run
- 4-variant run
- project tree and project history
- reference-image drag and drop
- remix and Kontext edit entry
- video generation form
- audio generation mode
- voice library selection
- voice cloning

### Partial or only partly surfaced

- long-video pipeline exists only in video form, not in the shared canvas shell
- project history API supports type filters, but the main Studio gallery does not expose that filter behavior
- LoRA training API and hook exist, but are not wired into the main `/studio` flow

### Present in UI but not functionally wired

- `StudioGallery` filter tabs `all / favorites / today` are UI-only right now
- Studio gallery `Heart` action is a no-op
- preview actions `Super Res`, `Remove BG`, and `Save Super Res` are currently disabled in the Studio preview toolbar

## Recommended Reading Order For Future Analysis

### If the problem is layout or panel behavior

Read:

1. `StudioWorkspace.tsx`
2. `StudioTopBar.tsx`
3. `StudioSidebar.tsx`
4. `StudioBottomDock.tsx`
5. `StudioDockPanelArea.tsx`

### If the problem is image generation behavior

Read:

1. `StudioPromptArea.tsx`
2. `use-unified-generate.ts`
3. `src/lib/api-client/generation.ts`
4. `/api/studio/generate`
5. `src/services/studio-generate.service.ts`

### If the problem is compare/variant runs

Read:

1. `use-unified-generate.ts`
2. `StudioCanvas.tsx`
3. `CompareGrid.tsx`
4. `VariantGrid.tsx`
5. `/api/studio/select-winner`

### If the problem is project/history behavior

Read:

1. `use-projects.ts`
2. `StudioSidebar.tsx`
3. `StudioGallery.tsx`
4. `src/services/project.service.ts`

### If the problem is video

Read:

1. `VideoGenerateForm.tsx`
2. `use-generate-video.ts`
3. `use-generate-long-video.ts`
4. `src/lib/api-client/generation.ts`

### If the problem is audio or voices

Read:

1. `useAudioModelOptions.ts`
2. `StudioPromptArea.tsx`
3. `VoiceSelector.tsx`
4. `VoiceTrainer.tsx`
5. `src/services/generate-audio.service.ts`
6. `src/services/fish-audio-voice.service.ts`

## Bottom Line

The current Studio is no longer just an image form.

It is already a multi-surface workbench with:

- image creation
- video creation
- audio creation
- project organization
- prompt/reference tooling
- compare/variant decision flows

The main remaining gap is not lack of features, but feature consolidation:

- some capabilities are still split between image shell vs video form
- some APIs exist without first-class Studio entry points
- some Studio gallery actions are still placeholders
