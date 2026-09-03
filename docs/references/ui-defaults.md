# UI 默认食谱 — ui-defaults.md

> 状态：**现行默认（2026-09-03 owner 拍板三条：字体收回脊柱 · semantic 颜色全站锁死 · UI 完成定义压成 8 项）**。
> 定位：AI 或人动任何 UI 之前必读的**肯定句清单**——不写"不准"，只写"默认这样做"。禁忌见 `forbidden.md`，治理边界见 `brand-dna.md`，实现事实见 `frontend.md`，动效原则见 `interaction.md`。
> 冲突时：本文 > 当前页面长相 > 任何 skill 的自带审美。需求卡（`templates/ui-request.md`）里没写的，一律按本文默认。
> 2026-09-03 owner 已拍板：展示槽 = Fraunces + Noto Serif（A）· 壳底保留浮岛层次（`--surface-sunken`）· cards / assets loading 改回浅色 · 画布与 LoRA 移动端走降级、arena 待删。本文无未决项；标 **[待验证]** 的（页面切换 View Transitions）验证通过前不用。

---

## 1. 字体 — 三个槽，全站同一套

| 槽       | 类名           | 拉丁       | CJK（zh / ja）              | 用在哪                                                                                                                            |
| -------- | -------------- | ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **正文** | `font-sans`    | Geist      | Noto Sans SC / Noto Sans JP | 一切默认文字、控件、表格、标签                                                                                                    |
| **等宽** | `font-mono`    | Geist Mono | 回落正文 CJK                | 参数、seed、代码、数值、模型 id、快捷键                                                                                           |
| **展示** | `font-display` | Fraunces   | Noto Serif SC / JP          | **只给三处**：首页 hero、legal 页标题、空态大标题（owner 2026-09-03）；应用内页面 h1 一律正文槽加粗，**不进控件、表格、卡片标题** |

规则：

1. **栈顺序三语一致**：拉丁字体永远排第一，CJK 排第二。zh/ja 下正文栈必须写成 `Geist, Noto Sans SC`，不能把 Geist 丢掉——现状正文丢了 Geist，标题没丢，这就是"标题和正文里的英文长得不一样"的根因。
2. **`font-serif` 是假槽，废止**。它现在映射到 Geist，86 处引用全部改成 `font-display`（真要衬线）或删掉（本来就是正文）。
3. **首页营销域并入三槽**：`--font-home-sans`（Noto Sans）→ `font-sans`；`--font-home-mono`（IBM Plex Mono）→ `font-mono`；`--font-home-serif` / `-jp` → `font-display` 的 CJK 侧。首页保留的只是"标题用衬线"这个用法，不是独立字体家族。
4. **`--font-editorial`（Fraunces，legal 页）并入 `font-display`**，不再单独存在。
5. 目标：根布局挂载家族从 9 个降到 7 个（Geist · Geist Mono · Fraunces · Noto Sans SC · Noto Sans JP · Noto Serif SC · Noto Serif JP）；`--font-app-display` / `--font-app-serif` 两个重复的 Geist 变量删掉。
6. **字号只走 Tailwind 尺度 + 已有扩展**：`text-3xs`(10) · `text-2xs`(11) · `text-xs`(12) · `text-sm`(14) · `text-base`(16) · `text-lg`(18) · `text-xl`(20) · `text-2xl`(24) · 更大只在 `font-display` 槽里出现。控件正文 `text-sm`，辅助文字 `text-xs`，标签 `text-2xs` 大写字距 `tracking-nav`，10px 只给密排数据。
7. **字重**：正文 400 · 强调/按钮 500 · 小标题 600 · 700 只在 `font-display`。CJK 不用 700 以上。
8. **行高**：正文 `leading-normal`(1.5)，CJK 段落 `leading-relaxed`(1.625)，标题 `leading-tight`。

**展示槽已拍板（2026-09-03）：A = Fraunces + Noto Serif SC/JP**，全站唯一衬线，首页 08-28 方向 B 的衬线标题与 legal 页 Fraunces 合成这一个槽。代价是 zh/ja 页面首屏多一个 Noto Serif 请求，`preload: false` 已挡在关键路径外。

---

## 2. 颜色 — semantic 全站一套，域只有一个强调色

