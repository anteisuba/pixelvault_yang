# Canvas Node Locator

Last updated: 2026-07-30

## Domain definition

The left canvas registry is a **node locator**, not a second editing surface.
It answers only:

1. Which nodes exist in this project?
2. How can I narrow the list quickly?
3. Where is the real node on the canvas?

The real React Flow node remains the only place that can be edited, deleted,
connected, generated, or opened in detail.

## Confirmed direction

- 2026-07-26: owner confirmed the old Cast card mirror should become a compact
  registry that only lists, searches, locates, and selects.
- 2026-07-30: owner expanded the scope from character/scene identities to
  **all canvas nodes**, grouped for scanning.

This is an already-confirmed implementation slice, not a new visual direction.

## Structure

The existing left glass panel remains. Its content becomes:

1. Header: `节点` + total node count (owned by `CanvasLeftPanel`).
2. Search field: searches display name, localized node type, prompt, and image
   role.
3. Non-empty modality groups in fixed order:
   - text
   - image
   - audio
   - video
4. Compact row:
   - 32px media thumbnail when the node has one; otherwise a modality glyph
   - user-visible name, with localized node type as fallback
   - localized node type
   - outgoing reference count when greater than zero
5. Empty result message for an empty canvas or a search with no matches.

## Interaction contract

- Activating a row calls the workbench's existing `focusNode(nodeId)`.
- `focusNode` selects only that node and animates `fitView` to it.
- Activation does **not** open `NodeDetailPanel`.
- There is no rename, delete, create, drag, quick-throw, or reference editing
  affordance in the locator.
- Creation remains in the rail's existing `＋添加` action.
- Keyboard activation uses the row's native button behavior and keeps a visible
  focus ring.

## Data contract

- Source: the live React Flow `useNodes()` array; never a copied registry.
- Reference count: number of live outgoing edges keyed by source node id.
- Display-name precedence:
  `characterName → character.name → backgroundName → shotName → voiceName → mediaLabel → sourceLabel → localized node type`.
- Unified image nodes retain their role-specific presentation type.
- No persistence schema is added.

## Non-goals

- Identity ownership or multi-owner schema.
- Node detail redesign.
- Video result archive / film bin.
- Mobile left-panel redesign; 375px canvas chrome is handled in the final
  responsive pass.

## Acceptance

- Every current node appears exactly once.
- Empty groups do not render.
- Search and clear restore results without mutating graph state.
- Clicking or keyboard-activating any result selects and locates the real node.
- No secondary edit/create/delete affordance remains in the locator.
- en/ja/zh labels are complete.

## Last verified

- 2026-07-30: locator and left-panel Vitest 10/10; `npm run typecheck`;
  relevant ESLint 0 errors; `git diff --check`.
- 2026-07-30 localhost regression: a project with image, audio, and video
  nodes rendered all three groups; searching `满穗` isolated the voice node;
  activating the result selected the real React Flow node.
