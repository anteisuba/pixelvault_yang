# Studio 功能地图

> Last updated: 2026-05-19
> Scope: current implemented Studio behavior only.
> Companion reference: `docs/plans/product/unified-development-plan.md`.

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
- Workbench shell (image / video / audio share the same shell):
  - `src/components/business/studio/StudioTopBar.tsx`
  - `src/components/business/studio/StudioSidebar.tsx`
  - `src/components/business/studio/StudioCanvas.tsx`
  - `src/components/business/studio/StudioBottomDock.tsx`
  - `src/components/business/studio/StudioGallery.tsx`
  - `src/components/business/studio/StudioResizableLayout.tsx` (exports `StudioFlowLayout`)
- Workflow-first entry layer (Phase 1-5 of `studio-workflow-shell.md`):
  - `src/components/business/studio/StudioWorkflowGroupTabs.tsx`
  - `src/components/business/studio/StudioWorkflowPicker.tsx`
  - `src/components/business/studio/StudioWorkflowSummary.tsx`
  - `src/components/business/studio/StudioAdvancedDrawer.tsx`
  - `src/constants/workflows.ts` (Balanced 8 workflow catalog)

## One-Sentence Summary

Studio is a workflow-first multi-mode workbench with:

- image generation (quick / card workflows + image-transform Phase 1)
- video generation (cinematic short + character-to-video, with Cloudflare Worker execution)
- audio generation (TTS + voice cloning)
- project-scoped history
- compare and variant runs
- prompt / reference tooling
- shared canvas + dock + gallery layout across all three media

## Layout Structure

The actual rendered layout (verified against `StudioWorkspace.tsx` + `StudioFlowLayout`):

```
SidebarProvider
  Sidebar (StudioSidebar — projects, API routes)
  SidebarInset
    StudioTopBar (slim 44px — sidebar toggle + route indicator + advanced drawer + credits)
    Workflow shell strip
      StudioWorkflowGroupTabs (image / video / audio media-group tabs)
        StudioWorkflowSummary (current workflow name + description)
        StudioWorkflowPicker  (cards inside the active media group)
    StudioFlowLayout
      Canvas (flex-1) — StudioCanvas
      BottomDock (shrink-0) — StudioBottomDock
      Gallery (below the fold) — StudioGallery
  StudioCommandPalette (Cmd/Ctrl + K)
  OnboardingTooltip
```

There is no left/center/right three-column split. Older planning docs that
describe a 280/flex/320 column layout describe an earlier intent that did not
ship — the actual shell is canvas-centric vertical flow.

## Top-Level Modes

Modes are now driven by `selectedWorkflowId` in `StudioFormContext`. The legacy
`outputType` (`image` / `video` / `audio`) is derived from the active workflow's
`mediaGroup` and is still consumed by downstream components.

