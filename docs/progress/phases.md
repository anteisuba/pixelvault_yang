# Development Phases

> Last synced: 2026-04-13
> This file is the milestone-level status view.
> For the current Studio implementation map, start with `../plans/frontend/studio-feature-map.md`.

## Phase 1: MVP (Core Generation) — COMPLETE

- Single-model image generation
- Prompt input plus result display
- Basic Studio entry flow

## Phase 2: Persistent Storage — COMPLETE

- Prisma plus PostgreSQL persistence
- Cloudflare R2 upload and permanent hosting
- Generation records saved to the database

## Phase 3: User System + Credits — COMPLETE

- Clerk sign-in and sign-up
- Clerk webhook sync into the application database
- Server-side credit deduction and balance APIs
- Route protection middleware
- Gallery route
- Profile route

## Phase 4: UI Polish + Gallery Enhancements — COMPLETE

- Landing page redesign and responsive pass
- Gallery search and detail flows
- Multi-provider architecture
- Per-user API key management
- Image-to-image generation
- Prompt enhancement and reverse engineering
- Arena
- Storyboard
- Video generation
- SEO and deployment hardening

## Phase 5: UX Refinement + Security — COMPLETE

- Image and video distinction across gallery/detail flows
- Profile enhancement and hard-delete
- Mobile navigation and toast feedback
- API rate limiting and request hardening
- API route test coverage

## Phase A+: Code Quality, Model UX, Performance — COMPLETE

- Design-system compliance cleanup and form deduplication
- Error boundaries
- Dynamic imports and lazy loading
- Toast consistency and provider error unification
- Prisma index optimization
- Prompt visibility and API key hints
- Keyboard navigation and ARIA improvements
- Model metadata and selector UX improvements
- Rendering optimization and gallery ISR
- Free quota display in Studio

## Phase D: Community & Growth — IN PROGRESS

### D1: Prompt Sharing & Reuse — COMPLETE

- Copy prompt and share-link flows
- One-click Studio prefill from Gallery and detail views
- URL parameter sharing for prompt/model reuse

### D2: Arena Upgrade — COMPLETE

- Personal arena history and model stats
- Leaderboard podium and model-family grouping
- Dedicated arena history and stats APIs

### D2.5: Landing Page Narrative — COMPLETE

- "Your Key, Your Images, Zero Markup" differentiation
- BYOK plus permanent archive plus Arena value framing

### D3: Social Layer — COMPLETE

- Public creator profiles
- Creator attribution in gallery cards
- Likes, follows, and prompt feedback
- Profile editing
- Clerk `user.updated` sync
- i18n synchronization

### D4: Collections / Albums — COMPLETE

- `Collection` and `CollectionItem` Prisma models
- Collection CRUD service and ownership checks
- Collection APIs and client helpers
- `useCollections` hook
- i18n synchronization

### Remaining

- Publish-to-earn and broader creator-growth loops are still pending

## Phase W: Workbench Evolution — PARTIAL

### W0: VolcEngine Seedance — COMPLETE

- VolcEngine adapter integration
- Seedance models registered in provider capabilities

### W1: Multi-Reference Images — COMPLETE

- `referenceImages[]` request support
- Provider-specific capability limits
- Shared reference-image UI across image/video flows

### W2: Project System — COMPLETE

- Project model and generation-to-project relation
- Project CRUD APIs and client helpers
- Active project selection in Studio
- Project-aware history and drag-and-drop assignment

### W3: Video Style Continuity — NOT STARTED

- Project-aware clip continuation and style continuity are still planned, but not yet shipped in the main Studio route

### W4: Audio & Assembly — PARTIAL

- Audio mode is now shipped inside `/studio`
- `/api/generate-audio` and `/api/voices` are live
- Voice selection and voice cloning are wired into the Studio workbench
- Final clip + TTS + BGM assembly flow is still pending

## Phase E: Unified Development Plan — IN PROGRESS

> Treat `../plans/product/unified-development-plan.md` as the merged planning document, not the source of truth for shipped behavior.
> Current Studio code is ahead of parts of that plan, especially in audio/voice flows and LoRA-training foundations.

### Track A: Hardening — MOSTLY COMPLETE

- Shared constants cleanup
- New model intake
- Editing persistence and performance work

### Track B: Studio Upgrade — MOSTLY COMPLETE

- Snapshot DTO and `activeRun`
- Rebuilt Studio workspace shell
- Better status visibility and action flow
- Remix and project-aware history
- Compare and 4-variant workflows
- Prompt tooling and accessibility polish

### Track C: Advanced Creative Tooling — PARTIAL

- Storyboard polish is still pending
- Stronger card-binding continuity is still pending
- Editing foundations exist, but outpainting and inpainting are not fully surfaced
- LoRA-training APIs and hooks exist, but not yet as a first-class Studio route flow
