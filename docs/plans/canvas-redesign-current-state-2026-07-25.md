# 画布域现状报告 — 交设计（2026-07-25）

> 用途：画布视觉重设计 **fresh start** 的地基。owner 2026-07-25 拍板：`pages/canvas-workbench.md`（方向 A）**降为可推翻的参考**，重新走一遍设计流程。
> 读法：**§1–§5 是事实**（代码实读，可信）；**§6 是硬约束**（不能破坏，但只约束能力不约束造型）；**§7 是现有视觉，全部可推翻**。
> 产出方式：opus 4.8 调查（本文）→ 设计代理出方向 → owner 选 → Sonnet 执行。

## 0 · 一句话现状

画布是**已实现的大体量功能系统**（78 个组件 / 主工作台 3348 行 / 6 条核心工作流全跑通），**但视觉是 2026-07-10 那轮的"暗炭桌 + 纸卡"旧皮**。历史上有两份设计文档，**都不再是答案**（见 §7）。所以这轮不是从零造功能，而是**给一个能跑的系统换一套新的空间组织与视觉语言**。

## 1 · 路由与外壳

- 主路由：`/studio/node`（用户可见名「画布」），单页 `src/app/[locale]/(main)/studio/node/page.tsx`。
- 域皮肤 lane：**`src/app/canvas.css`（434 行，清场已建）** —— node/canvas 全部 `:root` 变量 + 全部 `.node-*` 类住这里。
  ⚠ `node-*` 保持全局 `:root`（未 scope），因为 `LoraAssistantDock` / `StudioAssistantDock` 两处画布域外也在引用。
- 组件目录：`src/components/business/node/**`（78 个 tsx，不含 test）。

## 2 · 组件版图（实读清点）

| 层          | 文件                                                                                                                                          | 规模                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 主工作台    | `StudioNodeWorkbench.tsx`                                                                                                                     | **3348 行**（巨型） |
| 工作区壳    | `CanvasWorkspaceLayout.tsx`(60) · `CanvasSurface.tsx`(114)                                                                                    | 薄                  |
| chrome      | `CanvasTopBar.tsx`(255) · `CanvasBottomDock.tsx`(252) · `CanvasMiniMap.tsx` · `CanvasAddMenu.tsx` · `CanvasAppearancePanel.tsx`               | 中                  |
| 节点        | `nodes/` 19 个                                                                                                                                | 见 §3               |
| 卡匣        | `CastDock.tsx`(576) · `CastCard.tsx`                                                                                                          | 中                  |
| 助手        | `StudioNodeAssistantDock.tsx`(589) · `AssistantConversation.tsx` · `ScriptDocWorkspace.tsx` · `CanvasAssistantHistory/RouteSelector/Toggle/…` | 大                  |
| 详情/检查器 | `node-detail/` 11 · `inspector/` 11                                                                                                           | 大                  |
| composer    | `composer/` 5（VideoComposer / MentionInput / ReferenceTokenChip / …）                                                                        | 中                  |
| 边          | `edges/` 1（`NodeWorkflowStatusEdge`）                                                                                                        | 小                  |
| 图片编辑    | `CanvasImageEditWorkspace.tsx` · `CanvasImageSelectionToolbar.tsx` · `CanvasQuickEditPrompt.tsx`                                              | 中                  |
| 拖拽        | `IngestDragLayer.tsx`                                                                                                                         | 小                  |

⚠ **`StudioNodeWorkbench.tsx` 3348 行是最大的实现风险**：布局联动（助手分栏 / `bottomRowInsetPx` / CastDock / BottomDock / React Flow resize）都汇在这里。任何改空间结构的方向都会动它。

## 3 · 节点类型（现役）

`nodes/` 19 文件对应的现役类型：

