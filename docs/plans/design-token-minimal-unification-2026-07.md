# 设计 token 最小统一化 — 治理修订草案 + LoRA 试点

> 状态：**草案（2026-07-24 owner 拍板方向，逐节待确认）**。
> 本文只是任务包草案；`brand-dna.md` / `forbidden.md` / `CLAUDE.md` 在 owner 逐节确认前**不改**。
> 相关 memory：`project-ui-design-governance-reset` · `project-lora-visual-redesign` · `project-lora-search-redesign`。

## 0 · 诉求与拍板

owner（2026-07-24）：项目被 token 定得太死；只想保持**最小限度统一**；每个页面按自己的风格设计。

拍板：

- 自由粒度 = **域级为主 + 少数孤品页**（Homepage / 登录 / Gallery 详情等 landing 性质页可页级独立；业务域内多页保持连贯）。
- 下一步 = **写治理修订草案 + 三域并行设计**：**LoRA / 画布 / 首页** 各开一个 chat 并行推进。
- 分工 = **Sonnet 执行** 已定。设计代理：owner 问「UI 哪个更好」→ 4.8 判断 = **Claude Design 为主力**（UI 真相在渲染像素/交互里，CD 在真实 HTML/CSS 介质出可跑高保真原型、吃 DesignSync 组件库、import 到 Vercel 预览；LoRA 已有 CD brief），**Fable 留 fallback**（某域 CD 太保守时加狠；画布是最可能用 Fable 的域——React Flow 自绘节点非标准组件，CD 组件库杠杆用不上）。此判断与 memory 07-20 一致，待 owner 最终点。
- 本 chat（Opus 4.8 前门）职责 = 产出**三域共享地基 + 防碰撞契约 + 各域交接指针**，不代替各 chat 做域内三方向设计。

## 1 · 诊断：「太死」死在落地，不在文档

`brand-dna.md` 已写「薄脊柱 + 每域自有视觉身份」。死的是代码落地，四条机制：

1. **中性语义层被当成默认答案而非兜底**。`globals.css` `:root`/`.dark` 是整套 Krea 中性灰阶：`--primary` 纯黑/白、`--secondary`/`--muted`/`--accent` 全 `oklch(97% 0 0)` 无彩、`--radius` 单值 `0.625rem`、字体全 Geist（`--font-serif` 亦指向 Geist，陷阱）。所有 shadcn 原语绑这批语义 token → 不主动覆盖就长一个样。
2. **Hard Rule #5 + 无 `tailwind.config` = 岔开逆风**。独特圆角/底色不能写 `rounded-[20px]`/`bg-[#…]`，只能用全局 token（趋同）或加全局 `@theme`（污染全局）。
3. **原语只有一套皮肤变量**。全项目真正做容器级覆盖、让原语零改换皮的只有 Canvas `--node-*` 与 composer 象牙反转；其余域裸奔在中性层。
4. **`editorial-*`（33 类）是多页共享皮肤活标本**，跨 prompts/arena/storyboard/详情共用，与「每域自己的风格」对冲。`frontend.md` 已标「职责混合」。

结构性问题：`globals.css` 已 **1939 行**，全局枢纽混入大量域局部，本身是耦合来源。

## 2 · 三环模型（修订核心）

```text
┌─ 环1 · 冻结脊柱（全站唯一强制，不可覆盖）── 这就是「最小限度统一」
│    · 应用壳 + 导航位置/行为（AppSidebar / MobileTabBar）
│    · 语义 token 的【契约存在性】——永远有 --foreground/--background/
│      --border/--ring/状态色（保留 SLOT，不保留当前中性 VALUE）
│    · 行为 / a11y / 状态真实性（焦点·键盘·ARIA·reduced-motion·
│      ResponsiveOverlay·软键盘策略·三语同步）
│    · 文案语气 + 图标体系 + 反馈语义
│    · 品质底线（对比度·命中区·状态不只靠颜色）
│    ⚠ 不含任何具体长相：无主色 / 无圆角值 / 无字体性格 / 无卡片材质
├─ 环2 · 域皮肤（每域自己拥有，覆盖环1中性值）
│    · 一个 .domain-<x> 作用域块重定义 --primary/--radius/--font-*/
│      --card/材质/密度/动效性格；域内原语读语义 token 自动换皮，零改组件
│    · 机制已被 Canvas .node-card-paper 验证（Tailwind v4 @theme inline
│      单跳编译 → 容器级 var 覆盖生效）
└─ 环3 · 页级 / 组件级微调（作用域锁死页内，不外泄）
```

