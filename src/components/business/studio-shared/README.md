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
- `pickers/` — 统一模型选择器：`ModelPickerPopover`（唯一面板）+ `ModelChip`（触发器）+ `MainModelPicker`（按模态取清单的分派器）

## Model pickers — there is exactly one

2026-09-17（D2 ④，画板 `docs/design/roadmap-canvas/gen/DesignD2Picker.dc.html`）收口：
**`ModelPickerPopover` 是全仓唯一的模型选择器**。三层钻取的 `BaseModelPickerPanel`
与更早的 `business/ModelSelector` 都已整删，`StudioModelOption` 搬到
`@/types/model-option`。

Model UI is classified by **modality first**: `ModelOption.outputType` =
`IMAGE | VIDEO | AUDIO | MODEL_3D`. Style / provider / video-brand are all
_secondary_ groupings, never the top level.

The one supported chain:

```text
getAvailable{Image,Video,Audio,3D}Models()
  → use{Image,Video,Audio,3D}ModelOptions()   (per-modality hook)
    → StudioModelOption[]                     (one option shape)
      → ModelPickerPopover                    (行 = 模型·型号·价格；渠道在右侧独立浮层)
        ← MainModelPicker(modality=…)         Studio / 3D / LLM 助手
        ← NodeModelChip / TextAssistantBar / VoiceRoomModelChip  直接挂
```

五处宿主用的是**同一颗触发器**（`ModelChip`：名 + 型号 + 价 / 状态 + caret）与同一个
弹层，只换触发器上的字。⛔ 不为某个宿主另开一套皮肤。

三条不可动的规则（owner D2 Q1 亲手定）：

1. 行只有三件 —— 模型名 · 型号 · 价格。⛔ 行里不画状态点、不写渠道名、不写能力标。
2. 渠道面板是独立浮层，浮在弹层右侧、与当前行顶部对齐；绿 / 黄点**只在面板里**。
3. **没有「自动」渠道**（`resolveModelChannel` 只认「手选记住的」与「只有一条」）。
   多渠道没点过 = 未选：行价格位写「—」，触发器写「先选渠道」。

例外（**不是**本选择器的变体，各有 owner 记录的理由）：
`studio/assistant-operator/StudioOperatorModelChip`（助手人设级路由，「自动」是真选
项；2026-08-19 生产事故后明确不与画布共用）与 `studio/lora/LoraBaseModelModal`
（LoRA 底模，走 `LoraBaseModel` 兼容性模型，没有渠道这一层）。

Route type (native API vs fal/Replicate aggregation vs self-hosted Runner) is an
adapter-layer fact — see `docs/references/providers.md`. It is **not** a
picker-level grouping; the UI only shows the channel label and its key dot.

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
