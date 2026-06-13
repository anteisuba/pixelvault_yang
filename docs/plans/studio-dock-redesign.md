# Studio Dock 重设计 — 执行计划（交给 Codex）

创建：2026-06-13
状态：**活跃任务包**。Owner 已确认全部方向（见下「决策依据」），可落地。
角色：本文件是 Claude Code（规划面）产出的 task packet 集合，供 Codex 在
`前端` 线 plan mode 逐片执行。每片改完由 Claude Code review diff + owner review 页面。

---

## 决策依据（owner 2026-06-13 确认，会话内拍板）

配套阅读：`docs/design/direction.md` 决议 5（工具栏 6 chip + 工具面板契约）、
`docs/design/reviews/2026-06-11-ui-audit-pass1-code.md`、`docs/domains/studio.md`、
`docs/product/mainline.md`。

本计划修订了 direction.md 决议 5 的两点（需在决议记录回写）：

1. **删变换面板** → 工具 chip 从 6 个变 5 个（约束簇实为 4：图像/卡片/LoRA/宽高比 + 状态行模板）。
2. **chips 出纸** → 工具行迁出象牙 composer，回深色工作台行（决议 5 未涉及位置，此为新增）。

确认的设计骨架：

- **双面基调**：Studio 深色工作台 + composer 象牙纸；UI 无彩，内容发色；
  实心 primary（黑/白反相）**只属于生成按钮**，面板内一律不得出现实心 primary 大控件。
- **4 交互范式**（每个入口归一类，同类同范式）：
  - 范式① 参数 → mini-popover：**宽高比**
  - 范式② 库选择器（轻入口 → 全屏库 / 列表）：**图像、卡片**（全屏库）、**模板**（列表）
  - 范式③ 工作台（锚定宽面板，产出写回 composer）：**LoRA**
  - 范式④ 起手选择器（状态行）：**模型、模板**
  - 对话工作空间（居中 Dialog，独立例外）：**助手**
- **锚定统一**：所有面板 `side=top` + `sideOffset=12`（统一垂直基线＝位置一致感来源）。
  窄面板 `align=center` 锚 chip；LoRA 宽面板锚 composer 左缘；模板 `align=start`；助手居中 Dialog。

---

## 范围与分线

**本批 = Dock UI 线（D0–D7）**，纯 UI/交互重构。

**助手线（A1–A3）= 后续单独工作线**，owner 指示「先做完 dock UI 再回头修」。
A 线含功能/服务端改动 + 必须联网核验，**不在本批实现**，仅在文末列出依赖与边界。

---

## 全局约束（每片都适用）

1. **UI-only**：不改 `src/app/api/**`、`src/services/**`、`prisma/**`、Clerk 配线、
   credit/billing；`useUnifiedGenerate` / `handleGenerate` / 各生成 hook 的**语义不变**。
2. **不碰 provider/model/payload**；本批不触 `src/constants/models/`、provider adapter。
3. **无 magic value / 无 Tailwind 任意值**；色值只用语义 token，**缺 token 就停下 surface**，
   不自造色值（呼应 AGENTS.md 3.1/3.6）。
4. **动效只用 `src/constants/motion.ts`**（`EASE_STANDARD` + `DURATION` 四档），
   面板内禁止裸 duration 数字；framer 组件接 `useReducedMotion`。
5. **i18n 三语同步**：任何新增可见文案同时写 `src/messages/{en,ja,zh}.json`，键语义命名。
6. **高危文件**（改前先 `grep -r` 引用方，>5 处只做向后兼容）：
   - `src/contexts/studio-context.tsx`（47 引用方；D0 删 `transform` panel key、D6 用 `loraSelector` key）
   - `src/components/business/studio/StudioPromptArea.tsx`（1198 行；D1 出纸只动工具行容器）
   - `src/components/business/studio/StudioCardSection.tsx`（card 选择编排；D5 退役）
   - `src/components/business/studio-shared/chrome/StudioBottomDock.tsx`
7. **同文件跨片串行**：`LoraPromptControlButton` 被 D1/D6 触碰、`PromptTemplatePicker` 被
   D1/D3 触碰、各 chip 被 D1 + 各自片触碰 —— **严格按 D 编号顺序执行，禁止并行触同文件**。
8. **改动文件同目录补/改 `.test.tsx`**。

### 每片验证阶梯（完成报告逐项给结论，跳过须写原因）

1. `npm run lint` 绿
2. 全量 `npx tsc --noEmit`（约 4 分钟可跑完，**禁止因超时跳过**；后台跑 + 显式捕获 exit code，管道会吞退出码）
3. `npx vitest run --reporter=verbose`（新增 + 相邻测试）
4. `npm run build`（**不要在 dev server 运行时并行 build**——会污染 `.next`/Turbopack 缓存致嵌套路由 404）
5. `npx playwright test e2e/studio.visual.spec.ts`（基线按 OS 分套 `-win32`；本批多片必然更新基线，
   **逐片在报告点名改了哪些快照**；Mac 侧需另跑 `--update-snapshots` 生成 `-darwin` 套）
