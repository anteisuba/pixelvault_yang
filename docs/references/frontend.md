# Frontend 参考 — 统一共同设计文档（现状事实）

> 定位：全站共享的前端现状事实 + 共同约定。**宽松原则**：本文件是默认值和共享词汇表，不是枷锁——页面可以有意破格，破格写进该页 `pages/<页>.md` 并记录理由。方向层（工坊宅邸）见 `brand-dna.md`；本文件只记录代码现状，过渡期 UI 改动以此为准。

## CSS 与 token 现状

- 入口：`src/app/globals.css`（全局枢纽，@theme inline + 语义变量 + 组件层）+ `src/app/homepage.css`（首页页面局部，`.homepage-*` 约定，别全局化）。
- 运行时默认 `.dark`（根 html className）。⚠ `.dark` 只换色 token 不设 color-scheme——暗面组件需显式 `color-scheme: dark`。
- **Tailwind 4：无 `tailwind.config.ts`**，token 扩展一律在 `globals.css` 的 `@theme inline`（2026-07-10 核验；CLAUDE.md 旧口径已修正）。
- ⚠ globals.css 首行仍 `@import` Fontshare Satoshi，但全 src 无任何 `Satoshi` font-family 引用（字体栈已迁 Geist）——死引用，已立清理任务。

### Token 四层治理模型

| 层            | 内容                                                                                                                                                                                                                                   | 使用规则                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1 shadcn 语义 | `bg-background` / `bg-card` / `border-border` / `bg-muted`…                                                                                                                                                                            | 默认选择                               |
| 2 域 token    | `sidebar-*`（壳）· `node-*`（画布：`--node-panel` #1a1a1a 系 + `shadow-node-panel`）· `--surface-composer`（oklch 96% 0.008 95 象牙输入条，**B4 决议已实装**：暗面 Studio 上唯一亮纸 + 黑丸 CTA，2026-07-10 目检）· `--width-studio-*` | 只在所属域用，不外溢                   |
| 3 页面局部    | `homepage-*` / `--home-*`                                                                                                                                                                                                              | 留在页内；第二个页面需要同模式时才提取 |
| 4 工具类      | `max-w-content` / `max-w-gallery` · `text-3xs`(10px) / `text-2xs`(11px) / `text-nav` · `tracking-nav(-dense)`                                                                                                                          | 小标签/宽度的首选路径                  |

- `editorial-*` 类族（globals.css 33 处）：跨 prompts / arena / storyboard / 详情页 / 路由态的陈列面模式；职责混合（壳/hero/panel/metric 混在一起），提取或改动前按页确认。
- **弱/孤 token**（2026-06-02 审计口径，构建新 UI 前先核实用量）：`--text-hero-*`、`--h-hero-btn`、`--text-tab`、`--overlay-chip`、`--surface-highlight`、`--home-surface-soft`、`--width-studio-left/sidebar`。
- 任意值治理：`text-[10px]`（60 处）→ `text-3xs`；`text-[11px]`（27 处）→ `text-2xs`；`tracking-[0.16em]` 等 → `tracking-nav` 族。视口/运行时约束（`calc()`/`svh`/radix 变量/`duration-[…]`）属合法保留，不盲目归一。

## 字体现状（2026-07-10 核验 `src/i18n/fonts.ts`）

| 变量                                           | 实际字体                                 | 用途                                                 |
| ---------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `--font-app-sans`                              | **Geist**                                | 正文主字体（en）                                     |
| `--font-app-display`                           | Geist                                    | 展示字（映射 `--font-display`）                      |
| `--font-app-serif`                             | **Geist ——名叫 serif 实为 sans（陷阱）** | 勿当衬线用                                           |
| `--font-editorial`                             | Fraunces 400/500                         | 仅营销 hero；CJK hero 回退宋体系统栈（homepage.css） |
| `--font-geist-mono`                            | Geist Mono                               | 代码 / 参数                                          |
| `--font-japanese-sans` / `--font-chinese-sans` | Noto Sans JP / SC                        | `html:lang(ja/zh)` 覆盖 sans/display 栈              |