一句话：**把「统一」从「同一套长相」降到「同一套骨架和行为」，长相下放到域。** 语义层继续存在（a11y/暗色/原语都靠它），只是不再拿其中性值当房子风格。

## 3 · 治理修订草案（逐节待 owner 确认）

### 3.1 `brand-dna.md` · 品牌脊柱

- **加一句收紧**：语义 token 属于脊柱的是**槽位（slot）存在性**，不是当前中性数值；成熟业务域**默认期望覆盖**语义值，中性值仅在方向未定时兜底。
- 现措辞「域和页面 token **可以**引用/覆盖」→ 强化为「域级视觉身份是**常态目标**，不是特批」。

### 3.2 `brand-dna.md` · 业务域视觉身份

- 明确粒度：**域级为主 + 少数孤品页**。域内多页连贯为可用性底线；孤品页限 landing 性质（首页/登录/Gallery 详情），需在页级方向里点名。

### 3.3 `forbidden.md` + `CLAUDE.md` Hard Rule #5 · arbitrary 值松绑

- 现行：`No Tailwind arbitrary values`（一刀切禁）。
- 草案：**arbitrary / 字面值允许落在有名字的作用域内**（`.domain-*` 块、域 css 文件、页级作用域）；**全局散落与页面样式泄漏全局仍禁**。即禁的是「无作用域泄漏」，不是「字面值本身」。
- `forbidden.md` 对应行由「重复视觉值散落…」改写为区分 scoped（合法）vs unscoped（禁）。

### 3.4 `frontend.md` · `editorial-*` 降级

- 明确 `editorial-*` 为**中性陈列面兜底**，任何域可整体替换；新页不再默认穿它。按域拆分或替换在各域试点时决定。

## 4 · 松绑三件事（把逆风改顺风）

1. **Hard Rule #5 开「域作用域内」口子**（见 3.3）。
2. **`editorial-*` 降级为兜底**（见 3.4）。
3. **域皮肤单独成文件**：像 `homepage.css` 那样每域一个 `<domain>.css`，域 layout 处 import，遏制 `globals.css` 继续膨胀 —— 这步本身在拆耦合。

## 5 · 三域并行：共享地基 + 各域落点 + 防碰撞

### 5.0 关键事实：机制已被验证两次，LoRA 是唯一 greenfield

- **首页**已有 `src/app/homepage.css`（页面局部 `.homepage-*` / `--home-*`）——这**就是「域皮肤单独成文件」的活模板**。
- **画布**已有 `--node-*` 整套域 token + `.node-card-paper` 容器级覆盖——这**就是「原语零改换皮」的活模板**。
- **LoRA** 是三者里唯一还没carve out 的域（裸奔在中性层 + composer 象牙）。

结论：三域并行**不是发明机制，是把已证两次的机制对齐成一套，各域再把视觉推远**。风险低——前提是共享脊柱与文件归属先锁死。

### 5.1 共享脊柱（三个 chat 都不许动，动前回本 chat 仲裁）

- `globals.css` 的 `:root`/`.dark` 语义**槽位**（脊柱契约）：冻结；域皮肤在**各自的 css 文件**里覆盖，不在这里改值。
- `globals.css` 的 `@theme inline` 块：冻结**不新增 per-domain key**；域用作用域内 CSS 变量，不往全局加。
- 应用壳 / 导航：`(main)/layout.tsx` · `AppSidebar` · `MobileTabBar`——冻结。
- 共享 `ui/` 原语的**行为/API/a11y**：冻结；换皮走作用域 token，**不准改原语本体**。