### 2.1 脊柱（锁死，任何域不得覆盖）

| 语义             | token                                                                                        | 现值（浅色）                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 页面底           | `bg-background`                                                                              | 纯白 oklch(100%)                                                                  |
| 卡片/浮层        | `bg-card` `bg-popover`                                                                       | 纯白 + `border-border`                                                            |
| 次级面           | `bg-muted` `bg-secondary` `bg-accent`（hover）                                               | oklch(97%) 中性浅灰                                                               |
| 壳底             | `bg-surface-sunken`（只给应用壳 `--sidebar` 用）                                             | #ebebeb = oklch(94%)，2026-09-03 已落地                                           |
| 正文/次文        | `text-foreground` / `text-muted-foreground`                                                  | oklch(14.5%) / oklch(52%)（2026-09-03 由 55.6% 压深：原值对 `--muted` 只有 4.35） |
| 主动作           | `bg-primary text-primary-foreground`                                                         | 纯黑上白字                                                                        |
| 破坏             | `bg-destructive` / `text-destructive`                                                        | 红                                                                                |
| 边/输入/焦点     | `border-border` `border-input` `ring-ring`                                                   | oklch(92.2%) / 70.8%                                                              |
| 已应用/警告/风险 | `--status-applied` / `--status-warning` / `--status-risk`，各带 `-surface` 浅底（risk 除外） | 绿 #16794c · 琥珀 #a04f00 · 红 #b3261e；对比度见 globals.css 注释                 |
| 模态             | `bg-modality-image` / `-video` / `-audio`                                                    | 紫 292 / 蓝 255 / 玫瑰 10，低饱和                                                 |

**应用默认浅色。** html 根没有 `.dark`；`ds-bundle/README.md` 里"dark-only"是过时口径。`.dark` 只允许出现在**媒体观看面**：lightbox、`MediaDetailViewer`、画布图片编辑工作台、node 画布视口。页面本身不做暗色。cards 页与 assets loading 现在整页 `.dark`，**改回浅色（owner 2026-09-03 拍板）**；它们不是媒体观看面。

### 2.2 "白"只有一种

现状五种浅底（首页暖白 `#f4f4f1` · 壳冷灰 `#e4e7ec` · LoRA 中性 oklch · 画布米纸 `#ebe5d8` · composer 象牙 oklch(96% .008 95)）收成两层：

- **页面底 = `--background` 纯白；分组/次级面 = `--muted` 中性灰。** 首页 `--paper/--panel`、LoRA `--lora-page/--lora-well`、壳 `--sidebar` 全部 alias 到这两个，不再各自给值。**壳底例外（owner 2026-09-03 拍板保住浮岛层次）**：脊柱新增第三层 `--surface-sunken: oklch(94% 0 0)`，只给应用壳 `--sidebar` 用，主卡浮在它上面；域不得再造第四种浅底。三层就是全部：`--background` 纯白 · `--muted` 97% · `--surface-sunken` 94%。
- **画布米纸与 composer 象牙是"材质"，不是页面底**：作为 canvas 域和 studio 域各自的 `--domain-accent-surface` 保留，只贴在卡片/输入条那一件东西上，不铺整页。
- **第四层 `--surface-workbench`（owner 2026-09-03，配音间灰底+白卡推广到工作台）**：配音间原实现是 `#f4f4f1`，真机实测与壳底 `--sidebar`（计算值 #ebebeb）通道差 (9,9,6)，超过「肉眼几乎一样」的 ≤6 判据，没有直接复用 `--sidebar`，单独开了这一档（暗色沿用 `--surface-sunken`，即壳底暗档，配音间锁浅色没有暗档可对齐）。工作台框 = `.workbench-ground`（灰底地台）+ `.workbench-card`（白卡），四个工作台（配音间 / 图像 / 视频 / LoRA）共用一份值，值以 `src/app/globals.css` 为准，不在域内各自维护。

### 2.3 域强调色（每域一个）

每个业务域只能定义 **`--domain-accent`** 和 **`--domain-accent-surface`** 两个变量，写在域根（`.domain-canvas` / `.domain-lora` / `.home-v4`），**不写 `:root`**。默认取值：