- zh / ja 没有真正的标题字身份（衬线场景由系统栈兜底）——DNA v2「待深挖」项，选型前维持现状。

## 布局壳（2026-07-10 核验 `(main)/layout.tsx`）

- 结构：`SidebarProvider` → `AppSidebar` + `MobileCollapsedRail` + `MobileHeader` + `SidebarInset`(#main-content) + `MobileTabBar`；Mobile 三件套都从 `src/components/layout/MobileTabBar.tsx` 导出。
- **紧凑断点 = 1024**（`use-mobile.ts` MOBILE_BREAKPOINT，C4 决议：<1024 移动 chrome，≥1024 才出桌面侧栏；768–1023 平板区间走移动 chrome。⚠ 2026-06 旧文档写 768 已过时）。inset padding：`pt-11 pb-12 pl-11 lg:pt-0 lg:pb-0 lg:pl-0`。
- 侧栏：展开 12rem / 折叠 3rem；初始状态 = `sidebar_state` cookie + UA 判断；快捷键 ctrl/⌘+B。
- skip link → `#main-content`（保持，勿删）。
- `KeyboardInsetBridge`：visualViewport 软键盘适配（dock 感知）。

## 组件清单（先查这里，再考虑造新的）

层级判据：`ui/` = 无业务纯原语 · `layout/` = 壳 · `business/` = 域组件 · `business/studio-shared/` = 跨 Studio 复用 · `business/node/` = 画布域。

### 覆层（披露）矩阵 — 强约定

| 场景                               | 用什么                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 桌面居中弹窗 ↔ 手机底部抽屉        | **ResponsiveDialog**（勿 `defaultOpen`）                                                        |
| 桌面 Popover ↔ 手机抽屉            | **ResponsivePopover**                                                                           |
| Studio 工具面板（chip 锚定轻面板） | `studio-shared/primitives/tool-surface`（七条契约见 `archive/design/direction.md` 决议 5 附则） |
| 选素材                             | `AssetSelectorDialog`（约 39 处引用；单/多选、mediaType、上限）                                 |
| 选模型                             | `MainModelPicker`（约 44 处）/ `BaseModelPickerPanel`（约 29 处）                               |
| 缺 API key                         | **QuickSetupDialog**（Hard Rule 8：不禁用 UI，内联配置）                                        |
| 确认 / 危险操作                    | `confirm-dialog` / `alert-dialog`                                                               |
| Toast                              | sonner（`Toaster` 已挂主布局 top-right，业务代码直接 `import { toast } from 'sonner'`）         |

### `ui/` 原语分类（58 文件，2026-07-10 清点）

- **基础控件**：button（cva 变体：default/destructive/outline/secondary/ghost/link + xs/icon-xs）· input · textarea · label · select · slider · switch · tabs（default/line）· toggle-group · option-group · param-slider · seed-input · aspect-ratio-selector
- **覆层**：dialog · sheet · drawer(vaul) · responsive-dialog · responsive-popover · popover（带交互守卫）· alert-dialog · confirm-dialog · dropdown-menu · tooltip（delay 0）· command(cmdk)
- **反馈**：skeleton（单一 pulse 原语）· progress · badge · error-alert · sonner
- **内容展示**：card · card-tile-base · markdown · code-block · message · metadata-list · audio-player · optimized-image · image-compare · tree-view · collapsible-panel · animated-collapse
- **输入复合**：prompt-input（约 41 处）· placeholders-input · image-drop-zone · reference-image-section
- **装饰/动效**：blur-fade · hyper-text · number-ticker · particles · pulsating-button · brand-mark —— ⚠ 受 forbidden 动效红线约束，新用途先对照 brand-dna 动效性格

### Studio 共享 chrome（`studio-shared/chrome`）

StudioBottomDock · StudioCanvas · **StudioResizableLayout（Studio 垂直间距唯一负责人）** · StudioAssistantDock · StudioCommandPalette · StudioLightbox · StudioErrorBoundary；教程载体 XiaoheiGuideCarousel。

### 画布域（`business/node/`）要点

StudioNodeWorkbench（主工作台）· CanvasTopBar / CanvasBottomDock / CanvasMiniMap · StudioNodeAssistantDock + ScriptDocWorkspace（助手 = 剧本脑）· NodeCanvasEmptyGuide；节点卡片族在子目录。**改画布先读 `plans/canvas-baseline.md`。**

## 移动端范式

- 断点体系：<1024 移动 chrome（左侧 44px 竖 rail + 顶部 header + 底部 tab bar）；测试视口集 375 / 390 / 430 / 768 / 1024 / 1440。
- 披露一律 ResponsiveDialog / ResponsivePopover；侧栏移动 Sheet 宽 `min(13rem, calc(100vw - 8rem))`。
- 44px 触达区；软键盘双保险：visualViewport（KeyboardInsetBridge）+ 触屏键盘策略（isTouchPrimary / focusUnlessTouch——软键盘只在用户直接点输入框时弹）。
- 移动主路径回归：`npx playwright test e2e/mobile.spec.ts --project=mobile`。

## i18n

- next-intl；`en` / `ja` / `zh`；locale 前缀恒在；路由事实源 `src/i18n/routing.ts`；Clerk 本地化 `src/i18n/clerk.ts`。
- **双层 message 包**：根 layout 只发 marketing 子集，`(main)/layout.tsx` 用全量包重新包一层——use-intl 4.x 嵌套是**替换不是合并**（layout 内注释，2026-07-10 核验）。
- 三语必须同步（约 80 命名空间 / 3456 键，2026-06-02 口径）；守护：`src/i18n/completeness.test.ts`（键齐全 + AI_MODELS 标签 + providers）+ `e2e/i18n.spec.ts`。
- ⚠ Studio 命名空间碎片化（StudioV2 / V3 / Form / PromptArea / Page / Panels / Toolbar…）：新 key 优先并入既有页面域命名空间，**不再新开版本号空间**。

## Source of Truth

- `src/app/globals.css` · `src/app/homepage.css` · `src/i18n/fonts.ts` · `src/i18n/routing.ts`
- `src/hooks/use-mobile.ts` · `src/app/[locale]/(main)/layout.tsx` · `src/components/{ui,layout,business}/`
- 历史详版（含逐行 source 引用）：`git show cddc4384:docs/design/system/<文件>`（css-and-tokens / layout-shell / components / i18n-accessibility / current-ui-inventory）

## Last Verified

- Date: 2026-07-10 · Method: 核验 fonts.ts、(main)/layout.tsx、use-mobile.ts（断点 1024）、globals.css 关键 token 行与 Satoshi 死引用、`ui/` 目录清点（58 文件）、无 tailwind.config.ts。
- 2026-07-10 浏览器目检（claude-in-chrome，owner dev 实例，桌面 1568 宽）：侧栏分组结构 ✓ · Studio 空态起手势（eyebrow + 3 示例 chips + 继续创作 ≤6 缩略图 + 教程入口）✓ · dock 六位工具栏（模型/模板/助手/图像/卡片/1:1）✓ · composer 象牙纸 + 黑丸 ✓ · 画布空态前门 + 助手右侧 dock + 底部工具条 ✓ · 登录态侧栏 footer（额度徽标/今日免费/用户菜单/语言切换）✓。**移动端壳未目检**（浏览器窗口受管理无法缩放）；发现 MobileRailAccountButton hydration mismatch（已立修复任务）。
- 引用计数（39/44/29/41 处等）与弱 token 清单沿用 2026-06-02 系统审计口径；据此新建 UI 前遇疑先对代码。