- **图片族**：`ImageNode`（统一入口）· `ImageSourceStarter`（空态三来源）· `LooseImageCard`（散图）· `IdentityCollectorCard`（收集器：角色/场景）· `ShotNode`（镜头图）· `CharacterImageNode`/`BackgroundImageNode`/`FrameImageNode`（legacy 兼容旧存档）
- **视频**：`SeedanceNode`（视频生成）· `VideoReferenceNode`（参考视频）· `VideoMergeNode`（片盒）
- **音**：`VoiceNode`（音色）
- **文本**：`ShotTextNode`（剧本文本，退役中）
- **待删旧 planner**：`ComposerNode` · `AgentNode`
- **共享**：`NodeShell`(363，节点壳) · `NodeMediaPreview` · `NodeStatusBadge` · `NodeCardControls`

## 4 · 六条核心工作流（domains/canvas.md §5，业务事实）

1. **从剧本起手**：跟助手聊大纲 → 助手投影镜头/节点（autospawn）→ 逐镜细化。
2. **手动搭镜**：添加节点 → 组织素材与身份。
3. **一组素材 → 一个视频**（**最高频任务**，倒推自 Seedance 袋型合同）。
4. **一致性复用**：一个收集器卡（名字 + 出场图组 + 绑定音色）在多镜间整体参照。
5. **静帧先审再喂**：镜头图卡作中间产物，先产静帧审核再喂视频。
6. **拼接长片**：多视频片段进片盒，保序重排 → 合成长片。

## 5 · 数据与关系模型（锁定，只能改呈现）

- 数据层 = **节点 + 边的有向图**；合法性唯一事实源 `src/lib/node-connection-rules.ts`（呈现层查表，不得反向影响合法性）。
- 收割装配：`node-workflow-graph.ts` · `node-reference-payload.ts` · `node-edge-tier.ts`。
- 项目状态存 `NodeWorkflowProject.state`（单 Json 列，Zod 校验）；viewport 不入存档。
- 类型/常量：`src/types/node-workflow.ts` · `src/constants/node-*`。

## 6 · 硬约束（`domains/canvas.md` §7，视觉重设计必须保住 —— 约束能力不约束造型）

1. **数据层图模型不动**：节点+边+收割+autospawn+存档解析+payload 装配是锁定业务；只能改呈现，不能切断建图→收割→翻译→容量校验→图例注入这条链。
2. **provider 契约保真**：Seedance 袋型合同（1 prompt + image_urls/audio_urls/video_urls）、上限（image 9）、@token 翻译、音频绑定名——不得伪装或绕过真实能力。
3. **一致性单位不退化**：收集器卡「名字 + 出场图组 + 音色」整体参照、一卡多镜、每镜覆写——是画布相对 Studio 的核心价值，不能退化成散图堆。
4. **深浅两档分工**：Studio = 轻量单次；Canvas = 高级编排。画布不吞并 Studio，也不降成通用白板。
5. **谱系与资产化**：产出保留 lineage 且能进 Assets。
6. **全局品质底线**：a11y / 键盘 / 焦点 / 状态真实 / reduced-motion / ResponsiveOverlay / 触屏软键盘 / i18n 三语。
7. **脊柱不动**（本轮清场约定）：`globals.css` 脊柱段 / `@theme` / `layout.tsx` / `AppSidebar` / `ui` 原语。域值进 `canvas.css` 的作用域。

## 7 · 现有视觉与历史方向 —— **全部可推翻**

### 7.1 当前跑着的皮（2026-07-10 那轮，已实现）

「**导演的制片桌**」：暖炭桌 `#14120f` + 纸质场记卡 `#ebe5d8` + 石绿单颜料 `#3e8c6c` + 盖章状态 + 蓝图纸 minimap + 深窗裱媒体。实现在 `canvas.css`，**47 个组件文件在用**。
交互范式：**吞噬**（拖卡入腹，三拍动画）+ 成分栏 chip + 两级墨线（骨干常显/成分选中显）+ Cast 横匣 + 磁吸/快投。
文档：`references/pages/node-canvas.md`（其头部已声明：只服务旧皮业务收口与回归，**不具备未来设计权力**）。