### 5.2 域皮肤机制（三域统一约定）

- 每域一个作用域 class `.domain-<x>`，挂在该域 layout 根。
- 每域一个 css 文件 `src/app/<domain>.css`，在 `.domain-<x>` 内重定义 `--primary`/`--radius`/`--font-*`/`--card`/材质/密度/动效性格；域 layout 处 import。
- 域内 shadcn 原语（`bg-card`/`border-border`/`rounded-*`/`text-muted-foreground`…）读语义 token → 零改动自动换皮（机制 = `node-card-paper` 已验证的 Tailwind v4 单跳编译）。
- **scoped-arbitrary 合法**：`.domain-<x>` / 域 css 内可写字面值；全局散落仍禁（见 §3.3）。

### 5.3 文件归属图（防三 chat 碰撞）

| 域       | 作用域 + 文件（本 chat 独占编辑）                                               | 挂载点                                | 组件目录                             | 先读                                                                                         |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| **LoRA** | 新建 `src/app/lora.css` + `.domain-lora`                                        | `StudioLoraLayout`（lora/layout.tsx） | `components/business/studio/lora/**` | memory `project-lora-visual-redesign` · `lora-generate.md` · `lora-workbench.md`             |
| **画布** | 建议把 `--node-*` 从 globals.css **抽到 `src/app/canvas.css`** + 复用现有 scope | 画布 route/workspace layout           | `components/business/node/**`        | `plans/canvas-baseline.md` · `references/pages/node-canvas.md` · memory `project-canvas-*`   |
| **首页** | 现有 `src/app/homepage.css`（已就位，直接推）                                   | 首页 route                            | `HomepageCapabilityMatrix` 等        | memory `project-home-hero-darkroom-window` · `references/pages/home.md` · haivis-landing ref |

碰撞铁律：**每个 chat 只编辑自己那一行的文件 + 自己的组件目录**。要改共享脊柱（§5.1）→ 回本 chat 仲裁，不在域 chat 里私自改 `globals.css` 脊柱段。

### 5.4 建议：画布 `node-*` 抽到 `canvas.css`

现状 `--node-*` 住在 `globals.css`（约 332–422 行）。画布 chat 若要迭代它，就得改共享文件 → 违反 §5.1。**先把 node-\* 平移到 `src/app/canvas.css`**（纯搬运不改值，独立验证），三域从此对称（各拥一个 css 文件），`globals.css` 收敛为脊柱-only。此平移属机制活，可由本 chat/Sonnet 先做，为三域并行清场。

### 5.5 各域自由度与红线（交接给各 chat 的骨架）

三域**都**走 `brand-dna.md §域级设计确认流程`（域定义 → 三方向 → 切片 → owner 确认 → 写 `references/pages/` → 才实现），**都**受 §5.1 脊柱约束，视觉方向各 chat 自己出。

- **LoRA**：视觉真值走已定 Claude Design brief（lora-generate-claude-design-brief-2026-07.md（已删，见 git 历史））；不重开 `project-lora-visual-redesign` 已实现到 R4 的决策，本轮机制 = 给它 `lora.css` 容器 + 把现有值搬进作用域。
- **画布**：先做 §5.4 平移；视觉迭代基于 `node-canvas.md` 现基准（吞噬 vs 连线决策见 memory `project-canvas-ingest-vs-edges-decision`，别无脑推吞噬）。
- **首页**：`homepage.css` 已成型（白厅画廊已进 main），本轮是**孤品页级**推进（登录改 modal + 左侧矢量/CSS/SVG 动画等 owner 已标注方向），不受"域内多页连贯"约束。

### 5.6 跨域提取纪律

三域若发现想要同一视觉模式：**不自动共享**。按 `brand-dna.md §8`——至少两个真实页面证明后，回本 chat 讨论是否反向提取，不因代码可共享就强迫视觉共享。

