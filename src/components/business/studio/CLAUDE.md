# src/components/business/studio/ — Studio Workspace Components

## Risk Level: HIGH (53 components across `studio/` + `studio-shared/`, sharing 3 contexts)

2026-09-15 owner 已选 A「连续对话与结果优先」并授权修复；工具记录默认折叠，失败摘要独立显示，五动词常驻条已删除。⚠ 「参考依据」那一折随 56b 切片 5 整张分析卡一起退场。此项覆盖下方旧方向的展开约定，现行增量契约见 `docs/references/pages/assistant-shell-v2.md` 的 A 方向节。

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
        │   ├── StudioOperatorAvatarToggle (**头像开关**：36px 人设头像 + 数字角标（待确认 + 未读结果，打开面板清零），**右上角**；一个持久 fixed 元素、两个锚点（顶栏 36 ↔ 面板头部槽 22），只过渡 transform。D7b ④。⛔ StudioOperatorCollapsedButton · StudioOperatorIconRail · StudioOperatorCollapsedCard · StudioOperatorMobileFab 四个文件都已删)
        │   ├── StudioOperatorMobileSheet (手机半屏可拖 vaul Sheet：三档吸附 0.55 / 1 / 关闭，`modal={false}` 露出上半截工作台，键盘弹起升全屏 —— 装的是下面同一个 Panel 元素)
        │   └── StudioOperatorPanel (同目录 — 面板内容：空态 / 时间线 / 双行输入区)
        │       ├── StudioOperatorHeader (头部一行 44px：左上头像槽（桌面留位给外壳那颗，手机自己画）/ 会话标题▾（= 历史下拉，新会话在底部）/ 续跑 / 右上一颗 ⋯。⛔ 收起钮已删，收起 = 点头像；⛔ 域标记胶囊已搬去输入框上方（D7c ④）)
        │       ├── StudioOperatorPinnedEvidence (面板顶部「钉住的证据」常驻条：钉住后在顶部留一份、点回原卡、× 取消钉住；⛔ 没钉住就整条不渲染；v2 §3.2 / 画板 BCards「已钉住 · 留在面板顶部」)
        │       ├── StudioOperatorEmptyState (空态：助手头像 68px + **一句话** + 起手药丸 ≤5；两样都来自宿主的 `face`，⛔ 不按 domain 取药丸表；v2 §4.2)
        │       ├── StudioOperatorTimelineRow (时间线沟一行 + **五类卡的分派点**)
        │       │   └── TimelineAvatar (用户 / 助手 32px 头像，与竖线同轴；助手那一档另出口 `AssistantTimelineAvatar` —— 它不碰 Clerk，收起态与空态用的是它)
        │       ├── StudioOperatorToolGroup (「5 个操作 · 4 成功 1 失败」折叠行)
        │       ├── StudioOperatorResearchProgress (调查那一行，三态：跑着一行微光 + 预估 / 点开展开步骤 / 跑完收成灰底一行「搜了 N 条 · 读了 M 页」；有失败步时退回 ToolGroup。56b 切片 2)
        │       ├── StudioOperatorCheckpointCard (每轮 checkpoint 薄卡，就地二选撤销)
        │       ├── StudioOperatorQueueBar (排队条，浮在输入框上方)
        │       ├── MentionInput（共享输入框：`@` 选择器**只列当前工作台**（参考图 / 结果）；
        │       │    正文缩略图标签。⛔ 分段能力已随 #7c 删回单段，素材库走下行那颗按钮）
        │       ├── AssetSelectorDialog（下行「素材库」按钮 `operator-library-toggle` 开的弹层：
        │       │    `AssetPickerBrowser` 多选 + 图片锁 + 文件夹分类 + 无限滚动，首屏 10 条）
        │       ├── StudioOperatorResultRow (结果卡三态：生成中 / 单张 / 多张；**无审核态**，只有「再来一组」「用它当参考」两颗。回流在 use-studio-operator-results.ts)
        │       ├── StudioOperatorLogItem (时间线一行：工具步 / 动作 / 系统行 / 证据卡)
        │       ├── StudioOperatorWebCandidateGrid (联网候选网格：来源三字段 + 「挂上 N 张」)
        │       ├── StudioOperatorCritiqueCard (评价卡，两个形态一颗组件：单图嵌图 / 视频三帧并排 + 时间码；分岔判据是载荷里有没有 frames，不是当前域)
        │       ├── StudioOperatorPlusMenu (「+」菜单三项：提及素材 / 上下文卡 / 指定来源；
        │       │    上传是下行那颗独立回形针按钮，素材库是它右边那颗独立按钮)
        │       ├── StudioOperatorHistoryItem (会话历史条目)
        │       ├── StudioOperatorMessageBody (助手正文那一格：无气泡 / 长回话折首句 / `detail` 折成「为什么」 / 空正文时的占位脉冲 / **句尾 `[n]` 角标**（56b 切片 1）· **末尾光标 + `motion-reduce` 扣住整段**（切片 3）)
        │       ├── StudioOperatorAnswerSources (回答底下那两样：媒体条（图片开灯箱 · 视频封面开新窗口）+ 一排来源卡（站点图标 + 标题 + 域名，角标点下来高亮）+ 「深入调查 / 钉住 / 回执」一行)
        │       ├── StudioOperatorQuestionBlock (问题块：**与输入框同框**、一组 ≤4 题一次一题、题头 + 「1 / 3」进度 + 竖排选项 + 就地展开的「其他」；键盘 1–4 / ↑↓+Enter / Esc；⛔ 没有「确定」。同文件的 `StudioOperatorQuestionAnswers` 画已答的小标签。56b 切片 4)
        │       ├── StudioOperatorConfirmCard (确认卡：多步 / 生成两支，就地换「已确认 · 时间」)
        │       └── StudioOperatorLightbox (全屏单例，模块级 store，三处共用)
        ├── StudioDockPanelArea (studio/ — 工具面板宿主，见下方规则 3)
        ├── StudioKeepChangePanel (image/)
        └── StudioCommandPalette (studio-shared/chrome/ — Cmd+K)
