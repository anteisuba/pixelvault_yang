# Architecture

> Last updated: 2026-04-13
> For a Studio-specific implementation map, also read
> `docs/plans/frontend/studio-feature-map.md`.

## Tech Stack

| Layer        | Technology                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router + Turbopack)                                           |
| Language     | TypeScript                                                                    |
| Auth         | Clerk                                                                         |
| Database     | PostgreSQL (Neon) via Prisma 7 + PrismaPg Driver Adapter                      |
| Storage      | Cloudflare R2                                                                 |
| AI providers | HuggingFace, Google Gemini, OpenAI, fal.ai, Replicate, VolcEngine, Fish Audio |
| UI           | Tailwind CSS + shadcn/ui                                                      |
| i18n         | next-intl (`en`, `ja`, `zh`)                                                  |
| Testing      | Vitest + Testing Library                                                      |
| Deployment   | Vercel                                                                        |

## High-Level Product Surfaces

- Landing page
- Studio workbench
- Public gallery
- Generation detail pages
- Profile/archive
- Arena
- Storyboard
- Collections

## Studio Architecture

The Studio is no longer a single image form.

Current Studio structure:

- image workbench
- video generation form
- audio generation mode
- project-scoped history
- card-based workflow
- compare and variant runs

Primary entry points:

- route: `src/app/[locale]/(main)/studio/page.tsx`
- shell: `src/components/business/StudioWorkspace.tsx`
- state: `src/contexts/studio-context.tsx`
- shared image/audio generation orchestration: `src/hooks/use-unified-generate.ts`
- video params panel: `src/components/business/studio/StudioVideoParams.tsx` (video shares the same canvas + dock shell as image/audio)

## Directory Structure

```text
src/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/
│   │   └── (main)/
│   │       ├── studio/page.tsx
│   │       ├── gallery/page.tsx
│   │       ├── gallery/[id]/page.tsx
│   │       ├── profile/page.tsx
│   │       ├── arena/
│   │       └── storyboard/
│   └── api/
├── components/
│   ├── business/
│   │   ├── StudioWorkspace.tsx
│   │   └── studio/          ← image/video/audio share one canvas+dock shell
│   ├── layout/
│   └── ui/
├── constants/
├── contexts/
├── hooks/
├── lib/
├── messages/
├── services/
├── test/
└── types/
```

## Key Studio Files

| Area                       | Primary files                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared shell               | `StudioWorkspace.tsx`, `StudioTopBar.tsx`, `StudioSidebar.tsx`, `StudioBottomDock.tsx`          |
| Shared state               | `studio-context.tsx`                                                                            |
| Image prompt/generate flow | `StudioPromptArea.tsx`, `use-unified-generate.ts`, `studio-generate.service.ts`                 |
| Result canvas              | `StudioCanvas.tsx`, `GenerationPreview.tsx`, `CompareGrid.tsx`, `VariantGrid.tsx`               |
| History/gallery            | `StudioGallery.tsx`, `StudioLightbox.tsx`, `use-projects.ts`                                    |
| Video                      | `StudioVideoParams.tsx`, `StudioScriptPanel.tsx`, `use-video-model-options.ts`                  |
| Audio                      | `useAudioModelOptions.ts`, `VoiceSelector.tsx`, `VoiceTrainer.tsx`, `generate-audio.service.ts` |
| Projects                   | `use-projects.ts`, `project.service.ts`, `StudioSidebar.tsx`                                    |

## API Route Families

### Core generation

| Method | Path                         | Purpose                                |
| ------ | ---------------------------- | -------------------------------------- |
| `POST` | `/api/generate`              | legacy/general image generation entry  |
| `POST` | `/api/studio/generate`       | Studio image workbench generation      |
| `POST` | `/api/studio/select-winner`  | select winner from compare/variant run |
| `POST` | `/api/generate-video`        | submit video generation                |
| `GET`  | `/api/generate-video/status` | poll video job                         |
| `POST` | `/api/generate-audio`        | submit/generate audio                  |
| `POST` | `/api/generate-audio/status` | poll async audio job                   |

### Studio workbench support

