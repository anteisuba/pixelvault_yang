# src/hooks/ — Client-Side Custom Hooks

## Risk Level: HIGH (42 hooks, 0 test coverage)

All hooks use `'use client'`. No tests exist — modifications require manual verification.

## Hook Domains

### Generation (core — changes affect Studio + all generation flows)

- `use-generate.ts` — Single image generation
- `use-unified-generate.ts` — **Core orchestrator**: image/video/audio routing (injected into StudioDataContext)
- `use-studio-generate.ts` — Studio-specific generation with recipe compilation
- `use-generate-video.ts` — Video generation + status polling
- `use-generate-long-video.ts` — Long video pipeline
- `use-generation-form.ts` — Form state management

### Cards (changes affect Studio card selection)

- `use-character-cards.ts` — Character card CRUD (injected into StudioDataContext)
- `use-background-cards.ts` — Background card CRUD (injected into StudioDataContext)
- `use-style-cards.ts` — Style card CRUD (injected into StudioDataContext)
- `use-card-recipes.ts` — Recipe compilation
- `use-card-manager.ts` — Card selection state

### AI Text (changes affect prompt-related features)

- `use-prompt-enhance.ts` — LLM prompt enhancement (injected into StudioDataContext)
- `use-prompt-assistant.ts` — Interactive prompt suggestions
- `use-prompt-feedback.ts` — Prompt quality feedback
- `use-generation-feedback.ts` — Post-generation coaching
- `use-reverse-image.ts` — Reverse engineer prompt from image

### Gallery & Community

- `use-gallery.ts` — Gallery listing + pagination
- `use-like.ts` — Like/unlike generations
- `use-follow.ts` — Follow/unfollow users
- `use-collections.ts` — Collection management
- `use-character-card-gallery.ts` — Public card gallery

### Studio Infrastructure

- `use-studio-shortcuts.ts` — Keyboard shortcut bindings
- `use-studio-draggable.ts` — Drag & drop support
- `use-image-upload.ts` — Reference image upload (injected into StudioDataContext)
- `use-onboarding.ts` — First-time user flow (injected into StudioDataContext)

### Utility

- `use-async-action.ts` — Generic async state wrapper (loading/error/data)
- `use-mobile.ts` — Mobile viewport detection
- `use-api-keys.ts` — User API key management
- `use-civitai-token.ts` — Civitai integration token
- `use-usage-summary.ts` — Credit usage display
- `use-audio-model-options.ts` / `use-image-model-options.ts` — Model option lists
- `use-lora-training.ts` — LoRA training jobs
- `use-layer-decompose.ts` — Image layer decomposition
- `use-my-profile.ts` / `use-creator-profile.ts` — Profile data

## Critical Hook: useUnifiedGenerate

This hook is the central generation orchestrator. It routes between image/video/audio generation, manages generation state, and is injected into StudioDataContext. Changing it affects ALL generation flows in Studio.

## Rules

1. Hooks call API through `src/lib/api-client.ts` — never use `fetch()` directly
2. All API calls must use `useAsyncAction` or similar loading/error pattern
3. Hooks injected into StudioDataContext (marked above) affect all Studio components when changed
4. No direct database or service imports — hooks are client-side only