| Mode    | Current UI shape                                              | Main files                                                                                                                                                                       |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image` | Canvas + dock workbench                                       | `StudioWorkspace.tsx`, `StudioPromptArea.tsx`, `StudioCanvas.tsx`, `StudioBottomDock.tsx`                                                                                        |
| `video` | Same canvas + dock shell, video-specific dock panel           | `StudioWorkspace.tsx`, `StudioPromptArea.tsx`, `StudioVideoParams.tsx` (dock panel), `use-generate-video.ts`, `use-generate-long-video.ts`                                       |
| `audio` | Same canvas + dock shell, audio-specific dock panel + dialogs | `StudioWorkspace.tsx`, `StudioPromptArea.tsx`, `StudioAudioParams.tsx`, `StudioAudioFeedback.tsx`, `FishVoiceLibraryDialog.tsx`, `AudioTranscribeDialog.tsx`, `VoiceTrainer.tsx` |

Note: video no longer has a separate `VideoGenerateForm.tsx` — that file was
deleted during the W6 unification work. Video runs in the same shell as image
and audio, with `StudioVideoParams` mounted as a dock panel.

## Workflow Shell (Balanced 8)

Owned by `src/constants/workflows.ts` and the four shell components above.

The first visible layer of Studio is now workflow selection rather than mode
selection. Eight workflows are defined as the launch set:

| ID                            | Media group | Public name (i18n) |
| ----------------------------- | ----------- | ------------------ |
| `QUICK_IMAGE`                 | image       | 快速出图           |
| `ANIME_ILLUSTRATION`          | image       | 动漫插画           |
| `CHARACTER_CONSISTENCY_IMAGE` | image       | 角色一致图         |
| `IMAGE_EDIT_REMIX`            | image       | 改图 Remix         |
| `POSTER_LAYOUT`               | image       | 海报排版           |
| `CINEMATIC_SHORT_VIDEO`       | video       | 电影短片           |
| `CHARACTER_TO_VIDEO`          | video       | 角色转视频         |
| `VOICE_NARRATION_DIALOGUE`    | audio       | 配音旁白           |

Each workflow declares `mediaGroup`, `launchTier`, `defaultOutputType`,
`publicNameKey`, `descriptionKey`, `advancedModeAllowed`. Phase 1-5 of the
workflow shell plan are complete (constants → context state → picker UI →
capability mapping → demoting old mode toggle to advanced drawer). Phase 6
(mobile / regression polish) remains unfinished — see Known Issues.

The workflow-to-capability mapping is intentionally minimal in the current
implementation: `getWorkflowStudioDefaults(workflowId)` only returns
`{ outputType }` today. Recommended-models / default-panel routing is a
documented Phase 4 extension that has not been wired in yet.

## Shared Workbench Shell

### Top bar

Owned by `src/components/business/studio/StudioTopBar.tsx`.

Implemented (44px slim bar):

- sidebar open / close toggle
- selected route indicator (model + provider + key label)
- API key health dot
- free quota display (`Gift` icon + remaining count)
- "Advanced" trigger that opens `StudioAdvancedDrawer`

The image / video / audio toggle that previously lived on the top bar was
removed during the workflow-first migration (Phase 4-5 of
`studio-workflow-shell.md`). Mode switching is now driven by the workflow group
tabs above the canvas.

### Advanced drawer

Owned by `src/components/business/studio/StudioAdvancedDrawer.tsx`.

Hosts the demoted "old entry" controls that are no longer first-class:

- workflow mode toggle (`quick` / `card`)
- route / model selection
- provider-specific advanced controls (e.g. video params, voice selector / trainer)

This is the "advanced path" referenced by the Studio Workflow Shell plan.

### Sidebar

Owned by `src/components/business/studio/StudioSidebar.tsx`.

Implemented:

- project tree with nested names via `name = "Parent / Child"`
- create / rename / delete project
- "All Generations" unassigned history scope
- drag generation onto a project to assign it
- drag generation onto "All Generations" to unassign it
- compact API route list
- workspace / free route quick-select
- saved API key route quick-select
- health coloring for saved routes

### Shared state model

Owned by `src/contexts/studio-context.tsx`.

Three providers split by update frequency (per `src/contexts/CLAUDE.md`):

- `StudioFormContext` (HOT — every keystroke)
  - prompt
  - aspect ratio
  - **`selectedWorkflowId`**
  - output type (derived)
  - workflow mode (`quick` / `card`)
  - selected route option
  - selected voice
  - style preset id
  - advanced params
  - video duration / video resolution / long-video mode / long-video target duration
  - panels record (see PanelName below)
- `StudioDataContext` (WARM — user actions)
  - cards (character / background / style)
  - projects
  - upload state
  - prompt enhance state
  - Civitai token state
  - onboarding
  - usage summary
- `StudioGenContext` (COLD — generation only)
  - generating state
  - elapsed time
  - error
  - last generation
  - `activeRun`

`PanelName` union now contains: `cardManagement`, `projectHistory`,
`modelSelector`, `civitai`, `cardSelector`, `enhance`, `reverse`, `advanced`,
`refImage`, `layerDecompose`, `aspectRatio`, `voiceSelector`, `voiceTrainer`,
`audioTranscribe`, `transform`, `videoParams`, `script`, `keepChange`,
`planPreview`.

Audio-specific HOT fields (in addition to `voiceId` / `voiceCardId`):

- `audioEmotion`, `audioPace`, `audioPauseMarkers`, `pronunciationDictionary`
- `audioVolume`, `audioNormalizeLoudness`, `audioNormalizeText`,
  `audioWithTimestamps`
- Output: `audioFormat`, `audioSampleRate`, `audioMp3Bitrate`, `audioOpusBitrate`
- Model: `audioLatency`, `audioTemperature`, `audioTopP`, `audioChunkLength`,
  `audioRepetitionPenalty`
- Dialogue: `audioSpeakerVoiceIds` (ordered chips for `<|speaker:n|>` tags)
- Zero-shot reference (Step 11): `audioReferenceUrl`, `audioReferenceFileName`,
  `audioReferenceText` — schema-enforced both-or-none via `.refine()` on
  `GenerateAudioRequestSchema`

Plus the cross-mode action token `generateRequestId` (bumped by
`REQUEST_GENERATE`) used by feedback retry and external regeneration triggers.

### Command palette and shortcuts

Owned by:

- `src/components/business/studio/StudioCommandPalette.tsx`
- `src/hooks/use-studio-shortcuts.ts`

Implemented:

- `Cmd/Ctrl + Enter` generate
- `Cmd/Ctrl + Shift + Enter` generate 4 variants
- `Cmd/Ctrl + E` open prompt enhance
- `Esc` close all panels
- IME `isComposing` guard (W7)
- command palette can switch output mode
- command palette can switch quick / card workflow
- command palette can switch image models
- command palette can toggle some panels

⚠️ Known issue — `Cmd/Ctrl + K` is overloaded:

- command palette listens for it
- shortcut hook also uses it to focus / select the prompt field

This caveat has been documented since 2026-04-13 and is still unfixed in code.
Cleanup decision (drop one, or remap one to `Cmd+P` / `/` style) is pending.

## Image Mode

### Quick mode

Primary files:

- `StudioPromptArea.tsx`
- `useImageModelOptions.ts`
- `StudioDockPanelArea.tsx`

Implemented:

- workspace route and saved route selection (inline model picker in prompt area)
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
- 6 style presets via `src/constants/style-presets.ts` (W2)
- "Quick Setup" API key onboarding (`QuickSetupDialog.tsx`, W3)

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
- style cards that can carry model-specific setup (model + adapter + advanced
  params + LoRAs)

### Image transform (Phase 1)

Primary files:

- `src/services/image-transform.service.ts` (Strategy Pattern dispatcher)
- `src/services/image-transform/handle-style-transform.ts`
- `src/services/image-transform/handle-pose-transform.ts`
- `src/constants/transform-presets.ts` (6 seed presets)
- `src/constants/transform-dimensions.ts` (5 dimension provider config)
- `src/types/transform.ts`
- `src/app/api/image-transform/route.ts`
- `src/hooks/use-image-transform.ts`
- UI: `StudioInputImage.tsx`, `StudioFaceConsentModal.tsx`,
  `StudioTransformToggle.tsx`, `StudioVariantsGrid.tsx`,
  `StudioTransformPanel.tsx`

Implemented:

- 5-dimension schema fully reserved: `style`, `pose`, `background`, `garment`,
  `detail`
- `style` and `pose` dimensions both implemented
  - style → FLUX Redux via FAL
  - pose → FLUX Kontext via FAL
- `background`, `garment`, `detail` reserved as `NotImplementedError` 501
- 6 style presets seeded: Watercolor, Oil Painting, Ghibli, Cyberpunk, Pixel
  Art, Photo-realistic
- Variants grid (1× Fast / 2×2 4-variants), failure tolerant via
  `Promise.allSettled`, per-variant retry
- Face consent modal before submission

The transform panel is reachable from Studio via the transform toolbar entry
on desktop (popover) and mobile (sheet).

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
- winner selection for compare and variant runs (atomic transaction)
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
- drag image from gallery / history into canvas to use as reference
- use as reference
- remix from an existing generation
- "edit with Kontext" flow
- zoom in / zoom out / reset
- download (fetch + Blob force-download to bypass cross-origin issues)
- copy / share URL
- detail modal
- mobile action drawer
- Super Res, Remove BG, and Save Edited preview tools (each connected to
  `image-edit.service`; `disabled` is conditional during an active edit, not
  permanent)

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
- transform panel
- video params panel
- script panel
- keep / change panel

## Video Mode

Primary files:

- `src/components/business/studio/StudioPromptArea.tsx` (build payload, including `workflowId` injection for video)
- `src/components/business/studio/StudioVideoParams.tsx` (dock panel — duration, resolution, negative prompt, long-video toggle)
- `src/hooks/use-generate-video.ts`
- `src/hooks/use-generate-long-video.ts`
- `src/lib/video-utils.ts`

Implemented:

- video model selection (shared `ModelSelector`)
- built-in and saved route selection
- duration selection
- aspect ratio selection
- resolution selection
- reference image upload
- prompt enhancer
- negative prompt
- character-card-assisted video prompt flow
- long-video toggle for supported models
- pipeline progress display for long-video flow
- normal queued / generating / uploading progress display
- result playback inside Studio canvas

Server-owned execution path (Cloudflare Worker, see "Server-owned Execution"
section below):

- `workflowId === CINEMATIC_SHORT_VIDEO` + adapter `FAL` + saved API key →
  submit dispatches to Cloudflare Workflow
- All other video paths (`CHARACTER_TO_VIDEO`, non-FAL, no apiKeyId) continue
  to use the inline service path

The frontend selects this path by reading `state.selectedWorkflowId` in
`StudioPromptArea.buildVideoInput` and conditionally setting `workflowId` on
the submit payload (the F1 micro-packet from 2026-04-24).

## Audio Mode

Primary files:

- `StudioPromptArea.tsx` (build payload, audio reference completeness gate)
- `useAudioModelOptions.ts`
- `StudioDockPanelArea.tsx` (mounts audio dock + dialogs)
- `StudioAudioParams.tsx` (dock panel — pace / pause / advanced settings,
  speaker chips, style chips with icons + hover-preview scaffolding,
  inline reference-audio dropzone with required transcript)
- `StudioAudioFeedback.tsx` (👍 / 👎 chips + one-click retry that dispatches
  `REQUEST_GENERATE` on the canvas)
- `VoiceSelector.tsx` (voiceSelector panel)
- `VoiceTrainer.tsx` (voiceTrainer panel)
- `FishVoiceLibraryDialog.tsx` (full Fish voice catalog browser — public +
  private voices, pagination, search)
- `AudioTranscribeDialog.tsx` (ASR entry — upload audio → transcribed text
  flows into the prompt field; opens via the `audioTranscribe` panel)
- `GenerationPreview.tsx` (audio player with corrected single-seek track,
  timestamp segments when `audioWithTimestamps` is true)

Current built-in audio routes:

- `Fish Audio S2 Pro`
- `FAL F5-TTS`

Implemented (Sprints 1-5 of `studio-audio-plan.md`, all shipped 2026-04 → 2026-05):

- audio mode reachable through workflow group tabs (`audio` group → "配音旁白")
- audio model route selection
- TTS prompt input inside the shared Studio prompt area
- selected voice state in Studio form context
- Fish voice library dialog (public voices + my voices, search, pagination)
- create private cloned voice from uploaded audio (voiceTrainer)
- optional transcript / audio enhancement during voice cloning
- delete my voice
- pace control + sentence pause markers + style chips (with per-style icons
  and hover-preview scaffolding; no demo MP3s seeded yet — see Known Issues)
- advanced settings grouped into Output / Voice / Model tabs:
  - Output: format, sample rate, MP3 bitrate, Opus bitrate, loudness +
    text normalization
  - Voice: ordered speaker voice chips for `<|speaker:n|>` dialogue tags
    (paste comma-separated → chips), reference-audio dropzone + transcript
    (Step 11 — zero-shot voice cloning fallback when no preset voice is set)
  - Model: temperature, top-p, chunk length, repetition penalty, latency,
    timestamp alignment
- speaker voice chips wired to `VoiceSelector` (click chip → swap voice,
  remove chip → drop, "add" chip → open picker)
- post-generation feedback chips (👍 / 👎) with one-click retry that bumps
  `generateRequestId` to re-run the same payload (Step 8)
- audio-to-prompt transcription entry (ASR via `/api/voices/transcribe`)
  surfaced as the `audioTranscribe` dialog from the toolbar (Step 10)
- zero-shot reference upload — inline dropzone on the Voice tab, file goes
  to R2 via `/api/voices/upload-reference`, schema requires text + URL
  together (Step 11)
- audio result playback inside Studio preview with timestamp segments when
  `audioWithTimestamps` is true
- async submit / status using outbox-backed server-owned contract (audio
  finalize wraps DB writes in `db.$transaction`)

Supporting APIs:

- `POST /api/generate-audio`
- `POST /api/generate-audio/status`
- `GET/POST /api/voices`
- `GET/DELETE /api/voices/[id]`
- `POST /api/voices/transcribe` (ASR — used by `AudioTranscribeDialog`)
- `POST /api/voices/upload-reference` (multipart, 25 MiB cap, audio MIMEs
  only — used by the inline reference-audio dropzone)

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
- gallery filter tabs `all` / `favorites` / `today` (functional — favorites
  filter via likes set, today filter via ISO date prefix)
- gallery `Heart` action wired to `useLike` hook with optimistic update

## Server-owned Execution (Worker)

Cloudflare Worker scaffold added 2026-04-24 to host long / async tasks outside
the Vercel function timeout window.

Primary files:

- `workers/execution/` (Cloudflare Worker workspace, `wrangler.jsonc`)
- `workers/execution/src/index.ts` (~677 lines — health endpoint + dispatch
  handler + `CinematicShortVideoWorkflow` Cloudflare Workflow + FAL queue
  submit / poll + emitCallback)
- `src/app/api/internal/execution/callback/route.ts` (HMAC-SHA256 signed
  callback receiver, no Clerk auth — uses `createApiInternalRoute` factory)
- `src/app/api/internal/execution/resolve-key/route.ts` (worker reverse-fetches
  the user's API key here, same HMAC + `Cache-Control: no-store`)
- `src/services/execution-callback.service.ts` (business handler for callback
  result branch)
- `src/services/api-key-resolver.service.ts`
- `src/services/execution-outbox.service.ts`
- `src/constants/execution.ts` (front + back shared protocol constants)
- `src/lib/api-route-factory.ts` (`createApiInternalRoute`)

Convention: `runId === generationJob.id`. Terminal jobs are idempotent. Unknown
runIds throw `EXECUTION_RUN_NOT_FOUND` 404.

⚠️ Known issue — `execution-callback.service.ts` `result` branch finalize
(`streamUploadToR2` → `createGeneration` → `completeGenerationJob` +
`createApiUsageEntry`) is **not** wrapped in `db.$transaction`. Audio finalize
already uses transactions; video finalize does not yet. Extreme crash mid-flow
can leave orphan Generation records.

## Generation Pipeline (3-stage)

`generate-image.service.ts` was refactored 2026-04-17 (W4) into composable
stage functions:

- `callProviderWithFallback` — circuit breaker + retry + free-tier recursive
  fallback
- `persistGeneratedImage` — R2 upload + DB record + usage attachment
- thin orchestrator (~45 lines) ties the two stages together
- discriminated union return type prevents fallback double-persistence

This is the canonical reference implementation. Video and audio services
import `resolveGenerationRoute` and `GenerateImageServiceError` from here.
A future merger into a single `generation-pipeline.ts` is captured in
`docs/plans/studio-optimization-progress.md` Section 4 W4 but has not been
unified yet — image / video / audio services still own their own orchestration
beyond the shared route resolver.

## APIs That Directly Support Studio

### Image workbench

- `POST /api/studio/generate`
- `POST /api/studio/select-winner`
- `POST /api/image-transform`
- `POST /api/image/analyze`
- `POST /api/image/decompose`
- `POST /api/image/edit` (super res / remove bg via `image-edit.service`)

### Video workbench

- `POST /api/generate-video`
- `GET /api/generate-video/status`
- `POST /api/generate-long-video`
- `GET /api/generate-long-video/status`
- `POST /api/generate-long-video/retry`
- `POST /api/generate-long-video/cancel`

### Audio workbench

- `POST /api/generate-audio`
- `POST /api/generate-audio/status`
- `GET/POST /api/voices`
- `GET/DELETE /api/voices/[id]`
- `POST /api/voices/transcribe`
- `POST /api/voices/upload-reference`

### Project workbench

- `GET/POST /api/projects`
- `PUT/DELETE /api/projects/[id]`
- `GET /api/projects/[id]/history`
- `PATCH /api/generations/[id]/project`

### Internal (worker callback) — not user-facing

- `POST /api/internal/execution/callback`
- `POST /api/internal/execution/resolve-key`

### Extra Studio-adjacent foundations

- `GET/POST /api/lora-training`
- `GET /api/lora-training/[id]/status`

## What Is Fully Shipped vs Partial

### Fully shipped in the current Studio route

- workflow-first shell (Balanced 8 — picker + group tabs + summary)
- image quick workflow
- image card workflow
- image-transform Phase 1 (style + pose dimensions, 6 presets)
- compare run
- 4-variant run (with winner selection)
- project tree and project history
- reference-image drag and drop
- remix and Kontext edit entry
- video generation (cinematic short via Cloudflare Worker for FAL routes;
  inline path otherwise)
- audio generation (Fish S2 Pro + FAL F5-TTS)
- voice library selection (Fish public + private catalog, search + paginate)
- voice cloning (`VoiceTrainer` + Fish create-voice API)
- audio advanced controls (Output / Voice / Model tabs, speaker chips, style
  chips with hover-preview scaffolding)
- audio post-generation feedback chips + one-click retry
- audio-to-prompt transcription (ASR entry into the prompt field)
- zero-shot voice cloning via the inline reference-audio dropzone (Step 11)
- gallery filter tabs (`all` / `favorites` / `today`)
- preview Like / Heart action (wired to `useLike`)
- preview Super Res / Remove BG / Save Edited (wired to `image-edit` service)
- audio finalize transactional write (DB writes inside `db.$transaction`)
- shared canvas + dock + gallery layout across all media (no separate video form)

### Partial or only partly surfaced

- long-video pipeline exists for video, but recovery semantics on segment
  failure are not finalized
- image-transform `background` / `garment` / `detail` dimensions are
  schema-defined and `NotImplementedError`-throwing (Phase 3+ work)
- Worker execution covers `CINEMATIC_SHORT_VIDEO` + FAL only — other workflows
  still run inline
- workflow shell `getWorkflowStudioDefaults` only drives `outputType` today;
  `recommendedModelIds`, `defaultPanel`, etc. are reserved but unused
- LoRA training APIs and hooks exist (`use-lora-training.ts`,
  `lora-training.service.ts`) but the main `/studio` route does not yet
  expose them as a first-class workflow

### Known issues

- ⚠️ `Cmd/Ctrl + K` double-binding (command palette + prompt focus) — see
  Command palette section
- ⚠️ Workflow-shell Phase 6 polish (mobile real-device smoke,
  workflow→workflowMode override semantics) not done
- ⚠️ `execution-callback` finalize is not wrapped in `db.$transaction` — see
  Server-owned Execution section
- ⚠️ Audio style chips have icons + hover-preview wiring but no demo MP3s
  are seeded in `public/audio/style-demos/` — hovering does nothing until
  the 6 demo files land (B1 follow-up)
- ⚠️ Voice cloning (Step 12) still relies on `VoiceTrainer` as a panel;
  train → voice library round-trip + batch upload + polling status need an
  audit pass
- ⚠️ `studio-feature-map.md` may still drift; treat the source code as the
  final authority when in doubt

## Recommended Reading Order For Future Analysis

### If the problem is layout or panel behavior

Read:

1. `StudioWorkspace.tsx`
2. `StudioTopBar.tsx`
3. `StudioWorkflowGroupTabs.tsx` / `StudioWorkflowPicker.tsx`
4. `StudioSidebar.tsx`
5. `StudioBottomDock.tsx`
6. `StudioDockPanelArea.tsx`
7. `StudioResizableLayout.tsx` (`StudioFlowLayout` lives here)

### If the problem is workflow selection or advanced drawer

Read:

1. `src/constants/workflows.ts`
2. `src/contexts/studio-context.tsx` (search for `SET_SELECTED_WORKFLOW_ID`)
3. `StudioWorkflowPicker.tsx`
4. `StudioAdvancedDrawer.tsx`
5. `docs/plans/frontend/studio-workflow-shell.md` (full plan + Phase Reviews)

### If the problem is image generation behavior

Read:

1. `StudioPromptArea.tsx`
2. `use-unified-generate.ts`
3. `src/lib/api-client/generation.ts`
4. `/api/studio/generate`
5. `src/services/studio-generate.service.ts`
6. `src/services/generate-image.service.ts` (3-stage pipeline)

### If the problem is image transform

Read:

1. `src/services/image-transform.service.ts`
2. `src/services/image-transform/handle-style-transform.ts`
3. `src/services/image-transform/handle-pose-transform.ts`
4. `src/constants/transform-dimensions.ts` / `src/constants/transform-presets.ts`
5. `StudioTransformPanel.tsx`

### If the problem is compare / variant runs

Read:

1. `use-unified-generate.ts`
2. `StudioCanvas.tsx`
3. `CompareGrid.tsx`
4. `VariantGrid.tsx`
5. `/api/studio/select-winner`

### If the problem is project / history behavior

Read:

1. `use-projects.ts`
2. `StudioSidebar.tsx`
3. `StudioGallery.tsx`
4. `src/services/project.service.ts`

### If the problem is video

Read:

1. `StudioPromptArea.tsx` (`buildVideoInput` — workflowId injection)
2. `StudioVideoParams.tsx` (dock panel)
3. `use-generate-video.ts`
4. `use-generate-long-video.ts`
5. `src/services/generate-video.service.ts` (look for the
   `workflowId === CINEMATIC_SHORT_VIDEO + FAL + apiKeyId` branch)
6. `workers/execution/src/index.ts` (worker dispatch + Cloudflare Workflow)

### If the problem is audio or voices

Read:

1. `useAudioModelOptions.ts`
2. `StudioPromptArea.tsx` (audio submit + reference-completeness gate)
3. `StudioAudioParams.tsx` (dock panel — pace, pause, style chips,
   advanced tabs, reference-audio dropzone)
4. `StudioAudioFeedback.tsx` (feedback chips + `REQUEST_GENERATE` retry)
5. `FishVoiceLibraryDialog.tsx` / `VoiceSelector.tsx` / `VoiceTrainer.tsx`
6. `AudioTranscribeDialog.tsx` (audio-to-prompt entry)
7. `src/services/generate-audio.service.ts`
8. `src/services/fish-audio-voice.service.ts`
9. `src/services/audio-reference.service.ts` (R2 upload for zero-shot refs)

### If the problem is server-owned execution / worker callback

Read:

1. `workers/execution/src/index.ts`
2. `src/app/api/internal/execution/callback/route.ts`
3. `src/app/api/internal/execution/resolve-key/route.ts`
4. `src/services/execution-callback.service.ts`
5. `src/services/execution-outbox.service.ts`
6. `src/constants/execution.ts`

## Bottom Line

The current Studio is a workflow-first multi-mode workbench:

- image creation (quick / card / transform)
- video creation (with worker-backed execution for the cinematic short path)
- audio creation
- project organization
- prompt / reference tooling
- compare / variant decision flows

The main remaining work is:

- finishing workflow-shell Phase 6 (mobile real-device smoke + override
  semantics)
- removing `Cmd+K` double-binding
- wrapping `execution-callback` finalize in `db.$transaction`
- expanding image-transform from style + pose into the remaining 3 dimensions
- promoting LoRA training from API-only into a first-class Studio workflow
- consolidating long-video failure recovery
