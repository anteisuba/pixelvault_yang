# Canvas Node Detail Redesign — design ledger

Status: direction selected; key slice confirmed
Last updated: 2026-07-30

## 0. Gate

This is a redesign, not a maintenance patch. `src/**` stays frozen until the
owner selects a structural direction, confirms a key slice, and the result is
written to `docs/references/pages/`.

## 1. Five-question gate

### 1. What does this domain own?

The node detail surface is the expanded task workspace for one real canvas
node. It owns:

- the node's primary media and current generation state;
- editing fields and parameters that belong to that node;
- node-family-specific creation, replacement, binding, or composition tasks;
- inspecting/removing real graph references;
- handoff actions already supported by the family, such as LoRA mounting,
  Studio image editing, classification, or generation.

It does not own graph layout, all-node navigation, project management, asset
archive design, or a second copy of the compact video composer.

### 2. Maintenance or redesign?

Redesign. The current shared shell is only a centered scrolling modal. Nine
registered families then inject unrelated long forms, so hierarchy, media
preview, task grouping, and action placement drift by family.

### 3. How far is direction confirmed?

Confirmed:

- compact composer is the collapsed state;
- node detail is the expanded state;
- a single shared detail surface serves all registered families;
- opening detail must not move the real canvas node or mutate graph data.
- direction A, Object studio, is the selected structure;
- the shared transparent shell uses a spacious media/state rail plus a
  family-specific task rail;
- the desktop workspace should use the available canvas width generously:
  larger media previews, 32px task padding, and a clearly separated two-rail
  composition instead of compressing both rails into a narrow modal;
- the nine node families keep the same outer frame but do not flatten into
  identical content;
- image and voice families expose explicit primary generation actions;
- the HTML key slice covers desktop and narrow/mobile reflow.
- below the comfortable two-rail width, the task rails stack into one reading
  column instead of shrinking controls and media into crowded columns.

Not confirmed:

- the final page-document contract and implementation task packet;
- final motion/color polish and every family-state edge case.

### 4. Shared vs family-specific boundary

Shared behavior:

- target-node lookup, focus return, Escape/backdrop close;
- live node state, status, name, model capability, references, and mutations;
- common media/state presentation primitives;
- common footer/action semantics and accessibility.

Family-specific content:

- video send plan and generation composer;
- character/background dossier;
- voice identity builder;
- shot/frame/image media inspector;
- merge/reference-video workflows.

The redesign may introduce shared layout slots, but must not flatten those
family workflows into one universal form.

### 5. Success and evidence

- A user can identify the node, its media/state, current task, and primary
  action without scrolling.
- Compact video state and expanded video state consume the same composer data.
- Every registered family has a deliberate empty, ready, generating, failed,
  and unsupported/disabled placement where applicable.
- Desktop, narrow desktop, keyboard, focus return, and 375px behavior are
  specified before implementation.
- No provider, persistence, billing, or graph contract changes are hidden in
  the UI redesign.

## 2. Fact audit

- `NodeDetailPanel` is a single centered overlay with `max-height: 80svh`; only
  video and video merge receive a wider shell.
- `node-detail/registry.ts` dispatches nine dedicated families:
  generated video, video merge, reference video, voice, character, background,
  shot, frame, and loose image.
- Video detail already delegates to `VideoComposer density="detail"`.
- Character/background/shot reuse large inspectors; voice owns a long bespoke
  identity form; loose image adds classification to `NodeMediaInspector`.
- The shell owns only breadcrumb, badge/name, status, close, width, and one
  undifferentiated scrolling body.
- This makes long forms technically reusable but structurally inconsistent.

## 3. State matrix

| State                | Shared shell                                       | Family body                                                    |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Empty                | identity and type remain visible                   | next valid source/action                                       |
| Ready                | media and state visible                            | editable task and primary action                               |
| Generating           | node remains identifiable; close remains available | truthful indeterminate progress and cancel only when supported |
| Failed               | error summary near primary media/action            | retry without losing inputs                                    |
| Unsupported/disabled | reason remains visible                             | unsupported controls omitted or disabled with reason           |
| Nested chooser       | detail stays mounted                               | one family-owned overlay at a time                             |
| Narrow/mobile        | no clipped action or double scroll                 | family sections reflow in reading order                        |

## 4. Structural directions

### A — Object studio (recommended)

A centered, canvas-contained object workspace. The shell divides into a stable
media/state rail and a family task rail. On desktop these are side by side; on
narrow screens they stack. The primary action stays at the bottom of the task
rail while the media/state rail remains visible.

Strengths:

- strongest shared hierarchy across all nine families;
- keeps preview, state, and task simultaneously legible;
- video can reuse the confirmed composer without duplicating it;
- dossier-heavy character/background and media-heavy image/video both fit.

Risk:

- requires defining a small set of real layout slots for existing inspectors;
  cannot be achieved by changing only modal CSS.

### B — Canvas inspector

A right-docked detail inspector keeps more of the graph visible. Primary media
becomes a compact sticky block above a single scrolling task column.

Strengths:

- fastest transition between nodes and graph relationships;
- smallest interruption to canvas work;
- natural fit for property editing.

Risk:

- character galleries, video composition, and voice identity become cramped;
- resembles the compact video sidecar too closely and weakens the
  collapsed/expanded distinction.

### C — Focus workspace

An in-canvas focus mode gives the selected node almost the whole stage. A
horizontal task switcher separates media, creation, references, and history;
the graph remains as subdued context behind the surface.

Strengths:

- most spacious for media review and complex creation;
- clear separation between node tasks;
- strongest future home for result history.

Risk:

- highest navigation cost and implementation scope;
- task tabs can hide important state and feel detached from the graph.

## 5. Recommendation

Proceed with A. The owner selected Object studio after reviewing the structural
prototype. It preserves the existing centered-overlay contract, creates a clear
difference from the compact video sidecar, and gives all nine families a stable
hierarchy without forcing them into identical controls.

The confirmed key slice compares:

- generated video in ready state;
- character dossier with multiple images and a bound voice;
- voice identity in empty and ready states;
- the same shell at 375px.

The image and voice task rails include explicit `Generate image` and
`Generate voice` primary actions. The design remains implementation-frozen
until this decision is converted into the stable page reference and an
authorized task packet.

## 6. Non-goals for the first implementation slice

- video asset card / film bin;
- new result-history backend;
- provider or payload changes;
- new graph ownership fields;
- final motion/color polish.
