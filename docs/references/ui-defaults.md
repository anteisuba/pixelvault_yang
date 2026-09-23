# UI 默认食谱 — ui-defaults.md

> 状态：**现行默认（2026-09-03 owner 拍板三条：字体收回脊柱 · semantic 颜色全站锁死 · UI 完成定义压成 8 项）**。
> 定位：AI 或人动任何 UI 之前必读的**肯定句清单**——不写"不准"，只写"默认这样做"。禁忌见 `forbidden.md`，治理边界见 `brand-dna.md`，实现事实见 `frontend.md`，动效原则见 `interaction.md`。
> 冲突时：本文 > 当前页面长相 > 任何 skill 的自带审美。需求卡（`templates/ui-request.md`）里没写的，一律按本文默认。
> 本文无未决项；标 **[待验证]** 的（页面切换 View Transitions）验证通过前不用。

---

## 1. 字体 — 三个槽，全站同一套

| 槽       | 类名           | 拉丁       | CJK（zh / ja）              | 用在哪                                                                                                                            |
| -------- | -------------- | ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **正文** | `font-sans`    | Geist      | Noto Sans SC / Noto Sans JP | 一切默认文字、控件、表格、标签                                                                                                    |
| **等宽** | `font-mono`    | Geist Mono | 回落正文 CJK                | 参数、seed、代码、数值、模型 id、快捷键                                                                                           |
| **展示** | `font-display` | Fraunces   | Noto Serif SC / JP          | **只给三处**：首页 hero、legal 页标题、空态大标题（owner 2026-09-03）；应用内页面 h1 一律正文槽加粗，**不进控件、表格、卡片标题** |

**等宽槽判据（2026-09-20，进度表 32 ②）**——`font-mono` 只给**机器串**，两问一判：

- **这串字是机器产生或机器读的吗**：数值（价格 · 尺寸 · 时长 · 时间码 · 计数 · 百分比）、id（模型 id · seed · voice id · 触发词 · 掩码 key · @handle · 域名 · 短代号如 `S01`）、参数行（`1024×1360 · Steps 30`）、代码与提示词原文、快捷键 → **等宽**，数值再配 `tabular-nums`。
- **这串字是写给人读的一句话吗**：标签 · 按钮文案 · 标题 · 分组头 · 状态词 · 说明 · 文章标题 · 出版方名 → **正文槽**。含 CJK 的更是如此：Geist Mono 没有 CJK，整句会回落到正文 CJK 字形，等宽只让句中那几个拉丁字母对不上，白付一次视觉噪音。
- **一格里两样都有**就拆两个 span（评价卡的「首帧 / 00:04」已按此拆），⛔ 不给整行套等宽；拆不动时以**哪一半是主语**为准（`已挂 3` 是标签，`×1.25` 是数值）。
- 机器门只守最硬的那一档：`src/test/typography.contract.test.ts` 扫 `src/**/*.tsx`，`<h1>`–`<h6>` 上出现 `font-mono` 即红。按钮与 span 两边都有正当用法（掩码 key 是按钮、触发词 chip 是按钮），⛔ 不为它们造规则。

规则：

1. **栈顺序三语一致**：拉丁字体永远排第一，CJK 排第二。zh/ja 下正文栈写成 `Geist, Noto Sans SC`（ja 为 Noto Sans JP），不能把 Geist 丢掉——丢了会让标题和正文里的英文长得不一样。
2. **没有 `font-serif` 槽**：真要衬线用 `font-display`，否则就是正文 `font-sans`。
3. **首页营销域与 legal 页也只用这三槽**：首页保留的只是"标题用衬线"这个用法（走 `font-display`），不另起字体家族变量。
4. 根布局挂载 7 个家族（Geist · Geist Mono · Fraunces · Noto Sans SC · Noto Sans JP · Noto Serif SC · Noto Serif JP，见 `src/i18n/fonts.ts`）。
5. **字号只走下面这张表**，⛔ 不写 `text-[13px]` 一类 arbitrary（Hard Rule 5），⛔ 不为同一个值再起第二个名字。更大的只在 `font-display` 槽里出现。
6. **字重**：正文 400 · 强调/按钮 500 · 小标题 600 · 700 只在 `font-display`。CJK 不用 700 以上。
7. **行高**：正文 `leading-normal`(1.5)，CJK 段落 `leading-relaxed`(1.625)，标题 `leading-tight`。