| 域                           | accent                 | accent-surface |
| ---------------------------- | ---------------------- | -------------- |
| Studio Image                 | `--modality-image`     | composer 象牙  |
| Studio Video                 | `--modality-video`     | 同上           |
| Studio Audio                 | `--modality-audio`     | 同上           |
| Canvas                       | `--node-port-image` 紫 | 米纸 `#ebe5d8` |
| LoRA                         | `--primary`（黑）      | 无             |
| Gallery/Assets/Cards/Prompts | `--primary`            | 无             |
| Home                         | `--primary`            | 无             |

强调色只出现在三个位置：**当前选中态、主 CTA 的 hover/focus 环、进度**。不做大面积填色，不做渐变。

### 2.4 写法

- 颜色一律用 token 类名，Tailwind 调色板类（`text-amber-700` `bg-emerald-500/15` 一类）**不出现在业务代码**。amber/emerald 已于 2026-09-03 全部换成 `status-warning` / `status-applied`（文字用 `text-status-*`，浅底用 `bg-status-*-surface`，实心点/进度用 `bg-status-*` 或 `bg-status-*/70` 一类透明度）；红/蓝/紫/中性灰等其余调色板类仍待清，装饰性渐变（cards 占位、训练完成庆祝）不在此列。
- 任何新颜色先跑 `contrast-check`，文字 4.5:1、大字与图标 3:1、AA 底线 24px 命中区。
- 透明度修饰符是允许的：`bg-primary/90` `border-border/60`。

---

## 3. 间距、圆角、阴影

- 间距只走 Tailwind 4 尺度：控件内距 `px-3 py-2`，卡片内距 `p-4`，区块间距 `gap-4` / `gap-6`，页面外距 `px-4 lg:px-6`，最大宽 `max-w-content` / `max-w-gallery`。
- 圆角：控件 `rounded-md`，卡片/弹层 `rounded-lg`，抽屉/大面 `rounded-xl`，胶囊只给 chip/badge。基准 `--radius: 0.625rem` 不改。
- 阴影：浮层 `shadow-md`，抽屉/对话框 `shadow-lg`，其余不加。浅色界面靠边线分层，不靠阴影。
- 边线：`border-border` 一档；材质描边（画布卡）用域内 token。

---

## 4. 动效配方 — 每个交互一行，直接照抄

时长/曲线只用 `globals.css` 的 token：`--duration-fast` 120 · `--duration-base` 200 · `--duration-slow` 320 · `--duration-reveal` 500；曲线 `--ease-standard`。只动 `transform` / `opacity`。**每条都带 `motion-reduce:` 降级**。

| 交互                         | 配方                                                                                                                                    | 库                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 按钮/卡片按压                | `active:scale-[.98] transition-transform duration-fast`（把 `.98` 收成 `--scale-press` token 后改用 `active:scale-press`）              | CSS                |
| hover 提亮                   | `transition-colors duration-fast hover:bg-accent`                                                                                       | CSS                |
| 焦点环                       | `focus-visible:ring-2 ring-ring ring-offset-2`，不做动画                                                                                | CSS                |
| Dialog 开/关                 | 已内置：`data-[state=open]:animate-in fade-in-0 zoom-in-95` / closed 反向，`duration-200`。**不要覆盖**                                 | radix + tw-animate |
| Sheet / Drawer 开/关         | Sheet 已内置 slide；手机底部抽屉走 vaul，自带拖拽关闭。**不要自己写 translateY**                                                        | radix / vaul       |
| Popover / Dropdown / Tooltip | 已内置 `fade-in-0 zoom-in-95`，tooltip delay 0                                                                                          | radix              |
| 列表/网格项进入              | `motion.div` `initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}` + 父级 `staggerChildren: 0.03`，最多前 12 项做 stagger，其余直接出现 | motion             |
| 元素移除                     | `AnimatePresence` + `exit={{opacity:0,scale:.98}}`，`duration-fast`                                                                     | motion             |
| 骨架 → 内容                  | 骨架 `animate-pulse`；内容到达时容器 `animate-in fade-in-0 duration-base`；**骨架尺寸 = 内容尺寸**，不许跳动                            | CSS                |
| Tab / 分段选中指示条         | `layoutId="tab-indicator"` 共享布局动画                                                                                                 | motion             |
| 选中态切换（卡片/chip）      | `transition-[background-color,border-color,box-shadow] duration-fast`                                                                   | CSS                |
| 生成进度                     | 不确定 = spinner；确定 = 进度条 `linear`（`loading.md`）                                                                                | 已有组件           |
| 页面切换                     | 默认无动画。**[待验证]** Next 16 `viewTransition` 可试，验证通过前不用                                                                  | —                  |
| 数字变化                     | `number-ticker.tsx` 已有；只给统计数，不给价格/额度                                                                                     | 已有组件           |
| 拖拽                         | dnd-kit / pragmatic-dnd 已装；拖起 `scale-[1.02] shadow-lg`，落下回弹 `--ease-soft-return`                                              | 已有依赖           |