6. `npx playwright test e2e/mobile.spec.ts --project=mobile`
7. 交互实跑：逐 chip 开/关、Esc/外点关闭、移动 drawer、键盘弹起 dock 抬升、生成按钮不受影响 —— 截图入报告

---

## 执行序列与依赖

```
D0 清理(删变换+孤儿)
  └─> D1 出纸 + 徽标修色（结构迁移地基）
        └─> D2 panel chrome 地基（token/Header/遮罩/锚定常量）
              ├─> D3 宽高比 + 模板
              ├─> D4 图像（上拉列表 → 全屏库）
              ├─> D5 卡片三套合一（★最大风险）
              ├─> D6 LoRA 宽工作台 + chip 入 panels
              └─> D7 video/audio 行对齐

（D3–D7 地基就绪后逻辑独立，但因共享 chip 文件，按编号串行执行最稳）

A 线（dock 全部完成 + 联网核验后另启）：A1 通用助手组件 → A2 并入反推 → A3 文本模型修复
```

---

# Dock UI 线

## D0 — 清理：删变换面板 + 删孤儿组件

**目标**：移除变换工具，约束簇降到 4 chip；清掉确认的死代码。
**非目标**：不碰反推（reverse）——它归 A2 并入助手，本片只确认它是否死键，不动。

**涉及文件**：

- 删 `StudioTransformButton.tsx`、`StudioTransformPanel.tsx`、`StudioTransformToggle.tsx`
- `StudioToolbar.tsx`：删 `<StudioTransformButton/>` 一行（6 chip → 5：Assistant/Image/Cards/LoRA/Aspect）。
  注：layerDecompose / civitaiToken / trainLora **不在本片** —— 它们早在 `26effd28 Redesign dock toolbar chip row`
  已移出主行，功能在 Image 面板 / LoRA 工作台 / Cmd+K 仍可达（2026-06-13 review 用 `git show 278d4125` 核实）。
- `studio-context.tsx`：删 `panels.transform` + `STUDIO_TOOL_PANEL_NAMES` 中的 `'transform'` + initialPanels。
- i18n：删 `StudioV2.transform`、`TransformPresets.*`、以及 **UI 用的** `Transform.title/description/style/preservation` 等。
  ⚠ **保留 `Transform.errors.*`**（含 `Transform.errors.allFailed`）——服务层 `handle-style-transform.ts` /
  `handle-pose-transform.ts` 仍以 `i18nKey: 'Transform.errors.*'` 返回，`/api/image-transform` 仍是活 endpoint。
  删 UI i18n 前先 grep `src/services/**` 里所有 `'Transform.` 引用，被引用的 error key 一律保留。
- 删孤儿：`prompt-tags/TagsToolbarButton.tsx`（零引用）、`StudioQuickRouteSelector.tsx` + `index.ts` barrel export

**删除前必 grep 核查（有他处引用则保留，不误删共享件）**：
`StudioInputImage` / `StudioVariantsGrid` / `StudioFaceConsentModal` / `useImageTransform` /
`transform-presets`（服务层 `handle-style-transform.ts` 仍用 → 保留）。逐个把 grep 结果贴进报告。

**禁止改**：reverse 相关任何文件；图片 edit 任务页；`image-transform` 服务层与 `/api/image-transform`（UI-only 边界）。
**验收**：约束簇渲染 4 chip；全局 grep 无 `StudioTransformButton`/`TagsToolbarButton` 残留引用；
UI 变换 i18n 已清且无组件 `t('...')` 悬空；**`Transform.errors.*` 三语仍在**（service 引用未悬空）；
`transform-presets` 保留（service 仍用）。

### D0 Review & 回流（Claude Code, 2026-06-13）

**结论：Pass（follow-up 已闭环）。** commit `278d4125`。主体正确：5 button（4 chip + 助手）、
9 个删除组件零残留引用（含 `StudioFaceConsentModal`，只被 TransformPanel 用）、`panels.transform` 清净、
`transform-presets` 正确保留、`workflows.ts`/`image-input.ts`/`hooks/image/index.ts` 配套合理；lint/tsc/vitest 通过。

Follow-up 收口：

1. **[真问题·已修] `Transform.errors.allFailed` 悬空**：D0 删整个 `Transform` namespace，但 service
   `handle-style-transform.ts` / `handle-pose-transform.ts` 仍引用、`/api/image-transform` 仍活。
   Codex 已三语恢复 `Transform.errors.allFailed`（grep 确认 service 仅此一处引用）。
2. **[我误判·已撤销] layerDecompose/civitaiToken/trainLora**：我据会话早期旧 toolbar 记忆，误指 D0 删了这三个并要求补报。
   `git show 278d4125` 证明 **D0 只删 `<StudioTransformButton/>` 一行**；这三个早在 `26effd28 Redesign dock toolbar chip row`
   就移出主行，功能在 Image/LoRA/Cmd+K 可达。**Codex 报告准确，我的指控错误，已撤销并改回 packet。**
3. **[已做] D0 单独 commit** `278d4125`。
4. **[已确认] Gallery 3 失败 pre-existing**：Codex `git stash` 验证 `011b43cd` 同样失败，与 D0 无关。

---