**字号档 → 用途（2026-09-20 收口，进度表 32 ③；真值 SoT = `src/app/globals.css`）**

| 档                              | 值                      | 用途                                                   |
| ------------------------------- | ----------------------- | ------------------------------------------------------ |
| `text-3xs`                      | 0.625rem / 10px         | 密排数据：网格角标、缩略图上的读数、序号。**全站下限** |
| `text-2xs`                      | 0.6875rem / 11px        | 标签、分组头、chip、导航项（配 `tracking-nav` 大写）   |
| `text-xs`                       | 0.75rem / 12px（内置）  | 辅助文字、说明行                                       |
| `text-2sm`                      | 0.8125rem / 13px        | 面板里的辅助文字（2026-09-06 从 12 抬的那一档）        |
| `text-sm`                       | 0.875rem / 14px（内置） | 控件正文，默认档                                       |
| `text-md`                       | 0.9375rem / 15px        | 面板正文（2026-09-06 抬的那一档）                      |
| `text-base`                     | 1rem / 16px（内置）     | 长文正文                                               |
| `text-lg` / `text-xl`           | 1.125 / 1.25rem（内置） | 卡片标题、区块标题                                     |
| `text-brand`                    | 1.12rem / 17.9px        | 只给 wordmark，⛔ 不外借                               |
| `text-empty-title`              | 1.375rem / 22px         | 空态大标题（`font-display` 三个落点之一）              |
| `text-2xl` 及以上               | 内置                    | 应用内页面 h1；再大只在首页营销域                      |
| `text-hero-title` / `-subtitle` | clamp()                 | 首页 hero，营销域专用                                  |

**展示槽已拍板（2026-09-03）：A = Fraunces + Noto Serif SC/JP**，全站唯一衬线，首页 08-28 方向 B 的衬线标题与 legal 页 Fraunces 合成这一个槽。代价是 zh/ja 页面首屏多一个 Noto Serif 请求，`preload: false` 已挡在关键路径外。

---

## 2. 颜色 — semantic 全站一套，强调色只有 `--primary`

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
| 模态             | `bg-modality-image` / `-video` / `-audio`（**只给 prompts 域**，见 §2.3）                    | 紫 292 / 蓝 255 / 玫瑰 10，低饱和                                                 |

**应用默认浅色。** html 根没有 `.dark`。`.dark` 只允许出现在**媒体观看面**：lightbox、`MediaDetailViewer`、画布图片编辑工作台、node 画布视口。页面本身不做暗色（cards 页、assets loading 也是浅色，它们不是媒体观看面）。

### 2.2 "白"只有一种

浅底只有脊柱这几层，域不各自给值：

