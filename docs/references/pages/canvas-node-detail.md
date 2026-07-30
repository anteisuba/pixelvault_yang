# Canvas node detail · Object studio

Status: structural direction confirmed; detailed design not finalized

Owner confirmation: direction A and density principles only, 2026-07-30

Last verified: 2026-07-30
Route: `/[locale]/studio/node`

## 1. Responsibility

The node detail surface is the expanded workspace for one real canvas node. It
owns the node's primary media/state, its family-specific editing or generation
task, and the actions that already exist for that node.

It does not own:

- project or graph navigation;
- editing a different node type;
- a second copy of the compact video composer;
- provider, billing, persistence, or graph-contract changes;
- result archive / film-bin design.

Only the explicit expand control opens this surface. Double-clicking a node,
preview, model control, parameter control, asset slot, or canvas-selection
control must not open it.

## 2. Confirmed direction and design boundary

Direction A, **Object studio**, is confirmed as the structural direction.
The owner has not confirmed the final information hierarchy and state layout
for every node family. The current local implementation is a construction
baseline that exposes real content for the next design round; it must not be
treated as a finished page design.

The implementation reference is:

`C:\Users\15620\.codex\visualizations\2026\07\27\019fa404-dd78-7973-92d7-bf14c9ad6557\canvas-node-detail-object-studio.html`

The HTML node-family switcher is a design-demo control only. The product
surface always shows the currently expanded real node and must not let the user
change node type inside the detail workspace.

## 3. Shared structure

Every registered family uses one large, translucent canvas-contained dialog:

1. Stable header
   - canvas breadcrumb / back action;
   - family badge and real node name;
   - live status;
   - explicit close control.
2. Object workspace
   - a media/state region;
   - a family-specific task region;
   - one clear primary action where the family supports one.
3. One scroll owner
   - the dialog body scrolls;
   - the canvas behind it does not scroll or receive pointer actions.

The outer frame is shared; body content is not normalized into a universal
form. Generated video, video merge, reference video, voice, character,
background, shot, frame, loose image, and generic fallback keep their existing
business controls and generation paths.

## 4. Size and density

Desktop:

- use the available canvas width generously;
- target a workspace near `1180px`, bounded by viewport gutters;
- target up to `88svh`, bounded by viewport gutters;
- header padding is larger than the compact sidecar;
- task content uses approximately `32px` breathing room;
- media/task columns keep a visible gap and never compress into dense card
  stacks.

Narrow desktop and tablet:

- the body changes from two rails to one reading column before controls become
  cramped;
- the media/state region appears before the task region;
- the header may wrap but must keep the close action visible.

375px:

- the dialog becomes a near-full-canvas sheet with 12px gutters;
- body padding reduces without shrinking interactive targets;
- no horizontal overflow or nested vertical scrollbar;
- primary actions remain reachable without overlapping the close action.

## 5. Family-specific content

| Family           | Required object-studio emphasis                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Generated video  | left rail for the current film and exact sent assets; right rail for composition, model-aware parameters, send diagnostics, and generation |
| Video merge      | source sequence / result preview plus merge action                                                                                         |
| Reference video  | upload or current video plus replace / clear task                                                                                          |
| Voice            | active voice/representative sample plus source, model, tuning, emotion, and generate-sample action                                         |
| Character        | visual identity gallery plus card, voice binding, performances, LoRA, and image generation                                                 |
| Background       | location gallery plus card, performances, LoRA, and image generation                                                                       |
| Shot             | current shot image plus prompt/camera/composition/references and image generation                                                          |
| Frame            | current frame image plus source/references and image generation                                                                            |
| Loose image      | current asset plus category/source controls and optional image generation                                                                  |
| Generic fallback | model, supported fields, and the existing family action                                                                                    |

The image and voice families must continue to expose their existing generation
actions. This redesign may reposition them, but must not invent a new provider
request.

## 6. States

| State          | Shared behavior                       | Family behavior                                         |
| -------------- | ------------------------------------- | ------------------------------------------------------- |
| Empty          | node identity stays visible           | show the next valid source or task                      |
| Ready          | media/state and task are both legible | primary action reflects current inputs                  |
| Generating     | close remains available               | truthful progress; cancel only if already supported     |
| Failed         | error is near media or action         | retry preserves inputs                                  |
| Unsupported    | reason stays visible                  | unsupported controls are absent or disabled with reason |
| Nested chooser | dialog remains mounted                | only one family-owned chooser is active                 |

## 7. Accessibility and interaction

- The surface is a labelled `role="dialog"` with `aria-modal="true"`.
- The visible node title labels the dialog.
- `Escape`, backdrop, breadcrumb, and close button close it.
- Closing returns interaction to the canvas; it does not mutate node position or
  graph data.
- Focus-visible states remain present on all interactive controls.
- Reduced-motion preference preserves the same state changes without scale
  motion.

## 8. Acceptance for the final design

- Every registered family opens in the same spacious object-studio frame.
- Family bodies remain observably different and retain existing behavior.
- The old narrow/wide family split is removed.
- Desktop, narrow, and 375px layouts have no clipping or horizontal overflow.
- Explicit expand is still the only detail-entry control.
- Targeted tests cover dispatch, dialog semantics, close behavior, and
  responsive structure; typecheck, relevant lint, and browser regression pass.

## 9. Provisional implementation evidence

Source of truth:

- `src/components/business/node/node-detail/NodeDetailPanel.tsx`
- `src/components/business/node/node-detail/registry.ts`
- `src/components/business/node/node-detail/*DetailBody.tsx`
- `src/components/business/node/inspector/NodeMediaInspector.tsx`
- `src/components/business/node/inspector/*Inspector.tsx`
- `src/app/canvas.css`

The current construction baseline was verified 2026-07-30 with an additional
generated-video correction pass:

- `VideoComposer`, `VideoDetailBody`, and `NodeDetailPanel`: 52 targeted Vitest
  cases passed;
- `npx tsc --noEmit`, relevant ESLint, Prettier, and `git diff --check` passed;
- the owner localhost instance showed the generated-video body as a real
  two-rail Object studio on desktop and a single reading column at 375px;
- the previous first pass changed the shared dialog shell but still enlarged
  the legacy stacked video composer. That incomplete structure is retired.

This evidence proves the current implementation is usable as a factual design
input. It does not prove that the detailed page design is owner-approved. The
next design round must cover all family states and update this document before
further visual implementation.

The broader node-detail directory Vitest command from the earlier pass did not
complete within its 120-second local window and is not recorded as passing.
