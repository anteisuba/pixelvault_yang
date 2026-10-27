# Frontend 参考 — 实现事实与共享行为契约

> 定位：记录当前前端实现、token 层级、共享组件行为和高风险复用点。本文不定义页面视觉身份；新 UI 的品牌与设计权力边界见 `brand-dna.md`，域级方向见对应 `references/domains/` 与 `references/pages/`。

## Token 与组件治理

```text
primitive → semantic → domain/component → page
```

- **Primitive**：原始色阶、间距、尺寸、字体尺度、半径、阴影和时长，只提供可用值。
- **Semantic**：foreground、surface、border、focus、success、warning、destructive 等用途语义，提供中性 fallback。
- **Domain / Component**：业务域与组件状态的外观实现，可以完整覆盖 semantic fallback。
- **Page**：页面结构和标志性局部值；只有第二个真实消费者出现且视觉需求一致时才提升。
- 共享组件固定行为、API、状态优先级、ARIA、键盘、focus return 和响应式；颜色、字体、材质、圆角、阴影、密度、布局与动效由域/page variant 和 token 决定。
- `className`、slot、data attribute 和 CSS variable 是允许的域级外观接缝；页面 class/token 不得无意泄漏全局。

## CSS 与 token 现状

- 入口：`src/app/globals.css`（全局枢纽，@theme inline + 语义变量 + 组件层，**唯一挂根 `layout.tsx` 的样式表**）+ 域皮肤 `src/app/canvas.css` / `src/app/home-v4.css` / `src/app/legal.css` / `src/app/lora.css` / `src/app/auth.css`（域内局部，令牌一律写在域根上**不准写 `:root`**）。
- **域皮肤只由自己的域入口 import**，不进根 layout：`canvas.css` + `@xyflow/react/dist/style.css` → `src/app/[locale]/(main)/studio/node/layout.tsx`（2026-09-03 从根 layout / `globals.css` 的 `@import` 下沉，此前那 173 KB 皮肤进每一个路由的首屏 CSS）；`home-v4.css` → `HomeV4Shell.tsx`；`lora.css` → `LoraWorkbench.tsx`；`legal.css` → `LegalPage.tsx`（`not-found.tsx` 2026-10-08 起走空态模板，不再引 legal.css）。
- ⚠ **canvas.css 泄漏的那一小部分留在 `globals.css` 脊柱上**（皮肤当年写 `:root` 的代价，2026-09-03 下沉时按真实消费者逐条查证后拆分，别搬回去也别两边各留一份）：
  - 8 个 `--node-*` 定值（`panel` / `panel-inner` / `panel-soft` / `foreground` / `muted` / `edge` / `focus-ring` / `shadow`）——`studio-shared/editor/ImageEditSurface`、`studio-shared/pickers/CanvasRoutePicker`在画布路由之外读它们。
  - `.node-canvas-panel-motion` 整块：域外消费者（旧 `StudioAssistantDock` / `StudioAssistantHeaderActions`）已随第 9c 步（2026-10-23）删掉，可以下沉回 canvas.css，留给全局 UI 统一时一起整理。（同批的 `.canvas-assistant-popover*` 字面色浮层皮没了消费者，暗色主题模块 2026-10-24 已删。）
  - 其余 `--node-*` / `--canvas-*` / `.domain-canvas *` / `.node-card-*` 等仍住 canvas.css；`@theme inline` 的 `--color-node-*` 映射照旧留在 `globals.css`（Tailwind 编译入口只有一个）。
- 首页域皮肤 2026-08-28 从 `home-v3.css` 换成 `home-v4.css`（`.home-v4` 翻页站），v3 的皮肤 + 20 个 `HomeV3*` 组件 + `constants/home-v3.ts` 已整体删除。此前 2026-07-27 曾从 `homepage.css`（`.homepage-*`）换到 v3。
- 外观两档（2026-10-24）：默认素，根 `<html>` 没有 `.dark`；用户选了暗房，`(main)` 里 `<html>` 挂 `.dark`（`src/lib/theme.ts`，见 `ui-defaults.md` §2.1）。`.dark` 自带 `color-scheme: dark`；域皮肤的暗档写 `.dark .domain-*`。
- **Tailwind 4：无 `tailwind.config.ts`**，token 扩展一律在 `globals.css` 的 `@theme inline`（2026-07-10 核验；CLAUDE.md 旧口径已修正）。
- ⚠ globals.css 首行仍 `@import` Fontshare Satoshi，但全 src 无任何 `Satoshi` font-family 引用（字体栈已迁 Geist）——死引用，已立清理任务。