### 5.7 验收（每域各自过）

- 域内原语零改动换皮成立（≥3 处 `bg-card`/`border`/`rounded` 实测读到 `.domain-<x>` 值）。
- a11y 不破：对比度/焦点环/状态色达 `brand-dna.md` 底线。
- 作用域封闭：本域路由外任意页面 computed style 无变化。
- 全量 tsc + vitest 绿；真机（claude-in-chrome，owner dev 实例）目检。

## 6 · 不做什么

- 不在 owner 逐节确认前改 `brand-dna.md` / `forbidden.md` / `CLAUDE.md`。
- 三域 chat 不私改 `globals.css` 脊柱段与 `@theme`（§5.1）；各只动自己那一行文件 + 组件目录。
- 不重开 LoRA / 画布已定视觉决策；LoRA 视觉真值归 Claude Design brief。
- 不删语义层（它是 a11y/暗色/原语的地基），只把它从「房子风格」降级为「中性兜底 + 槽位契约」。

## 7 · 逐节确认清单（owner 逐条 √/×/改）

- [ ] 3.1 脊柱收紧到「槽位存在性、非中性值；域默认覆盖」
- [ ] 3.2 粒度 = 域级 + 孤品页（孤品页名单：首页/登录/Gallery 详情？其他？）
- [ ] 3.3 Hard Rule #5 松绑为 scoped-arbitrary 合法
- [ ] 3.4 `editorial-*` 降级为兜底
- [ ] 4.3 域皮肤单独 css 文件
- [ ] 5.3 三域文件归属图（各 chat 只动自己那一行）
- [ ] 5.4 画布 `node-*` 平移到 `canvas.css`（先做，为并行清场）
- [ ] 分工最终点：4.8 荐 Claude Design 主力（UI 更优）+ Fable fallback（画布最可能用）；owner 拍
- [ ] §8 清场 handoff 交给 Sonnet 执行（先于三域 chat）

## 8 · 清场 handoff（Sonnet 可直接执行，先于三域 chat）

> 本节自足，可整段丢给一个新 Sonnet chat 执行。目标：把三域公用文件先理干净，让 LoRA/画布/首页三 chat 开局各在自己车道，不碰 `globals.css` 脊柱段。

**开工前先读**：本文档 §5（文件归属）+ `docs/references/frontend.md`（token 治理）+ memory `reference-tsc-next-routes-race` / `feedback-full-tsc-required` / `feedback-full-vitest-before-push` / `feedback-no-powershell-source-rewrite`。

**已探明的两个事实（2026-07-24，塑造下面做法）**：

- `homepage.css` 挂载约定 = 域 shell 组件里 `import '@/app/homepage.css'`（`HomepageShell.tsx:9`）。
- ⚠ `node-*` 泄漏：55 处引用中 53 处在 `business/node/**`，另 2 处在域外——`LoraAssistantDock.tsx`（LoRA 域）+ `StudioAssistantDock.tsx`（studio-shared）。**故 `node-*` 今天是全局 `:root` 常量，不是纯 canvas 作用域**。

### T1 · `node-*` 平移到 `canvas.css`（纯 `:root` 文件搬家，零行为变化）

- 新建 `src/app/canvas.css`。
- 把 `globals.css` 的 `node-*` / `canvas-*` **变量定值**（`:root` 段约 332–422 行 + 底部 `.node-card-paper` 作用域块 + 相关 node keyframes/类）整体剪切进 `canvas.css`，**保持 `:root` 作用域不变**（⚠ 不要改成 `.domain-canvas`——会 break 上述 2 处域外消费者）。
- `@theme inline` 里的 `--color-node-*` 映射**留在 `globals.css`**（Tailwind 主题编译入口，属脊柱侧；`canvas.css` 只放 `:root` 定值）。
- `globals.css` 顶部 `@import './canvas.css';`（紧跟现有 `@import` 组），保证 `node-*` 全局始终可用。
- 验证：`node-*` computed style 在画布内 + `LoraAssistantDock` + `StudioAssistantDock` 三处均不变。