- **页面底 = `--background` 纯白；分组/次级面 = `--muted` 中性灰。** 首页 `--paper/--panel`、LoRA `--lora-page/--lora-well`、壳 `--sidebar` 全部 alias 到这两个，不再各自给值。**壳底例外（owner 2026-09-03 拍板保住浮岛层次）**：脊柱新增第三层 `--surface-sunken: oklch(94% 0 0)`，只给应用壳 `--sidebar` 用，主卡浮在它上面。连同下面的 `--surface-workbench`，全部就是四层：`--background` 纯白 · `--muted` 97% · `--surface-sunken` 94% · `--surface-workbench`；域不得再造第五种浅底。
- **画布米纸与 composer 象牙是"材质"，不是页面底**：作为 canvas 域和 studio 域各自的材质 token 保留，只贴在卡片/输入条那一件东西上，不铺整页。
- **第四层 `--surface-workbench`（owner 2026-09-03，配音间灰底+白卡推广到工作台）**：配音间原实现是 `#f4f4f1`，真机实测与壳底 `--sidebar`（计算值 #ebebeb）通道差 (9,9,6)，超过「肉眼几乎一样」的 ≤6 判据，没有直接复用 `--sidebar`，单独开了这一档（暗色沿用 `--surface-sunken`，即壳底暗档，配音间锁浅色没有暗档可对齐）。工作台框 = `.workbench-ground`（灰底地台）+ `.workbench-card`（白卡），四个工作台（配音间 / 图像 / 视频 / LoRA）共用一份值，值以 `src/app/globals.css` 为准，不在域内各自维护。**2026-09-20（进度表 32 ④）画廊页与素材库页也推到这一层**：页面底（含两页的 `loading.tsx` 与素材库未登录壳）走 `bg-surface-workbench`，卡走不透明 `bg-card` —— 画廊卡原本是 `bg-card/84`、素材库图块是 `bg-muted/40`，半透明白摆在纯白页面底上等于没有卡，换到灰底后卡边才立得住。⛔ 只换底与卡面，卡片布局与信息不动（那是 34）。

### 2.3 强调色

**全站强调色只用 `--primary`（2026-09-06 owner 定）**；`--modality-*` 仅 prompts 域使用。⛔ 不新造域强调色变量。

强调色只出现在三个位置：**当前选中态、主 CTA 的 hover/focus 环、进度**。不做大面积填色，不做渐变。

### 2.4 写法

- 颜色一律用 token 类名，Tailwind 调色板类（`text-amber-700` `bg-emerald-500/15` 一类）**不出现在业务代码**。文字用 `text-status-*`，浅底用 `bg-status-*-surface`，实心点 / 进度用 `bg-status-*` 或 `bg-status-*/70` 一类透明度。
- **风险面**：浅红底用 `bg-status-risk-surface`，同一个 className 里文字 `text-status-risk`、边 `border-status-risk/N`；不拿 `bg-destructive/N` 透明度凑浅红。`--destructive` 只给**实心破坏按钮**（`bg-destructive text-destructive-foreground hover:bg-destructive/90`）。警告浅底同理用 `bg-status-warning-surface`。对比度（实算）：`#b3261e` 对 risk-surface **5.91** · 对白 **6.54** · 对 `--surface-workbench` **5.93**；`--foreground` 对 risk-surface **16.65**；暗档 `#e06c65` 对 `#3e1d1a` **4.66**；warning **5.28** · applied **4.98**。
- 未清的两处例外：**装饰性渐变**（素材库未登录壳的占位图块、训练完成庆祝）与**贴在媒体上的固定明暗 chrome**（`bg-neutral-950/85` 的 stage HUD、3D 预览黑台、图上白底小按钮）——后者刻意不跟随主题，换 `foreground` / `background` token 会在暗档整个翻过来。
- 任何新颜色先用脚本算对比度（Claude Code 用 `contrast-check`，其他客户端用同等 WCAG 计算），文字 4.5:1、大字与图标 3:1、AA 底线 24px 命中区。
- 透明度修饰符是允许的：`bg-primary/90` `border-border/60`。

---

## 3. 间距、圆角、阴影

- 间距只走 Tailwind 4 尺度：控件内距 `px-3 py-2`，卡片内距 `p-4`，区块间距 `gap-4` / `gap-6`，页面外距 `px-4 lg:px-6`，最大宽 `max-w-content`（画廊、素材库这类内容浏览页不封顶）。
- 圆角：控件 `rounded-md`，卡片/弹层 `rounded-lg`，抽屉/大面 `rounded-xl`，胶囊只给 chip/badge。基准 `--radius: 0.625rem` 不改。
- 阴影：浮层 `shadow-md`，抽屉/对话框 `shadow-lg`，其余不加。浅色界面靠边线分层，不靠阴影。
- 边线：`border-border` 一档；材质描边（画布卡）用域内 token。

