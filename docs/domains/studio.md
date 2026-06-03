# Studio Domain

最后更新：2026-06-03

本文档记录 Studio 业务域的当前事实、已确认目标和未决边界。它不替代生成、存储、认证、用量或 provider 架构文档。

## Current

### Route Surface

Current Studio route surface:

- `/studio` redirects to `/studio/image`.
- `/studio/image`, `/studio/video`, and `/studio/audio` live under the shared `(workspace)` route group.
- `/studio/node` renders the Node workflow canvas.
- `/studio/lora` renders the LoRA workbench.
- `/studio/3d` renders the 3D workspace.
- `/studio/edit` and `/studio/edit/*` render image edit task surfaces.
- `/studio/enhance` and `/studio/analyze` exist as Studio-adjacent tool routes.

`/studio/image`, `/studio/video`, and `/studio/audio` do not render full independent pages. Their visible UI is mounted once in `src/app/[locale]/(main)/studio/(workspace)/layout.tsx`; each page renders `StudioModeSync` to switch mode.

### Shared Workspace Shell

`src/app/[locale]/(main)/studio/layout.tsx` wraps all `/studio/*` routes in `LoraStackProvider` and renders `ActiveLoraBar`.

`src/app/[locale]/(main)/studio/(workspace)/layout.tsx` wraps image/video/audio workspace routes in `StudioProvider` and renders `StudioWorkspaceUI`.

`StudioWorkspaceUI` owns the shared canvas/dock layout for image/video/audio modes:

- `StudioCanvas`
- `StudioBottomDock`
- `StudioFlowLayout`
- `StudioCommandPalette`
- onboarding tooltip
- replay/prompt prefill hydration

The workspace deliberately keeps the layout mounted across image/video/audio route transitions.

### Studio Context

`src/contexts/studio-context.tsx` splits Studio state into three contexts:

- `StudioFormContext`: prompt, selected workflow, output type, panels, params.
- `StudioDataContext`: cards, projects, uploads, prompt enhance, Civitai token, onboarding, usage summary.
- `StudioGenContext`: generation state from `useUnifiedGenerate` plus last evaluation.

This split is a performance and maintainability boundary. Components should subscribe only to the context they need.

### Workflow Model

`src/constants/workflows.ts` defines the current workspace workflow catalog.

Current workflow media groups:

- image
- video
- audio

Current workflow modes:

- quick
- card

3D and Node workflow are separate Studio routes, not part of the shared image/video/audio `StudioProvider` workspace.

### Generation Path

`src/hooks/use-unified-generate.ts` is the client orchestration hook for image/video/audio generation.

Current API calls include:

- `studioGenerateAPI`
- `submitVideoAPI`
- `checkVideoStatusAPI`
- `generateAudioAPI`
- `checkAudioStatusAPI`
- `studioSelectWinnerAPI`

Image generation through Studio uses:

```text
Studio UI
-> useUnifiedGenerate
-> studioGenerateAPI
-> POST /api/studio/generate
-> compileAndGenerate
-> submitImageGeneration
-> Cloudflare Worker execution
-> internal execution callback
-> Generation
```

`src/services/studio-generate.service.ts` has two image paths:

- quick mode: direct worker job submit
- card mode: `compileRecipe` then worker job submit

Video and audio generation use media-specific APIs and services, not `compileAndGenerate`.

Studio image, video, and audio submit APIs now return job IDs for polling. Synchronous provider execution through Next.js is not a supported fallback. Migrated image providers, ordinary image reference inputs, independent multi-view image fan-out, FAL video, FAL audio, Fish Audio, and long-video pipeline runs perform provider execution plus final artifact upload inside the Cloudflare Worker before callback finalization or DB-only long-video state updates. Next.js may standardize uploaded reference images into R2 URLs before dispatch and aggregate multi-view child job status, but it must not call provider generation. Provider-specific special image paths that are not Worker-safe fail until the matching Worker handler exists.

### Node Workflow

`/studio/node` renders `StudioNodeWorkbench`.

The Node workflow UI uses React Flow and `useNodeWorkflow`.