## D1 — 出纸：工具行迁入暗面工作台行 + 徽标修色

**目标**：把工具 chip 行从象牙 composer 内迁出，与起手簇（模型 + 模板）合成 dock 顶部
**深色工作台行**（三明治：工作台行 → 象牙纸）。所有面板向上展开、不盖纸。

**⚠ 必须捆绑徽标修色**：暗面全局 `--primary` 是白色（`globals.css:301`），composer 内靠局部
反转（`globals.css:662`）徽标才成立。出纸后 `bg-primary text-white` 徽标会**白底白字**。
本片把所有徽标 `text-white` → `text-primary-foreground`：
`StudioToolbar.tsx:65` / `ReferenceImageChip.tsx:101-108` / `StudioCardsButton.tsx:61` /
`LoraPromptControlButton.tsx:179`。

**涉及文件**：

- `StudioPromptArea.tsx`（高危，最小触碰）：把 `<StudioToolbarPanels compact />` 从象牙
  `motion.div` 内移到工作台行容器；删 `mt-2 border-neutral-200` + `[&_button]:text-black
[&_svg]:text-black` 覆盖层；删因迁移而死的分支（`isComposerExpanded` 全量清理**不在本片**）。
- 工作台行布局：≥md 单行 flex（起手簇 `[模型▾][模板▾]` + `h-4 w-px bg-border/60` 分隔 +
  约束簇 chips `overflow-x-auto`）；<md 两行（起手行固定 + chip 行横滚 + 两端渐隐）。
- `globals.css`：`.studio-dock` 行距按需微调（仅间距，不动 `.studio-composer` 反转机制）。
- 各 chip 文件：仅徽标 `text-white` → `text-primary-foreground`。

**禁止改**：`.studio-composer` 语义反转；纸内一切（托盘/textarea/生成丸/selection）；
MainModelPicker / PromptTemplatePicker 内部逻辑。
**验收**：grep 确认 dock 链路零 `text-black`/`text-white`；chips 在暗面 token 渲染
（rest 态 computed color = muted-foreground 暗面值）；所有 popover 从工作台行向上展开、
打开时纸面完全可见（交互截图）；移动端 chip 行单行横滚、触达 ≥44px。

---

## D2 — Panel chrome 地基（统一 token / Header / 遮罩 / 锚定常量）

**目标**：建立可复用的 Studio Tool Panel 材质层，收敛审查发现的 8 选中态 / 3 圆角 /
3 遮罩 / 5 头部。本片**只建地基 + 改原语 + 助手 Dialog 作示范**，不改各业务面板内部
（那是 D3–D7）。

**⚠ 基线校准（2026-06-13 review，`git show` + 读 tool-surface 核实）**：D2 的 **chip 层已由前期 commit
`3c4cacc7`（panel contract）/ `26effd28`（chip row redesign）落地** —— `studioChipActiveClass`
（`bg-primary/10 text-primary ring-1 ring-primary/30`）、`StudioChipBadge`（`bg-primary text-primary-foreground`

- `ring-background`）、`studioToolTriggerClass`（`h-11 sm:h-9 rounded-full px-3.5` + `duration-fast ease-standard`）
  已存在并被各 chip 使用。下方清单里「新建 studioChipActiveClass / StudioChipBadge」**已完成，跳过**。
  **D2 剩余范围 = 面板 chrome 层**：① `StudioToolPopoverContent` 圆角 `rounded-xl` → `rounded-2xl`、
  `studioDialogBaseClass` 补 `rounded-2xl`；② 新建 `StudioPanelHeader` 组件（现仅有 `studioDialogHeaderClass` 字符串）；
  ③ dialog/drawer 遮罩统一；④ padding `p-4` / 滚动 max-h / 锚定常量导出（`sideOffset=12` 默认已在，未命名导出）。

**建立的共享资产**（`studio-shared/primitives/tool-surface.tsx` 为主）：

- `studioPanelSelected` = `bg-primary/10 text-primary ring-1 ring-primary/30`（唯一选中态；
  **清除一切实心 primary 选中**——实心只留生成钮）。
- `StudioPanelHeader` 组件：`flex items-center gap-2 border-b border-border/50 px-4 py-3`，
  图标 `size-4 text-muted-foreground` + 标题 `font-display text-sm font-medium`（统一 weight）+
  可选状态 badge。
- `StudioChipBadge`：`rounded-full bg-primary text-primary-foreground text-[10px]`（唯一徽标样式）。
- 圆角：`StudioToolPopoverContent` `rounded-xl` → `rounded-2xl`；`studioDialogBaseClass` 补
  `rounded-2xl`（修 dialog 家族继承 `rounded-lg` 不一致）。
- 统一 body padding `p-4` 常量 + 统一滚动 max-h 公式常量（轻 60svh / 重 85svh / 对话 75vh）。
- 锚定常量：导出 `STUDIO_PANEL_SIDE='top'`、`STUDIO_PANEL_SIDE_OFFSET=12`（D3–D7 引用）。
- 遮罩：`dialog.tsx` overlay `bg-black/50 backdrop-blur-sm` + `drawer.tsx` overlay `bg-black/80`
  → 统一 `bg-background/70 backdrop-blur-sm`。**若影响非 Studio 调用方**（dialog/drawer 是全局
  原语），改为在 Studio 面板局部覆盖 overlay className，不动全局原语 —— 停下 surface 报告选择。