### 3.1 画布节点卡例外（owner 2026-09-08 定，只此一处）

画布上的节点卡是全站唯一不走 `rounded-lg` 的卡片：它同时是**卡片、可拖对象和工作面**，在缩放的画布里比页面卡片需要更软的轮廓才认得出「这是一块可以拿起来的东西」。

- 圆角走 `rounded-node`（脊柱新增的一档，比卡片档大一档），并与 `corner-squircle` 一起写：连续圆角只有 Chromium 认，不认的浏览器自动退回同值的普通圆角——形状差、布局不差，是渐进增强不是分支。
- 材质分两种，**不要混**：卡面用不透明卡色（画布上可能同时有上百张卡，半透明卡每帧都要合成）；只有浮层——工具条、右键菜单、媒体 transport、移动端浮动条——用 `surface-glass`（半透明面 + vibrancy）。
- 卡的立体感靠**两层低不透明阴影**（一层贴边、一层大扩散），不靠一档 `shadow-lg`；展开态把扩散那层加大，就是「当前工作面」。
- 填充式控件（填充输入、inset 分组、分段控件底、滑杆轨）用 `surface-fill` 三档，值由 `--foreground` 派生，⛔ 不引入新色相；最深那档只做非文本图形。
- 其他页面的卡片**不跟着抬**，这一节的授权范围就是画布节点卡及其卡内控件。

### 3.2 图标 — Phosphor 一套，只从桶里拿

- 图标库是 **Phosphor**（`@phosphor-icons/react`），全站唯一一套。lucide 已卸载，`src/**` 再出现 `lucide-react` 由 eslint 报错。
- 默认 **weight `bold`**，尺寸与颜色由调用点的 `className` 给（`size-4` 一档为主，`currentColor`）；全局默认写在 `src/components/icons/IconDefaults.tsx`，⛔ 不在调用点逐个传 `weight` / `size` prop。
- **只从桶 `@/components/icons` import**，⛔ 不直接 import `@phosphor-icons/react`：桶是换库时唯一要改的一处，也是「这个语义用哪个字形」的唯一裁决点。
- 需要新图标：**先查桶**——多数语义已经有了（同义词落在同一个字形上是有意的）。桶里没有才加一条 re-export，并挑与已有字形同族的那一支，⛔ 不为一个页面引入孤立风格。
- 转圈只有一个来源：`@/components/ui/spinner` 的 `Spinner`（内部是 `CircleNotch`，自带 `animate-spin` 与 `motion-reduce` 降级），⛔ 不在调用点手写 `animate-spin`。

---

## 4. 动效配方 — 每个交互一行，直接照抄

时长/曲线只用 `globals.css` 的 token：`--duration-fast` 120 · `--duration-base` 200 · `--duration-slow` 320 · `--duration-reveal` 500；曲线 `--ease-standard`。只动 `transform` / `opacity`。**每条都带 `motion-reduce:` 降级**。

> 真值 SoT = `src/app/globals.css` 的 `--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)` 与四个 `--duration-*`。⛔ 别信任何写着 `150 / 300 / 400ms` 或 `cubic-bezier(.2,0,0,1)` 的设计稿——那是 2026-09-06 助手改版简报里的一处错值，已在 `pages/assistant-shell.md` §11.5 订正。

| 交互                         | 配方                                                                                                                                    | 库                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 按钮/卡片按压                | `active:scale-[.98] transition-transform duration-fast`（`.98` 尚无 token，是本表唯一容许的 arbitrary）                                 | CSS                |
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

