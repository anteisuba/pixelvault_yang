# Current Status Audit

> Last updated: 2026-04-28
> This file replaces the older MVP-era audit snapshot.

## Executive Summary

The project is no longer in an early "single Studio page" stage.

Current product state:

- multi-provider image generation is shipped (8 provider adapters)
- video generation is shipped (with Cloudflare Worker execution path for cinematic short)
- audio generation is shipped (with outbox-backed async + transactional finalize)
- persistent storage is shipped
- user system and credits are shipped (BYOK + free-tier daily quota)
- gallery, detail page, profile, arena, storyboard, collections, and social layer are all present
- Studio is now a workflow-first multi-mode workbench with the Balanced 8 workflow shell

## Current Studio State

Studio is driven by `selectedWorkflowId` over the Balanced 8 catalog:

- Image workflows: `QUICK_IMAGE`, `ANIME_ILLUSTRATION`, `CHARACTER_CONSISTENCY_IMAGE`, `IMAGE_EDIT_REMIX`, `POSTER_LAYOUT`
- Video workflows: `CINEMATIC_SHORT_VIDEO`, `CHARACTER_TO_VIDEO`
- Audio workflow: `VOICE_NARRATION_DIALOGUE`

Layout is canvas + dock + gallery vertical flow (`StudioFlowLayout`), not a left/center/right three-column split. Top bar is a slim 44px strip with an Advanced drawer that hosts the demoted route / model / quick / card controls.

Current Studio capabilities include:

- workflow-first picker shell (group tabs + cards + summary)
- quick image workflow
- card-based image workflow
- image-transform Phase 1 (style + pose dimensions, 6 presets, FAL FLUX Redux + FLUX Kontext)
- compare generation (2-3 models)
- 4-variant generation with winner selection (transactional)
- project tree and project-scoped history
- drag-and-drop reference image flow
- remix and Kontext edit entry
- video generation
- long-video pipeline for supported models
- Cloudflare Worker dispatch path for `CINEMATIC_SHORT_VIDEO` + FAL + saved API key
- audio generation (TTS) with outbox-backed async + transactional finalize
- voice library selection
- private voice cloning
- gallery filter tabs (`all` / `favorites` / `today`) — fully functional
- gallery `Heart` action wired to `useLike`
- preview Super Res / Remove BG / Save Edited — all connected to `image-edit.service`
- 6 style presets (W2)
- Quick Setup API key onboarding dialog (W3)

Primary reference document:

- `docs/plans/frontend/studio-feature-map.md` (updated 2026-04-28)

## What Is No Longer Accurate In Older Audits

These statements from prior audits are no longer true:

- "only Studio exists"
- "gallery/profile are missing"
- "Studio is only image/video"
- "project system is still missing"
- "prompt-related community reuse is still missing"
- "Studio Gallery `favorites` / `today` filters are UI-only" — they are functional
- "Studio gallery `Heart` action is a no-op" — it is wired to `useLike`
- "Super Res / Remove BG / Save Super Res are disabled" — they are connected to `image-edit.service`; `disabled` is conditional, not permanent
- "video uses a separate `VideoGenerateForm.tsx` layout" — that file was removed during W6; video shares the canvas + dock shell
- "Studio uses left/center/right three-column layout" — never shipped; actual layout is `StudioFlowLayout` (canvas + dock + gallery)

## What Is Still Partial

The current codebase still has some Studio-adjacent partial areas:

- **image-transform** `background` / `garment` / `detail` dimensions are schema-defined and `NotImplementedError`-throwing (Phase 3+ work). `style` and `pose` are implemented.
- **Worker execution** covers `CINEMATIC_SHORT_VIDEO` + FAL + saved API key only. Other video workflows (`CHARACTER_TO_VIDEO`, non-FAL, no apiKeyId) still run inline.
- **Workflow-shell `getWorkflowStudioDefaults`** only drives `outputType` today; `recommendedModelIds` / `defaultPanel` / etc. are reserved but unused.
- **LoRA training APIs and hooks exist** (`use-lora-training.ts`, `lora-training.service.ts`, two API endpoints), but the main `/studio` route does not yet expose them as a first-class workflow.
- **Long-video pipeline** exists, but recovery semantics on segment failure are not finalized.
- **Generation pipeline unification** — image service has been refactored to 3 stages (W4); video / audio still own their own orchestration beyond the shared route resolver.

## Known Issues (carried forward)

- ⚠️ `Cmd/Ctrl + K` is double-bound (command palette + prompt focus). Documented since 2026-04-13, not yet resolved.
- ⚠️ Workflow-shell **Phase 6 polish** (mobile real-device smoke + workflow→workflowMode override semantics) is not done. Phase 1-5 verdict: Pass on `studio-workflow-shell.md`.
- ⚠️ `requestCount` / `credits` semantic drift in frontend copy vs. backend. Free-tier model is `FREE_TIER + requestCount`, not `User.credits` balance. Resolution required before Phase E (monetization).
- ⚠️ 240s `maxDuration` is insufficient for some video providers; long-video pipeline lacks formal recovery points. Worker execution path mitigates this for the `CINEMATIC_SHORT_VIDEO` + FAL slice, but other paths remain on the inline timeout.
- ⚠️ in-memory rate limiter has not been upgraded to durable shared infrastructure (roadmap Phase G).

## Recent Implementation Highlights (2026-04-13 → 2026-04-28)