**示范对齐**：`StudioEnhanceButton.tsx` 助手 Dialog 去掉硬编 `rounded-2xl`（由 base 供给）、
头部换 `StudioPanelHeader`。助手形态不变（仍居中 Dialog）。

**禁止改**：各业务面板内部 IA；panels reducer；宽高比/卡片/LoRA 的内容（D3–D7 处理）。
**验收**：三表面圆角同族（popover/dialog 2xl、drawer t-2xl）；grep 确认 dock 链路无
`shadow-primary`；`StudioPanelHeader` 与 `studioPanelSelected` 至少被助手消费；遮罩统一。

### D2 Review & 回流（Claude Code, 2026-06-13）

**结论：Pass with follow-up（遮罩需 owner 决策）。** commit `e7df72e6`（边界干净，仅 5 个 D2 文件）。
核实通过：`studioDialogBaseClass` 升 `rounded-2xl` 并重构为组合常量（padding/maxh/header/body 常量已导出）；
`StudioPanelHeader` 新增（复用 `ResponsiveDialogTitle`，移动端=DrawerTitle，a11y 正确）；
`DIALOG_HEADER` 全 src 零残留（StudioDockPanelArea/StudioEnhanceButton 已切 `StudioPanelHeader`）；
chip 层资产未重建；popover `rounded-2xl` 经 Codex Playwright computed-style 实测命中。

**⚠ 遮罩越护栏 — 待 owner 决策**：packet 写「dialog/drawer 全局原语影响非 Studio 则降级局部」，
但 Codex 改了**全局** `DialogOverlay`/`DrawerOverlay`（`bg-black/50`→`bg-background/70`、drawer `bg-black/80` 无 blur
→ `bg-background/70 backdrop-blur-sm`），影响全站所有模态。方向可能更优（双面自适应雾），但需：

1. owner 拍板全站统一是否 intended（否则回退全局、改 Studio 局部覆盖）；
2. 实测浅面 dialog + 移动端 drawer 对比度（白雾比 black 暗化弱，drawer 从强暗变白雾，聚焦可能不足）；
3. **视觉覆盖缺口（已澄清）**：`visual.spec.ts` 现仅测 homepage + studio shell，**不打开任何 dialog/drawer**，
   故全局遮罩改动**零自动化视觉覆盖** —— 回归只能 owner 手动看页面（gallery dialog / 移动 drawer）。
   仓库当前仅 win32 基线，Mac/darwin 缺失（Windows runner 不能生成，需 owner 在 Mac 端 `--update-snapshots`）。

遮罩决策（2026-06-13 owner 看深面 Studio 模板 dialog 后）：**保留全局版**（`e7df72e6`，深面暗雾+`backdrop-blur` 效果获认可）。
⚠ 仅验证了**深面桌面 dialog**；浅面白雾(gallery/prompts) + 移动 drawer(`black/80`→`background/70` 对比度掉最多)未单独验——
深面是 Studio dialog 主场景，风险可接受；如后续在浅面/手机发现雾太淡再调 `/80` 或浅面单独取值。**此 follow-up 闭环。**

待办：~~D2 commit~~（已 `e7df72e6`）；working tree pre-existing dirty（docs/plan、chip 宿主、AssetSelector/
responsive-dialog 后续、tsconfig、Prisma 换行噪音）来源语义不一 → 采纳 Codex 建议**单独开 cleanup pass 分类处理**，
建议 **D3 前做**（chip 宿主的 `StudioChipBadge` 化改动仍未提交，会与 D3 叠加污染边界）。

---

## D3 — 宽高比（范式①）+ 模板（范式④ 起手只读库）

**目标**：两个最轻入口收尾。

**⚠ 基线校准（2026-06-13 review，读现状）**：

- 宽高比 `StudioAspectRatioPopover`：chip trigger（`studioToolTriggerClass`+`studioChipActiveClass`）、锚定
  `side=top align=center` **前期 commit 已做**。D3 **只剩**：① popover 内比例 pill 选中态从实心
  `bg-primary text-primary-foreground shadow-primary/15`（line 115）→ `studioChipActiveClass`（ring 版，与全场一致）；
  ② 固定尺寸模型下不渲染（读现有模型能力，不新发请求）。
- 模板 `PromptTemplatePicker`：仍是**裸 `Popover`**（line 176）、`sideOffset=10`、保留「保存当前 prompt」、
  两页签搜索不一（mine=Command / inspiration=裸 input）；`align=start` 已对。D3 范围如下方原 packet。
- **owner 决定（2026-06-13）**：**保留「保存当前 prompt」**（用户习惯，与结果区 `onSaveRecipe` 是两个时机，都留）。

#### 模板完整设计（workflow `studio-template-panel-redesign` 综合，2026-06-13）

