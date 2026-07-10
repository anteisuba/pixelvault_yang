# Task Packet: 画布间改版 S5a — Cast 卡匣四分区（镜像视图版）

> 上游施工图：`docs/references/pages/node-canvas.md` §6.1 / §6.2 / §9-S5a。
> 分工：Fable 出包（2026-07-10），Sonnet 执行。S1–S4 已 commit（`2b4906a4` + `98a7bab1`）。

## Goal

- 画布底部新增 **Cast 卡匣**：四分区（角色/背景/音色/参考视频）陈列当前项目的身份类节点，拍立得纸卡样式，点卡聚焦画布对应节点，各分区可新建，可折叠。

## ⚠ 本片语义：镜像视图（关键架构决定，不要偏离）

S5a 期间**身份节点照常留在画布上**（连线、端口、一切现有操作不变），卡匣是它们的**第二呈现**（从 ReactFlow store 的 nodes 派生渲染）。「身份节点从画布退场 + 吞噬手势 + 连线退场 + 添加菜单收敛」全部属于 S5b —— 这样 S5a 不产生任何绑定操作真空，独立可验收可回退。

## Non-goals

- 不做吞噬手势/三拍动画/张口/咬不动（S5b）；不隐藏任何画布节点（S5b）；不动 CanvasAddMenu（S5b 收敛）；不碰 StudioNodeAssistantDock / AssistantConversation（assistant-ux 批挂账）。
- 不新建数据模型、不加 API、不动 services（卡匣纯派生视图）。

## Read First

- 施工图 §6.1（食物链/节点定性）§6.2（卡匣规格）；forbidden UI + CI/CD 节

## Source of Truth（侦察指针，动手前自行确认）

- 挂载点：`StudioNodeWorkbench.tsx`（ReactFlowProvider 内，与 `CanvasBottomDock` / `CanvasMiniMap` 同级渲染）
- 数据：ReactFlow store（`useNodes`/`useStore`）过滤 —— 角色区 = `image` 且 `data.role===character`（含 legacy `characterImage`）；背景区 = role=background（含 legacy）；音色区 = `voice`；参考视频区 = `videoReference`。「出演 N 镜」= edges 中 `source===该节点` 计数。
- 节点显示名：参照 `NodeMediaPreview.tsx` 的 `getHeaderTitle`（characterName/backgroundName 等字段）
- 新建路径：侦察 `CanvasAddMenu` 的 `onSelect(type)` 在 workbench 侧的实现（spawn/addNode）；分区新建应预设 role（角色区直接建 image+role=character，跳过 role picker）——若 spawn API 不支持预设 role，降级为「spawn 后自动开 role picker」并在报告记录偏离。
- 布局避让（实测坐标）：工具条=底部中央；minimap=`!bottom-24 !left-4`；助手 dock=右侧。

## 规格（§6.2 工程化）

1. **容器 `CastDock.tsx`**：底部中央横匣（工具条上方），深炭 chrome（`bg-node-panel/95 border-node-panel-inner/70 backdrop-blur` 与工具条同语言）；四分区以横向分组呈现（分组标签 + 卡片行，横向滚动）；**可折叠** —— 折叠态 = 小把手 chip（`Cast · N`），展开/折叠走 `.node-canvas-panel-motion` 动效规则（`data-resizing` 契约不适用则普通 transition，`--duration-slow`）。桌面优先；小屏（<md）默认折叠，展开若布局挤压可用 ResponsiveOverlay 抽屉（现有覆层原语），工程量过大可降级为同一横匣并报告。
2. **卡片 `CastCard.tsx`**：拍立得式纸卡 —— `bg-node-card-paper rounded-md` + 照片窗（`bg-node-card-window`，节点缩略图有则贴图无则类型图标）+ 名字（`text-node-card-ink`，S6 前用现有字体）+ 类型小徽标 + `@名字` mono 小字；**静置微倾**：按节点 id 确定性取档（`-rotate-2 / -rotate-1 / rotate-1 / rotate-2`，同卡恒定角度），hover 归正 + 轻微上浮；「出演 N 镜」小字（N>0 时显示）。尺寸紧凑（照片窗 ~64px 级），一屏可见 6–8 张。
3. **交互（本片只读级）**：点卡 = 选中画布对应节点 + 视图聚焦（ReactFlow `setCenter`/`fitView` 到该节点，动画走默认）+ 石绿选中环自然出现（S2 已有）；分区「＋」新建（见侦察指针）；无拖拽（S5b）。
4. **空态**：分区无卡时显示极简占位（「还没有角色 · ＋ 新建」一行，不做插画——空态插画是 S6 画布级的）。
5. **i18n**：新增 `StudioNode.castDock.*`（标题/四分区名/出演 N 镜/新建/空态文案），zh/en/ja 三语同步。
6. **a11y**：卡片为 button 语义、焦点环、键盘可达；折叠把手 aria-expanded；触屏 44px 触达（coarse variant 项目已有原语）。

## Allowed File Scope

- 新建 `src/components/business/node/CastDock.tsx` / `CastCard.tsx`（+ `.test.tsx`，用 `templates/component.md` 骨架判层级）
- `StudioNodeWorkbench.tsx`（仅挂载 + 必要的回调接线）
- `src/messages/{zh,en,ja}.json`（仅新增 `StudioNode.castDock` ns）
- `src/constants/node-studio.ts`（卡匣尺寸/布局常量，禁魔法值散落）
- 施工图 §9 S5a 行 ✅ + §6.2 实现偏差回写

## Forbidden File Scope

- 吞噬相关一切（S5b）；`CanvasAddMenu.tsx`；`node-connection-rules.ts`；assistant-ux 批文件；api/prisma/services
- ⚠ 不 kill 3000、不 build、源码只用 Edit/Write、不 commit

## Acceptance Criteria

- 画布底部出现 Cast 卡匣：项目「鸣潮」应显示角色卡（dania 等）、背景卡（daniabeijing 夜街等）、音色卡；卡为拍立得纸卡微倾、hover 归正。
- 点卡：画布平滑聚焦到对应节点且节点出现石绿选中环。
- 各分区「＋」能新建对应类型节点（role 预设或记录降级）。
- 折叠/展开顺滑；工具条、minimap、助手 dock 无遮挡（截图证明）。
- 三语文案就位；lint / 全量 tsc / 全量 vitest 绿（新组件带测试）。

## Validation / Evidence

- 三件套（红线同前，不 build）。
- chrome 实跑截图：卡匣全景（四分区）/ 点卡聚焦前后 / 折叠态把手 / 小屏 375 宽形态。
- 报告含手动验证步骤与偏离事项。

## Documentation Sync

- 施工图 §9 S5a ✅、§6.2 偏差回写；status.md 与归档由 Fable 收尾。
