# studio-shared/ — L1.5 Studio Shared layer

UI components and hooks consumed by 2+ Studio tools (Image, Video, Audio, 3D, Edit, LoRA, Node) that carry no tool-specific business logic. Established by [Spec 2](../../../../docs/spark/2026-05-28-spec-2-studio-shared-layer.md) on top of the architecture contract in [Spec 1](../../../../docs/spark/2026-05-28-architecture-contract-design.md).

## What belongs here

A file enters `studio-shared/` only if **all** are true:

1. Imported by **2+ different Studio modules** (verified via grep, not by intuition)
2. Contains **no** tool-specific business logic (no `if (mode === 'image')` branches — split into per-tool components instead)
3. Does not depend on any L2 tool module (`studio/edit/`, `studio/lora/`, `studio/node/`)
4. Has no obvious single-owner answer (a "shared between Audio and Video" file that's really just an Audio detail belongs in Audio)

If a file fails any test, it goes back to its owning module's L2 directory or stays flat until its owning module's spec relocates it.

## Subdirectory map

- `chrome/` — workbench shell: layout, canvas, bottom dock, lightbox, command palette, error boundary, active LoRA bar
- `setup/` — API-key / model-config gates: quick setup dialog, API routes section, face-consent modal
- `workflow/` — workflow & mode selection: workflow tabs / picker / summary, mode selector, generate bar
- `primitives/` — small atomic UI primitives (e.g. `tool-surface`)

## Public API

External code imports only via the barrel:

```ts
import {
  QuickSetupDialog,
  StudioCanvas,
} from '@/components/business/studio-shared'
```

Deep imports (`@/components/business/studio-shared/setup/QuickSetupDialog`) work but are discouraged — once Spec 2 settles, ESLint will enforce the barrel for cross-module callers (currently only enforced for downward boundary checks; deep-import enforcement is a Spec 6 follow-up).

## What does NOT belong here (yet)

- 3 giant SHARED files still in `studio/` flat (`StudioPromptArea` 1,371 LOC, `GenerationPreview` 667 LOC, `StudioDockPanelArea` 571 LOC) — Spec 6 will split them and relocate the cohesive pieces.
- ~22 other SHARED candidates (`ReferenceImageChip`, `StudioAspectRatioPopover`, `StudioCardsButton`, `StudioEnhanceButton`, `StudioGallery`, `StudioCardSection`, etc.) — Spec 6 second pass.
- Single-tool-owned files mislabeled as shared (`StudioInpaintEditor` → Edit, `VoiceSelector` → Node, etc.) — moved by each tool's module spec.

## Boundary rules (ESLint-enforced)

Files under `studio-shared/` cannot import from:

- `src/components/business/studio/edit/**` (L2 Edit)
- `src/components/business/studio/lora/**` (L2 LoRA)
- `src/components/business/studio/node/**` (L3 Node)
- `src/app/**` (Next.js routes)

They **can** import from:

- L0 Shared Kernel (`src/services/kernel/`, `src/hooks/kernel/`, `src/lib/`, `src/constants/`)
- L1 content domains (`src/services/prompts/`, etc.) — going _downward_ to fetch content
- React contexts in `src/contexts/`
- shadcn UI primitives in `src/components/ui/`
- Other `studio-shared/` siblings (relative imports OK inside the directory)