| Method       | Path                             | Purpose                               |
| ------------ | -------------------------------- | ------------------------------------- |
| `GET/POST`   | `/api/projects`                  | project list + create                 |
| `PUT/DELETE` | `/api/projects/[id]`             | rename/delete project                 |
| `GET`        | `/api/projects/[id]/history`     | paginated project history             |
| `PATCH`      | `/api/generations/[id]/project`  | assign/unassign generation to project |
| `GET/POST`   | `/api/voices`                    | voice list + create private voice     |
| `GET/DELETE` | `/api/voices/[id]`               | voice detail + delete                 |
| `GET/POST`   | `/api/lora-training`             | LoRA training jobs                    |
| `GET`        | `/api/lora-training/[id]/status` | LoRA job polling                      |

### Other major product routes

| Method                | Path                                 | Purpose                |
| --------------------- | ------------------------------------ | ---------------------- |
| `GET`                 | `/api/images`                        | gallery/profile feed   |
| `DELETE`              | `/api/generations/[id]`              | hard delete generation |
| `PATCH`               | `/api/generations/[id]/visibility`   | toggle visibility      |
| `POST`                | `/api/image/analyze`                 | reverse engineer       |
| `POST`                | `/api/image/analyze/[id]/variations` | generate variations    |
| `POST`                | `/api/prompt/enhance`                | prompt enhancement     |
| `GET/POST/PUT/DELETE` | `/api/api-keys...`                   | BYOK route management  |
| `GET/POST/...`        | `/api/arena...`                      | Arena flows            |
| `GET/POST/...`        | `/api/stories...`                    | Storyboard flows       |
| `GET/POST/...`        | `/api/collections...`                | Collections            |

## Core Data Flow

```text
Browser -> API route -> service layer -> Prisma / R2 / provider
```

Each API route is expected to stay thin:

1. authenticate
2. validate input
3. delegate to service
4. return normalized response

## Studio Image Flow

1. User interacts with `StudioPromptArea.tsx`
2. `use-unified-generate.ts` builds a Studio image request
3. `POST /api/studio/generate` validates with `StudioGenerateSchema`
4. `studio-generate.service.ts` resolves quick-mode vs card-mode generation
5. downstream generation service calls the correct provider adapter
6. result is uploaded to R2 and persisted in Prisma
7. `use-unified-generate.ts` updates `lastGeneration` and `activeRun`
8. canvas and gallery update in the Studio UI

## Studio Compare / Variant Flow

1. user triggers compare or variant mode from `StudioPromptArea.tsx`
2. `use-unified-generate.ts` creates an `activeRun`
3. compare:
   - runs parallel generations across selected models
4. variant:
   - runs 4 parallel generations with different seeds
5. result grid is rendered by `CompareGrid.tsx` or `VariantGrid.tsx`
6. winner selection calls `POST /api/studio/select-winner`

## Video Flow

1. user configures video in `StudioVideoParams.tsx` panel and submits via shared `StudioPromptArea`
2. `POST /api/generate-video` submits a job
3. client polls `/api/generate-video/status`
4. completed generation is persisted and returned
5. long-video flow uses separate pipeline submit/status/retry/cancel endpoints

## Audio Flow

1. user switches Studio to audio mode
2. `useAudioModelOptions.ts` resolves available audio routes
3. `StudioPromptArea.tsx` submits audio generation through `use-unified-generate.ts`
4. `POST /api/generate-audio` either:
   - returns a direct generation for synchronous providers like Fish Audio
   - returns job references for async providers
5. generated audio is persisted as a `Generation`
6. preview is rendered through `AudioPlayer`

Voice support is separate from generation:

- `GET /api/voices` lists public or personal voices
- `POST /api/voices` creates a private cloned voice
- `DELETE /api/voices/[id]` removes a voice

## Project / History Flow

1. `use-projects.ts` loads projects and the active project history
2. Studio sidebar changes `activeProjectId`
3. `/api/projects/[id]/history` returns paginated project-scoped generations
4. Studio gallery merges the latest generated item into that history
5. drag-and-drop updates project assignment through `/api/generations/[id]/project`

## Security

- Clerk protects private pages and private APIs
- rate limiting exists on major AI endpoints
- API keys are encrypted with AES-256-GCM
- storage keys are crypto-random
- Zod validates all cross-boundary payloads
- ownership checks are enforced server-side

## Testing

- test framework: Vitest
- API routes have focused auth/validation/success/error coverage
- shared helpers live in `src/test/api-helpers.ts`

## Notes On Current State

- Studio is already ahead of some older roadmap text
- audio mode and voice cloning are implemented
- LoRA training APIs and hooks exist, but are not yet first-class in the main Studio route
- some Studio UI controls are still placeholders; see `docs/plans/frontend/studio-feature-map.md`