### T2 · `lora.css` + `.domain-lora` 空骨架（立容器，不改视觉值）

- 新建 `src/app/lora.css`，内容先 = `.domain-lora { }`（空/占位注释）。
- `LoraWorkbench`（或 `StudioLoraLayout` wrapper）`import '@/app/lora.css'` + 根加 `className="domain-lora"`（镜像 `HomepageShell` 约定）。
- 本步视觉零变化；只把 P1 视觉真值的容器立起来。

### T3 · `globals.css` 收敛脊柱-only 注释

- `node-*` 块搬走后原位留 banner 注释：「以下为冻结脊柱；域皮肤去 `<domain>.css`（canvas/homepage/lora）。三域 chat 不改本文件脊柱段。」

### 验收

- 全量 tsc 绿 + 全量 vitest 绿（后台跑捕获真实 exit code，禁跳过）。
- 真机（claude-in-chrome，owner dev 实例）目检：画布 / LoRA assistant dock / 首页 三处视觉零变化。
- `git diff`：`globals.css` 仅剩脊柱 + `@import` + `@theme` 映射；`node-*` 定值全在 `canvas.css`。
- ⚠ owner dev 跑着时不 build；源码只用 Edit/Write（保 UTF-8 中文注释）。

### 不做

- 不把 `node-*` 改成 `.domain-canvas` 作用域（留给画布 chat；先解决那 2 处域外泄漏的归属）。
- 不改任何视觉值、不动组件逻辑。

## 9 · 三域 chat 启动包（owner 各开一 chat，paste 用）

> owner 2026-07-24：**重新开始设计，目前很多都不确定**。故三域各自 fresh 设计——
> **只锁三样：脊柱（§5.1）· 你的 lane 文件 · 设计流程 gate**。视觉语言、布局、信息
> 层级全部开放；references 与已实现页面都是**可推翻的现状证据，不是必须继承的答案**
> （brand-dna.md：当前代码/历史页/inspiration 只提供事实与参考，不自动成为新方向）。

### 9.0 每个 chat 的开场（paste 第一句）

```
读 docs/plans/design-token-minimal-unification-2026-07.md（尤其 §5 文件归属 + §9.本域）。
这是 <LoRA / 画布 / 首页> 的视觉重设计，fresh start——除脊柱/lane/流程外都可重定。
按 brand-dna.md《域级设计确认流程》先走到「域定义 + 三个结构不同方向」交我选，
在此之前不要改任何代码。设计代理出方向，落地由 Sonnet。
```

三家共同纪律：① 只编辑自己 lane 的文件 + 组件目录；② 要动脊柱（globals.css 脊柱段 / `@theme` / `layout.tsx` / `AppSidebar` / `ui` 原语）→ 回 front-door chat 仲裁，不私改；③ 不新增全局 `@theme` key，域值进 `<domain>.css` 的 `.domain-*` 作用域；④ 跨域想共享同一视觉 → 不自动共享，回 front-door（brand-dna §8）；⑤ 方向经 owner 确认后才写 `references/pages/<域>.md`、才实现。

### 9.A LoRA chat

- **lane**：`src/app/lora.css`（清场已建，空 `.domain-lora`）+ `components/business/studio/lora/**`。
- **开放**：LoRA 全部视觉语言。references = NovelAI + owner 贴的 LoRA 截图（`project-map.md` §LoRA）+ lora-generate-claude-design-brief-2026-07.md（已删，见 git 历史）——**输入非答案**；已实现的 R4 深炭工作台是现状证据，**可推翻**。
- **想学清单（project-map.md §LoRA · owner 标注）**：
  - _要求（功能，不管视觉方向都得服务）_：按类型检索的分类标签（人物 / 衣服 / 表情 …）；生成时自由搭配组合多 LoRA 的**组合 UI**；检索性能（图片加载速度 + 精确度 + 缩短耗时）；Civitai / HF 两边 UI 对齐。
  - _参考（视觉，可重解释别照抄）_：NovelAI 生成页 + owner 贴的 LoRA 截图。
  - ⚠ 现状已有多 LoRA 混挂 + 配方面板（别重造，重设计的是入口 / 组合 / 检索 UI）。