5 方案 × 4 视角对抗评审 + 综合。评分：**refine-popover 3.75（胜出，零 blocking）** > two-tier 3.5 ≈
command-fusion 3.5 > image-grid 2.75 > route-overlay 2.5。三个方案被代码核验证伪：图驱动需改 service
join（RecipeRecord 无封面字段）；route-backed overlay 因 StudioProvider 深两层保不住 Studio 树；全屏库与已有
/prompts 重叠；合并搜索因 cmdk 本地 vs useInspirations 远端两套过滤权威打架。

**⚠ owner 形态修正（2026-06-13，看实物截图后）**：workflow 综合推 popover（图"最小改动"），但 owner 看实物
判断信息量（两页签+保存+搜索+最近/全部两组列表+二跳）是"库浏览"级、popover 太挤 → **改用居中 `ResponsiveDialog`
（桌面 dialog / 移动全屏 sheet），与助手同形态同 chrome（`StudioPanelHeader`）**。好处：①列表舒展；②起手簇形态统一
（助手+模板=居中工作空间，约束簇=锚定 popover/全屏库，dock 心智更干净）；③天然消除 popover 的双 DrawerTitle /
内层 max-h 双滚动两坑（Dialog 单一 title + 单一 body 滚动）。尺寸比助手小（`max-w-xl` 级 + `max-h-[85svh]`）。
**内容设计沿用下方 refine 综合的全部 IA，只换外壳 popover→Dialog。**

**内容设计 = refine-popover 主 + 嫁接（阶段 A，纯 UI 零越界）**：

- ~~形态 popover~~ → 见上方 owner 修正：`ResponsiveDialog` + `StudioPanelHeader`（同助手）。锚定不再适用（居中）。
- 两页签各自搜（不合并），统一搜索头视觉。
- 保存当前 prompt：从顶部 ghost 下移到「搜索下/列表上」，升级 muted pill（`bg-muted/65→hover:bg-muted`，非实心 primary），三态逻辑零改。
- 条目：阶段 A 不强行统一封面——recipe 文本(FileText 圆图标)/ inspiration 图(imageUrl)；去 inspiration 行尾外链图标，整条即点即应用。
- 二跳：列表底部 ghost 文字链「在 Prompts 中管理 ↗」`router.push(ROUTES.PROMPTS)`(用 @/i18n/navigation)。
- 移动端正确性：解掉内层 `max-h-96` 双滚动（交还抽屉单一滚动）、保存行在搜索之上保证键盘可达。

**阶段 B（需单独授权放开 service，本次不做）**：recipe 经 `parentGenerationId` join `Generation.thumbnailUrl`
取封面、统一图驱动卡。

**owner 拍板（2026-06-13）**：① 保存后**不关**（刚存乐观插到"最近"首位，用户立刻看到）；② 保存行**普通 pill**（零 cmdk 耦合）；
③ inspiration（共享提示词库）条目 **line-clamp-2**；④ 二跳**无参**直达「提示词」页（不动 routes.ts，`router.push(ROUTES.PROMPTS)`）；
⑤ 阶段 B 模板封面图留后（需单独授权放开 service）。形态：**居中 `ResponsiveDialog`（同助手）**，见上方 owner 形态修正。

**D3-模板 packet（owner 拍板后 finalize）**：

- 改：`PromptTemplatePicker.tsx`(唯一主改：根 `Popover` → `ResponsiveDialog`+`StudioPanelHeader`(同助手,居中、去锚定) +
  保存 muted pill(存后**不关**+乐观插最近首位) + 去 inspiration 外链图标 + inspiration `line-clamp-2` + 列表 body 单一滚动 +
  底部二跳「提示词」页无参 `router.push(ROUTES.PROMPTS)` 用 @/i18n/navigation)、**新建** `PromptTemplatePicker.test.tsx`、
  `messages/{en,ja,zh}.json` 新增 1 key(如 manageInPrompts；saveCurrentPrompt 等已存在)。
- **不许改**：api/services/prisma/credit；`use-recipes`/`use-inspirations`/`api-client/recipes`(数据契约零改)；
  `tool-surface.tsx`/`responsive-popover.tsx`(不改原语，尤其不为抑制软键盘改 onOpenAutoFocus)；`StudioPromptArea.tsx`(host 已 own apply 语义)；
  `routes.ts`(直链 ROUTES.PROMPTS 已存在；不引用不存在的 promptDetailPath)。
- **明确不做**：封面图驱动(阶段B)、新建 PromptLibraryDialog、intercepting route、合并两页签搜索。
- 验收：lint+build；visual.spec(--update-snapshots 点名，双机 -darwin 另跑)；toHaveClass 断言 min-h-11/bg-muted/65/border-border/40/rounded-2xl/sideOffset=12；交互实跑桌面 popover + 移动抽屉单滚动 + 键盘下保存可达 + 空态引导；红线复检无实心 primary/无彩/不误用 studioChipActiveClass 于即点即走条目。

**宽高比** `StudioAspectRatioPopover.tsx`：

- 选中 pill 由实心 `bg-primary text-primary-foreground shadow-primary/15` → `studioPanelSelected`，去彩色阴影。
- 锚定 `side=top align=center sideOffset=12`（核验，现状已近似）。线框预览保留。
- 固定尺寸模型下不渲染（跟随模型能力，读现有能力查询，不发新请求）。