**app 内动效库只有一个：`motion`，且只从 `motion/react` 进**（服务端安全的那一档走 `motion/react-client`）。`framer-motion` 是 `motion` 的旧包名，`package.json` 里**没有**它 —— 写 `from 'framer-motion'` 不会报模块找不到（`motion` 把它作为传递依赖拖了进来），只会让一个幽灵包悄悄进 bundle。

**首页营销域**例外：GSAP 允许，且只在 `src/components/business/home-v4/**` 内动态导入（`CLAUDE.md` 动画库分工）。截至 2026-09-20 首页一行 GSAP 都没有——规则照样立着，它守的是下一次有人想加的时候。

两条都由 `eslint.config.mjs` 的 **`ANIMATION_LIBRARY_FORBIDDEN_PATHS`** 守（`@typescript-eslint/no-restricted-imports`，与 Phosphor 图标门同一条规则 id，⛔ 不能各起一个块——flat config 会整块替换同名规则的 options）。

**过冲那一族**（助手灯箱 / 参考图挂上去）走 `constants/motion.ts` 的 `EASE_POP` / `EASE_POP_STRONG`：时长照旧四档刻度，曲线单列是因为「蹦出来」和脊柱那条收敛曲线是两种意思。⛔ 组件里不再出现裸的 `ease: [...]` 数组。

### 4.1 弹簧三档（owner 2026-09-08 定，只给画布节点卡）

四档线性时长仍是全站默认。画布节点卡多出三档弹簧，因为它的展开是**物体在原地长大**——线性缓动会让这件事读起来像面板切换而不是同一张卡：

| 档              | 用在哪                                            | 感觉                 |
| --------------- | ------------------------------------------------- | -------------------- |
| `spring-expand` | 卡展开 / 收起 · 邻居让位 · 分区进入 · 展开钮旋转  | 主弹簧，轻微过冲     |
| `spring-slot`   | 槽卡进入 · 折叠段展开 · 分段控件 thumb · 开关拨子 | 更快更脆，几乎不过冲 |
| `spring-press`  | 按压回弹                                          | 无过冲               |

- 类名是 T-shirt 档：`duration-spring-expand` / `ease-spring-expand` 等。⛔ 不用数字后缀——数字档会和 Tailwind 内置的同名档在 tailwind-merge 里互相吞掉。
- **邻居让位与卡宽必须同一条曲线同一个时长**，否则卡长大和邻居退让读起来是两件事。
- **移除不用弹簧**：弹着消失像 bug，退回 `duration-base` + `ease-standard`。
- hover / 焦点 / 颜色过渡照旧走四档线性，本来就不该有弹性。
- `prefers-reduced-motion` 下三档整体退化为 `--duration-base` + `--ease-standard`（在 `globals.css` 里改的是 token 值本身，所以 keyframes 也一起降级）。

---

## 5. 交互状态 — 每个可点的东西都有这七态

`default` · `hover`（fine pointer 才有）· `active/pressed` · `focus-visible` · `disabled`（`opacity-50 pointer-events-none`，**不隐藏**）· `loading`（按钮内 `Spinner size="sm"` 替换图标，文字不变，宽度不跳）· `selected`（强调色边 + `aria-selected`/`aria-pressed`）。

- 状态不只靠颜色：selected 加图标或边线，error 加图标 + 文案。
- 点击有结果的按钮，结果必须可见：打开的东西有进入动画（第 4 节），提交成功 toast（sonner），失败 inline error + 可重试。
- 触屏（`coarse:`）：hover 态改为按压态；命中区 44px；tooltip 改为长按或省略。
- 命中区：fine 32/36px，coarse 44px，AA 底线 24px。

---

## 6. 移动端配方 — 375px 起，不是桌面缩小

**断点**：`<1024` 移动壳（`MobileShell`，顶栏当切换器，没有底部 tab bar），`≥1024` 桌面侧栏（`AppSidebar`）。组件内部**用容器查询** `@container` + `@md:`，不用视口断点。