### 7.2 已拍板但未实现的方向（2026-07-19）

「**导演的工作台**」方向 A：冷石墨舞台 `#101114` + **帧即卡**（媒体 edge-to-edge，2px 直角）+ **成分坞**（熔在帧左缘的竖轨，归属靠"长在一起"取代吞噬的消失）+ **名册牌**（身份立牌 + 选中时系带线）+ **成片托盘**（底部常驻，位置即顺序）+ **钨丝琥珀单信号** `#E8A33D`。
文档：`references/pages/canvas-workbench.md`（含完整 token 表 + C1–C5 切片）。
**落地程度：几乎为零** —— `--canvas-stage-*` 在 `src/` 只有 2 处（`CanvasWorkspaceLayout` 一个孤例）。

> **owner 2026-07-25 拍板：7.1 和 7.2 都降为「可推翻的现状/参考证据」，重新走一遍设计流程。**
> 7.2 有价值的地方在于它已经想过一些真问题（关系怎么可见、序列怎么表达、素材怎么发色），可以当**思考素材**，但不是必须继承的答案。

### 7.3 关系呈现范式 —— 完全开放

`domains/canvas.md` §9 明确（owner 2026-07-19）：「**连"要不要还用吞噬、要不要还用两级墨线"都可以重新提**，可提出结构完全不同的绑定手势与关系组织。唯一硬边界 = §6 的业务能力必须仍能达成。」
memory 另记：owner 对吞噬范式**本就动摇**（不直观、关系可见性丢失）。

## 8 · owner 想学清单 × 代码现状（**本节最重要** —— owner 2026-07-25：以 `project-map.md` §画布 为准）

逐条对照代码实读（2026-07-25）。**结论：一半已经有了，缺的是三件。**

| owner 想要                                          | 现状             | 证据 / 落点                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **点击图片浮现编辑框**                              | ✅ **已有**      | `CanvasImageSelectionToolbar.tsx`（1000+ 行，含 `NodeSelectionToolbarChrome` / `ToolbarLabelButton` / `ShotGenerateButton` / `canOfferCanvasImageEdit`）+ `CanvasQuickEditPrompt.tsx`                                                                               |
| **选中对象近场工具条**                              | ✅ **已有**      | 同上；`VideoMergeComposeToolbar` 也复用它的 `ToolbarLabelButton`（说明已是共享模式）                                                                                                                                                                                |
| **可收起的固定右助手**                              | ✅ **已有**      | `StudioNodeAssistantDock.tsx` 有 `open` / `onOpenChange` / `collapse` aria-label / `inert` + `lg:opacity-0` 收起态                                                                                                                                                  |
| **图片直接粘贴**                                    | ⚠ **半有**       | 粘贴只在**局部输入区**：`CharacterImageReferenceControls`(413) / `NodeMediaInspector`(501) / `MentionInput`(380)。**画布面板本身没有 paste 监听** —— `CanvasSurface` / `StudioNodeWorkbench` / `CanvasWorkspaceLayout` 全无。owner 要的"往画布上一贴就出图"= **缺** |
| **左侧工具栏 + 玻璃质感**                           | ❌ **没有**      | 现状工具条在**底部**（`CanvasBottomDock`，`absolute bottom-*`），不是左侧；无玻璃/透明材质（现状是暖炭实色面板）                                                                                                                                                    |
| **整理初始（空）状态**                              | ⚠ 有但待改       | `NodeCanvasEmptyGuide.tsx` 存在，owner 明确要重新整理                                                                                                                                                                                                               |
| **功能明确分化**（助手/编辑图片/生成视频/管理资源） | ⚠ 能力齐但入口散 | 四件事的能力都在（助手 dock / 图片编辑 workspace / seedance 节点 / 卡匣），但入口分散在顶栏+底 dock+卡匣+节点内，**边界不清是真痛点**                                                                                                                               |
| **附件·模态·模型·思考 独立披露**                    | ⚠ 部分           | `CanvasAssistantRouteSelector` / `CanvasAssistantReferencePicker` 存在，是否达到 haivis 的"各自独立披露"需设计判断                                                                                                                                                  |

