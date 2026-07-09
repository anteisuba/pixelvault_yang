# UI 审查 — 第一遍（代码层）

日期：2026-06-11
状态：**两遍中的第一遍。** 仅静态代码分析——以下发现读自源码，尚未在浏览器实跑确认。第二遍（实跑交互 + 视觉验证，真实移动端视口）已排期，将逐项核实 High 级条目。

## 范围

本次审查由项目所有者提出的四个痛点驱动：

1. 打开方式不统一——"按钮打开方式都不一样"，全站性问题，Studio 最严重。
2. 移动端使用起来非常麻烦。
3. 操作逻辑——东西怎么打开、结果去了哪、用户怎么找回来。
4. 质感与动画。

方法：四个并行只读代码扫描（披露模式 / 动效+质感 / 移动端 / IA+操作流），覆盖 `src/components/**`、`src/app/[locale]/**`、`src/app/globals.css`、`src/app/homepage.css`、`e2e/*.spec.ts`，以及 `docs/design/system` 与 `docs/design/pages` 的现状事实文档。

## 检查的路由 / 表面

全部 34 个 `page.tsx` 路由；布局壳（`AppSidebar`、`MobileCollapsedRail`、`MobileHeader`、`MobileTabBar`）；Studio 工作区 + dock + edit 中心 + 10 个编辑工具 + LoRA 工作台 + 节点画布 + 3D；Assets（`KreaAssetBrowser`、`AssetDetailSheet`）；Gallery 流与详情（`ImageCard`、`ImageDetailModal`、`MediaDetailViewer`）；Prompts；Cards；Storyboard；首页。

---

## A. 披露一致性（打开方式）

盘点：全站约 12 种打开机制在同时使用——Dialog（17 处）、Popover（18 处）、Sheet（6 处）、Drawer（5 处）、DropdownMenu（5 处）、AlertDialog（5 处）、自定义 `ConfirmDialog` 包装（3 处）、`ResponsiveDialog`（仅 2 处）、自定义 fixed/absolute 浮层（7+ 处）、路由式打开、query 参数标签页、裸 `useState` 内联面板（20+ 处）。

| #   | 发现                                                                                                                                                                                                                                                                                                                            | 严重度 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A1  | **同一个"选东西"意图用了 6 种模式。** 选 LoRA = Popover（`StudioLoraChip.tsx:38`）；选音色 = Dialog（`FishVoiceLibraryDialog.tsx`）；选参考图 = Popover→Dialog 嵌套（`ReferenceImageChip.tsx:41`）；卡片/宽高比/风格/Transform = Popover；浏览资产 = 看表面而定，Dialog 或 Sheet。                                              | 高     |
| A2  | **`ResponsiveDialog`（桌面 Dialog / 手机 Drawer）已存在但全站只有 2 处在用**（`QuickSetupDialog.tsx:224`、`StudioFaceConsentModal.tsx:15`）。其他组件要么自己手写移动适配（`LoraPromptControlButton.tsx:64` 自建 Popover/Drawer 分支），要么完全不管移动端。                                                                    | 高     |
| A3  | **7+ 个自定义浮层绕开了 UI 原语**，z-index 手工管理，焦点圈定 / Esc / 点击外部行为各自为政：`CanvasAddMenu.tsx:155`（z-20）、`HomepageMenu.tsx:60`（z-30）、`ImageDetailModal.tsx:503`（自定义 `fixed inset-0 z-[90]`，不是 Radix Dialog）、`StudioNodeAssistantDock.tsx:613`、`CanvasAssistantToggle.tsx:33`、节点检查器预览。 | 高     |
| A4  | **开/关状态有 3 个所有者**：Studio reducer 面板（`FormContext.panels.*`）、散落的局部 `useState`（如 `GenerationPreview.tsx:104` 有两个布尔值）、URL query 参数（LoRA 工作台分区）。没有"该用哪个"的规则。                                                                                                                      | 高     |
| A5  | **删除确认是分裂的**：Radix `AlertDialog`（`LoraAssetCard`、`StudioNodeWorkbench.tsx:1002`）与自定义 `ConfirmDialog` 包装（`ApiKeyRow`、`ImageDetailModal`、`AssetDetailSheet`）并存。同一个"确定要删吗"长两种样子。                                                                                                            | 中     |
| A6  | **浮层嵌套链**（`ReferenceImageChip` 的 Popover→Dialog、移动端 LoRA 的 Drawer 套 Drawer）产生 Esc/焦点恢复的边缘问题。                                                                                                                                                                                                          | 中     |
| A7  | Dialog 与 Popover 之间没有"重量"规则：Enhance（重）用 Dialog，但同样重的 PromptTemplatePicker 用 Popover。                                                                                                                                                                                                                      | 中     |

