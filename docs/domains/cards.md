# Cards Domain

最后更新：2026-06-02

本文档记录 Cards 业务域的当前事实、已确认目标和未决边界。这里的 Cards 主要指视觉创作卡系统：`CharacterCard`、`BackgroundCard`、`StyleCard` 和 `CardRecipe`。`VoiceCard` 是相关当前使用面，但它的最终边界需要和 Node workflow / Audio 一起确认。

## Current

### Role

当前 Cards 域是可复用创作上下文层。

Current implemented responsibilities include:

- create and manage character cards
- extract character attributes from source images
- keep structured character prompt, source images, reference images, LoRA metadata, variants, and stability status
- score and refine character consistency
- create and manage background cards
- create and manage style cards
- compose `CardRecipe` from character/background/style/free prompt
- compile card recipes into generation-ready prompt, reference images, advanced params, and recipe snapshot
- expose cards to Studio quick mode and card mode
- expose cards to Node workflow inspectors for character/background node hydration

当前 `/cards` 页面主要管理 Character / Style / Background 三类卡。`CardRecipe` 有 API 和 compiler，但没有同等级的页面 tab。`VoiceCard` 有 API、service、hooks 和 Studio/Node 使用面，但不属于当前 `/cards` 视觉管理页。

### Data Model

Current visual card models:

- `CharacterCard`
- `GenerationCharacterCard`
- `BackgroundCard`
- `StyleCard`
- `CardRecipe`

Related models:

- `Generation`
- `Project`
- `LoraTrainingJob`
- `LoraAsset`
- `VideoPipeline`
- `VideoScript`
- `VoiceCard`

`CharacterCard` currently stores:

- owner through `userId`
- optional organization through `projectId`
- `name`
- `description`
- primary source image URL and storage key
- legacy `sourceImages`
- structured `sourceImageEntries` with view type
- `characterPrompt`
- provider/model-specific prompt map through `modelPrompts`
- reusable `referenceImages`
- structured `attributes`
- character-specific `loras`
- `tags`
- `status`
- `stabilityScore`
- variant relationship through `parentId`, `variants`, and `variantLabel`
- soft deletion through `isDeleted`

Character card status is:

```text
DRAFT
REFINING
STABLE
ARCHIVED
```

`GenerationCharacterCard` is the current join table for multi-character generation lineage. It links one generation to one character card, with a uniqueness constraint on:

```text
generationId + characterCardId
```

`BackgroundCard` currently stores:

- owner through `userId`
- optional `projectId`
- name, description, prompt, source image, attributes, LoRAs, tags, soft deletion, timestamps

`StyleCard` currently stores:

- owner through `userId`
- optional `projectId`
- name, description, style prompt, source image, attributes, LoRAs, `modelId`, `adapterType`, `advancedParams`, tags, soft deletion, timestamps

`CardRecipe` currently stores:

- owner through `userId`
- optional `projectId`
- optional `characterCardId`
- optional `backgroundCardId`
- optional `styleCardId`
- optional `freePrompt`
- soft deletion and timestamps

`Generation` currently stores:

- legacy single `characterCardId`
- multi-card links through `characterCards`
- optional `cardRecipeId`
- `recipeSnapshot`

### Limits And Constants

Current CharacterCard limits:

- max character cards per user: 100
- max variants per card: 20
- max active character cards in generation: 5
- max source images per card: 10
- max reference images per card: 5
- stability threshold: 0.75
- max refinement iterations: 10

Current BackgroundCard limits:

- max background cards per user: 100
- prompt max length: 2000

Current StyleCard limits:

- max style cards per user: 100
- prompt max length: 2000

Current CardRecipe limits:

- max recipes per user: 200
- free prompt max length: 2000
- prompt truncation limit for LLM fusion: 800
- compiled prompt cache TTL: 1 hour
- LLM fusion timeout: 10 seconds

### API Surface

Current visual Cards API routes:

- `GET /api/character-cards`
- `POST /api/character-cards`
- `GET /api/character-cards/[id]`
- `PUT /api/character-cards/[id]`
- `DELETE /api/character-cards/[id]`
- `POST /api/character-cards/[id]/refine`
- `POST /api/character-cards/[id]/score`
- `GET /api/character-cards/[id]/generations`
- `GET /api/character-cards/generations`
- `GET /api/background-cards`
- `POST /api/background-cards`
- `GET /api/background-cards/[id]`
- `PUT /api/background-cards/[id]`
- `DELETE /api/background-cards/[id]`
- `GET /api/style-cards`
- `POST /api/style-cards`
- `GET /api/style-cards/[id]`
- `PUT /api/style-cards/[id]`
- `DELETE /api/style-cards/[id]`
- `GET /api/card-recipes`
- `POST /api/card-recipes`
- `GET /api/card-recipes/[id]`
- `PUT /api/card-recipes/[id]`
- `DELETE /api/card-recipes/[id]`
- `POST /api/card-recipes/[id]/compile`

