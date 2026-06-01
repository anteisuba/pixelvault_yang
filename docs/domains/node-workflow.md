# Node Workflow Domain

最后更新：2026-06-02

本文档记录 Node workflow 业务域的当前事实、已确认目标和未决边界。Node workflow 当前也在代码和 UI 中被称为 Node Studio。本文档不记录 provider 参数、模型价格、Seedance/FAL/OpenAI/Gemini/DeepSeek 的官方能力细节；涉及这些能力的实现变更必须先查官方当前文档。

## Current

### Role

当前 Node workflow 是 Studio 下的高级画布工作区。

Current implemented responsibilities include:

- render `/studio/node` as a React Flow canvas
- persist user-scoped workflow canvas projects
- keep nodes, edges, and per-node data as validated JSON state
- support localStorage fallback and server-side project sync
- create, rename, switch, delete, activate, and save workflow projects
- add and connect workflow nodes
- inspect and edit node data
- generate script breakdowns from a story idea
- generate Seedance prompt plans from an idea and current graph references
- spawn character nodes from agent breakdowns
- spawn a runnable shot/Seedance/video-merge subgraph from an agent plan
- generate image, video, and audio outputs from node data
- upload reference images, reference audio, and reference videos
- merge upstream video clips
- hydrate character/background nodes from Cards
- use voice nodes as reusable voice/reference-audio inputs
- provide a canvas assistant that can inspect current nodes and suggest next actions

Current Node workflow is not a full independent product. It is mounted under Studio and shares generation, storage, API key, model catalog, usage, and media persistence infrastructure with the rest of the app.

### Route Surface

Current page route:

- `/studio/node`

Current Node workflow API routes:

- `GET /api/node-workflow/projects`
- `POST /api/node-workflow/projects`
- `GET /api/node-workflow/projects/[id]`
- `PUT /api/node-workflow/projects/[id]`
- `DELETE /api/node-workflow/projects/[id]`
- `POST /api/node-workflow/projects/[id]/activate`
- `POST /api/node-workflow/upload-reference-video`
- `POST /api/node-workflow/merge-videos`

Related planning and assistant routes:

- `POST /api/script-breakdown`
- `POST /api/studio/seedance-prompt-plan`
- `POST /api/studio/node-assistant`

Related shared generation routes consumed by Node workflow:

- `POST /api/studio/generate`
- video generation/status APIs through `submitVideoAPI` and `checkVideoStatusAPI`
- audio generation/status APIs through `generateAudioAPI` and `checkAudioStatusAPI`
- image upload through `uploadImageAPI`
- reference audio upload through `uploadReferenceAudioAPI`

### Data Model

`NodeWorkflowProject` is the current database source of truth for server-persisted canvas projects.

Current fields:

- `id`
- `userId`
- `name`
- `state`
- `lastActiveAt`
- `isDeleted`
- `createdAt`
- `updatedAt`

`state` is a JSON snapshot shaped as:

```text
{
  nodes: [...],
  edges: [...]
}
```

The database treats this as JSON, but server and client code validate the shape through Zod schemas in `src/types/node-workflow.ts`.

`NodeWorkflowProject` is separate from normal `Project`.

- `Project` is the private file-management/folder domain.
- `NodeWorkflowProject` is the advanced canvas workflow state domain.

Current `NodeWorkflowProject` limit:

- max projects per user: 50

### State Schema

Current node state is defined by:

- `NodeWorkflowStateDataSchema`
- `NodeWorkflowNodeSchema`
- `NodeWorkflowEdgeSchema`
- `NodeWorkflowNodeDataSchema`

Current node types:

```text
composer
agent
shotText
shot
characterImage
backgroundImage
frameImage
voice
seedance
videoReference
videoMerge
```

Current media kinds:

```text
text
image
video
audio
```

Current node statuses:

```text
idle
queued
ready
running
done
failed
stale
disabled
```

Current generation statuses stored on node data:

```text
idle
pending
success
error
```

Current `NodeWorkflowNodeDataSchema` includes fields for:

- prompt and shot text fields
- scene/action/camera/composition/location/mood/lighting/frame intent
- dialogue and voice profile fields
- voice reference audio metadata
- video merge trim settings
- video resolution/aspect ratio/duration/negative prompt/audio intent
- script breakdown
- Seedance prompt plan and timeline
- planner route metadata
- model selection intent
- image mode/source fields
- media URL and media generation metadata
- generated `generationId`
- source `generationId`
- character draft reference
- `cardId` for library card binding
- reference assets
- LoRA selections

The schema uses `.passthrough()`, so current node data may carry extra keys beyond the explicit contract.

### Persistence

Current persistence is hybrid:

- localStorage keeps a per-Clerk-user workflow snapshot for resilience and fast hydration.
- Server persistence stores user-owned `NodeWorkflowProject` rows.
- Server project rows are the durable cross-device source once hydration succeeds.
- The hook migrates owned local content to server when the server has no projects.
- The hook rejects mismatched owner snapshots so one signed-in user's local workflow state is not written into another user's account.

Current server behavior:

- list projects ordered by `lastActiveAt desc`
- create project after ensuring DB user exists
- enforce per-user project count
- validate state before persistence
- update name and/or state
- soft-delete projects
- bump `lastActiveAt` when activated

Current service deliberately coerces invalid stored state to an empty state instead of throwing, so a malformed snapshot does not break the whole project list.

### Canvas And UI Surface

`StudioNodeWorkbench` is the main canvas shell. It owns:

- React Flow rendering
- node component registry
- canvas top bar
- canvas bottom dock
- mini map
- add menu
- assistant dock
- project name dialog
- delete confirmation
- save action
- layout tidy action
- node generation actions

`useNodeWorkflow` owns:

- current canvas state
- project list and current project
- localStorage hydration
- server hydration and migration
- debounced local writes
- debounced server writes
- add node
- connect nodes
- delete node
- create/switch/rename/delete project
- update node data
- update script breakdown
- update Seedance prompt plan
- spawn character nodes from breakdown
- spawn full workflow from agent plan
- apply Seedance prompt plan to a Seedance node
- save now
- tidy layout

### Graph Semantics

Current graph semantics are mostly implemented in the client.

For video nodes, `StudioNodeWorkbench` reads upstream graph context:

- upstream `shotText` nodes contribute prompt text
- upstream visual nodes contribute reference images
- upstream keyframe nodes contribute reference images
- upstream voice nodes contribute reference audio
- upstream video nodes contribute reference video clips
- voice nodes can be routed through a character/visual node before a Seedance node so the audio binding carries the character name

For image and audio nodes, current generation mainly uses the node's own inspector data instead of harvesting the wider graph.

The graph does not yet have a server-owned execution planner. Current edges guide UI-side input harvesting and node spawning.

### Generation Integration

Current Node workflow generation uses shared media execution paths.

Image generation from general image-like nodes uses:

```text
node data
-> useNodeMediaGeneration
-> studioGenerateAPI
-> /api/studio/generate
-> image generation service
-> Generation
```

Character image generation uses:

```text
character image node
-> useCharacterImageGeneration
-> image generation flow
-> Generation
```

Video generation uses:

```text
video node
-> useNodeMediaGeneration
-> submitVideoAPI
-> video status polling
-> Generation
```

Audio generation uses:

```text
audio node
-> useNodeMediaGeneration
-> generateAudioAPI
-> sync result or audio status polling
-> Generation
```

Successful node media generation writes the resulting `Generation.id` and output URL back into node data:

- `generationId`
- `mediaUrl` or `imageUrl`
- `mediaLabel`
- `generationStatus = success`
- `status = done`

The durable generated work still belongs to `Generation`. Node workflow stores references to generated outputs; it is not the canonical generated asset table.

### Planning

Current Agent planning has two modes:

- `storyBreakdown`
- `seedancePrompt`

`storyBreakdown` turns an idea into structured drafts:

- title
- logline
- reference intent
- copy risk
- characters
- scenes
- actions
- beats
- shots

`seedancePrompt` turns an idea and optional graph reference summary into:

- title
- visual description
- timeline
- motion
- camera
- duration
- audio intent
- final prompt
- copy risk

Current planner route resolution supports:

- `auto`
- Gemini
- DeepSeek
- OpenAI

The current planner route can use an explicit `apiKeyId`, an active user key for the adapter, or a platform key when available.

### Assistant

The Node assistant route streams text advice for the current canvas context.

Current assistant request includes:

- recent messages
- summarized current nodes
- selected node IDs
- locale
- optional `apiKeyId`

Current assistant behavior:

- replies in the requested locale
- references nodes by `[[node:id]]` markers
- suggests practical next actions
- does not directly mutate the canvas

When no explicit key is selected and AI Gateway is available, current service may route through AI Gateway. Otherwise it resolves an LLM text route through server-side user/platform key logic.

### Cards Integration

Current Cards integration:

- Character image nodes can hydrate from `CharacterCard`.
- Background image nodes can hydrate from `BackgroundCard`.
- Hydrated nodes store `cardId`.
- CharacterCard source/reference images become node image/reference assets.
- CharacterCard prompt becomes node prompt.
- BackgroundCard prompt/source image become node prompt/media/reference assets.

Current limitation:

- CharacterCard LoRAs are not mapped into node LoRA selections because card LoRA shape does not yet match `NodeWorkflowLoraSelection`.

Cards own reusable character/background/style/card facts. Node workflow owns graph state, edge semantics, and workflow orchestration.

### Voice Integration

Current voice integration:

- `voice` node stores voice profile fields.
- User can select a Fish Audio voice ID through the node voice library.
- User can upload reference audio.
- User can generate a short reference audio sample for a selected Fish voice.
- Seedance video nodes can harvest upstream voice reference audio.
- Voice can connect directly to a Seedance node.
- Voice can connect through a character/visual node before a Seedance node, which preserves the character name for audio binding.

VoiceCard exists elsewhere in the codebase, but the final boundary between VoiceCard, Cards, Audio, and Node workflow is unresolved.

### Reference Inputs

Current reference image upload in Node workflow uses the shared image upload API and creates a `Generation` row for the uploaded image.

Current reference video upload:

- writes bytes directly to R2 under `video-references/{userId}/...`
- returns a URL, size, MIME type, and file name
- does not create a `Generation` row
- is described in code as a transient handle attached to a generation

Current reference audio upload is handled through the shared voice/audio API client and service, not through a NodeWorkflowProject table.

### Video Merge

Current `videoMerge` node:

- reads upstream video URLs
- requires at least 2 clips
- caps at 9 clips
- can submit simple full-clip merge
- can submit a compose-style payload when trim settings exist
- writes merged output URL back to the node

Current merge service:

- calls FAL queue endpoints
- fetches provider output
- uploads merged output to R2
- returns R2-backed output metadata
- does not create a `Generation` record for the merged clip

This is a current implementation fact, not the final archive policy for workflow clips.

## Target

### Role

Node workflow should be the core advanced workspace for directorial, long-video, and multi-step generation workflows.

Confirmed owner direction:

```text
Node workflow is a core advanced capability.
It should support long-video creation through a canvas node system where voice, role, script, and generation steps can be connected.
The purpose is to reduce random retrying and make intended videos more controllable.
```

For now, Node workflow should be described as:

```text
Studio advanced workspace / sub-workspace
```

It should not be written as:

- a normal image/video/audio mode
- a replacement for the default Studio workspace
- a permanently independent product before the long-video workflow is clearer

### Owns

Node workflow owns:

- canvas workflow project state
- node and edge semantics
- node-level prompt/reference/model selection state
- graph-driven reference harvesting
- graph-driven role/voice/script binding intent
- workflow project persistence
- workflow-specific UI orchestration
- planner output stored on nodes
- spawn rules that materialize agent plans into nodes
- long-video workflow structure
- workflow clip/reference lifecycle decisions after they are explicitly designed