## B. 动效与质感

盘点：framer-motion 仅在 8 个文件中使用；21 个 `@keyframes`（globals.css 17 / homepage.css 2 / PolaroidCard 2）；Tailwind `animate-*` 约 144 处。

| #   | 发现                                                                                                                                                                                                                                                   | 严重度 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| B1  | **两套缓动方言并存，没有规范曲线。** CSS 的 studio/homepage keyframes 用 `cubic-bezier(0.22, 1, 0.36, 1)`；`StudioPromptArea.tsx` 的 framer 代码用 `[0.4, 0, 0.2, 1]`；其他 framer 文件用命名的 `easeOut`/`easeInOut`。没有任何一个被导出为常量。      | 高     |
| B2  | **duration 散乱无刻度**：150 / 180 / 220 / 250 / 300 / 350 / 360 / 380 / 400 / 500 / 700 / 800 ms 全在同时使用。stagger 节奏也不一致（Studio 50ms 步进 vs 首页 70ms 步进）。                                                                           | 中     |
| B3  | **8 个 framer-motion 文件全部不响应 `prefers-reduced-motion`**（没有 `useReducedMotion`）。CSS 动画有全局媒体查询兜底（`globals.css:1176`），JS 驱动的没有。                                                                                           | 中     |
| B4  | **最显眼的组件硬编码颜色破坏 token 纪律**：`StudioPromptArea.tsx:1074` 用 `bg-white text-neutral-950`（暗色 studio 画布上的输入栏）；`TagSourceBadge.tsx` 用 `bg-zinc-900`；`PromptTagTray.tsx` 用 `bg-neutral-100/200`。违反 no-magic-values 硬规则。 | 高     |
| B5  | **同层级圆角混用**：卡片在 `rounded-2xl`（244 处）与 `rounded-xl`（167 处）之间分裂；`dialog.tsx:70` 是 `rounded-lg`，而多数面板是 `rounded-2xl`。                                                                                                     | 中     |
| B6  | `--shadow-node-panel` token 存在但通用 `shadow-sm` 占主导（67 比 17）；9 处临时调色阴影（`shadow-primary/20`、`shadow-black/25`）。没有海拔（elevation）阶梯。                                                                                         | 低     |

## C. 移动端

架构：左侧 rail `w-11` + 顶部 header `h-11` + 底部标签栏 `h-12`；Studio dock 面板走 `ResponsiveDialog` → 底部 Drawer（这部分是好的）；其余都是补丁式的。

| #   | 发现                                                                                                                                                                                            | 严重度 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1  | **软键盘弹起会盖住 dock / 生成按钮**（sticky dock，没有 `visualViewport` 处理——`globals.css:927-935`、`StudioResizableLayout.tsx:24`）。`docs/design/system/layout-shell.md` 的真机记录可佐证。 | 高     |
| C2  | **Transform / 反推 / 编辑面板用的是裸 `Dialog` 而非 `ResponsiveDialog`** → 手机上是挤成一团的居中弹窗（`StudioTransformPanel.tsx`、`ReverseEngineerPanel.tsx`）。                               | 高     |
| C3  | **参考图拖拽是纯桌面方案**（Pragmatic DnD，`StudioCanvas.tsx:146`）；上传 chip 路径存在，但拖拽提示在触屏上是死重。                                                                             | 高     |
| C4  | **平板区间是坏的**：768–1023px 时 `useIsMobile()` 返回 false → 桌面侧栏挂载，studio 画布被裁切（壳层 overflow hidden）。                                                                        | 高     |
| C5  | Select 下拉与固定宽度在窄视口溢出：`GalleryFilterBar.tsx:206-241`（`w-[130px]`/`w-[180px]`）、`AssetDetailSheet.tsx:662`（`w-[min(34rem,90vw)]`）、`MediaDetailViewer.tsx:214`。                | 中     |
| C6  | Studio 工具栏触达区低于 44px（`size="icon"` 约 24–32px）——违反项目自己的 44px 规则。                                                                                                            | 中     |
| C7  | 节点画布 / 3D 查看器的触屏交互未测试且大概率残缺（xyflow 有原生触屏支持，我们的 popover 没有）。                                                                                                | 中     |
| C8  | **e2e 移动端覆盖只有几个页面的横向溢出检查**——studio 流程、键盘行为、抽屉、触屏全部零覆盖。                                                                                                     | 高     |

## D. 操作逻辑 / IA

