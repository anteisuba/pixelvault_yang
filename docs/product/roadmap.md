# Product Roadmap

> Last synced: 2026-04-13
> This file tracks roadmap-level priorities and current status.
> For the current shipped Studio behavior, start with `../plans/frontend/studio-feature-map.md`.

## Phase A — Code Quality & Design Compliance — COMPLETE

### A1. Design System Cleanup — COMPLETE

- Removed one-off visual drift in form controls and supporting UI
- Consolidated repeated reference-image and aspect-ratio UI
- Filled key alt-text and accessibility gaps

### A2. Reusable UI Extraction — COMPLETE

- Moved repeated UI patterns toward shared components
- Reduced duplicated image-generation form structure

### A3. Error Boundaries — COMPLETE

- Added route-level error handling for primary product surfaces
- Synchronized error copy across `en`, `ja`, and `zh`

### A4. Lazy Loading — COMPLETE

- Dynamically loaded heavier prompt and analysis panels
- Reduced initial Studio and generation-form bundle weight

### A+ UX / Reliability Follow-ups — COMPLETE

- Toast consistency
- Provider error normalization
- Prisma index optimization
- Prompt transparency
- API key format hints
- Mobile locale switcher
- Keyboard navigation and ARIA cleanup
- AVIF / WebP optimization

## Phase B — Model Catalog & Selector Intelligence — COMPLETE

### B1. Richer Model Metadata — COMPLETE

- Added model purpose metadata such as style tags and quality tiers
- Added localized descriptions across supported languages

### B2. Better Model Selector UX — COMPLETE

- Purpose-based grouping
- Better sorting and discoverability
- Clearer provider/model presentation

### B3. Prompt Presets — PARTIAL

- Preset structure and categories exist
- Deeper project-aware preset reuse is still limited

## Phase C — Performance Optimization — COMPLETE

- Rendering optimization (`React.memo`, callback cleanup)
- Gallery skeletons and ISR
- Better image delivery defaults
- Studio free-quota visibility

## Phase D — Community & Growth — IN PROGRESS

### D1. Prompt Sharing & Reuse — COMPLETE

- Copy prompt and share-link flows
- One-click Studio prefill from Gallery/detail surfaces
- URL parameter sharing for prompt/model reuse

### D2. Arena Upgrade — COMPLETE

- Personal history and stats
- Leaderboard improvements
- Model-family grouping

### D2.5. Landing Page Narrative — COMPLETE

- "Your Key, Your Images, Zero Markup" positioning
- BYOK plus archive plus Arena differentiation

### D3. Creator Profiles & Social Graph — COMPLETE

- Public creator profiles
- Gallery attribution
- Likes, follows, prompt feedback
- Profile editing
- Featured / pinned images
- Dynamic OG generation

### D4. Collections / Albums — COMPLETE

- Collection models
- CRUD service and APIs
- Client helpers and hook
- i18n coverage

### Remaining D Work

- Publish-to-earn
- Broader social-discovery and growth loops

## Phase E — Monetization & Platform Credits — NOT STARTED

### E1. Credits & Billing

- Credit purchase / top-up flow
- Credit balance visibility outside Studio
- Usage analytics dashboard

### E2. Platform Credits Mode

- Platform-owned provider usage mode
- Provider cost and margin controls

## Phase F — Creator Workflow Expansion — PARTIAL

### F1. Storyboard Enhancement — PARTIAL

- Fullscreen support is shipped
- Character binding and preset continuity are still pending

### F2. Advanced Generation — PARTIAL

- Compare and 4-variant runs are already shipped in Studio
- Batch generation across multiple prompts is still pending
- Side-by-side history comparison is still pending
- Bulk profile operations are shipped

### F3. Image Edit Tools — PARTIAL

- Upscale and remove-background service foundations are shipped
- Shared edit-service plumbing exists
- Inpainting is still pending
- Some Studio preview actions are still placeholder buttons

### F4. Workflow / Pipeline Productization — NOT STARTED

- Reusable saved pipelines
- Better workflow presets
- End-to-end creative pipeline composition

### F5. Lower API Key Barrier — NOT STARTED

- OAuth provider login
- Guided provider onboarding
- API key import assistance

## Phase G — Production Readiness & Scale — NOT STARTED

### Security / Reliability

- Replace in-memory rate limiter with durable shared infrastructure
- API key decryption alerting
- R2 orphan cleanup
- Database tuning

### Observability

- Structured logging
- Latency dashboards
- Provider error alerting

### Data / Compliance

- Backup automation
- Lifecycle policies
- Data export / deletion flow

### Mobile / Team

- PWA support
- Push notifications
- Shared workspaces
- Role-based access
- Team billing

## Phase W — Workbench Evolution — PARTIAL

### W0. VolcEngine Seedance — COMPLETE

- VolcEngine adapter integration
- Seedance models registered and routed

### W1. Multi-Reference Images — COMPLETE

- Shared multi-reference upload flow
- Provider capability limits
- Studio and video references support

### W2. Project System — COMPLETE

- Project CRUD
- Project-aware history
- Drag-and-drop generation assignment
- Studio sidebar integration

### W3. Video Style Continuity — NOT STARTED

- Project-aware clip continuity and continuation UX are still pending

### W4. Audio & Final Assembly — PARTIAL

- Audio mode is already shipped in the main `/studio` route
- `/api/generate-audio` is live
- `/api/voices` is live
- Voice selection and voice cloning are already wired into Studio
- Final clip + TTS + BGM assembly workflow is still pending

## Current Studio Highlights

- Image quick workflow
- Image card workflow
- Compare generation across 2-3 models
- 4-variant generation with winner selection
- Project-scoped history
- Prompt/reference tooling
- Video generation form
- Audio generation mode
- Voice library and voice cloning