**给设计的启示**：这轮画布重设计**不是补功能，主要是重新组织空间 + 换视觉语言**。近场工具条/助手收起/图片编辑都已跑通，设计可以直接重铺它们的外观与位置；真正要新建的只有 **画布级粘贴** 和 **左侧工具栏（如果方向选它）**。

### 8.1 参考（视觉/交互，可重解释）

haivis-canvas（**只学点、不照抄** —— 它只有图片编辑、无视频，本项目还有独有部分）= 大画布 + 可收起固定右助手 + 选中对象近场工具条 + 附件/模态/模型/思考独立披露；**左侧工具栏玻璃透明质感**；助手框。
owner 将**另发想要状态的截图**给设计代理（2026-07-25）。

### 8.2 ⚠ `project-map.md` §画布「现状」行的两处失准（读它的人注意）

owner 那行写于早期，两处与今天代码不符：

1. **「核心状态 `studio-context.tsx`（47 files 高风险）」** —— 画布**不用** `studio-context`（全 `node/` 目录只有 `VoiceSelector` 一处命中）。画布真正的状态源是 **`@/hooks/node/use-node-workflow`**（`StudioNodeWorkbench.tsx:97`）+ `NodeWorkflowProject.state`。`studio-context` 是 Studio Image/Video/Audio 的。
2. **「节点按模态收敛为 5 类」** —— 按模态分组大致成立，但实际现役类型更细（见 §3），另有 legacy 兼容类型与待删旧 planner。

## 9 · 已知痛点与未决（设计可直接用的真问题）

1. **关系可见性**：吞噬让节点消失，用户丢失"谁喂了谁"（owner 动摇的根因）。
2. **长片在哪**：序列/成片缺常驻表达（7.2 的托盘就是为治这个而借的）。
3. **空态**：`NodeCanvasEmptyGuide` 存在，但 owner 明确要"整理初始状态"。
4. **功能分化不清**：助手/图片编辑/视频生成/资源管理四件事的入口与边界，owner 要求明确分化。
5. **巨型工作台**：3348 行的 `StudioNodeWorkbench` 是改空间结构的成本中心。
6. **两套拖拽系统**：自定义指针拖拽（卡匣路径）+ ReactFlow 原生 `onNodeDragStop`（画布路径）并存。
7. **旧类型待清**：`ComposerNode`/`AgentNode` 死类型、`ShotTextNode` 退役中、legacy 图片类型仅兼容旧存档。

## 10 · 事实源（设计如需深挖）

- 域契约：`docs/references/domains/canvas.md`（业务责任/边界/锁定区，**不含视觉答案**）
- 旧皮业务回归：`docs/references/pages/node-canvas.md`
- 已拍板未实现方向：`docs/references/pages/canvas-workbench.md`
- 架构基准：`docs/plans/canvas-baseline.md`
- 代码：`src/components/business/node/**` · `src/lib/node-workflow-graph.ts` · `node-connection-rules.ts` · `src/types/node-workflow.ts` · `src/app/canvas.css`
- 并行治理：`docs/plans/design-token-minimal-unification-2026-07.md`（§5 文件归属 / §9.B 画布 lane）
- memory：`project-canvas-ui-baseline` · `project-canvas-ingest-vs-edges-decision` · `project-canvas-modular-redesign` · `project-canvas-cast-card-2026-07`

## Last Verified

- 2026-07-25 · opus 4.8 实读：`domains/canvas.md` 全文 · `pages/node-canvas.md` 全文 · `pages/canvas-workbench.md` 全文 · `node/` 组件清点（78 tsx，按目录分布）· 核心文件行数实测 · `canvas-stage-*` 落地度 grep（2 处）· 旧皮 `node-*` 用量 grep（47 文件）· 画布 route 定位 · 近期 canvas 提交日志。未改任何产品代码。