Most card CRUD routes use API route factories. The character-card generation listing routes currently use direct `auth()` and `NextResponse`.

Related current voice-card routes:

- `GET /api/voice-cards`
- `POST /api/voice-cards`
- `GET /api/voice-cards/[id]`
- `PATCH /api/voice-cards/[id]`
- `DELETE /api/voice-cards/[id]`

### Service Layer

Current visual Cards services:

- `src/services/cards/character-card.service.ts`
- `src/services/cards/character-card.mapper.ts`
- `src/services/cards/character-refine.service.ts`
- `src/services/cards/character-scoring.service.ts`
- `src/services/cards/background-card.service.ts`
- `src/services/cards/style-card.service.ts`
- `src/services/cards/card-recipe.service.ts`
- `src/services/kernel/card-recipe-compiler.service.ts`

Character card creation currently:

- ensures the user exists
- enforces per-user card limits
- validates parent-card ownership for variants
- uploads source images to R2
- stores source image entries with view type metadata
- extracts structured character attributes using LLM vision
- optionally searches for character information using LLM grounding
- merges attributes across images
- builds `characterPrompt`
- creates a `CharacterCard` row

Character card refinement currently:

- loads the owned card
- generates test images using selected models
- links successful generations to the character card
- scores source image vs generated image consistency through LLM vision
- updates `stabilityScore`
- moves status toward `REFINING` or `STABLE`
- writes high-scoring generated outputs back as `referenceImages`

Background and Style card creation currently:

- ensures the user exists
- enforces per-user limits
- optionally uploads a source image to R2
- optionally extracts attributes and prompt from the source image
- falls back to user-provided prompt when extraction fails
- creates soft-deletable owned card rows

CardRecipe compile currently:

- loads referenced cards by `id + userId + isDeleted = false`
- requires `StyleCard.modelId` and `StyleCard.adapterType`
- builds prompt parts from character, background, style, and free prompt
- tries LLM fusion with adapter-specific prompt hints
- falls back to template concatenation when LLM fusion fails
- caches compiled prompts
- collects reference images from character, style, and background cards
- builds `RecipeSnapshot`
- merges LoRAs from character, style, style advanced params, and background
- trims LoRAs by adapter limit
- injects Civitai token into LoRA URLs when needed
- returns compiled prompt, model, adapter, advanced params, reference images, and snapshot

### Studio Integration

Studio currently consumes cards in two ways.

Quick mode:

- selected character cards can be injected through `composeCharacterInjection`
- prompt prefix is built from selected character cards
- reference image falls back to the highest-priority source image from the first selected card
- character LoRAs are merged into advanced params
- applied character card IDs are sent as `characterCardIds`

Card mode:

- `StyleCard` is required because it provides the model and adapter
- optional `CharacterCard`, `BackgroundCard`, and free prompt are compiled through `compileRecipe`
- `recipeSnapshot` is persisted with the resulting generation
- selected project is passed as `projectId`

Current Studio selection semantics:

- CharacterCard supports multi-select, capped by `CHARACTER_CARD.MAX_ACTIVE_CARDS`.
- StyleCard is single-select.
- BackgroundCard is single-select.

### Generation Integration

`createGeneration` links multi-character lineage through `characterCardIds`.

Current image generation path passes:

- `characterCardIds`
- `projectId`
- `recipeSnapshot`
- `snapshot`

Current video generation paths also carry `characterCardIds` through queue metadata and final generation creation.

Current execution callback path can persist `characterCardIds` for video outputs and `projectId` for callback-created generations.

Character-card gallery APIs query generations through the `GenerationCharacterCard` join table. A combination query returns generations linked to all requested character card IDs.

### Node Workflow Integration

Node workflow currently reuses Cards in specific inspectors.

Character image node:

- uses `useCharacterCards`
- can hydrate the node from a CharacterCard
- stores `node.data.cardId`
- sets `characterName`
- uses `characterPrompt` as node prompt
- uses source/reference images as node reference assets
- sets existing image mode from the card source image

Current limitation:

- CharacterCard LoRAs are skipped in Node workflow V1 because card LoRA shape does not yet match `NodeWorkflowLoraSelection`.

Background image node:

- uses `useBackgroundCards`
- can hydrate the node from a BackgroundCard
- stores `node.data.cardId`
- sets prompt, media label, media URL, reference assets, and existing-image mode when a source image exists

`NodeWorkflowProject` stores the workflow canvas state separately. Cards supply reusable inputs to nodes; they do not own the canvas project state.

### Related VoiceCard Surface

`VoiceCard` currently exists for reusable audio voices.

Current VoiceCard stores:

- owner through `userId`
- name
- provider
- optional model and voice IDs
- reference audio URL/storage key
- voice descriptors such as gender, age, tone, pace, pitch
- pronunciation dictionary
- sample text
- soft deletion

Current VoiceCard usage includes:

- Studio audio payload construction
- Node voice selector
- Fish Audio voice validation
- cloned voice-card creation from voice APIs

VoiceCard is related to the future Node workflow direction of connecting voice, character, and script, but its final boundary is not yet settled in this document.

## Target

### Role

Cards should be the reusable creative asset layer for consistent creation.

Confirmed owner direction:

```text
Cards should keep character consistency and should be directly reusable as workflow character cards.
```

Cards owns:

- reusable character identity
- reusable background/environment context
- reusable style/model context
- reusable prompt and recipe composition metadata
- card-owned source/reference assets
- card-specific LoRA metadata
- character consistency scoring and status
- private card library management
- card lineage into generations

Cards does not own:

- provider execution
- final model/provider routing
- BYOK/platform key resolution
- usage, allowance, or credit deduction
- final media persistence policy
- public Gallery feed behavior
- public Profile presentation
- Project folder hierarchy
- Node workflow canvas state
- long-video execution orchestration

### Character Consistency Contract

CharacterCard is the core identity card.

Target CharacterCard should represent:

- who the character is
- what visual traits define the character
- which source/reference images are canonical
- which LoRAs help reproduce the character
- how stable the card is across generation attempts
- which generated works used that character
- how it can be reused in Studio and Node workflow

CharacterCard should be the primary reusable unit for keeping a character consistent across images, videos, and workflow-generated scenes.

### Workflow Reuse Contract

Node workflow should be able to use CharacterCard as a role card.

Target behavior:

- selecting a CharacterCard in a workflow node should hydrate character name, prompt, source image, reference images, and recoverable `cardId`
- future LoRA bridging should map card LoRAs into `NodeWorkflowLoraSelection` through a server/client-safe adapter
- role nodes, voice nodes, script nodes, and generation nodes should be able to reference the same character identity without duplicating card facts
- Node workflow outputs should still persist to `Generation` and link back to the cards used

Cards supplies reusable role/context data. Node workflow owns graph state, node execution, edge semantics, and long-video orchestration.

### Recipe And Execution Boundary

CardRecipe is a composition contract, not a provider executor.

Target boundary:

- Cards may compile prompt, reference images, LoRA stack, model choice from StyleCard, and recipe snapshot.
- Generation services own the actual generation request, provider call, job tracking, storage persistence, and final `Generation` record.
- Provider-specific payload decisions must stay in provider/generation services.

StyleCard can carry model/adapter/advanced params, but provider capability and current model API behavior must be verified through provider docs before implementation changes.

### Ownership And Permission Rules

Every card write must be server-owned and user-scoped.

Required checks before writing card references:

- referenced CharacterCard belongs to the authenticated internal user and is not deleted
- referenced BackgroundCard belongs to the authenticated internal user and is not deleted
- referenced StyleCard belongs to the authenticated internal user and is not deleted
- referenced Project belongs to the authenticated internal user and is not deleted
- referenced Generation belongs to the authenticated internal user before linking, scoring, or displaying private card history

Client-selected card IDs, project IDs, generation IDs, model IDs, and adapter IDs are only user intent. Server code must verify ownership and compatibility before use.

### Storage Rules

Card source images and durable reference assets should follow storage policy:

- uploaded source images should be persisted to R2
- card reference images should not depend on provider temporary URLs
- deleting a card should not delete generations that used the card
- deleting a generation should not silently delete card-owned source/reference assets
- reference assets copied from generated works need explicit lifecycle rules before destructive cleanup

### Project Boundary

Projects may organize cards, but Projects do not own card semantics.

Rules:

- `projectId` on cards is private organization metadata.
- Moving a card between projects must not change card identity or generation lineage.
- Making a generation public must not expose its card's private project membership.

### VoiceCard Boundary

VoiceCard is related but not fully settled.

Near-term rule:

- treat VoiceCard as reusable audio/voice context for Studio audio and Node voice selection
- do not assume it shares all lifecycle, UI, or lineage rules with visual CharacterCard
- design character-to-voice binding explicitly in the Node workflow domain before making VoiceCard part of the main Cards target contract

## Unresolved