| 桌面上的东西     | 375px 上变成                                                                   | 用什么                        |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| 居中 Dialog      | 底部抽屉                                                                       | `ResponsiveDialog`            |
| 锚定 Popover     | 触屏紧凑态抽屉；窄视口 + 鼠标仍是 Popover                                      | `ResponsivePopover`           |
| 侧栏参数面板     | 底部 vaul 抽屉；页面底部固定一条主动作栏（生成/保存），底边用 `pb-safe-bottom` | `drawer.tsx` + `dvh` 全高布局 |
| 多列表格         | 卡片列表，每行主字段 + 一个次级行                                              | —                             |
| 模型选择器       | 同一个选择器，触屏自动切到底部抽屉分支，行内展开渠道                           | `ModelPickerPopover`          |
| hover 显示的操作 | 常显或长按菜单                                                                 | `dropdown-menu`               |
| 图墙             | 2 列，`gap-2`，缩略图 `aspect-square` 或 `aspect-[3/4]`                        | grid                          |
| 软键盘           | 已处理，dock 会让位                                                            | `KeyboardInsetBridge`         |
| 全高容器         | `min-h-svh` / `h-dvh`，不用 `100vh`                                            | CSS                           |

**每条路由的移动端等级**（写进各 `references/domains/<域>.md`）：

- **完整**：gallery · assets · cards · prompts · u/[username] · 详情页 · 首页 · 登录。
- **降级**：studio/image · video · audio · enhance · analyze · 3d——参数进抽屉，预览占满，生成栏固定。
- **降级 · 画布**（owner 2026-09-03 拍板要做，参考 updream.cn 手机画布的结构，不借皮肤）：视口全屏可 pan/zoom；节点卡放大到 `calc(100vw - 2rem)` 宽、单指拖动；左侧一条竖排浮动工具栏（4 到 5 个图标：素材 / 新节点 / 历史 / 剪辑）；composer 是底部 vaul 抽屉，收起只露一行输入、拉起露出模式 chip + 媒体类型 + 模型/参数；小地图缩到左下角可折叠；撤销/重做/全屏/预览压成底部一条 44px 工具条；助手 dock 改为全屏 Sheet；节点详情改为底部抽屉。连线用"点端口 → 点目标端口"两步点击，不用拖拽。
- **降级 · LoRA**（owner 2026-09-03 拍板）：模型库、训练进度、用已训模型生成三条路径完整；**训练创建流程不做**，入口在手机上渲染"请在桌面创建训练"提示。

---

## 7. 状态配方

- **空态**：一句说明 + 一个可点动作（起手势），可选 3 个示例 chip；不留白板。长相只有一种 —— `src/components/ui/empty-state.tsx` 的五段：灰底虚线框 → 40px 图标位 → **展示槽标题** → 一句话 → 黑丸主动作。⛔ 不画插画。那句话回答「为什么是空的 / 接下来做什么」，⛔ 不写「暂无数据」。

**全站空态落点清单（2026-09-20 收口，进度表 33 ①）**——机器门 `src/test/empty-state.contract.test.ts` 守这张表：名册写死，长出第四类落点就红；每个落点都得给一句话 + 一个 `rounded-full` 主动作。

| 落点                   | 文件                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| 画布空项目             | `node/NodeCanvasEmptyGuide.tsx`（画布皮肤覆盖）                                     |
| 画廊为空               | `GalleryGrid.tsx`                                                                   |
| 素材库空库             | `assets/AssetStateBlocks.tsx` · `KreaAssetBrowser.tsx`                              |
| 角色卡 / 画风卡为空    | `cards/CharacterCardManager.tsx` · `StyleCardManager.tsx` · `SimpleCardManager.tsx` |
| 灵感墙筛空             | `prompts/inspiration/InspirationGrid.tsx`                                           |
| 设置页记忆为空         | `settings/SettingsAssistantSection.tsx`                                             |
| LoRA 我的库 / 类型筛空 | `lora/LoraWorkbench.tsx` · `lora/library/LoraLibraryTypeStates.tsx`                 |
| LoRA 训练起手          | `lora/training/EmptyState.tsx`                                                      |
| dev 展柜               | `dev/ui-states/UiStateGallery.tsx`                                                  |

