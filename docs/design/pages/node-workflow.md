# Node Workflow Page

Last updated: 2026-06-02

This document records current page-level facts for the Node workflow surface. It
is not a redesign spec and not a request to change UI code.

## Current

### Route Surface

| Surface       | Route          | Current UI entry      | Notes                            |
| ------------- | -------------- | --------------------- | -------------------------------- |
| Node workflow | `/studio/node` | `StudioNodeWorkbench` | Studio advanced canvas workspace |

### Structure

Current visible structure:

- `StudioNodeWorkbench`
  - full-height dark node canvas shell
  - `ReactFlowProvider`
  - `StudioNodeCanvas`
    - `ReactFlow`
    - `CanvasTopBar`
    - `CanvasBottomDock`
    - `CanvasAddMenu`
    - `CanvasMiniMap`
    - `StudioNodeAssistantDock`
    - `ProjectNameDialog`
    - delete confirmation dialog
    - node components for composer, agent, shot, image, voice, Seedance,
      video reference, and video merge

## Current State Matrix

| State      | Current fact                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Loading    | project sync, node media generation, script breakdown, prompt plan, voice/LoRA/reference loading states                    |
| Error      | node-level generation errors, toasts, inspector errors, assistant errors                                                   |
| Empty      | hook parks server calls until Clerk loads; default/empty canvas state lives in workflow hook and guide/onboarding surfaces |
| Signed-out | no route-level signed-out page found; `useNodeWorkflow` receives `clerkId=null` until auth loads                           |
| Signed-in  | React Flow workbench with project persistence and server sync                                                              |
| No credits | generation errors are node/component-owned; no separate no-credit page state                                               |

## Page CSS / Layout Rules

Current CSS facts:

- root uses `dark relative h-[calc(100svh-3rem)] min-h-[36rem]
overflow-hidden bg-node-canvas text-node-foreground`.
- Node uses the `node-*` token family:
  - `bg-node-canvas`
  - `bg-node-panel`
  - `bg-node-panel-inner`
  - `text-node-foreground`
  - `text-node-muted`
  - `shadow-node-panel`
- React Flow CSS is imported globally from `@xyflow/react/dist/style.css`.
- no generic app page should reuse `node-*` tokens without a Node-domain reason.

## Components

| Area      | Components                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| route     | `src/app/[locale]/(main)/studio/node/page.tsx`                                                                                                                                              |
| workbench | `StudioNodeWorkbench`, `CanvasTopBar`, `CanvasBottomDock`, `CanvasMiniMap`, `CanvasAddMenu`                                                                                                 |
| assistant | `StudioNodeAssistantDock`, `AssistantConversation`                                                                                                                                          |
| nodes     | `ComposerNode`, `AgentNode`, `ShotTextNode`, `ShotNode`, `CharacterImageNode`, `BackgroundImageNode`, `FrameImageNode`, `VoiceNode`, `SeedanceNode`, `VideoReferenceNode`, `VideoMergeNode` |
| dialogs   | `ProjectNameDialog`, delete confirmation dialog                                                                                                                                             |

## Interaction Details

Current page-internal interaction matrix:

| Interaction                 | Current trigger / owner                                    | Current state / feedback                                                                                  | Design notes                                                                                 |
| --------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Canvas pan/zoom/select      | React Flow canvas in `StudioNodeWorkbench`                 | React Flow owns viewport movement, selection, node movement, edge changes, and fit-view behavior          | Preserve React Flow semantics when changing shell layout.                                    |
| Connect nodes               | React Flow connection handles                              | `onConnect` creates a typed edge and persists it through workflow state                                   | Edge creation is stateful; visual redesign must not hide handles.                            |
| Add node from top bar       | `CanvasTopBar` add button                                  | Opens/uses add menu path and creates a node through `addNode`                                             | Add affordance must remain reachable when assistant dock is open.                            |
| Add node at canvas position | `CanvasAddMenu` / canvas add path                          | Creates a node at the intended flow position                                                              | Position fidelity matters because workflow meaning is spatial.                               |
| Delete node                 | Workflow action path / React Flow delete flow              | Removes node from state; related saved state is updated                                                   | Keyboard deletion needs dedicated QA before redesign.                                        |
| Project switch              | Project menu in `CanvasTopBar`                             | Selects active project id and hydrates that workflow                                                      | Switching is user-scoped and must not mix local/server projects.                             |
| Create project              | Project menu create item + `ProjectNameDialog`             | Creates local project immediately; server create is attempted when auth/server calls are available        | Dialog replaces native prompt; keep typed project name flow.                                 |
| Rename project              | Project menu rename item + `ProjectNameDialog`             | Updates current project name locally and calls server update when possible                                | Rename should not trigger canvas reset.                                                      |
| Delete project              | Project delete menu item + confirmation dialog             | Deletes selected project; active project falls back to another/default project                            | Destructive flow must keep confirmation.                                                     |
| Save now                    | Top-bar save button                                        | Calls `saveNow`; sync state is also mirrored through localStorage/server paths                            | Save feedback should distinguish saved, saving, and fallback-local states.                   |
| Arrange / tidy              | Top-bar arrange button                                     | Invokes graph arrangement path when available; placeholder toast exists for unavailable actions           | Do not make placeholder-only actions look equally final in redesign.                         |
| Top-bar collapse            | Top-bar collapse button                                    | Collapses/expands workspace chrome                                                                        | Collapsed state needs screenshot evidence before redesign.                                   |
| Assistant dock visibility   | Assistant dock controls and responsive first paint         | Dock is default-open on desktop and closes on first mobile paint below 768px                              | Mobile behavior is intentional to avoid covering canvas.                                     |
| Assistant inspection        | `StudioNodeAssistantDock` reading current nodes/project    | Can inspect workflow context and suggest next actions                                                     | Assistant is contextual tooling, not a separate route.                                       |
| Composer / agent generation | Composer and planner actions in node workflow hooks        | Can create script breakdown nodes and Seedance prompt-plan nodes/edges                                    | Agent-created nodes must stay visibly distinguishable from manual additions.                 |
| Media generation from nodes | Character/image/video/audio node controls                  | Uses node media generation hook; node data stores running/done/failed/stale states and generation links   | Node status tokens are part of the page interaction language.                                |
| Model/key selection         | `WorkflowModelPicker` and setup callbacks                  | Locked models can route to key/setup flow through `onClickLocked`                                         | Keep API-key boundary visible without turning it into a page-level dead end.                 |
| Reference images            | `CharacterImageReferenceControls` upload/select/paste path | Supports upload, asset selection, paste focus, and reference removal                                      | Reference controls are dense; mobile and keyboard QA are unresolved.                         |
| LoRA controls               | `CharacterImageLoraControls` import/select/remove path     | Imports custom LoRA URL, toggles assets, inserts trigger words, removes LoRA references                   | This is node-local interaction, not global asset management.                                 |
| Voice selection             | `VoiceSelector` / Fish voice dialogs                       | Can create/delete/select voice cards and pass selected voice to node data                                 | Voice library states belong in component-level QA and may need screenshots.                  |
| Persistence fallback        | `use-node-workflow` localStorage + server sync             | Hydrates per-user localStorage, parks unknown-owner data, then syncs server project records when possible | Do not redesign away the difference between saved server state and local fallback state.     |
| Placeholder actions         | Several toolbar/dock buttons use placeholder toast paths   | User gets toast feedback instead of silent no-op                                                          | Redesign should label incomplete affordances honestly or remove them from primary hierarchy. |

## Responsive

Known source facts:

- root height is `100svh - 3rem` with `min-h-[36rem]`.
- assistant dock defaults open on desktop and closes on first mobile paint.
- canvas is overflow-hidden.
- no fresh mobile/tablet screenshot pass was run for this page document.

## Empty / Loading / Error States

Node workflow has many component-level states rather than one page state:

- project sync loading/saving in top bar;
- empty/default canvas state through workflow state;
- node-specific queued/running/done/failed/stale/disabled statuses;
- generation errors stored on node data and surfaced by node UI/toasts;
- assistant conversation empty/loading/error states;
- voice/LoRA/reference picker loading/empty/error states.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- empty/default canvas;
- non-empty canvas with several node types;
- assistant dock open and closed;
- add menu;
- inspector/editor state;
- node generation running and failed;
- mobile 390 and tablet 768.

## i18n / Accessibility

- Route metadata uses `Metadata.studio.node`.
- UI copy uses `StudioNode` plus nested component namespaces.
- React Flow canvas, keyboard navigation, dialogs, and custom node controls
  need dedicated accessibility QA before redesign.

## Do Not Break

- Node workflow remains a Studio advanced workspace under `/studio/node`.
- React Flow rendering and global CSS import.
- Server-persisted `NodeWorkflowProject` state.
- User-scoped project storage and localStorage fallback behavior.
- Node generation status and saved `generationId` links.
- Card/voice/reference hydration paths.

## Unresolved

- What should the default empty canvas look like after redesign?
- Should assistant dock remain default-open on desktop?
- Which node types need first-class visual hierarchy in page design?
- How should mobile Node workflow behave if canvas editing is not primary on
  phones?

## Source Of Truth

- `docs/domains/node-workflow.md`
- `docs/domains/studio.md`
- `src/app/[locale]/(main)/studio/node/page.tsx`
- `src/components/business/node/StudioNodeWorkbench.tsx`
- `src/components/business/node/CanvasTopBar.tsx`
- `src/components/business/node/CanvasBottomDock.tsx`
- `src/components/business/node/CanvasAddMenu.tsx`
- `src/components/business/node/CanvasMiniMap.tsx`
- `src/components/business/node/StudioNodeAssistantDock.tsx`
- `src/components/business/node/nodes/**`
- `src/hooks/node/use-node-workflow.ts`
- `src/hooks/node/use-node-media-generation.ts`
- `src/types/node-workflow.ts`
- `src/constants/node-studio.ts`
- `src/constants/node-types.ts`
- `src/services/node/node-workflow.service.ts`
- `src/app/globals.css`

## Last Verified

- Date: 2026-06-02
- Method: documentation review and code inspection of Node workflow domain,
  route, workbench, node tokens, hooks, constants, and source files listed
  above.