**首页营销域**例外：GSAP 允许，且只在 `HomeV4*` 内动态导入（`CLAUDE.md` 动画库分工）。

---

## 5. 交互状态 — 每个可点的东西都有这七态

`default` · `hover`（fine pointer 才有）· `active/pressed` · `focus-visible` · `disabled`（`opacity-50 pointer-events-none`，**不隐藏**）· `loading`（按钮内 `Spinner size="sm"` 替换图标，文字不变，宽度不跳）· `selected`（强调色边 + `aria-selected`/`aria-pressed`）。

- 状态不只靠颜色：selected 加图标或边线，error 加图标 + 文案。
- 点击有结果的按钮，结果必须可见：打开的东西有进入动画（第 4 节），提交成功 toast（sonner），失败 inline error + 可重试。
- 触屏（`coarse:`）：hover 态改为按压态；命中区 44px；tooltip 改为长按或省略。
- 命中区：fine 32/36px，coarse 44px，AA 底线 24px。

---

## 6. 移动端配方 — 375px 起，不是桌面缩小

**断点**：`<1024` 移动壳（`MobileShell` + `MobileTabBar`），`≥1024` 桌面侧栏。组件内部**用容器查询** `@container` + `@md:`，不用视口断点。

| 桌面上的东西     | 375px 上变成                                                                                   | 用什么                        |
| ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| 居中 Dialog      | 底部抽屉                                                                                       | `ResponsiveDialog`            |
| 锚定 Popover     | 触屏紧凑态抽屉；窄视口 + 鼠标仍是 Popover                                                      | `ResponsivePopover`           |
| 侧栏参数面板     | 底部 vaul 抽屉；页面底部固定一条主动作栏（生成/保存），`pb-[env(safe-area-inset-bottom)]` 之上 | `drawer.tsx` + `dvh` 全高布局 |
| 多列表格         | 卡片列表，每行主字段 + 一个次级行                                                              | —                             |
| 三列模型选择器   | `layout="drill"` 逐级下钻                                                                      | `BaseModelPickerPanel`        |
| hover 显示的操作 | 常显或长按菜单                                                                                 | `dropdown-menu`               |
| 图墙             | 2 列，`gap-2`，缩略图 `aspect-square` 或 `aspect-[3/4]`                                        | grid                          |
| 软键盘           | 已处理，dock 会让位                                                                            | `KeyboardInsetBridge`         |
| 全高容器         | `min-h-svh` / `h-dvh`，不用 `100vh`                                                            | CSS                           |

**每条路由的移动端等级**（写进各 `references/domains/<域>.md`）：

- **完整**：gallery · assets · cards · prompts · u/[username] · 详情页 · 首页 · 登录。
- **降级**：studio/image · video · audio · enhance · analyze · 3d——参数进抽屉，预览占满，生成栏固定。
- **降级 · 画布**（owner 2026-09-03 拍板要做，参考 updream.cn 手机画布的结构，不借皮肤）：视口全屏可 pan/zoom；节点卡放大到 `calc(100vw - 2rem)` 宽、单指拖动；左侧一条竖排浮动工具栏（4 到 5 个图标：素材 / 新节点 / 历史 / 剪辑）；composer 是底部 vaul 抽屉，收起只露一行输入、拉起露出模式 chip + 媒体类型 + 模型/参数；小地图缩到左下角可折叠；撤销/重做/全屏/预览压成底部一条 44px 工具条；助手 dock 改为全屏 Sheet；节点详情改为底部抽屉。连线用"点端口 → 点目标端口"两步点击，不用拖拽。
- **降级 · LoRA**（owner 2026-09-03 拍板）：模型库、训练进度、用已训模型生成三条路径完整；**训练创建流程不做**，入口在手机上渲染"请在桌面创建训练"提示。
- **不做**：arena（owner 2026-09-03：已闲置，待整体删除，不做任何移动端工作）。