Current Node workflow persistence uses:

- `GET /api/node-workflow/projects`
- `POST /api/node-workflow/projects`
- `GET /api/node-workflow/projects/[id]`
- `PUT /api/node-workflow/projects/[id]`
- `DELETE /api/node-workflow/projects/[id]`
- `POST /api/node-workflow/projects/[id]/activate`

`src/services/node/node-workflow.service.ts` currently persists user-scoped canvas project state. It does not replace the simple Studio image/video/audio execution service.

### LoRA

`/studio/lora` renders `LoraWorkbench`.

The top-level Studio layout also exposes the active LoRA stack across Studio routes through `LoraStackProvider`.

LoRA training and assets are handled through LoRA-specific hooks, components, services, and API routes. Studio consumes LoRA state as part of creation flow, but LoRA asset ownership and training are not owned solely by the shared image/video/audio workspace.

### 3D

`/studio/3d` renders `Studio3DWorkspace`.

The 3D route prefetches the signed-in user's image generations for source selection and uses the 3D generation routes/services.

Per product scope, 3D is currently a branch capability, not a short-term mainline priority.

### Related But Separate Domains

Studio interacts with these domains but does not fully own them:

- Gallery and assets listing
- Projects/folders
- Cards
- API keys
- LoRA assets/training
- Generation persistence
- Provider adapters
- Usage/free allowance
- Storage and media access

Those domains keep their own service and route boundaries.

## Target

### Role

Studio is the main creation workspace and generation workbench.

It should protect the primary user path:

```text
选择模型 -> 输入 prompt/参考图 -> 生成 -> 持久保存 -> 管理/复用作品
```

Studio is responsible for the active creation phase. It can select reference assets, select models, generate, reuse prompts, replay/remix previous works, and edit outputs.

Studio is not the full asset management system. After a work is saved, bulk management, folders, asset-library browsing, filtering, deletion, and publish management primarily belong to Assets, Project, and Gallery domains.

### Workspace Priority

Current target priority:

- image / video / audio are the main Studio workspace.
- Node workflow and LoRA are core advanced capabilities.
- 3D remains a branch entry under Studio for now, but it is not a short-term mainline priority and should not drive core Studio roadmap decisions.

### Responsibility

Studio owns:

- creation entry points
- prompt/reference input UX
- model and route selection UX
- image/video/audio workspace orchestration
- quick mode and card-assisted image generation UX
- compare/variant run UX
- local workspace state for active creation
- prompt reuse from public or owned works
- replay/remix/edit entry points back into creation
- handoff into persistent `Generation` records

Studio does not own:

- saved-asset bulk management
- folder/project organization UX
- full private asset library browsing
- public gallery presentation
- public profile presentation
- final provider API correctness
- provider-specific payload contracts
- final credit/free allowance policy
- storage retention policy
- private media access policy
- API key encryption and verification rules
- public social expansion

Those belong to architecture or adjacent domain documents.

### Domain Boundaries

Confirmed domain boundary:

- Studio: creation, generation, reference input, model selection, and current creation state.
- Assets: saved private asset management, bulk operations, folders, uploads, and asset picker flows.
- Gallery: public presentation and public detail pages.
- Project: organization and grouping relationships; it does not own generation execution.
- Generation: unified data source of truth for generated works.
- Storage: R2 and durable media persistence source of truth.

### Node Workflow Direction

Node workflow is a core advanced capability for long video and directorial workflows.

Its confirmed direction is to use a canvas node system to connect role, voice, script, reference, and video generation steps so the user can make intended videos with less random retrying.

For now, Node workflow should be described as a Studio advanced workspace / sub-workspace.

It must not be written as a normal image/video/audio mode, and it must not be written as a permanently independent product. When the long-video workflow is clearer, create `docs/domains/node-workflow.md` before major implementation decisions.

Node workflow should integrate with shared `Generation` outputs, storage rules, and allowance rules, but it should not be forced into the same simple execution path as image/video/audio Studio generation.

### Stability Rules

Future Studio work must not break:

- `/studio -> /studio/image` redirect.
- image/video/audio shared workspace layout persistence.
- `StudioModeSync` route-to-mode behavior.
- prompt/reference/model selection primary path.
- LoRA active stack.
- Node workflow entry point.
- generated outputs being persisted as `Generation` records.
- replay/remix paths from gallery/assets back into Studio.
- edit paths from gallery/assets back into Studio.
- provider, usage, storage, and auth decisions staying in server/service layers.
- `StudioProvider` context split.
- API-client based generation calls from hooks.
- translation readiness for visible UI text.

### Development Rules

Studio UI changes should not move business logic into components.

Studio generation changes must follow:

```text
read docs
-> inspect code source of truth
-> verify official provider docs when API/provider behavior is involved
-> expose uncertainty
-> owner confirms direction
-> task packet
-> small implementation slice
-> validation
-> update necessary docs
```

Any change to model IDs, provider payloads, BYOK/platform key priority, storage persistence, usage/allowance, auth, or database schema must use the corresponding architecture documents before implementation.

## Unresolved

- Long-video Node workflow needs its own domain specification before major implementation changes.
- Whether `/studio/3d` should remain under Studio routes long term is unresolved. Current direction is only that 3D can remain as a Studio branch entry and should not drive short-term mainline planning.
- Studio edit route ownership versus a separate image editing domain is unresolved.
- The current mixed use of `/api/studio/generate`, `/api/generate`, and media-specific generation APIs needs future cleanup decisions only after behavior review.
- A complete browser QA pass for the Studio primary path has not been run in this documentation pass.
- Provider/model currentness has not been checked against official docs in this pass.

## Source of Truth

- User-confirmed product direction in the 2026-06-01 and 2026-06-02 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/storage.md`
- `docs/architecture/credits.md`
- `docs/architecture/auth.md`
- `src/app/[locale]/(main)/studio/layout.tsx`
- `src/app/[locale]/(main)/studio/page.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/layout.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/image/page.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/video/page.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/audio/page.tsx`
- `src/app/[locale]/(main)/studio/node/page.tsx`
- `src/app/[locale]/(main)/studio/lora/page.tsx`
- `src/app/[locale]/(main)/studio/3d/page.tsx`
- `src/app/[locale]/(main)/studio/edit/`
- `src/contexts/studio-context.tsx`
- `src/constants/workflows.ts`
- `src/constants/studio.ts`
- `src/constants/node-studio.ts`
- `src/components/business/StudioWorkspaceUI.tsx`
- `src/components/business/StudioModeSync.tsx`
- `src/components/business/studio/`
- `src/components/business/studio-shared/`
- `src/components/business/node/StudioNodeWorkbench.tsx`
- `src/components/business/studio/lora/LoraWorkbench.tsx`
- `src/components/business/Studio3DWorkspace.tsx`
- `src/hooks/use-unified-generate.ts`
- `src/hooks/use-active-lora-stack.tsx`
- `src/hooks/node/use-node-workflow.ts`
- `src/lib/api-client/generation.ts`
- `src/lib/api-client/node-workflow.ts`
- `src/app/api/studio/generate/route.ts`
- `src/app/api/studio/select-winner/route.ts`
- `src/app/api/studio/seedance-prompt-plan/route.ts`
- `src/app/api/studio/node-assistant/route.ts`
- `src/app/api/generate-video/route.ts`
- `src/app/api/generate-audio/route.ts`
- `src/app/api/generate-3d/route.ts`
- `src/app/api/generate-long-video/route.ts`
- `src/app/api/node-workflow/projects/route.ts`
- `src/app/api/node-workflow/projects/[id]/route.ts`
- `src/services/studio-generate.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/generate-audio.service.ts`
- `src/services/generate-3d.service.ts`
- `src/services/video-pipeline.service.ts`
- `src/services/node/node-workflow.service.ts`
- `src/services/lora-asset.service.ts`
- `src/services/lora-training.service.ts`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-02
- Method: owner product-boundary confirmation plus code inspection
- External docs: not checked; provider/model/API behavior intentionally deferred to provider integration docs
- Runtime validation: not run
