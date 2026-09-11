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
        │   │   ├── StudioCardSection (studio/ — 卡片工作流时才渲染，非音频)
        │   │   └── StudioVideoReferenceSlots (studio-shared/chrome/ — 视频档具名参考槽：首帧 / 尾帧 / 参考视频；
        │   │        槽的可见性来自模型发送契约 getVideoWorkbenchSlots，不支持的槽不渲染)
        │   └── stage: StudioCanvas (studio-shared/chrome/)
        │       ├── StudioReferenceRail (studio-shared/chrome/ — 参考轨，与结果并存)
        │       ├── GenerationPreview (studio/ — current result)
        │       ├── CompareGrid (image/ — 共享图墙：多模型 / 多张 / 矩阵)
        │       ├── AudioVariantGrid (studio/ — 音频变体，内联播放器)
        │       └── StudioResultFeedback / StudioAudioFeedback / StudioGenerationErrorDialog
        ├── StudioAssistantDock + StudioAssistantFab (studio-shared/chrome/ + studio/ — 旧助手，只剩音频档走它；图片/视频已归 operator)
        ├── StudioOperatorDock (studio/assistant-operator/ — 操作员面板外壳：宽度/收放；图片+视频档)
        │   ├── StudioOperatorCollapsedCard (收起态 40px 微状态卡：头像 + 名字 / 微状态词 / 状态点 / 待办角标；v2 §4.3。⛔ StudioOperatorIconRail 整文件已删)
        │   ├── StudioOperatorMobileFab (手机入口浮标 44px —— 微状态卡的手机对应物，复用同一张 tone 表)
        │   ├── StudioOperatorMobileSheet (手机全屏 vaul Sheet 100dvh —— 装的是下面同一个 Panel 元素)
        │   └── StudioOperatorPanel (同目录 — 面板内容：空态 / 时间线 / 双行输入区)
        │       ├── StudioOperatorHeader (头部一行 40px：会话标题▾（= 历史下拉，新会话在底部）/ 续跑 / 右上两颗 32px 图标：历史 · 设置 / 收起)
        │       ├── StudioOperatorEmptyState (空态：助手头像 68px + 自我介绍 + 三颗起手势；v2 §4.2)
        │       ├── StudioOperatorTimelineRow (时间线沟一行 + **五类卡的分派点**)
        │       │   └── TimelineAvatar (用户 / 助手 32px 头像，与竖线同轴；助手那一档另出口 `AssistantTimelineAvatar` —— 它不碰 Clerk，收起态与空态用的是它)
        │       ├── StudioOperatorToolGroup (「5 个操作 · 4 成功 1 失败」折叠行)
        │       ├── StudioOperatorCheckpointCard (每轮 checkpoint 薄卡，就地二选撤销)
        │       ├── StudioOperatorQueueBar (排队条，浮在输入框上方)
        │       ├── MentionInput（共享输入框：@ 当前参考图，正文缩略图标签）
        │       ├── StudioOperatorResultRow (结果行卡 2/4 列，@ 闭环入口)
        │       ├── StudioOperatorLogItem (时间线一行：工具步 / 动作 / 系统行 / 证据卡)
        │       ├── StudioOperatorWebCandidateGrid (联网候选网格：来源三字段 + 「挂上 N 张」)
        │       ├── StudioOperatorCritiqueCard (评价卡，两个形态一颗组件：单图嵌图 / 视频三帧并排 + 时间码；分岔判据是载荷里有没有 frames，不是当前域)
        │       ├── StudioOperatorAttachMenu (📎 附件面板，素材库就地预览)
        │       ├── StudioOperatorHistoryItem (会话历史条目)
        │       ├── StudioOperatorMessageBody (助手正文那一格：无气泡 / 整段出现 / 长回话折首句 / `detail` 折成「为什么」 / 空正文时的占位脉冲)
        │       ├── StudioOperatorQuestionCard (问题卡：**钉在输入框上方**，一次一题；答完落一行系统行)
        │       ├── StudioOperatorConfirmCard (确认卡：多步 / 生成两支，就地换「已确认 · 时间」)
        │       ├── StudioOperatorResearchCard (调查卡：结论 + 证据 + 候选网格 + 折叠过程)
        │       └── StudioOperatorLightbox (全屏单例，模块级 store，三处共用)
        ├── StudioDockPanelArea (studio/ — 工具面板宿主，见下方规则 3)
        ├── StudioKeepChangePanel (image/)
        └── StudioCommandPalette (studio-shared/chrome/ — Cmd+K)