**模板** `PromptTemplatePicker.tsx`：

- 裸 `Popover` → `StudioToolSurface`/`StudioToolPopoverContent`（修移动裁切，出底部抽屉）；
  `sideOffset` 10 → 12；`align=start`（它在起手簇最左，吻合）。
- **砍掉「保存当前 prompt」**——`GenerationPreview` 已有 `onSaveRecipe`（生成后存配方是更对的时机）。
  模板纯化为只读应用库（浏览/搜索/应用 我的配方 + 灵感）。
- 两页签搜索统一为 `CommandInput`（现状 mine 用 Command、inspiration 用裸 input）。
- 空态加起手势文案（去灵感 / 提示先生成再存）。

**禁止改**：recipes/inspirations hook；PlaceholderFillDialog 流程；`/prompts` 页。
**验收**：宽高比/模板选中态走 `studioPanelSelected`（toHaveCSS 断言 ring 非实心）；
模板 375px 不裁切、移动出抽屉。
（⚠ 此为 D3 早期 packet 验收，已被上方"模板完整设计"子段覆盖：保存当前 prompt **保留**、形态 = 居中
`ResponsiveDialog`、两页签**各自搜**只统一搜索头视觉——以子段为准。）

### D3 Review & 回流（Claude Code, 2026-06-13）

**结论：两半均 Pass。**

- 宽高比 `9cf06112`：只动 1 文件；pill 选中态 → `studioChipActiveClass`(ring, line 128)、chip trigger 同；
  video 按 `getVideoModelCapabilities` 过滤、`ratios.length < 2` 时入口 `return null`(固定尺寸隐藏)；读 capability 是现有 hook/常量，无 service 越界。
- 模板 `3c38c6fe`：文件范围零越界(仅 PromptTemplatePicker.tsx + 新建 .test.tsx + 3 json 各 +manageInPrompts)。
  根 `ResponsiveDialog`+`StudioPanelHeader`(同助手)；保存 muted pill `min-h-11 bg-muted/65`、存后不关；
  去 ExternalLink；inspiration line-clamp-2；二跳 `router.push(ROUTES.PROMPTS)` 用 @/i18n/navigation；数据 hooks 契约零改。

**累积债（进 D4 前建议先还）**：① dirty tree 第三次出现(根问题，致 visual 跑不了、commit 要避让 stillProcessing 等)；
② 视觉债——D1 出纸 / D2 全站遮罩 / D3 模板形态三次显著改动几乎零自动化视觉回归覆盖(visual.spec 仅 homepage+shell、不开面板)；
③ 遮罩去留仍悬(`e7df72e6` 全局版已 commit，待 owner 看页面)。**建议插入 cleanup pass**：dirty 分类清理 + 遮罩定去留 + 跑干净全量 visual 基线，再开 D4。

**cleanup 执行（2026-06-13 owner 拍板）**：A1 纯 chip(Reference/Cards/tool-surface.test)→ commit；A2 tsconfig(`.next/dev` types exclude)→ commit；
B(AssetSelector / responsive-dialog `mobileBodyClassName` / QuickSetup)→ **stash**（⚠ D4/D5 全屏库开始前看是否捡回——它改了全屏库要用的 responsive-dialog 原语）；
C(Prisma 39 换行噪音)→ 丢弃 + `.gitattributes` `generated/** text eol=lf` 防复发；D 文档(含本计划)→ commit；
**LoRA(LoraPromptControlButton .tsx/.test)留 working tree 待 D6**（已含去 violet ✓ + 默认页签被改 generate→`tags` 待 D6 定，按 LoRA 主线"还原在 generate 页"倾向回 generate）。
清完跑 `--update-snapshots` 固化干净 win32 基线。**遮罩已闭环（见 D2 回流）。**

---

## D4 — 图像（范式② 库选择器）

**目标**：chip → **上拉列表（本地 / 素材两个来源）** → 选「素材」进全屏素材库。
（owner 明确要保留「选来源」这步，不直接全屏。）

**涉及文件**：`ReferenceImageChip.tsx` + `ImageSourcePicker.tsx`：

- popover 内容明确为上拉列表两项：**本地上传**（主）/ **浏览素材**（次），可顺带显示最近用过的几张缩略图。
- 「浏览素材」→ 全屏 `AssetSelectorDialog`（现状已是，保持二跳：先关 popover 再开全屏）。
- 加 `StudioPanelHeader`（图标 + 「参考图」+ 附件计数 badge）。
- 锚定 `side=top align=center sideOffset=12`。
- 附件预览条移到 header 下、动作上；空态加说明文案。
- 「附件存在但模型不支持」→ 警示态（aria + tooltip，警示色走状态语义 token，缺则只做 aria），
  无附件且能力为 0 → 不渲染 chip。废除现灰徽标暗语。

**禁止改**：`imageUpload` 数据流；`AssetSelectorDialog` 内部；拖拽/粘贴路径（已支持，保留）。
**验收**：chip → 上拉两项 → 选素材全屏；图像与卡片形成「轻入口→全屏库」对称；
徽标=附件数且走 `StudioChipBadge`。