- **先读（现状事实）**：memory `project-lora-*` · `references/pages/lora-generate.md` / `lora-workbench.md` · `references/product.md`（产品边界）。
- **第一步产出**：域定义（做什么/不做什么/最高频任务）+ IA + 三个结构不同方向 → owner。

### 9.B 画布 chat

- **lane**：`src/app/canvas.css`（清场已建，装现有 node-\* 值）+ `components/business/node/**`。
- **开放**：画布视觉语言 fresh。node-canvas.md / haivis-canvas / owner 贴的画布截图（玻璃工具栏/助手框/粘贴/编辑框）= 参考证据；**吞噬 vs 连线可重议**（owner 本就动摇）。
- **⚠ 特殊**：画布是自绘 React Flow 非 shadcn，域皮肤靠 `canvas.css` 变量 + 节点组件，Claude Design 组件库杠杆弱——**这域最可能上 Fable**。
- **想学清单（project-map.md §画布 · owner 标注）**：
  - _要求（功能/结构）_：整理初始（空）状态；功能明确分化——助手 / 编辑图片 / 生成视频 / 管理资源(卡片)；图片可**直接粘贴**；点击图片后浮现**编辑框**。
  - _参考（视觉/交互，可重解释）_：haivis-canvas（**只学点、不照抄——它只有图片编辑、无视频，本项目还有独有部分**）= 大画布 + 可收起固定右助手 + 选中对象**近场工具条** + 附件/模态/模型/思考**独立披露**；左侧工具栏**玻璃透明质感**；助手框。
  - ⚠ 吞噬 vs 连线可重议（owner 本就动摇）。
- **先读**：`plans/canvas-baseline.md`（架构不可丢）· `references/pages/node-canvas.md`（现状）· memory `project-canvas-*`。
- **第一步产出**：域定义 + 三个结构不同方向 → owner。

### 9.C 首页 chat

- **lane**：`src/app/homepage.css`（已就位）+ homepage 组件（`HomepageShell` / `HomepageCapabilityMatrix` 等）。
- **性质**：**孤品页级**，不受"域内多页连贯"约束。
- **开放**：首页 fresh。白厅画廊是现状证据**可推翻**；references = haivis-landing + owner 贴的登录态矢量/CSS/SVG 动画截图（`project-map.md` §首页）。
- **想学清单（project-map.md §首页 · owner 标注）**：
  - _要求（结构）_：登录改 **modal 窗**；每个介绍面板升级 + 整体布局升级；展示公开资源（可复用 Gallery 公开 feed）。
  - _参考（视觉/动效，可重解释）_：haivis-landing 的**动效语法**（元素拆分 / 前后对比 / 文字图层 / 魔法擦除）= 喜欢；**左侧矢量 / CSS / SVG 动画** = 喜欢；⚠ 纯黑大衬线 + 超大留白 = **仅参考，别整套照搬**。
- **先读**：memory `project-home-hero-darkroom-window`（现状）· `references/pages/home.md` · Haivis 官网拆解（已删，见 git 历史）。
- **第一步产出**：三个方向（单页可直接三方向）→ owner。

### 9.D front-door（本 chat）留守

跨域冲突、脊柱变更请求、跨域视觉提取、治理修订草案（§3）逐节确认——都回本 chat。三域 chat 不各自改脊柱/治理。

## 变更记录

| 日期       | 变更                                                                  | 谁     |
| ---------- | --------------------------------------------------------------------- | ------ |
| 2026-07-24 | 建草案：诊断 + 三环 + 修订草案 + 试点                                 | Claude |
| 2026-07-24 | 改向三域并行：共享地基 + 文件归属 + §8 清场 handoff；分工判断 CD 主力 | Claude |