- BackgroundCard, StyleCard, and CardRecipe create/update currently accept `projectId` without a visible shared ownership validator. Project ownership checks should be added before relying on `projectId` writes as a permission boundary.
- CardRecipe create/update currently accepts referenced card IDs. It should explicitly verify all referenced cards belong to the same user and are not deleted at write time, not only at compile time.
- BackgroundCard and StyleCard update can change `projectId`; target ownership validation should match Projects rules.
- CharacterCard create currently validates `parentId` ownership but does not expose `projectId` in the current create schema. Whether CharacterCard should be project-organizable from creation needs product/UI confirmation.
- `createGeneration` writes `characterCardIds` into the join table without validating ownership itself. Callers should either validate before calling or `createGeneration` should enforce card ownership.
- Character refine links generated images to a single legacy `characterCardId` field rather than the multi-card join table. Whether to keep both lineage styles or migrate to join-table-only should be decided.
- Character-card generation listing routes use direct `auth()` and `NextResponse`; route factory consistency remains unresolved.
- CardRecipe has API and compiler but no first-class `/cards` tab or full management UI. The product role of saved recipes needs confirmation.
- Node workflow currently hydrates CharacterCard and BackgroundCard, but does not map card LoRAs into node LoRA selections. A card-to-node LoRA bridge is needed.
- Node workflow currently stores `cardId` in generic node data. The final schema for role card binding, voice binding, and script binding should be specified in `docs/domains/node-workflow.md`.
- VoiceCard exists and is used by Studio audio and Node voice selector, but whether VoiceCard belongs under Cards or should become a separate Voice domain is unresolved.
- StyleCard currently controls model and adapter in card mode. The long-term relation between StyleCard and model/provider routing should be audited before expanding card-driven routing.
- Provider/model behavior used by card extraction, scoring, refinement, and recipe fusion has not been checked against current official docs in this pass.
- Browser QA for `/cards`, Studio quick/card mode, character multi-select, card recipe generation, character refine, score, Node character-card hydration, and Node background-card hydration has not been run in this documentation pass.

## Source of Truth

- User-confirmed Cards direction in the 2026-06-02 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/storage.md`
- `docs/domains/studio.md`
- `docs/domains/projects.md`
- `prisma/schema.prisma`
- `src/constants/cards/character-card.ts`
- `src/constants/cards/card-types.ts`
- `src/constants/cards/cardify.ts`
- `src/constants/voice-cards.ts`
- `src/types/index.ts`
- `src/types/node-workflow.ts`
- `src/services/cards/character-card.service.ts`
- `src/services/cards/character-card.mapper.ts`
- `src/services/cards/character-refine.service.ts`
- `src/services/cards/character-scoring.service.ts`
- `src/services/cards/background-card.service.ts`
- `src/services/cards/style-card.service.ts`
- `src/services/cards/card-recipe.service.ts`
- `src/services/cards/voice-card.service.ts`
- `src/services/kernel/card-recipe-compiler.service.ts`
- `src/services/generation.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/execution-callback.service.ts`
- `src/lib/character-card-injection.ts`
- `src/lib/api-client/cards.ts`
- `src/lib/api-client/voice-cards.ts`
- `src/hooks/cards/use-character-cards.ts`
- `src/hooks/cards/use-background-cards.ts`
- `src/hooks/cards/use-style-cards.ts`
- `src/hooks/cards/use-card-recipes.ts`
- `src/hooks/cards/use-card-manager.ts`
- `src/hooks/cards/use-voice-cards.ts`
- `src/components/business/cards/CardsPageContent.tsx`
- `src/components/business/cards/CharacterCardManager.tsx`
- `src/components/business/cards/StyleCardManager.tsx`
- `src/components/business/cards/SimpleCardManager.tsx`
- `src/components/business/studio/StudioCardPicker.tsx`
- `src/components/business/studio/StudioCardSection.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/components/business/node/inspector/CharacterImageInspector.tsx`
- `src/components/business/node/inspector/BackgroundImageInspector.tsx`
- `src/components/business/node/inspector/NodeMediaInspector.tsx`
- `src/components/business/node/VoiceSelector.tsx`
- `src/app/[locale]/(main)/cards/page.tsx`
- `src/app/api/character-cards/route.ts`
- `src/app/api/character-cards/[id]/route.ts`
- `src/app/api/character-cards/[id]/refine/route.ts`
- `src/app/api/character-cards/[id]/score/route.ts`
- `src/app/api/character-cards/[id]/generations/route.ts`
- `src/app/api/character-cards/generations/route.ts`
- `src/app/api/background-cards/route.ts`
- `src/app/api/background-cards/[id]/route.ts`
- `src/app/api/style-cards/route.ts`
- `src/app/api/style-cards/[id]/route.ts`
- `src/app/api/card-recipes/route.ts`
- `src/app/api/card-recipes/[id]/route.ts`
- `src/app/api/card-recipes/[id]/compile/route.ts`
- `src/app/api/voice-cards/route.ts`
- `src/app/api/voice-cards/[id]/route.ts`

## Last Verified

- Date: 2026-06-02
- Method: owner direction confirmation plus schema/API route/service/compiler/hook/component/page/Node workflow inspector inspection
- External docs: not checked in this pass; provider/model behavior used by card LLM and generation paths still requires official documentation review before implementation changes
- Runtime: not run