---

## D5 — 卡片三套合一（范式② 全屏库）★最大风险，建议二次拆分

**目标**：消除卡片的三套 UI / 四种范式，收敛为「一个全屏卡片库 + composer 托盘」。

**现状（病灶）**：`StudioCardPicker`（chip popover 选 char/style/bg）+ `StudioCardSection`
（card 模式 dock 常驻 bg/style dropdown）+ `CardManager`（右侧 **Sheet**，三个 Manager CRUD）。
bg/style 选择在 picker 和 section 重复；Sheet 是第四种披露原语 + 自带 `dark`/`bg-sidebar` 视觉。

**目标形态**：

- **一个全屏卡片库 overlay**（复用 `AssetSelectorDialog` 的网格 + 侧栏模式）：三类 tab
  （角色/画风/背景）+ 浏览/搜索 + 就地 CRUD（复用现有 `CharacterCardManager`/`SimpleCardManager`/
  `StyleCardManager`）+ 内置风格 pills。取代 `StudioCardPicker` 与 `CardManager` Sheet 两套。
- **激活的卡显示在 composer 托盘**（与参考图托盘同语言），取代 `StudioCardSection` 的常驻 dropdown。
- chip（`StudioCardsButton`）→ 打开全屏库；徽标=激活卡数。

**涉及文件**：`StudioCardsButton.tsx`、`StudioCardPicker.tsx`（退役/重构）、`StudioCardSection.tsx`
（退役 dropdown + Sheet，高危）、`StudioBottomDock.tsx`（卡片托盘挂载）、新建全屏卡片库组件、
i18n ×3。

**建议二次拆分**（Codex plan mode 内）：

- D5a：新建全屏卡片库（含三类 tab + CRUD + 内置风格），`StudioCardsButton` 改为打开它，退役 `StudioCardPicker`。
- D5b：退役 `StudioCardSection` 的 dropdown / CardManager Sheet；激活卡进 composer 托盘。

**禁止改**：卡片 hooks（`useCharacterCards`/`useBackgroundCards`/`useStyleCards`）数据契约；卡片 CRUD 服务。
**验收**：卡片只剩「全屏库 + 托盘」两处 UI、一种范式；bg/style 选择不再重复；
全局 grep 无 `StudioCardPicker` 残留宿主；card 模式激活卡显示在托盘。
**Review**：本片单独提交、单独 review（最大风险）。

---

## D6 — LoRA 宽工作台（范式③）+ chip 入 panels

**目标**：LoRA popover 升级为锚定宽工作台面板；状态收编进 reducer。

**涉及文件**：`LoraPromptControlButton.tsx`（+ `studio-context.tsx` 复用现有 `loraSelector` key）：

- 形态：`w-[min(640px,calc(100vw-2rem))] max-h-[85svh]`，套 `StudioPanelHeader`（补图标）。
- 锚定：**锚 composer 左缘**（Radix `PopoverAnchor` 指向 composer 容器，非 trigger 按钮），
  `side=top sideOffset=12`。**若需 StudioPromptArea 暴露 anchor ref 风险过高**，降级为
  `align=end` 锚 chip（现状），仅统一 sideOffset —— 停下 surface 报告选择。
- 状态：局部 `open` useState → `state.panels.loraSelector`（key 已存在 studio-context.tsx:263）；
  挂载 toast 的「查看」action 改 dispatch `OPEN_PANEL`；reducer 的工具面板互斥（`openPanel` 已实现）
  自动生效。`StudioCommandPalette` 加「LoRA 控制」条目。
- 配色：`text-violet-600` 钻石 → 中性 `fill-current`；`ModelMatchNotice` 的 emerald/amber 裸值 →
  状态语义 token（缺 token 停下 surface）。
- 徽标计数：改为**仅挂载 LoRA 数**（现状混计 tags + LoRA + 负向；徽标须回答「挂了几个 LoRA」）。

**禁止改**：LoRA 配方/挂载逻辑（M2c 已落地，仅换壳）；`PanelName` 不删旧键。
**验收**：LoRA 面板宽 640、打开时 composer 可见；Cmd+K 可开 LoRA；开 LoRA 自动关其他工具面板；
grep 无 `violet`；徽标=挂载数。

---

## D7 — video/audio 工具行对齐

**目标**：三模式共用同一套 chip / chrome 语言。

**涉及文件**：`StudioToolbarPanels.tsx`：

- 删两份本地 `pillBase/pillActive/pillInactive`；video（videoParams/script）、audio
  （voice/clone/transcribe）的手写 pill 换 `studioToolTriggerClass` + `studioPanelSelected` + `StudioChipBadge`。
  披露面不变（仍走 `StudioDockPanelArea` 的 ResponsiveDialog）。
- 音色 chip 改「值即标签」：已选显示音色名（truncate max-w-32），未选显示「音色」。
- 顶部 JSDoc 写明能力规则：video 无 卡片/LoRA、audio 无 宽高比 = 「不支持→不渲染」的执行。

