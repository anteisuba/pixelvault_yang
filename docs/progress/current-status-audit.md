# Current Status Audit

> Last updated: 2026-04-17
> This file replaces the older MVP-era audit snapshot.

## Executive Summary

The project is no longer in an early "single Studio page" stage.

Current product state:

- multi-provider image generation is shipped
- video generation is shipped
- audio generation is shipped
- persistent storage is shipped
- user system and credits are shipped
- gallery, detail page, profile, arena, storyboard, collections, and social layer are all present
- Studio has evolved into a multi-mode workbench

## Current Studio State

Studio now has three top-level modes:

- image
- video
- audio

Current Studio capabilities include:

- quick image workflow
- card-based image workflow
- compare generation
- 4-variant generation
- image transform (style + pose dimensions, preset-based)
- project tree and project-scoped history
- drag-and-drop reference image flow
- remix and Kontext edit entry
- video generation form with long-video support
- audio generation
- voice selection
- private voice cloning

Primary reference document:

- `docs/plans/frontend/studio-feature-map.md`

## What Is No Longer Accurate In Older Audits

These statements are no longer true:

- "only Studio exists"
- "gallery/profile are missing"
- "Studio is only image/video"
- "project system is still missing"
- "prompt-related community reuse is still missing"

## What Is Still Partial

The current codebase still has some Studio-adjacent partial areas:

- Studio gallery `favorites` / `today` filters are UI-only
- Studio gallery `Heart` action is not wired
- preview actions for super resolution / remove background / save edited output are present but disabled in Studio preview
- LoRA training APIs and hook exist, but the main `/studio` route does not yet expose them as a first-class workflow
- some long-video and audio/video assembly ideas are still roadmap work rather than finished product
- Image transform: 3 of 5 dimensions (background/garment/detail) are schema-defined but not yet implemented

## Quality and Testing Status (as of 2026-04-17)

- 7-week Studio optimization plan fully completed (W1-W7)
- 61 test files, 479 tests, all passing
- Generation pipeline refactored into 3 composable stages
- SEO fundamentals: metadata on all pages, noindex on private pages, robots.txt + sitemap
- Design system compliance: no pure white backgrounds, shadow levels standardized, Skeleton component usage unified
- Accessibility: keyboard shortcuts have IME guard, Particles respect prefers-reduced-motion
- Dead code removed: useGenerateImage hook + generateImageAPI (-108 lines)
- Gallery sentinel double-fetch race fixed

## Recommended Up-To-Date References

- 7-week optimization progress: `docs/plans/studio-optimization-progress.md`
- overall phase tracking: `docs/progress/phases.md`
- forward-looking roadmap: `docs/product/roadmap.md`
- system architecture: `docs/architecture/system-architecture.md`
- Studio implementation map: `docs/plans/frontend/studio-feature-map.md`
- Unified 3-track plan (reference): `docs/plans/product/unified-development-plan.md`

## Bottom Line

Future analysis should no longer start from "what is Studio supposed to be?"

It should start from:

1. the current Studio feature map
2. the exact mode involved: image / video / audio
3. whether the issue is in shell, generation orchestration, projects/history, or provider integration