**故意不收进原语的几处**（理由写在契约测试的 `EXCEPTIONS` 头注里，改代码前先读）：

- **素材库「空文件夹」随进度表 19**（`AssetEmptyFolder`）——文案与出口依赖 19 那一整套，⛔ 现在不提前收，收了还得再改一遍。
- **起手屏不是空态**：`StudioEmptyState`（示例卡 + 最近作品）与 `StudioOperatorEmptyState`（一句话 + 起手药丸）都是 owner 逐条定过的形态，D7b ③ 的原话是「一句话就是一句话，不再是标题 + 说明两段」。
- **搜索无结果不是空态**：它回答「你的筛选太窄」，出口只有一个「清除筛选」，套空态配方会硬造一个不该有的主动作。
- **LoRA 稀疏引导卡**本页有 1–5 条内容，是结果流尾部的引导行。
- **加载**：`loading.md`。行内 `Spinner md`，区块 `lg` + 一行文案，列表用与内容同尺寸的 `Skeleton`。
- **错误**：`error-alert.tsx`，说明 + 重试按钮；缺 API key 走 `QuickSetupDialog`，不禁用 UI。
- **不支持的能力不渲染**，不做禁用占位。
- **成功**：轻量 toast；改变布局的结果就地出现（第 4 节进入动画）。

---

## 8. 完成定义 — 8 项，缺一不合

| #   | 项                                            | 怎么证明                                                    |
| --- | --------------------------------------------- | ----------------------------------------------------------- |
| 1   | lint + typecheck 绿                           | `npm run lint && npm run typecheck`                         |
| 2   | 颜色对比度过                                  | 对比度计算输出贴进报告（Claude Code 可用 `contrast-check`） |
| 3   | 移动端 e2e 过                                 | `npx playwright test e2e/mobile.spec.ts --project=mobile`   |
| 4   | 真机三张截图：桌面 1440 · 平板 820 · 手机 375 | 浏览器实跑截图（Claude Code 可用 `verify-real`）            |
| 5   | reduced-motion 目检：开启后无位移动画         | DevTools 渲染面板模拟，截一张                               |
| 6   | i18n en/ja/zh 三语同步，zh/ja 长文本不破版    | `src/messages/` diff + zh 截图                              |
| 7   | 需求卡状态矩阵每格实跑                        | 报告逐格勾                                                  |
| 8   | 需求卡交互动作表每行实跑，每行有可见反馈      | 报告逐行勾                                                  |

与 `checklists/ui.md` 同一份 8 项（2026-09-03 已替换旧 16 项 P0）；证据格式以 checklist 为准。

---

## 9. 机器挡住的漂移（待落地 eslint / grep 门）

- `src/app/*.css` 之外出现 `font-family` → 报错。
- 类名 `font-serif` → 报错（槽已废止）。
- 业务代码出现 Tailwind 调色板类（`-(amber|emerald|red|blue|...)-\d{2,3}`）→ 报错。
- `:root {` 出现在 `globals.css` 之外 → 报错（域 token 只写域根）。
- `src/**` import `lucide-react` → 报错（已落地：`eslint.config.mjs` 的 Phosphor 图标门，`@typescript-eslint/no-restricted-imports` 一条管整棵树）。
- `src/**` import `framer-motion` → 报错（已落地：动效库门 `ANIMATION_LIBRARY_FORBIDDEN_PATHS`，与图标门同一条规则）。app 内一律 `motion/react`。
- `src/**` import `gsap` → 报错，**只放行 `src/components/business/home-v4/**`**（已落地，同上）。两道门的「真的会红」由 `src/test/animation-library.contract.test.ts` 拿 fixture 源码喂同一份配置验证，⛔ 不靠读配置文件里有没有那几个字符串。
- 自画的空态 → 红（已落地：`src/test/empty-state.contract.test.ts` 的落点名册）。
- 应用内组件出现 `font-display` → 红（已落地：`src/test/typography.contract.test.ts`，展示槽应用内只有空态原语一个落点）。
- 第 1 条与第 4 条现在就可以用 `grep -rn` 当 PR 前门，eslint 规则化是独立任务。