| #   | 发现                                                                                                                                                    | 严重度 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1  | **生成结果没有"已保存"的提示**——没有 toast/角标告诉用户它已落入 Gallery/Assets；用户会以为作品丢了。                                                    | 高     |
| D2  | **画布结果上没有"编辑这张"入口**——编辑刚生成的图要绕道 Gallery/Assets 详情（多 2–3 次点击 + 整页加载），尽管 `studioImageEditPath()` 已经存在。         | 高     |
| D3  | **画布上没有"保存 prompt"**——存配方要离开 Studio，走 `/gallery/[id]` → `/prompts?create=1...`。                                                         | 中     |
| D4  | **结果操作按表面而异**（画布 vs gallery 详情 vs assets 弹窗）——没有共享的 ResultActions 组件。                                                          | 中     |
| D5  | **LoRA / Node / 3D / Edit 在共享 `StudioProvider` 之外**——工具间切换上下文会重置；Edit 中心还用了与暗色 studio 画布不同的视觉语言，感觉不像同一个产品。 | 中     |
| D6  | 编辑占位任务（`object-replace`、`style-transfer`、`text-render`）在任务网格里渲染成与可用任务完全等同的卡片 → 点进去预期落空。                          | 中     |
| D7  | 首跑引导的遮罩（z-40）挡住侧栏开关；自定义账户菜单 popover 破坏键盘导航（没有 Radix menu role）。                                                       | 中     |
| D8  | 生成按钮用 `aria-disabled` 但仍可点击——对辅助技术用户是矛盾信号。                                                                                       | 低     |

---

## 跨领域核心问题

1. 缺一条**披露决策规则**——A1/A2/A4 是同一个根因，C2 是它在移动端的症状。
2. 缺一套**动效缓动/时长规范**——B1/B2/B3 是同一个根因。
3. 移动端的失败集中在**三个机制**上：键盘感知的 dock（C1）、ResponsiveDialog 普及（C2/A2）、平板断点（C4）。
4. 结果生命周期（生成 → 去了哪 → 怎么操作它）是最大的**流程**缺口：D1/D2/D3/D4 本质是同一个功能（"统一的结果操作 + 落库提示"）。
5. 自定义浮层（A3）是最大的**重写风险**——不先把它们收编到原语上，视觉升级就得做两遍。

## 方向草案（草稿——待讨论，非定稿）

按 `docs/design/README.md` 的约定，以下内容在讨论确认前都不是定稿。

1. **披露决策树**（一页纸，然后强制执行）：锚定触发器的快速配置、选项 ≤ 约 6 个 → Popover；任何可浏览/可搜索/表单型的内容 → `ResponsiveOverlay`（桌面 Dialog / 手机底部 Drawer，统一一个原语）；删除确认 → 只用 AlertDialog；完整详情 → 路由。7 个自定义浮层迁移到原语上。
2. **动效常量模块**（`src/constants/motion.ts`）：一个缓动 token（候选：`cubic-bezier(0.22, 1, 0.36, 1)`——已是 CSS 侧多数派）、一个时长刻度（如 120/200/320/500）、一条 stagger 规则；所有 framer 组件加 `useReducedMotion`。
3. **先修移动端机制，再做外观**：visualViewport 感知的 dock、C2 列出的面板换用 ResponsiveOverlay、平板断点决策（提案：桌面侧栏 ≥1024px 才出现）、44px 触达区下限。
4. **统一的 ResultActions** 组件，画布/gallery/assets 共用 + 生成完成时的"已存入 Gallery"提示。
5. B4 硬编码颜色的 token 清理（具体颜色值等 Phase 0 品味方向定稿；但*机制性*的 token 化可以先做）。

## 验证方法

- 第二遍（实跑）必须确认：C1 键盘行为（真实/模拟视口）、C2 弹窗挤压、A3 浮层焦点/Esc 行为、C4 平板区间、D7 引导遮罩。
- 之后每一波修复走 CLAUDE.md 确认阶梯：lint+build → `e2e/visual.spec.ts`（基线更新要点名）→ 变更 token/触达区的 `toHaveCSS` / `getByRole` 断言 → 交互实跑。

## 待决策事项（需要项目所有者输入）

1. 品味参考集（参考集）——仍未提供；阻塞 Phase 0 方向与 B4/B5 的具体取值。
2. Phase 2 样板间选哪个表面——候选：Studio 图像工作区（影响最大、风险最高）vs Gallery（曝光高、风险较低）。
3. 披露决策树 + ResponsiveOverlay 收编方案的签字确认。
4. 平板断点策略（桌面侧栏 ≥1024px？）。
5. 动效规范取值（缓动/时长刻度）——等参考集到位后定。