### Does Not Own

Node workflow does not own:

- model catalog source of truth
- provider API contracts
- final BYOK/platform key resolution policy
- provider execution adapters
- usage, allowance, or credit deduction policy
- R2 persistence implementation
- canonical `Generation` records
- public Gallery presentation
- public Profile presentation
- private asset browser bulk management
- normal `Project` folder hierarchy
- Card character consistency logic
- VoiceCard lifecycle
- LoRA asset/training lifecycle

### Long-Video Direction

Target long-video workflow should support:

- story or idea planning
- character/role planning
- voice planning
- scene/beat/shot planning
- reusable character cards as role inputs
- reusable voice inputs
- background/reference inputs
- per-shot video generation
- clip review and retry
- clip merge or assembly
- final output persisted as `Generation`
- recovery from partial workflow progress

The target is not to make one opaque "generate long video" button. The target is a controllable chain where the user can inspect and adjust role, voice, script, references, shots, clips, and final assembly.

### Role / Voice / Script Binding

Target binding rules:

- `CharacterCard` should be usable as a workflow role card.
- A role node should keep a recoverable card binding instead of duplicating all card facts.
- Voice nodes should be bindable to a role/character intentionally.
- Script/shot nodes should refer to role IDs and background/scene IDs explicitly.
- Seedance/video nodes should consume bound role, reference, voice, and shot text through explicit graph semantics.
- Node outputs should link back to the `Generation` records they created.

Current generic `cardId`, `character.characterId`, voice fields, and user-edited shot bindings are enough for the current UI, but they are not the final domain model for role/voice/script relationships.

### Generation Contract

Node workflow outputs should still persist through the shared `Generation` model when they represent durable user-visible generated works.

Rules:

- Successful user-visible image/video/audio outputs should end as `Generation` records.
- Node data may cache `generationId` and media URLs for canvas continuity.
- Node data must not become the only archive source for generated works.
- If a workflow output is reusable, user-visible, recoverable, or required by final assembly, it needs an explicit persistence lifecycle.
- Hidden temporary intermediate files may be treated differently, but only after a product decision.

### Execution Contract

Node workflow should orchestrate media-specific execution; it should not collapse all media generation into one abstract provider executor.

Correct direction:

```text
Node workflow: graph state, orchestration, reference harvesting, role/voice/script binding
Generation services: media execution, provider calls, usage, storage, final asset records
```

Image, video, audio, and future 3D execution should remain media-specific because provider payloads, polling, callbacks, storage outputs, and failure behavior differ.

### Key Resolution Contract

Node workflow must follow the same BYOK/platform key boundary as the rest of generation.

Rules:

- Client-side model/key choice is user intent only.
- Final key resolution must happen server-side.
- If the user explicitly selects `apiKeyId`, that BYOK key must be used.
- If the explicit key is unavailable or incompatible, the request must fail loudly.
- The same request must not silently fall back from explicit BYOK to platform key.
- If no explicit key is selected, server-side automatic BYOK/platform fallback must follow the project-wide generation/API Keys rules.

Planner, assistant, merge, image, video, and audio execution paths should be audited against this rule before major implementation changes.

### Storage Contract

Node workflow references and clips need explicit lifecycle categories.

Target categories:

- durable workflow reference
- generation replay input
- user-visible intermediate clip
- final assembled output
- temporary execution input

Target rules:

- Durable workflow references should be R2-backed and owner-scoped.
- Final assembled outputs should persist as `Generation`.
- User-visible intermediate clips should not depend on provider temporary URLs.
- Temporary execution inputs may have TTL or best-effort cleanup, but only if they are not required for replay/recovery.
- Private media access must follow the storage/auth target rules; public R2 URL is not a privacy boundary.

### Project Boundary

`NodeWorkflowProject` remains separate from normal `Project`.

Rules:

- Normal `Project` organizes generated works and cards like private folders.
- `NodeWorkflowProject` stores canvas workflow state.
- A future final video `Generation` may optionally be assigned to a normal `Project`.
- Normal Project membership must not leak workflow project names or canvas internals.
- Deleting a NodeWorkflowProject should not delete durable `Generation` outputs without an explicit owner-confirmed destructive action.

### Cards Boundary

Cards provide reusable creative inputs.

Target rules:

- CharacterCard identity should hydrate role/character nodes.
- BackgroundCard should hydrate background/reference nodes.
- Card LoRAs need a safe mapping into NodeWorkflowLoraSelection before automatic use.
- Node workflow may store card bindings, but Cards remains the source of truth for card-owned facts and consistency status.
- Workflow outputs should record which cards influenced the generation when that lineage matters for replay and reuse.

### Voice Boundary

Voice binding must be designed explicitly before VoiceCard becomes part of the main Cards/Node contract.

Near-term rule:

- voice node data can represent manual voice metadata, Fish voice ID, or reference audio.
- Seedance/video nodes can consume voice reference audio through graph edges.
- do not assume VoiceCard shares the same lifecycle as CharacterCard.
- do not store plaintext provider secrets or direct provider credentials in node state.

### Assistant Boundary

The canvas assistant should remain an advisory surface unless a specific tool/action contract is designed.

Rules:

- Assistant may inspect summarized canvas state.
- Assistant may suggest edits and next steps.
- Assistant must not claim it changed the canvas unless there is an explicit action path.
- Assistant should not become an invisible router for provider execution, credits, or storage decisions.

## Unresolved

- The final role/voice/script binding schema is not settled. Current state mixes `cardId`, `character.characterId`, voice fields, and user-edited shot bindings.
- `NodeWorkflowNodeDataSchema` uses `.passthrough()`. This is flexible for UI iteration but weak as a long-term execution contract.
- Current graph semantics are mostly client-side. There is no server-owned workflow execution planner that validates the full graph before running it.
- `videoReference` upload writes directly to R2 without creating a `Generation` row. Its retention, deletion, privacy, and replay behavior need a lifecycle decision.
- `videoMerge` outputs R2-backed files but does not create `Generation` records. Whether merged clips are intermediate assets or durable works needs confirmation.
- The current merge/compose implementation depends on FAL endpoint behavior. Provider details must be checked against official current FAL docs before expanding this area.
- Planner and assistant key resolution should be audited against the project-wide BYOK/platform fallback contract.
- `merge-videos` has a local FAL key resolver. It should be checked against the central generation/API Keys key-resolution rules.
- `node-assistant` and `upload-reference-video` are direct route handlers, while most project/planner/merge routes use API route factories. Route boundary consistency is unresolved.
- Reference audio upload and generated voice reference lifecycle are owned by shared audio/voice services today. The final VoiceCard/Node workflow boundary is unresolved.
- CharacterCard LoRAs are not yet mapped into node LoRA selections.
- `CharacterCard`/`BackgroundCard` hydration stores `cardId` in generic node data. A typed card-binding contract is needed before workflow outputs rely on it for lineage.
- Background scene binding in `spawnFullWorkflowFromAgent` is best-effort through a `sceneId` key that is not a formal node schema field.
- Node-generated outputs store `generationId` in node data, but `Generation` does not currently store a `nodeWorkflowProjectId` or node-run lineage field.
- Current Node workflow does not define versioned migrations for server-stored state beyond schema parsing/coercion and localStorage legacy handling.
- Server invalid state currently coerces to empty state. This protects UI recovery, but may hide data corruption unless paired with logging/recovery tooling.
- Old source comments still reference deleted `docs/spark/...` documents. Those old docs are no longer active source of truth.
- Browser QA for `/studio/node`, project persistence, planner routes, card hydration, voice binding, Seedance generation, reference video upload, and video merge has not been run in this documentation pass.
- External provider/model docs were not checked in this pass.

## Source of Truth