## Last Verified

- 2026-09-20 · 动效语法合一（进度表 33 ②）：`src/` 里 `framer-motion` = 0（迁移先于本次完成，本次补的是门），eslint `ANIMATION_LIBRARY_FORBIDDEN_PATHS` 锁死 `framer-motion` 与 `gsap`（后者只放行首页域）；三处硬编时长（0.18 / 0.26 / 0.42s）按**角色**归到 `DURATION.base` / `.slow`，两条裸过冲曲线收进 `EASE_POP` / `EASE_POP_STRONG`。

- 2026-09-20 · 空态收口（进度表 33 ①）：全站空态收进 `EmptyState` 原语，落点清单见 §7，`empty-state.contract.test.ts` 守名册与「一句话 + 黑丸动作」；展示槽应用内落点数 = 1（空态原语自己那一行，首页 hero 与 legal 走各自域 CSS 的 `--font-stack-display`），由 `typography.contract.test.ts` 守。

- 2026-09-20 · 皮肤脊柱（进度表 32）五片：① 模态色只留 prompts 域，站外 12 处调色板强调色改 `--primary` / 去色；② `font-mono` 131 → 101，判据写进 §1，`src/test/typography.contract.test.ts` 守标题；③ 字号档收成 §1 一张表，删 `--text-nav` / `--text-tab` 两个 11px 重名档，61 处 arbitrary 换档名；④ 画廊 / 素材库推到 `--surface-workbench` 灰底 + `bg-card` 白卡；⑤ 风险浅底 64 处统一 `bg-status-risk-surface` + `text-status-risk`，对比度见 §2.4。

- 2026-09-17 · 图标基座换 Phosphor：`src/**` 全部改走 `@/components/icons`，`lucide-react` 已从 `package.json` 卸载，eslint 门覆盖整棵 `src/**`。
- 2026-09-03 · 新增 `--status-warning` / `-surface`（浅暗两档），28 个文件 170 处 amber/emerald 调色板类收口为 status token，43 处 `dark:` 变体删除。
- 2026-09-03 · 颜色脊柱落地：`--surface-sunken` 入脊柱并接管壳底；首页 `--paper/--panel/--line` 与 LoRA 表面/文本/主色 token 全部 alias 脊柱（LoRA 的 `--destructive` 琥珀覆盖一并删除）；cards 页与 assets loading 去 `.dark`；`--muted-foreground` 55.6%→52%。对比度见 globals.css 注释。
- 2026-09-03 · 展示槽收窄到首页 hero / legal / 空态三处，应用内 h1 退回正文槽（owner 看过画廊 375 截图后定）。
- 2026-09-03 · owner 拍板展示槽 A、`--surface-sunken`、cards/assets 改浅色；移动端等级：画布与 LoRA 走「降级」（画布结构参考 updream.cn 手机画布；LoRA 不做训练创建），arena 待删不做（2026-09-17 已整删）。
- 2026-09-03 · 首版。字体 9 家族/三槽、五种浅底、`.dark` 孤岛、`font-serif` 86 处、zh/ja 正文丢 Geist 均为当日 `src/i18n/fonts.ts` · `globals.css` · `home-v4.css` · `canvas.css` · `lora.css` 核验。本文只定默认，落地 `src/` 另起任务。
