# src/components/business/studio/ — Studio Workspace Components

## Risk Level: HIGH (53 components across `studio/` + `studio-shared/`, sharing 3 contexts)

## Component Tree

Studio chrome 已物理拆分：稳定外壳在 `studio-shared/`（`chrome/` + `workflow/` + `setup/`），
image-only 与尚未迁移的组件留在 `studio/` 或 `image/`。下面标注每个节点的真实目录。

```
(workspace)/layout.tsx
└── StudioProvider
    └── StudioWorkspaceUI (components/business/ — mounted once for image/video/audio)
        ├── StudioWorkbenchLayout (studio-shared/chrome/ — 图片模态：左参数栏 + 右结果区)
        ├── StudioFlowLayout (studio-shared/chrome/StudioResizableLayout.tsx — 视频/音频：纵向 canvas + dock)
        │   ├── StudioCanvas (studio-shared/chrome/)
        │   │   ├── GenerationPreview (studio/ — current result)
        │   │   ├── CompareGrid (image/ — 共享图墙：多模型 / 多张 / 矩阵)
        │   │   └── StudioResultFeedback / StudioAudioFeedback / StudioGenerationErrorDialog
        │   └── StudioBottomDock (studio-shared/chrome/)
        │       ├── StudioCardSection (studio/ — char/bg/style cards)
        │       ├── StudioPromptArea (studio/ — prompt input + generate)
        │       ├── StudioDockPanelArea (studio/ — inline panels: advanced, civitai, refImage, etc.)
        │       └── StudioKeepChangePanel (image/)
        └── StudioCommandPalette (studio-shared/chrome/ — Cmd+K)
```

按需挂载、不在主树固定位置的常用单元：StudioModeSelector / StudioGenerateBar / StudioWorkflowPicker
（studio-shared/workflow/）、StudioToolbarPanels / StudioAspectRatioPopover /
StudioGallery（studio/）、StudioLightbox / StudioErrorBoundary（studio-shared/chrome/）。

## Data Flow

```
User Input (prompt, aspect ratio, cards)
    ↓
StudioFormContext (HOT — useStudioForm)
    ↓
StudioDataContext (cards, projects via useStudioData)
    ↓
useUnifiedGenerate() → POST /api/studio/generate
    ↓
StudioGenContext (result via useStudioGen)
    ↓
GenerationPreview renders result
```

## Rules

1. **Before modifying any component**: check which context hooks it uses (`useStudioForm`, `useStudioData`, `useStudioGen`)
2. **Panels**: controlled by `StudioFormState.panels` — toggling is handled by reducer dispatch, not local state
3. **Panel hosts**: `StudioDockPanelArea` (studio/) renders inline panels (advanced, civitai, refImage, voiceSelector, voiceTrainer, videoParams, script) and is mounted by `StudioBottomDock`. The `aspectRatio` panel is its own popover (`StudioAspectRatioPopover`). (`StudioPanelDialogs` no longer exists — confirm the current modal-panel host against code before relying on it.)
4. **Entry point**: `index.ts` re-exports the main component

## Relatively Isolated Components (safer to modify)

- `CompareGrid.tsx` (image/) — **共享图墙**：多模型、单模型多张、以及两者相乘的矩阵都渲染它（`VariantGrid` 已于 2026-08-14 退役）。格子自带模型名，同模型多张时带 `1/2` 序号
- `StudioCommandPalette.tsx` (studio-shared/chrome/) — Cmd+K overlay, reads context but doesn't write
- `StudioLightbox.tsx` (studio-shared/chrome/) — Fullscreen viewer, display-only
- `StudioErrorBoundary.tsx` (studio-shared/chrome/) — Error recovery wrapper

## High-Risk Components (modify with caution)

- `StudioPromptArea.tsx` (studio/) — Core input, dispatches to FormContext
- `StudioCanvas.tsx` (studio-shared/chrome/) — result surface, complex layout logic
- `StudioCardSection.tsx` (studio/) — orchestrates char/bg/style card selection
- `StudioResizableLayout.tsx` (studio-shared/chrome/) — exports `StudioFlowLayout`, the vertical canvas+dock shell