### 当前 token 实现清单

| 层                     | 当前内容                                                                                                           | 新设计使用规则                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Semantic（脊柱，锁死） | `bg-background` / `bg-muted` / `bg-surface-sunken`（壳底）/ `bg-card` / `border-border` / `text-muted-foreground`… | 全站唯一浅底三层与文字语义，域不覆盖（ui-defaults.md §2，2026-09-03） |
| Domain                 | `sidebar-*` · `node-*` · `--surface-composer` · `--width-studio-*`                                                 | 只在所属域使用；当前值不外溢为全站默认                                |
| Page                   | `.home-v4` 域内令牌（首页域）                                                                                      | 留在页内；第二个页面需要同模式时仍先分别验证                          |
| Utility                | `max-w-content` / `max-w-gallery` · `text-3xs` / `text-2xs` / `text-nav`                                           | 共享尺度工具，不表达品牌性格                                          |

- `editorial-*` 类族（globals.css 33 处）：跨 prompts / 详情页 / 路由态的陈列面模式；职责混合（壳/hero/panel/metric 混在一起），提取或改动前按页确认。
- **弱/孤 token**（2026-06-02 审计口径，构建新 UI 前先核实用量）：`--text-hero-*`、`--h-hero-btn`、`--text-tab`、`--overlay-chip`、`--surface-highlight`、`--home-surface-soft`、`--width-studio-left/sidebar`。
- 任意值治理：`text-[10px]`（60 处）→ `text-3xs`；`text-[11px]`（27 处）→ `text-2xs`；`tracking-[0.16em]` 等 → `tracking-nav` 族。视口/运行时约束（`calc()`/`svh`/radix 变量/`duration-[…]`）属合法保留，不盲目归一。

## 字体现状（2026-10-27 核验 `src/i18n/fonts.ts`）

字体文件全部来自 npm 包、随构建打进产物（owner 2026-10-27 定）。⛔ `next/font/google`：构建时要去 Google 拉，拉不到 Production Build 整个挂掉（10-27 一天两次）。

| 变量                                            | 字体                         | 来源                                                  | 用途            |
| ----------------------------------------------- | ---------------------------- | ----------------------------------------------------- | --------------- |
| `--font-geist`                                  | Geist（可变 100–900）        | `geist` 包 → `next/font/local`                        | 拉丁正文 / 标题 |
| `--font-geist-mono`                             | Geist Mono                   | `geist` 包 → `next/font/local`                        | 代码 / 参数     |
| `--font-fraunces`                               | Fraunces（latin，可变 wght） | `@fontsource-variable/fraunces` → `next/font/local`   | 展示槽          |
| `--font-noto-sans-sc` / `--font-noto-sans-jp`   | Noto Sans SC / JP Variable   | `@fontsource-variable/*` 样式表，`:root` 接 family 名 | 三语栈的 CJK 位 |
| `--font-noto-serif-sc` / `--font-noto-serif-jp` | Noto Serif SC / JP Variable  | 同上                                                  | 展示槽的 CJK 位 |

- 三个 `next/font/local` 的 `.variable` 挂在 `<html>`（`layout.tsx`）；三语栈在 `globals.css` 的 `:root` / `html:lang(ja)` 组装。
- CJK 用 fontsource 样式表而不是 `next/font/local`：它按 unicode-range 切了约 100 片，页面用到哪段字才下哪片，不进其他 locale 的关键路径。
- ⚠ 组件测试需要 `next/font/local` 的 mock（`vitest.setup.ts`）：它的运行时导出是 Next 编译期生成的，plain vitest 里直接 `is not a function`。

## 布局壳（2026-07-10 核验 `(main)/layout.tsx`）