```

⚠ **operator 系对外只有两颗入口**（`assistant-operator/index.ts`）：`StudioOperatorDock`（`StudioWorkspaceUI` 挂）与 `StudioOperatorChangeRail`（`StudioPromptArea.tsx:711` 挂，改动标记长在被改的那一栏）。其余是面板内部件，不从 index 导出。LoRA 工作台也挂这两颗（`studio/lora/LoraWorkbench.tsx:176-177`）。
⚠ **卡片已收敛为五类（v2 §3.2，commit #4）**：消息 / 问题 / 确认 / 结果 / 证据 + 系统行，分派表在 `StudioOperatorTimelineRow.tsx`（`STUDIO_OPERATOR_CARD_KINDS`）。⛔ `StudioOperatorSpendConfirmCard` · `StudioOperatorAssetChoiceCard` · `StudioOperatorProgressBand` **三个文件已删**，旧的覆写三选条也整块删掉 —— 别再按名字找：花钱确认随决策 8 消失，缩略图单选并进问题卡，覆写三选降级成问题卡，进度带的两样挂件搬去了头部。`StudioOperatorQuestionCard`（`ask` 一帧到底，钉在输入框上方）+ `PlanOptionVisual` · `StudioOperatorConfirmCard`（`confirm` 两支；生成支确认即客户端扣扳机）· `RuleChip`（面板已渲染）· `AssistantSettingsDialog` + `AssistantAvatarGlyph`（**头部右上那颗常驻齿轮** → `onOpenAssistantSettings`，开合 state 在 Dock；2026-09-07 起 ⋯ 菜单里不再有第二个入口）· `StudioOperatorTimelineList`（2026-09-06 起就是面板那颗 `threadRef` 容器）。
⚠ **逐字淡入已删（v2 §13.1 / 拍板 13）**：`StudioOperatorStreamingText` 整文件删除，正文整段出现，占位脉冲并进 `StudioOperatorMessageBody`。
⚠ **视频档具名槽（2026-09-07 `48d6fecb`）**：视频参考区是 `StudioVideoReferenceSlots`（首帧 / 尾帧 / 参考视频），三条落法（拖入 / 素材库 / 助手 `mount_reference slot`）**汇到同一个 dispatch**（`use-video-reference-slots.ts`），⛔ 组件里没有第二条写入。⛔ 关键帧档下**不再渲染** `ReferenceImageChip`——那一档里图片是帧，留着它写进的参考图列表发送口根本不读（静默失效）。首帧在场且线路带图锁比例时，`StudioVideoSpecFields` 把比例组**禁用而不是移除**并说清怎么解除。

⚠ **手机形态（2026-09-06 `adb0a008`）**：Dock 在 `isMobile` 时**不再 `return null`**——图片 / 视频档改渲染 `StudioOperatorMobileFab` + `StudioOperatorMobileSheet`，装的是与桌面**同一个 `StudioOperatorPanel` 元素**（同一份 props，⛔ 别为手机再写一套面板内容）。判据是**宿主的域**不是路由：音频档与 LoRA 手机端仍走旧面板，Dock 在那两处照旧不渲染（否则 LoRA 会两张面板同屏）。

⚠ **目标态：方向 C「工作日志」面板**——收起态 48px 图标轨、顶部进度带、计划卡 / 三档确认 / 结果行卡 / checkpoint 薄卡、时间线沟用 **32px 头像 + 24px 沟宽且不显示任何时间戳**、助手设置弹层（两栏 + `Tabs`）、手机全屏 Sheet、检索链（`research` / `read_url` / 官方优先搜图）。施工基准 `docs/references/pages/assistant-shell.md`（owner 2026-09-06 定，§7.1 检索链 / §11.3 时间线沟 / §11.6 移动端）；⛔ 动这一系之前先读它，别照现状扩。

按需挂载、不在主树固定位置的常用单元：StudioModeSelector / StudioGenerateBar / StudioWorkflowPicker
（studio-shared/workflow/）、StudioAspectRatioPopover / StudioSpecPopover /
StudioGallery（studio/）、StudioLightbox / StudioErrorBoundary（studio-shared/chrome/）。

⚠ **画布不在这个目录**：`/studio/node` 的全部实现在 `src/components/business/node/`（v4 工作台 `node/workbench-v4/` + 节点卡 `node/nodes/v4/`），分层与禁改见 `src/components/business/node/CLAUDE.md`，基准见 `docs/references/pages/node-canvas-v2.md`。两边**不共用**面板与动作总线——画布走 `useNodeCanvasActions()` 与 v4 op 表，⛔ 别把 studio 的 context 或 operator 组件搬进画布。

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