### W1-W7 Studio optimization (2026-04-14 → 2026-04-17)

- W1 core generation path tests
- W2 style presets + `useUnifiedGenerate` hook tests (8 tests)
- W3 Quick Mode + `QuickSetupDialog`
- W4 generation pipeline 3-stage extraction (`callProviderWithFallback` + `persistGeneratedImage` + thin orchestrator), discriminated union return type
- W5 18 of 79 routes migrated to `createApiRoute` factory
- W6 Video UI unification (`VideoGenerateForm` removed, video runs in shared shell + `StudioVideoParams` dock panel) + skeleton standardization
- W7 reduce-AI-feel (`bg-card` over white, shadow-md over shadow-lg) + SEO basics (noindex private pages, sitemap)

### Phase 1 image-transform (2026-04-17)

- 5-dimension schema fully reserved (style / pose / background / garment / detail)
- `style` + `pose` dimensions both implemented (FLUX Redux + FLUX Kontext via FAL)
- 6 preset seeds + 5-dimension provider config map
- 5 new Studio components: `StudioInputImage`, `StudioFaceConsentModal`, `StudioTransformToggle`, `StudioVariantsGrid`, `StudioTransformPanel`
- `usage.service` / R2 wrapper / `with-retry` unit tests added
- API route + Zod schema + hook + service test coverage

### Phase 1 Studio Workflow Shell (2026-04-22 → 2026-04-24)

- `src/constants/workflows.ts` — Balanced 8 catalog (5 image + 2 video + 1 audio)
- `studio-context.tsx` adds `selectedWorkflowId` state + reducer action
- `StudioWorkflowGroupTabs` / `StudioWorkflowPicker` / `StudioWorkflowSummary` (3 new components)
- `StudioAdvancedDrawer` (demoted route / model / quick / card controls)
- `StudioTopBar` slimmed to 44px, image/video/audio toggle removed
- Phase 1-5 Diff Reviews: all verdict Pass (`docs/plans/frontend/studio-workflow-shell.md`)

### Server-owned Execution (2026-04-24)

- Cloudflare Worker scaffold (`workers/execution/`) — health endpoint + dispatch handler + `CinematicShortVideoWorkflow` Cloudflare Workflow
- `src/app/api/internal/execution/callback/route.ts` (HMAC-SHA256, `createApiInternalRoute`)
- `src/app/api/internal/execution/resolve-key/route.ts` (worker reverse-fetch user API key)
- `src/services/execution-callback.service.ts` + `execution-outbox.service.ts`
- `src/services/api-key-resolver.service.ts`
- `src/constants/execution.ts` (front+back shared protocol constants)
- Convention `runId === generationJob.id`, terminal jobs idempotent
- Frontend F1 micro-packet: `StudioPromptArea.buildVideoInput` injects `workflowId` from `state.selectedWorkflowId` for video submissions
- `execution-callback.service.ts` result finalize is wrapped in `db.$transaction` across `createGeneration`, `completeGenerationJob`, and `createApiUsageEntry`; transaction atomicity is covered by service tests.

### Quality and testing status

- 158 test files; 8 provider adapters all have unit tests; image-edit / R2 / usage / free-tier-boundary all covered
- 14 services still without unit tests (high-priority list: `user.service`, `generation.service`, `studio-generate.service`, `arena.service`, `lora-training.service`, `prompt-enhance.service`, `civitai-token.service`, `video-pipeline.service`, `image-analysis.service`, `image-decompose.service`, `fish-audio-voice.service`, `execution-outbox.service`, `generation-feedback.service`, `character-refine.service`)
- Generation pipeline refactored into 3 composable stages (W4)
- SEO fundamentals: metadata on all pages, noindex on private pages, robots.txt + sitemap (W7)
- Design system compliance: no pure white backgrounds, shadow levels standardized, Skeleton component usage unified
- Accessibility: keyboard shortcuts have IME guard, Particles respect prefers-reduced-motion
- Dead code removed: useGenerateImage hook + generateImageAPI (-108 lines)
- Gallery sentinel double-fetch race fixed

## Recommended Up-To-Date References

- Studio implementation map (truth source): `docs/plans/frontend/studio-feature-map.md`
- Workflow shell plan with Phase Reviews: `docs/plans/frontend/studio-workflow-shell.md`
- 7-week optimization progress: `docs/plans/studio-optimization-progress.md`
- overall phase tracking: `docs/progress/phases.md`
- forward-looking roadmap: `docs/product/roadmap.md`
- system architecture: `docs/architecture/system-architecture.md`
- Unified 3-track plan (historical reference, not source of truth): `docs/plans/product/unified-development-plan.md`
- Image-transform decision book: `docs/plans/feature/功能-路線決策結論書.md`
- Image-transform implementation checklist: `docs/plans/feature/功能-實作落地清單.md`
- Image consistency strategy discussion (in progress): `docs/plans/product/consistency-strategy-discussion.md`
- Most recent audit (this companion file): `docs/progress/2026-04-27-audit.md`

## Bottom Line

Future analysis should no longer start from "what is Studio supposed to be?"

It should start from:

1. the current Studio feature map (`studio-feature-map.md`)
2. the workflow being touched (one of Balanced 8) and its `mediaGroup`
3. whether the issue is in shell, workflow shell, generation orchestration, projects/history, image-transform, worker execution, or provider integration