- 结构：`SidebarProvider` → `AppSidebar` + `MobileCollapsedRail` + `MobileHeader` + `SidebarInset`(#main-content) + `MobileTabBar`；Mobile 三件套都从 `src/components/layout/MobileTabBar.tsx` 导出。
- **紧凑断点 = 768**（`use-mobile.ts` MOBILE_BREAKPOINT；owner 2026-10-09 平板 v10 推翻 C4 的 1024：<768 移动 chrome，≥768 桌面侧栏，768–1023 平板侧栏钉死收起、助手不让位，`useIsTablet`）。Tailwind `lg:` 挪到 48rem = 桌面壳，原 1024 档叫 `desk:`。inset padding：`pt-11 pb-12 pl-11 lg:pt-0 lg:pb-0 lg:pl-0`。
- 侧栏：展开 12rem / 折叠 3rem；初始状态 = `sidebar_state` cookie + UA 判断；快捷键 ctrl/⌘+B。
- skip link → `#main-content`（保持，勿删）。
- `KeyboardInsetBridge`：visualViewport 软键盘适配（dock 感知）。

## 组件清单（先查这里，再考虑造新的）

层级判据：`ui/` = 无业务纯原语 · `layout/` = 壳 · `business/` = 域组件 · `business/studio-shared/` = 跨 Studio 复用 · `business/node/` = 画布域。

### 覆层行为矩阵 — 强约定

| 场景                          | 用什么                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面居中弹窗 ↔ 手机底部抽屉   | **ResponsiveDialog**（勿 `defaultOpen`）                                                                                                                                                                                                                                                                          |
| 锚定 Popover ↔ 触屏紧凑态抽屉 | **ResponsivePopover**；窄视口 + fine pointer 仍走 Popover，保持触发器可重复关闭；包在 `ResponsivePopoverPhoneCard` 里的（工作台手机输入栏的模型 / 规格 / 参数 / ＋，iOS 稿 owner 2026-10-16）触屏手机也弹锚定白卡，高宽封顶在可用空间内                                                                           |
| ⋯ 动作菜单 ↔ 触屏手机抽屉     | **ResponsiveMenu**（`DropdownMenu*` 子集；手机是一列 48 高大行，`onSelect` 里 `preventDefault()` = 不关）；⛔ 手机上裸用 `DropdownMenu`                                                                                                                                                                           |
| 系统返回手势                  | 触屏上大图、底部抽屉开着时，返回先关最上面那层（`use-back-to-close`；`Drawer` 已内置，自写全屏浮层要自己挂）                                                                                                                                                                                                      |
| Studio 当前工具面板           | `studio-shared/primitives/tool-surface`；只作为 Studio 现有行为/实现，不是跨域外观模板                                                                                                                                                                                                                            |
| 选素材                        | `AssetSelectorDialog`（约 39 处引用；单/多选、mediaType、上限）                                                                                                                                                                                                                                                   |
| 选模型                        | `MainModelPicker`（约 44 处）/ `BaseModelPickerPanel`（约 29 处）；`layout="columns"` = 三列居中 Dialog（系列 / 型号 / 渠道，支持多选），`"drill"` = 原逐级下钻，移动端只能用 drill                                                                                                                               |
| 缺 API key                    | **选模型**、**出图等动作** → 都就地弹 `QuickSetupDialog`，选模型验证通过才选上（Hard Rule 8：不禁用 UI，⛔ 跳页）                                                                                                                                                                                                 |
| 确认 / 危险操作               | 能撤销的小删除（删图、删对话、删一条记忆）→ `feedback-button` 的 `ConfirmDeleteButton`（键拉长成红色「确认删除」，再点才删）；删了找不回的大事（删密钥 / 项目 / 注销）→ `confirm-dialog`（`alert-dialog` 自带从按下的位置长到正中，触屏手机从底部升起；`confirmPhrase` 要求先打字）。规则见 `ui-defaults.md` §7.1 |
| Toast / 键上结果              | 点按钮得到的结果 → `FeedbackButton` + `useButtonFeedback`（键拉长变黑写结果，1.6 秒缩回）；后台跑完的 → sonner 底部正中黑条（`Toaster` 挂主布局，业务代码照旧 `import { toast } from 'sonner'`；底部输入框用 `useToastLift` 把它抬高；可撤销的删除走 `lib/undoable-action`）                                      |

### `ui/` 原语分类（58 文件，2026-07-10 清点）

- **基础控件**：button（cva 变体：default/destructive/outline/secondary/ghost/link + xs/icon-xs）· input · textarea · label · select · slider · switch · tabs（default/line）· toggle-group · param-slider
- **覆层**：dialog · sheet · drawer(vaul) · responsive-dialog · responsive-popover · responsive-menu · popover（带交互守卫）· alert-dialog · confirm-dialog · dropdown-menu · tooltip（delay 0）· command(cmdk)
- **反馈**：skeleton（静止灰块，⛔ pulse）· load-reveal（数据到了由糊变清，`loading.md`）· progress · badge · sonner（底部黑条）· feedback-button（键上结果 / 两段删除）· empty-state（空态 / 出错 / 404 同一模板）
- **内容展示**：card · card-tile-base · markdown · code-block · message · metadata-list · audio-player · optimized-image · image-compare
- **输入复合**：prompt-input（约 41 处）
- **装饰/动效**：number-ticker · brand-mark；使用时验证任务价值、性能与 reduced-motion，不因存在而默认复用

### Studio 共享 chrome（`studio-shared/chrome`）

StudioBottomDock · StudioCanvas · **StudioResizableLayout（导出 `StudioFlowLayout`；Studio 垂直间距唯一负责人）** · **StudioWorkbenchLayout** · StudioCommandPalette · StudioErrorBoundary；教程载体 XiaoheiGuideCarousel。

⚠ **两套外壳并列，不是替代**（2026-08-18）：

| 外壳                    | 谁用         | 形状                                                                                                                                          |
| ----------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `StudioWorkbenchLayout` | **图片模态** | 横向：`lg:w-72` 常驻参数栏 + 结果区。断点 **lg（= 桌面壳 768）**，与 `useIsMobile` 对齐——两边各取一个数会留「列位已预留但内容还没渲染」的空沟 |
| `StudioFlowLayout`      | 视频 / 音频  | 纵向 canvas + 底部 dock（原样，未动）                                                                                                         |

分工沿用画布 07-31 那条已验证的分界线：**参数回答「下一版长什么样」，动作回答「我现在要做什么」**——参数栏只放参数，结果区上方不再有横带，每张图自己报状态。

助手（`StudioOperatorDock`，所有台同一个）对两套外壳都无感知：浮层，开合只改自身宽度，**覆盖不挤压**。旧的 `StudioAssistantDock` / `StudioAssistantFab` / `StudioEnhanceButton` 已随第 9c 步（2026-10-23）删掉。

### 画布域（`business/node/`）要点

画布是 v4：工作台外壳在 `node/workbench-v4/`（`NodeWorkbenchV4` / `CanvasV4` / 工具条 / 快捷键 / 拖放），四类节点卡在 `node/nodes/v4/`，外壳组件（CanvasTopBar / CanvasBottomDock / CanvasMiniMap / CastDock / StudioNodeAssistantDock / NodeCanvasEmptyGuide）留在 `node/` 根。**改画布先读 `pages/node-canvas-v2.md`（现行基准）与 `ui-defaults.md §3.1 / §4.1`（节点卡的圆角例外与弹簧三档）；组件分层与禁改见 `src/components/business/node/CLAUDE.md`。**

## 移动端范式

- 断点体系：<768 移动 chrome（顶栏当切换器）；768–1023 平板 = 桌面壳窄档；测试视口集 375 / 390 / 430 / 768 / 1024 / 1440。
- 披露一律 ResponsiveDialog / ResponsivePopover；ResponsivePopover 仅在 `<768px` 且 touch-primary 时切 Drawer，fine pointer 的窄窗口仍保留锚定 Popover；侧栏移动 Sheet 宽 `min(13rem, calc(100vw - 8rem))`。
- 自适应命中区：fine pointer 紧凑控件 ≥32px / 常规控件 ≥36px，coarse pointer/touch ≥44px；底线为 WCAG 2.2 AA 24px（小于时必须满足 spacing/equivalent 例外并断言）。软键盘双保险：visualViewport（KeyboardInsetBridge）+ 触屏键盘策略（isTouchPrimary / focusUnlessTouch——软键盘只在用户直接点输入框时弹）。
- 移动主路径回归：`npx playwright test e2e/mobile.spec.ts --project=mobile`。

## i18n

- next-intl；`en` / `ja` / `zh`；locale 前缀恒在；路由事实源 `src/i18n/routing.ts`；Clerk 本地化 `src/i18n/clerk.ts`。
- **双层 message 包**：根 layout 只发 marketing 子集，`(main)/layout.tsx` 用全量包重新包一层——use-intl 4.x 嵌套是**替换不是合并**（layout 内注释，2026-07-10 核验）。
- **文件布局（2026-10-22 owner 定）**：`src/messages/<模块>/{en,ja,zh}.json`，每个模块一个文件夹、三语并排；`src/messages/index.ts` 把各模块拼回每种语言一整份（`en` / `ja` / `zh` / `MESSAGES`），命名空间与键名不随文件夹变。读文案一律经 `@/messages`；`global-error.tsx` 是客户端组件，只引 `common/` 那三份。
- 模块（14 个，对齐第 3 批 `features/<域>`）：common · marketing · models · studio · media（视频 / 音频 / 3D）· canvas · assistant · prompts · tags · lora · characters · gallery · assets · settings。
- **三语怎么写、怎么维护（owner 2026-10-22 定）**：
  1. 同一个改动里三语一起加，⛔ 先写一种语言以后补。`en` 是默认语言，必须完整。
  2. Claude 写三语；中文以 owner 的说法为准，日文跟着术语表走。
  3. 产品固定词先查 [i18n-glossary.md](i18n-glossary.md)，同一个东西三语只用一种叫法；新出现的固定词先补进术语表。
  4. 新命名空间放进所属模块的文件夹；拿不准放 `common`，并在交付时说明。
  5. 删组件 / 删功能时，只给它用的键同一个改动里删掉（owner 定：不加「没人用的键」自动测试，靠删的人顺手清）。
  6. 文案风格沿用 UI 规矩：短，不加多余副标题和说明，让布局表达。
- 三语必须同步；守护：`src/i18n/completeness.test.ts`（每个模块文件夹三语键一致、每个命名空间只属于一个模块、代码引用的键都存在、AI_MODELS 标签）+ `e2e/i18n.spec.ts`。
- 按页面只把需要的文案发给浏览器（现在 `(main)` 每页带整份约 330KB）：owner 同意留到第 3 批按域搬家时做。
- ⚠ Studio 命名空间碎片化（StudioV2 / V3 / Form / PromptArea / Page / Panels / Toolbar…）：新 key 优先并入既有页面域命名空间，**不再新开版本号空间**。

## Source of Truth

- `src/app/globals.css` · `src/app/home-v4.css` · `src/app/canvas.css` · `src/i18n/fonts.ts` · `src/i18n/routing.ts`
- `src/hooks/use-mobile.ts` · `src/app/[locale]/(main)/layout.tsx` · `src/components/{ui,layout,business}/`
- 历史详版（含逐行 source 引用）：`git show cddc4384:docs/design/system/<文件>`（css-and-tokens / layout-shell / components / i18n-accessibility / current-ui-inventory）

## Last Verified

- Date: 2026-07-10 · Method: 核验 fonts.ts、(main)/layout.tsx、use-mobile.ts（断点 1024）、globals.css 关键 token 行与 Satoshi 死引用、`ui/` 目录清点（58 文件）、无 tailwind.config.ts。
- 2026-07-10 浏览器目检（claude-in-chrome，owner dev 实例，桌面 1568 宽）：侧栏分组结构 ✓ · Studio 空态起手势（eyebrow + 3 示例 chips + 继续创作 ≤6 缩略图 + 教程入口）✓ · dock 六位工具栏（模型/模板/助手/图像/卡片/1:1）✓ · composer 象牙纸 + 黑丸 ✓ · 画布空态前门 + 助手右侧 dock + 底部工具条 ✓ · 登录态侧栏 footer（额度徽标/今日免费/用户菜单/语言切换）✓。**移动端壳未目检**（浏览器窗口受管理无法缩放）；发现 MobileRailAccountButton hydration mismatch（已立修复任务）。
- 引用计数（39/44/29/41 处等）与弱 token 清单沿用 2026-06-02 系统审计口径；据此新建 UI 前遇疑先对代码。
- 2026-07-13：owner 授权调整旧 UI 硬规则；依据 WCAG 2.2 / Apple 触屏基准，把一刀切 44px 同步为 fine 32/36px、coarse 44px、AA 24px 底线。其余组件清点事实未重跑。
- 2026-07-19：重写 token 与组件治理口径；共享组件固定行为/API/状态/a11y，外观由 domain/page variant 与 token 覆盖。现状组件与 token 数值不再构成跨域视觉模板。
- 2026-08-18：图片模态换 `StudioWorkbenchLayout` 横向外壳（视频/音频未动）；`BaseModelPickerPanel` 加 `layout="columns"`；`VariantGrid` 退役，图墙统一到 `CompareGrid`。真机 1920 实测助手浮标开 720px / 关 0px、参数栏坐标全程不动。**图层分解（See-Through）整条删除**——Studio 入口、画布能力、service、API、三语 i18n 全部不在了，别再按「八条编辑能力」找它。
