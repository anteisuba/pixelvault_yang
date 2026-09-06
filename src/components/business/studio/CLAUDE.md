# src/components/business/studio/ — Studio Workspace Components

## Risk Level: HIGH (53 components across `studio/` + `studio-shared/`, sharing 3 contexts)

## Component Tree

Studio chrome 已物理拆分：稳定外壳在 `studio-shared/`（`chrome/` + `workflow/` + `setup/`），
image-only 与尚未迁移的组件留在 `studio/` 或 `image/`。下面标注每个节点的真实目录。

⚠ **2026-08-23 切片 A**：三个模态统一走横向工作台。`StudioFlowLayout`
（`StudioResizableLayout.tsx`）· `StudioBottomDock` · `StudioToolbarPanels` ·
`StudioToolbar` **已删除**，不留兼容层；`.studio-dock` / `.studio-canvas-slot`
两组 CSS 同步删掉。栏位差异归 `StudioPromptArea` 按 `outputType` 自己分。

```
(workspace)/layout.tsx
└── StudioProvider
    └── StudioWorkspaceUI (components/business/ — mounted once for image/video/audio)
        ├── StudioWorkbenchLayout (studio-shared/chrome/ — 三模态共用：左参数栏 + 右结果区)
        │   ├── params: StudioPromptArea (studio/ — 提示词 + 加料 chip + 模态参数 + 模型 + 规格 + 生成)
        │   │   └── StudioCardSection (studio/ — 卡片工作流时才渲染，非音频)
        │   └── stage: StudioCanvas (studio-shared/chrome/)
        │       ├── StudioReferenceRail (studio-shared/chrome/ — 参考轨，与结果并存)
        │       ├── GenerationPreview (studio/ — current result)
        │       ├── CompareGrid (image/ — 共享图墙：多模型 / 多张 / 矩阵)
        │       ├── AudioVariantGrid (studio/ — 音频变体，内联播放器)
        │       └── StudioResultFeedback / StudioAudioFeedback / StudioGenerationErrorDialog
        ├── StudioAssistantDock + StudioAssistantFab (studio-shared/chrome/ + studio/ — 旧助手，视频/音频仍走它)
        ├── StudioOperatorDock (studio/assistant-operator/ — 操作员面板外壳：宽度/收放；图片+视频档)
        │   ├── StudioOperatorIconRail (收起态 48px 图标轨：域图标 / 状态点 / 进度环)
        │   └── StudioOperatorPanel (同目录 — 面板内容：进度带 / 时间线 / 双行输入区)
        │       ├── StudioOperatorProgressBand (顶部进度带 ~40px，空闲退化为头部)
        │       ├── StudioOperatorTimelineRow (时间线沟一行，五档节点)
        │       │   └── TimelineAvatar (用户 / 助手 20px 头像，与竖线同轴)
        │       ├── StudioOperatorToolGroup (「5 个操作 · 4 成功 1 失败」折叠行)
        │       ├── StudioOperatorCheckpointCard (每轮 checkpoint 薄卡，就地二选撤销)
        │       ├── StudioOperatorQueueBar (排队条，浮在输入框上方)
        │       ├── StudioOperatorMentionPicker (@ 选择器：最近生成 + 素材库搜索)
        │       ├── StudioOperatorResultRow (结果行卡 2/4 列，@ 闭环入口)
        │       ├── StudioOperatorLogItem (时间线一行：工具步 / 动作 / 系统行 / 候选网格)
        │       ├── StudioOperatorCritiqueCard (评价卡，内嵌被评的那张图)
        │       ├── StudioOperatorAttachMenu (📎 附件面板，素材库就地预览)
        │       ├── StudioOperatorHistoryItem (会话历史条目)
        │       └── StudioOperatorLightbox (全屏单例，模块级 store，三处共用)
        ├── StudioDockPanelArea (studio/ — 工具面板宿主，见下方规则 3)
        ├── StudioKeepChangePanel (image/)
        └── StudioCommandPalette (studio-shared/chrome/ — Cmd+K)
```

⚠ **operator 系对外只有两颗入口**（`assistant-operator/index.ts`）：`StudioOperatorDock`（`StudioWorkspaceUI` 挂）与 `StudioOperatorChangeRail`（`StudioPromptArea.tsx:711` 挂，改动标记长在被改的那一栏）。其余是面板内部件，不从 index 导出。LoRA 工作台也挂这两颗（`studio/lora/LoraWorkbench.tsx:176-177`）。
⚠ **文件已就位但还没有调用方（3a 接线中）** —— 别以为它们没写：`StudioOperatorPlanCard` + `PlanOptionVisual`（计划卡与图示词表）· `StudioOperatorSpendConfirmCard`（花钱硬确认）· `StudioOperatorAssetChoiceCard`（歧义单选卡，等 `choice_request` 事件）· `AssistantSettingsDialog` + `AssistantAvatarGlyph`（助手设置弹层，等 ⋯ 菜单挂入口）· `RuleChip`（项目规则薄卡）。⛔ 要用它们时**先 import 现成的**，别再写一个。

⚠ **目标态：方向 C「工作日志」面板**——收起态改 48px 图标轨、顶部进度带、计划卡 / 三档确认 / 结果行卡 / checkpoint 薄卡、时间线沟用头像、助手设置弹层。施工基准 `docs/references/pages/assistant-shell.md`（owner 2026-09-06 定）；⛔ 动这一系之前先读它，别照现状扩。

按需挂载、不在主树固定位置的常用单元：StudioModeSelector / StudioGenerateBar / StudioWorkflowPicker
（studio-shared/workflow/）、StudioAspectRatioPopover / StudioSpecPopover /
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
3. **Panel hosts**: `StudioDockPanelArea` (studio/) renders the centred dialogs (advanced, civitai, voiceSelector, voiceTrainer, audioTranscribe, videoParams, script)，由 **`StudioWorkspaceUI` 直接挂载**（2026-08-23 起；此前挂在已删除的 `StudioBottomDock` 上）。⚠ 它还持有全仓唯一一处 `imageUpload.setMaxImages(...)` —— 不挂载它，参考图上限就是 Infinity。`aspectRatio` 是自己的 popover（`StudioAspectRatioPopover`）。
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
- `StudioWorkbenchLayout.tsx` (studio-shared/chrome/) — 三模态共用的横向外壳