- User-confirmed Node workflow direction in the 2026-06-02 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/storage.md`
- `docs/architecture/credits.md`
- `docs/domains/studio.md`
- `docs/domains/cards.md`
- `docs/domains/projects.md`
- `prisma/schema.prisma`
- `src/app/[locale]/(main)/studio/node/page.tsx`
- `src/app/api/node-workflow/projects/route.ts`
- `src/app/api/node-workflow/projects/[id]/route.ts`
- `src/app/api/node-workflow/projects/[id]/activate/route.ts`
- `src/app/api/node-workflow/upload-reference-video/route.ts`
- `src/app/api/node-workflow/merge-videos/route.ts`
- `src/app/api/script-breakdown/route.ts`
- `src/app/api/studio/seedance-prompt-plan/route.ts`
- `src/app/api/studio/node-assistant/route.ts`
- `src/constants/node-types.ts`
- `src/constants/node-studio.ts`
- `src/constants/script-breakdown.ts`
- `src/constants/seedance-prompt-plan.ts`
- `src/constants/config.ts`
- `src/types/node-workflow.ts`
- `src/types/node-assistant.ts`
- `src/types/script-breakdown.ts`
- `src/types/seedance-prompt-plan.ts`
- `src/services/node/node-workflow.service.ts`
- `src/services/node/node-assistant.service.ts`
- `src/services/node/script-breakdown.service.ts`
- `src/services/kernel/node-planner-route.service.ts`
- `src/services/prompts/seedance-prompt-plan.service.ts`
- `src/services/video-reference.service.ts`
- `src/services/video-merge.service.ts`
- `src/hooks/node/use-node-workflow.ts`
- `src/hooks/node/use-node-media-generation.ts`
- `src/hooks/node/use-node-reference-upload.ts`
- `src/hooks/node/use-script-breakdown.ts`
- `src/hooks/prompts/use-seedance-prompt-plan.ts`
- `src/hooks/use-workflow-model-options.ts`
- `src/lib/node-workflow-graph.ts`
- `src/lib/node-workflow-prompt.ts`
- `src/lib/node-workflow-layout.ts`
- `src/lib/api-client/node-workflow.ts`
- `src/lib/api-client/node-assistant.ts`
- `src/lib/api-client/script-breakdown.ts`
- `src/lib/api-client/seedance-prompt-plan.ts`
- `src/components/business/node/StudioNodeWorkbench.tsx`
- `src/components/business/node/NodeWorkflowActionsContext.tsx`
- `src/components/business/node/StudioNodeAssistantDock.tsx`
- `src/components/business/node/WorkflowModelPicker.tsx`
- `src/components/business/node/VoiceSelector.tsx`
- `src/components/business/node/inspector/AgentInspector.tsx`
- `src/components/business/node/inspector/ComposerInspector.tsx`
- `src/components/business/node/inspector/CharacterImageInspector.tsx`
- `src/components/business/node/inspector/BackgroundImageInspector.tsx`
- `src/components/business/node/inspector/NodeMediaInspector.tsx`
- `src/components/business/node/inspector/SeedanceInspector.tsx`
- `src/components/business/node/inspector/VoiceInspector.tsx`
- `src/components/business/node/inspector/VideoReferenceInspector.tsx`
- `src/components/business/node/inspector/VideoMergeInspector.tsx`
- `src/components/business/node/nodes/CharacterImageNode.tsx`
- `src/components/business/node/nodes/BackgroundImageNode.tsx`
- `src/components/business/node/nodes/VoiceNode.tsx`
- `src/components/business/node/nodes/SeedanceNode.tsx`
- `src/components/business/node/nodes/VideoReferenceNode.tsx`
- `src/components/business/node/nodes/VideoMergeNode.tsx`

## Last Verified

- Date: 2026-06-02
- Method: owner direction confirmation plus docs/schema/API route/service/hook/type/component/inspector/code inspection
- External docs: not checked in this pass; provider/model behavior for planner models, Seedance, FAL merge/compose, video reference limits, and AI Gateway must be verified against official current docs before implementation changes
- Runtime: not run