---

## 7. 状态配方

- **空态**：一句说明 + 一个可点动作（起手势），可选 3 个示例 chip；不留白板。
- **加载**：`loading.md`。行内 `Spinner md`，区块 `lg` + 一行文案，列表用与内容同尺寸的 `Skeleton`。
- **错误**：`error-alert.tsx`，说明 + 重试按钮；缺 API key 走 `QuickSetupDialog`，不禁用 UI。
- **不支持的能力不渲染**，不做禁用占位。
- **成功**：轻量 toast；改变布局的结果就地出现（第 4 节进入动画）。

---

## 8. 完成定义 — 8 项，缺一不合

| #   | 项                                            | 怎么证明                                                  |
| --- | --------------------------------------------- | --------------------------------------------------------- |
| 1   | lint + typecheck 绿                           | `npm run lint && npm run typecheck`                       |
| 2   | 颜色对比度过                                  | `contrast-check` 输出贴进报告                             |
| 3   | 移动端 e2e 过                                 | `npx playwright test e2e/mobile.spec.ts --project=mobile` |
| 4   | 真机三张截图：桌面 1440 · 平板 820 · 手机 375 | `verify-real`                                             |
| 5   | reduced-motion 目检：开启后无位移动画         | DevTools 渲染面板模拟，截一张                             |
| 6   | i18n en/ja/zh 三语同步，zh/ja 长文本不破版    | `src/messages/` diff + zh 截图                            |
| 7   | 需求卡状态矩阵每格实跑                        | 报告逐格勾                                                |
| 8   | 需求卡交互动作表每行实跑，每行有可见反馈      | 报告逐行勾                                                |

与 `checklists/ui.md` 同一份 8 项（2026-09-03 已替换旧 16 项 P0）；证据格式以 checklist 为准。

---

## 9. 机器挡住的漂移（待落地 eslint / grep 门）

- `src/app/*.css` 之外出现 `font-family` → 报错。
- 类名 `font-serif` → 报错（槽已废止）。
- 业务代码出现 Tailwind 调色板类（`-(amber|emerald|red|blue|...)-\d{2,3}`）→ 报错。
- `:root {` 出现在 `globals.css` 之外 → 报错（域 token 只写域根）。
- 第 1 条与第 4 条现在就可以用 `grep -rn` 当 PR 前门，eslint 规则化是独立任务。

## Last Verified

- 2026-09-03 · 新增 `--status-warning` / `-surface`（浅暗两档），28 个文件 170 处 amber/emerald 调色板类收口为 status token，43 处 `dark:` 变体删除。
- 2026-09-03 · 颜色脊柱落地：`--surface-sunken` 入脊柱并接管壳底；首页 `--paper/--panel/--line` 与 LoRA 表面/文本/主色 token 全部 alias 脊柱（LoRA 的 `--destructive` 琥珀覆盖一并删除）；cards 页与 assets loading 去 `.dark`；`--muted-foreground` 55.6%→52%。对比度见 globals.css 注释。
- 2026-09-03 · 展示槽收窄到首页 hero / legal / 空态三处，应用内 h1 退回正文槽（owner 看过画廊 375 截图后定）。
- 2026-09-03 · owner 拍板展示槽 A、`--surface-sunken`、cards/assets 改浅色；移动端等级：画布与 LoRA 走「降级」（画布结构参考 updream.cn 手机画布；LoRA 不做训练创建），arena 待删不做。
- 2026-09-03 · 首版。字体 9 家族/三槽、五种浅底、`.dark` 孤岛、`font-serif` 86 处、zh/ja 正文丢 Geist 均为当日 `src/i18n/fonts.ts` · `globals.css` · `home-v4.css` · `canvas.css` · `lora.css` 核验。本文只定默认，落地 `src/` 另起任务。