**禁止改**：`StudioDockPanelArea` 各 Dialog 内部；音频参数侧栏结构（归 VoiceCard 域）。
**验收**：三模式 toolbar 用同一 trigger/selected/badge 类（snapshot 或 class 断言）；
音色已选时 chip 文案=音色名。

---

# 助手线（A1–A3）— 后续工作线，本批不实现

owner 指示「先做完 dock UI 再回头修」。A 线含功能 + 服务端 + 联网核验，
**dock 线全部完成 + owner 启动后**另开 plan，此处仅锁定边界，防止 dock 线顺手扩散。

- **A1 — 抽通用 `StudioAssistant` 跨模态组件**：从 `PromptAssistantPanel` 提炼，接受
  `mode: image|video|audio` + 当前模型 + 当前 prompt；各模态工具栏都能开；服务端按 mode 切
  system prompt。架构已就绪（`use-prompt-assistant` + `chatPromptAssistantAPI` 本就模态无关）。
- **A2 — 并入看图反推**：助手 `imageStyle` preset 已是雏形；「分析图片→复刻提示词」做成助手
  一等动作；Studio 内 `ReverseEngineerPanel` 退役（Arena 自留另议）；`use-reverse-image` 收敛。
- **A3 — 文本模型修复**（⚠ 功能 + 服务端，**必须联网核验**）：根因＝`enhance` capability
  把「写提示词（纯文本，DeepSeek 可）」和「看图反推（需视觉，DeepSeek 不可）」捆死
  （`llm-capability.ts:11` DeepSeek 缺 `enhance`），DeepSeek 被整体挡出助手。
  - ⚠ `assistant` scope **不能挪用**——它是 Node 画布助手专用（`llm-capability.test.ts:108`
    强约束）。
  - 方向甲（推荐）：拆 `enhance` 为「文本提示词」（三家）+「视觉反推」（仅多模态），助手按
    动作是否看图过滤模型。方向乙：给 DeepSeek 补 `enhance` 但 UI 选 DeepSeek 时禁用看图 preset。
  - 启动前必联网核验 DeepSeek 当前是否有视觉模型 + 服务端 enhance 路由实现。

---

## 本批不做（防扩散）

- 助手线 A1–A3（含文本模型修复）——后续另开。
- 「提取风格」入图像面板、「图像变体」方案 B —— direction.md 标记后续，独立包。
- advanced（seed/负向）面板可见入口 —— 仍 Cmd+K，未决。
- `MainModelPicker`/`BaseModelPickerPanel` 契约迁移 —— 多域共享，另案。
- `PanelName` 闲置键清理（reverse/stylePreset 等）、`isComposerExpanded` 死路径全量清理 —— 触 47 引用方，另案。
- 全局 dialog/drawer 原语的破坏性改动 —— D2 遮罩若影响非 Studio 调用方则降级为局部覆盖。

---

## Review 检查点（Claude Code diff review + owner 页面 review）

每片完成，Claude Code 按以下审 diff，owner 同步看页面：

1. **范围合规**：无 packet 外编辑；未碰禁止清单（api/services/prisma/Clerk/credit/provider/model）。
2. **token 纪律**：无任意值、无 `text-white`/`text-black`/`violet`/`shadow-primary` 残留；
   选中态统一 `studioPanelSelected`；实心 primary 仅生成钮。
3. **一致性**：圆角 2xl 同族 / 统一 `StudioPanelHeader` / 统一锚定基线 `side=top sideOffset=12`。
4. **i18n**：三语同步、无悬空 key。
5. **a11y/响应式**：44px 触达、移动出抽屉、键盘 dock 抬升、Esc/外点/下滑三路径关闭。
6. **测试**：lint+tsc+vitest+build 绿；视觉基线点名更新（`-win32`）；mobile spec 过。
7. **页面 review（owner）**：逐 chip 打开位置正确（窄锚钮/宽锚纸）、面板不盖纸、视觉像「一套工具台」。

## Source of Truth

- `docs/design/direction.md`（决议 5 + 工具面板契约）
- `docs/design/reviews/2026-06-11-ui-audit-pass1-code.md`
- `docs/domains/studio.md`、`docs/product/mainline.md`
- `src/components/business/StudioToolbar.tsx`、`studio/StudioToolbarPanels.tsx`
- `src/components/business/studio-shared/primitives/tool-surface.tsx`
- `src/components/business/studio/{ReferenceImageChip,StudioCardsButton,StudioCardPicker,StudioCardSection,StudioAspectRatioPopover,PromptTemplatePicker}.tsx`
- `src/components/business/studio/prompt-tags/LoraPromptControlButton.tsx`
- `src/components/business/studio/StudioDockPanelArea.tsx`、`StudioPromptArea.tsx`
- `src/components/ui/{responsive-dialog,responsive-popover,dialog,drawer}.tsx`
- `src/contexts/studio-context.tsx`、`src/constants/llm-capability.ts`

## Last Verified

- Date: 2026-06-13
- Method: owner 方向确认（会话内）+ 全量代码事实源审查（dock/toolbar/7 面板/2 原语/llm-capability）
- 未验证：浏览器实跑（owner review 阶段补）；A 线 provider 能力联网核验（A3 启动前补）