```

⚠ **operator 系对外只有两颗入口**（`assistant-operator/index.ts`）：`StudioOperatorDock`（`StudioWorkspaceUI` 挂）与 `StudioOperatorChangeRail`（`StudioPromptArea.tsx:711` 挂，改动标记长在被改的那一栏）。其余是面板内部件，不从 index 导出。LoRA 工作台也挂这两颗（`studio/lora/LoraWorkbench.tsx:168-169`）。⚠ 训练 tab 的身体已于 2026-09-20（进度表 34）搬去 `studio/lora/training/TrainWizard.tsx`（配 `hooks/use-lora-train-wizard.ts`），`LoraWorkbench.tsx` 里只剩 tab 分派那一行。
⚠ **卡片已收敛为五类（v2 §3.2，commit #4）**：消息 / 问题 / 确认 / 结果 / 证据 + 系统行，分派表在 `StudioOperatorTimelineRow.tsx`（`STUDIO_OPERATOR_CARD_KINDS`）。⛔ `StudioOperatorSpendConfirmCard` · `StudioOperatorAssetChoiceCard` · `StudioOperatorProgressBand` **三个文件已删**，旧的覆写三选条也整块删掉 —— 别再按名字找：花钱确认随决策 8 消失，缩略图单选并进问题卡，覆写三选降级成问题卡，进度带的两样挂件搬去了头部。`StudioOperatorConfirmCard`（`confirm` 两支；生成支确认即客户端扣扳机）· `RuleChip`（面板已渲染）· `AssistantSettingsDialog` + `AssistantAvatarGlyph`（**头部右上那颗常驻齿轮** → `onOpenAssistantSettings`，开合 state 在 Dock；2026-09-07 起 ⋯ 菜单里不再有第二个入口）· `StudioOperatorTimelineList`（2026-09-06 起就是面板那颗 `threadRef` 容器）。
⚠ **皮肤是方向 B「玻璃仪表 · 浅色」（v2 §12，commit #21）**：三层玻璃 = 面板（`assistant-glass-panel` + `shadow-assistant-panel`，18px 圆角）/ 卡片（`bg-card` + `border-border` + `shadow-assistant-card`，⛔ 不带模糊）/ 浮层（`assistant-glass-overlay` + `shadow-assistant-overlay`，历史下拉 · +菜单 · 模型选择器）。「当下要你动手的那张卡」（问题 / 确认待决 / 输入区 / 结论编辑）多一档 `border-assistant-line-strong` + `shadow-assistant-raised`。**信号位只用近黑实底 + 白字**（`bg-foreground text-background`）—— ⛔ 不用 `--primary`，那一支被工作台的生成键占着（§12.2）。token 全在 `globals.css`，⛔ 组件内不写 hex、不写任意值。

⚠ **调查卡已删（56b 切片 1）**：`StudioOperatorResearchCard` 整文件删除 —— 它把证据摆在回答**前面**，读起来是「先看完它的过程，再看它说了什么」。证据现在长在回答底下（`StudioOperatorAnswerSources`），过程折进 `StudioOperatorToolGroup`，候选网格由 `StudioOperatorLogItem` 自己画。

⚠ **分析卡已删（56b 切片 5）**：`StudioOperatorReferenceAnalysisCard` 整文件删除。挂进来的图直接进当前多模态模型，回答就是一段普通正文；看参考图那一条跟着其它步折进 `StudioOperatorToolGroup`。⚠ `analyze_references` **工具本身没删** —— 它还是 `set_prompt` 的取材来源，历史里那份 `referenceAnalysis` 还喂着 `readOperatorReferenceProfiles`。

⚠ **问题卡已删（56b 切片 4）**：`StudioOperatorQuestionCard` + `PlanOptionVisual` 两个文件整删。反问现在是输入区里的 `StudioOperatorQuestionBlock`（一帧带一组 ≤4 题，界面一次一题）。⚠ 选项上的 `visual` 一格暂时没有渲染方 —— 契约还在，记为已知缺口。

⚠ **正文逐段追加（56b 切片 3）**：服务端只发差值（`message_delta`），客户端追加到同一条 `streaming` 气泡后面，末尾一根不闪的光标；定稿帧按 id 整体覆盖。`motion-reduce` 那一档**扣住整段**，写完才画。⛔ `StudioOperatorStreamingText`（当年那套逐字**淡入**）仍旧是删掉的，⛔ 别把它找回来 —— 这一次回来的是「字什么时候出现」，不是那套动效。
⚠ **视频档具名槽（2026-09-07 `48d6fecb`）**：视频参考区是 `StudioVideoReferenceSlots`（首帧 / 尾帧 / 参考视频），三条落法（拖入 / 素材库 / 助手 `mount_reference slot`）**汇到同一个 dispatch**（`use-video-reference-slots.ts`），⛔ 组件里没有第二条写入。⛔ 关键帧档下**不再渲染** `ReferenceImageChip`——那一档里图片是帧，留着它写进的参考图列表发送口根本不读（静默失效）。首帧在场且线路带图锁比例时，`StudioVideoSpecFields` 把比例组**禁用而不是移除**并说清怎么解除。

⚠ **手机形态（2026-09-06 `adb0a008`）**：Dock 在 `isMobile` 时**不再 `return null`**——图片 / 视频档改渲染 `StudioOperatorAvatarToggle`（右上角，⛔ 不再是右下浮标）+ `StudioOperatorMobileSheet`（v2 §4.6 起是**半屏可拖**，⛔ 不再是 100dvh 全屏），装的是与桌面**同一个 `StudioOperatorPanel` 元素**（同一份 props，⛔ 别为手机再写一套面板内容）。判据是**宿主的域**不是路由：音频档与 LoRA 手机端仍走旧面板，Dock 在那两处照旧不渲染（否则 LoRA 会两张面板同屏）。

⚠ **四张脸（D7b ③，owner 2026-09-20）**：宿主契约多一格 `face`（`{domainIcon, contextLine(), emptyLine, starterPills[], inputPlaceholder}`，见 `src/contexts/studio-operator-host.tsx`），四份宿主各自实现，Dock / Header / EmptyState 只读它。⛔ 组件里不许按 `domain` 分叉挑文案 / 图标 / 药丸（`StudioOperatorDock.web.test.tsx` 有源码扫描守着）。静态那几样按域查表走 `src/hooks/use-studio-operator-face.ts`，只有 `contextLine` 是宿主自己算的。⛔ `STUDIO_OPERATOR_SUGGESTIONS` · `STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT` 与三语 `StudioOperator.suggestion.*` 已整块删。

⚠ **收起态已改口（D7b ④，owner 2026-09-20）**：**右上角 36px 人设头像 + 数字角标，头像即唯一开关**（点开滑进面板头部，点头部那颗或 Esc 收回）。⛔ D7 ④ 的「右下 44px 近黑圆按钮」与画布顶栏那颗「助手」胶囊（`shell-assistant-toggle`）一起退场；⛔ 仍旧没有微状态卡、状态点、`N/M` 读数与那句状态词。机制与十条动画铁律见 `docs/references/pages/assistant-shell-v2.md §4.3`。下面这段方向 C 的「收起态 48px 图标轨」是历史记录。

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
