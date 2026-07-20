# Task Packet: LoRA Library + Generate UI 重构交接

> 状态：**可交 Claude 执行桌面实现（2026-07-19）**。owner 已确认 Library 与 Generate 的桌面方向和关键切片；本任务包把已确认内容压缩为施工边界。它不授权重做 Train、不授权补造移动端设计，也不授权改变业务/API/provider 契约。

## Goal

- 在 `/studio/lora` 保留全部真实业务能力和 URL/挂载/生成/持久化契约的前提下，按已确认页面文档重构 **Library、Generate 与共享来源配方 modal 的桌面 UI**。
- 交付应让 Library 成为高频默认入口，用户从效果证据判断 LoRA，点击明确主动作后直接挂载并进入 Generate；Generate 形成稳定的“当前装配 → 输入 → 出图 → 结果”并排工作台。

## Non-goals

- 不重做 Train 内部结构；Train 尚无 owner 确认的页面关键切片。
- 不自行设计移动端最终布局、移动端 sticky 出图动作或助手移动端皮肤；这些仍需 owner 单独确认。
- 不修改 LoRA 搜索、分页、收藏、导入、挂载、兼容判断、生成、积分、持久化、训练或 provider 业务语义。
- 不新增 fal/Runner 能力，不为 Anima DiT 伪造 fal 通道，不新增后端参数或假动作。
- 不恢复已退役的“暗房卡片/pill”造型，也不采用旧 Claude 草稿的骨白纸、朱砂、标本索引语言。
- 不把 LoRA 页面视觉提升成全站默认组件皮肤；只共享行为、API、状态和可访问性。

## Task Scene / Type

- UI / existing product redesign / desktop-first implementation handoff
- 实现归 Claude；本包只总结已确认设计，不替代仓库 `AGENTS.md` 与 `claude.md`。

## Read First

按顺序读取，后者不得覆盖前者的业务事实：

1. `AGENTS.md`
2. `claude.md`
3. `docs/WORKFLOW.md`
4. `docs/scenes/ui-page.md`
5. `docs/forbidden.md`
6. `docs/checklists/ui.md`
7. `docs/references/frontend.md`
8. `docs/references/domains/lora.md`
9. `docs/references/pages/lora-library.md`
10. `docs/references/pages/lora-generate.md`
11. `docs/references/pages/lora-workbench.md`（只读当前业务与回归事实，不继承旧皮肤）
12. `docs/plans/lora-assistant-nl2tag-2026-07.md`（助手真实行为）
13. `docs/plans/lora-session-handoff-2026-07-18.md`（当前在飞/已完成业务事实，先核对工作区）

以下文件只作历史或比较材料，**不得作为实现输入**：

- `docs/archive/design/lora-generate-bench-redesign-2026-07.md`（已退役）
- `docs/archive/design/lora-generate-claude-draft-2026-07.md`（未确认草稿）
- `docs/plans/assets/lora-generate-direction-a-*.png`（低保真方向比较，不是最终关键切片）
- `docs/archive/` 中旧 LoRA 视觉评审

## Confirmed Design Summary

### A. 整域与导航

- LoRA 是独立业务域，不是 Image Studio 的高级参数抽屉。
- 工作模式保持 Generate / Library / Train；无 `section` 时沿用 `community`，因此 **Library 是默认入口**。
- Generate 是执行核心；Library 是高频发现与管理入口；Train 是资源生产入口。
- 删除 LoRA 内容上方只显示“工作台”的冗余顶栏与重复账号入口；保留应用左侧 shell。
- 三个空间共享克制的中性深色域级气质，但可以有不同骨架。当前只实现 Library 与 Generate 的已确认骨架。

### B. Library — 聚焦浏览

确认图：`docs/references/pages/assets/lora-library-focus-browse-desktop-2026-07.png`

- 内容顺序：模式导航 → 搜索/低层级来源控制 → 类型与底模 → 单列宽幅效果流 → 分页。
- 搜索是主要入口。公开/我的、Civitai/Hugging Face、排序、安全和刷新保持可达，但低于搜索与内容。
- 类型与底模使用两个独立下拉/组合框并持续显示当前值；底模候选多，必须可检索。
- 结果使用单列宽幅节奏。普通行紧凑；点击普通行只在原位置展开详情，不挂载、不跳页。
- 展开详情按“效果证据 → 判断信息 → 下一步动作”组织：大效果图与样例带优先；名称、底模、来源、触发词、兼容性、安全性、作者与必要说明随后。
- 三个动作固定为：**使用此 LoRA**（主）、**收藏**（次）、**打开来源**（低层级外链）。
- “使用此 LoRA”立即挂载并进入 Generate，不弹二次确认；已有栈的追加/替换、满容量和不兼容继续沿用现行业务规则。
- Library 行内详情不常驻“试用提示词 / 来源图配方 / 带词去生成 / 复制”整块。点击样例图才打开共享来源配方 modal。
- 必须保留真实上一页、当前页、下一页，以及 loading/error/empty/disabled/selected 状态。

### C. Generate — A「并排监视台」

确认图：`docs/references/pages/assets/lora-generate-parallel-monitor-desktop-2026-07.png`

- 唯一主线：**当前装配 → 生成输入 → 出图 → 结果**。来源配方与助手只是按需辅助层。
- 顶部：模式导航下是一条无外层卡片装配行，平铺 LoRA、权重、容量、底模身份、执行通道、助手入口；其下是独立来源图带。
- 来源图是挂载 LoRA 的效果证据：已挂载显示，未挂载整条消失。点击单张来源图打开共享 modal。
- 助手关闭的桌面主台为输入 60% / 结果 40%。内容是自然页面流，不创建两个固定高度滚动盒。
- 左侧依次：参考图 → 全局参考强度 → 搭配状态条 → 200–240px Prompt → 折叠 Negative Prompt → 参数摘要与唯一“出图”动作。
- 参考图已添加态使用大预览卡横排，单图可预览/移除，末尾同尺寸“＋ 添加”；空态只显示低高度添加入口，不预留大卡片高度、不显示强度。
- 搭配提醒默认单行，原位向下展开触发词、标签、配方/参数差异和冲突处理；所有应用可查看变化并撤销，不静默覆盖。
- Prompt 是主编辑面，不能被参考图或参数挤成短输入条。Negative Prompt 与参数默认折叠并显示摘要。
- 参数是 disclosure，不是 Switch；详情从操作行下方向下展开。桌面“出图”只在左侧出现一次，与参数摘要同处自然流操作行，不 sticky/fixed，不在结果列重复。
- 右侧以大结果图为主；点击进入现有大图预览。图片下只显示尺寸、Steps、Seed、当前装配等元信息。
- 生成超过一张才显示本次会话缩略历史；点击切换主图，刷新清空。结果仍沿现有链路自动持久化，不显示“入库”。普通结果不显示“做同款 / 重出 / 无真实支撑的更多菜单”。

### D. Generate 必须覆盖的五种状态

1. 未挂载 · 助手关闭：保留纯底模生成主线，无来源图带。
2. 已挂载 · 助手关闭：确认图主状态。
3. 未挂载 · 助手打开：助手只读底模、Prompt、Negative、参考图和参数，不伪造 LoRA 语义。
4. 已挂载 · 助手打开：助手可读 LoRA、触发词、来源配方、参考图、底模和参数。
5. 搭配提醒展开：在输入区原位向下展开，主台骨架与结果列不重排。

助手桌面目标宽度约 380px。扣除助手后主台仍至少有 900px 才停靠；停靠态输入不低于约 540px、结果不低于约 360px。不足时改为右侧覆盖，不继续压缩。关闭后恢复 60/40、输入内容和原滚动位置。助手建议只通过可审阅变更卡写入搭配状态条，不能静默改写或直接生成。

### E. Library / Generate 共享来源配方 modal

确认图：`docs/references/pages/assets/lora-source-recipe-modal-desktop-2026-07.png`

- 桌面大尺寸 modal：左侧固定大图，右侧独立滚动 Prompt、Negative Prompt、底模/checkpoint、尺寸、采样器、调度器、Steps、CFG、Seed、标签与复制动作。
- 点击遮罩、Esc、关闭按钮退出；关闭后焦点回到触发图片，背景位置和状态不变。
- Library variant 用于查看与进入 Generate，不恢复行内配方块。
- Generate variant 可显示“做同款”：只应用真实可用的 Prompt、Negative、底模和参数并关闭 modal，不直接付费生成；已有输入时进入搭配提醒。
- 两处共享 dialog 行为、字段结构、键盘、焦点和响应式，不要求页面皮肤完全相同。

## Source of Truth

### 业务与 URL

- `src/constants/lora.ts`：section/query/default、Library 类型/底模/来源/分页和结果历史上限。
- `src/hooks/use-active-lora-stack.tsx`：挂载、权重、容量与兼容业务状态；本任务只读。
- `src/components/business/studio/lora/LoraWorkbench.tsx`：当前三空间组合、Generate 真实输入/结果/参数与 Library/Mine/Train 接线。
- `src/app/[locale]/(main)/studio/lora/page.tsx`
- `src/app/[locale]/(main)/studio/lora/layout.tsx`

### Library

- `src/components/business/studio/lora/library/CivitaiLibraryPane.tsx`
- `src/components/business/studio/lora/library/HuggingFaceLoraLibrary.tsx`
- `src/components/business/studio/lora/library/LoraLibraryCard.tsx`
- `src/components/business/studio/lora/library/LoraLibraryInspector.tsx`
- `src/components/business/studio/lora/library/LoraLibraryPagination.tsx`
- `src/components/business/studio/lora/library/LoraCoverPreviewDialog.tsx`
- `src/components/business/studio/lora/library/LoraLibraryTypeStates.tsx`

### Generate / shared auxiliary layers

- `src/components/business/studio/lora/LoraAssistantDock.tsx`
- `src/components/business/studio/prompt-tags/LoraSourceImagePreviewStrip.tsx`
- `src/components/business/studio/prompt-tags/LoraSourceRecipeStrip.tsx`
- `src/components/business/studio/lora/LoraReferenceImageChip.tsx`
- `src/components/business/studio/lora/LoraScaleChip.tsx`
- `src/components/business/studio/lora/LoraAspectRatioChip.tsx`

### Text and tests

- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`
- `src/components/business/studio/lora/**/*.test.tsx`
- `src/components/business/studio/prompt-tags/LoraSource*.test.tsx`
- `src/hooks/use-active-lora-stack.test.tsx`

## Allowed File Scope

- `src/components/business/studio/lora/**`
- `src/components/business/studio/prompt-tags/LoraSourceImagePreviewStrip.tsx`
- `src/components/business/studio/prompt-tags/LoraSourceRecipeStrip.tsx`
- 对应测试文件。
- `src/app/[locale]/(main)/studio/lora/page.tsx` 与 `layout.tsx`，仅用于移除 LoRA 冗余顶栏或接页面壳，不改路由/API 语义。
- `src/messages/en.json`、`ja.json`、`zh.json`，所有新增/改动用户文案三语同步。
- `src/app/globals.css` 仅允许增加严格作用域在 LoRA domain/page 根节点下的 token 或样式；不得改变其他域默认皮肤。
- 如需新文件，只能放在 `src/components/business/studio/lora/` 内，或新增只服务 LoRA 的 presentation constant；不得为视觉重构新建 service/hook/API。

任何超出上述范围的必要修改都先停止，向 owner 说明原因、真实调用方和最小扩张范围。

## Forbidden File Scope

- `src/app/api/**`
- `src/services/**`
- `prisma/**`
- Clerk、credit/billing、存储、provider、Runner、模型目录与生成服务契约。
- `src/hooks/use-active-lora-stack.tsx` 及搜索/收藏/训练 hooks 的业务语义。
- `src/constants/lora.ts` 中 URL、默认 section、分页、安全、来源、兼容和模型能力常量；需要 UI 阈值时优先新增 presentation constant，不改业务常量。
- 全站 `ui/`、`layout/` 共享组件的默认视觉皮肤；确需修复共享行为时另拆任务，不借本次改版扩张。
- Train 内部表单、预设、历史、训练 service 和训练 API。
- Canvas、Studio Image、Assets、Gallery、Prompts 或其他业务域页面。

## Implementation Slices

每片完成后都必须可运行、可回退、可截图核对；不要一次性重写 3000+ 行组件后再验证。

### R0 · 基线与拆分护栏

- `git status` 核对现有脏工作区，保留用户和其他会话改动。
- 跑 LoRA 现有定向测试，记录基线失败；确认 3000 是否由 owner 运行，存在则直接复用。
- 只在有助于后续切片时拆分 `LoraWorkbench` 的 presentation 组件；不移动业务逻辑到新范式，不改 hook/service。

### R1 · LoRA 壳与 Library

- 移除冗余“工作台”顶栏；保持左 shell 和 URL 深链。
- 落地 Library 搜索/低层级控制、类型与底模下拉、单列宽幅效果流、原位展开详情、三个动作和真实分页。
- 保持 Civitai/HF 字段和能力差异，不为统一视觉造假。
- 完成 Library loading/error/empty/selected/disabled 和键盘路径。
- 以 `lora-library-focus-browse-desktop-2026-07.png` 做截图比对，先让 owner 目验再继续大范围 polish。

### R2 · 共享来源配方 modal

- 将 Library 样例图和 Generate 来源图接到统一 dialog 行为/字段结构。
- 完成大图、独立参数滚动、复制、关闭、Esc、遮罩、focus return 与 Generate “做同款”差异动作。
- 复用现有配方/图片数据；不新建配方 API，不让 Library 常驻提示词块。

### R3 · Generate 主状态

- 落地无卡片装配行、来源图带、60/40 主台、大参考图、搭配状态、Prompt/Negative/参数层级和稳定结果列。
- 先完成“已挂载 + 助手关闭 + 有参考图 + 有结果”的确认图状态。
- 出图保持自然流单动作；验证滚动而不是 fixed/sticky。
- 以 `lora-generate-parallel-monitor-desktop-2026-07.png` 做截图比对并由 owner 目验。

### R4 · Generate 其余状态与助手

- 补齐未挂载、参考图空态、空结果、多结果会话历史、搭配展开及助手开/关四组合。
- 实现 900px 停靠阈值和覆盖回退；保持输入/结果底线、状态和滚动位置。
- 助手内容沿用现有真实能力与 `lora-assistant-nl2tag`，只调整宿主布局与审阅式应用路径。
- 参数展开、loading/error/disabled 与生成中状态不能改变主线或产生双出图动作。

### R5 · 响应式边界、a11y、i18n 与回归

- 桌面至少实跑 1440px 和约 1189px：前者验证可停靠助手，后者验证覆盖。
- 375px 只保证当前主任务可用、不丢字段、不溢出、不破坏软键盘与 focus；**不得自行拍板最终移动端视觉或 sticky 行为**。需要结构选择时停下让 owner 确认。
- 三语、键盘、ARIA、focus、命中区、reduced-motion、长文本和真实状态全部通过 checklist。
- 最终全量验证后再请求 commit；不得 `--no-verify`，不得自行 push main。

## Assumptions / Open Questions

### 已确认假设

- 默认 `community` 即 Library，保持现有 query 契约。
- Library “使用此 LoRA”沿用现有挂载规则并跳 Generate，不新增确认框。
- Generate 普通结果已经自动持久化；结果列不需要“入库”。
- 会话历史只存在内存，刷新清空，容量仍由现有 `LORA_RESULT_HISTORY_MAX` 决定。
- 当前 Anima DiT 只有 Runner；执行通道显示静态事实，不做假下拉。
- 来源配方和助手只能通过可审阅动作改变输入，不直接发起生成。

### 必须停下询问 owner

- 移动端最终骨架及是否 sticky 出图。
- 助手停靠/覆盖态需要超出已确认结构的新高保真皮肤时。
- Train 内部任何结构或视觉改版。
- 需要修改 hook/service/API/schema/provider/计费/持久化或 URL 契约时。
- 确认图与真实业务能力冲突、或实现必须移除现有功能时。
- 想把 LoRA token/variant 提升成全站默认时。

## Acceptance Criteria

### 全局

- `/studio/lora` 无 section 时进入 Library；`?section=generate|community|mine|train` 深链仍有效。
- LoRA 冗余“工作台”顶栏删除，左侧应用 shell、账户与全局导航行为不回归。
- Library、Generate 符合各自确认图的结构和注意力层级，但不机械取色或复制错误小字。
- 所有原有搜索、筛选、分页、收藏、来源、挂载、权重、参考图、生成、助手和结果持久化路径仍可用。
- 新视觉严格作用域在 LoRA；其他业务域截图无变化。

### Library

- 类型/底模始终一眼可达且显示当前值；搜索、来源、排序、安全、刷新、公开/我的和真实分页均保留。
- 普通行点击原位展开且不挂载；“使用此 LoRA”一次点击挂载并进入 Generate。
- 展开详情包含效果证据、必要判断字段和使用/收藏/来源三动作，不常驻完整提示词/配方编辑块。
- Civitai/HF 真实差异、loading/error/empty/selected/disabled 状态均正确。

### Generate

- 顶部装配与来源图、60/40 输入/结果、200–240px Prompt、折叠 Negative/参数、自然流单出图动作和大结果列符合页面文档。
- 五种挂载/助手/搭配状态都进入同一骨架；未挂载不显示来源图带，纯底模助手不读取 LoRA。
- 参考图空态/已添加态、全局强度、添加/预览/移除行为正确。
- 参数展开只向下扩展；不存在 sticky/fixed 桌面出图栏或右侧重复出图。
- 结果列无“入库 / 做同款 / 重出 / 假更多菜单”；会话历史刷新清空，点击历史切换大图。
- 助手在可用主台 ≥900px 时停靠，否则覆盖；关闭后恢复布局、输入和滚动位置。

### Shared modal

- Library/Generate 共用大图 + 右侧参数库行为；Esc、遮罩、关闭、focus return 和独立滚动可验证。
- Generate “做同款”不直接生成；已有输入进入搭配提醒并可撤销。

## Validation / Evidence

### 自动验证

```powershell
npm run typecheck
npm run lint
npx vitest run src/components/business/studio/lora/LoraWorkbench.test.tsx src/components/business/studio/lora/LoraWorkbench.library.test.tsx src/components/business/studio/lora/library src/components/business/studio/prompt-tags/LoraSourceImagePreviewStrip.test.tsx src/components/business/studio/prompt-tags/LoraSourceRecipeStrip.test.tsx src/hooks/use-active-lora-stack.test.tsx
npm run test:run
git diff --check
```

- 先跑定向，最终可提交切片必须跑全量；定向通过不能声称全绿。
- 3000 已被占用时直接复用 owner 的 dev server，不另起实例；dev server 运行时不要并行 `npm run build`。

### 浏览器与截图

- Library：默认入口、Public/Mine、Civitai/HF、搜索、类型、底模、排序、安全、刷新、分页、展开/关闭、收藏、来源、使用并跳 Generate。
- Generate：上述五状态，以及参考图 0/1/多张、Prompt 长文本、Negative/参数展开、生成中/失败/成功/多结果历史。
- 助手：1440px 停靠、约 1189px 覆盖、Esc/关闭/focus return、主台状态与滚动恢复。
- modal：Library 与 Generate 两处打开，左右滚动、复制、做同款、已有输入搭配提醒、遮罩/Esc/关闭。
- 输出同视口 before/after 截图，与三张确认图并列核对；不得用截图替代行为断言。

## Documentation Sync

- 实现过程中在本文追加每个 R 切片的完成状态、改动文件、验证结果与未验证边界。
- 只有真实实现与 owner 目验后，才更新 `docs/status.md` 和对应 page 文档 `Last Verified`。
- 若实现需要改变已确认设计，先回到 owner 逐项确认，不直接重写 `lora-library.md` / `lora-generate.md`。
- Train、移动端最终设计或新增 provider 能力必须另开任务包。

## Handoff Prompt for Claude

> 请按 `docs/plans/lora-ui-refactor-claude-handoff-2026-07.md` 执行 LoRA UI 重构。先完整读取 Read First，核对当前脏工作区和业务代码，再按 R0→R5 小切片推进。Library、Generate 和共享来源配方 modal 的桌面方向已经 owner 确认，不再重新生成设计方向；严格保留业务/API/provider/URL 契约。Train、移动端最终布局和未确认助手皮肤不要自行设计，遇到对应选择立即停下询问。每个切片完成后报告改动文件、验证结果和浏览器截图，owner 点头前不要 commit 或 push。

## Implementation Log

### R0 · 基线与拆分护栏 ✅（2026-07-19，Claude）

- 脏工作区核对：203 文件在飞（多为 docs + 跨域组件），**LoRA 作用域内零改动**（全部由本切片新增），未触碰他人在制品；两个 `lint-staged automatic backup` stash 保留不动。
- 现有定向测试基线：`LoraWorkbench.test.tsx` / `LoraWorkbench.library.test.tsx` / `library/**` / `LoraSource*` / `use-active-lora-stack` = **7 文件 / 91 测试全绿**。
- dev server：初始 3000 空，实施末 owner 已开 3000（PID 复用，未另起实例）。
- 结论：无需拆分业务逻辑；R1 直接在 `library/` 子目录内做 presentation 重构。

### R1 · LoRA 壳与 Library ✅ 待 owner 目验（2026-07-19，Claude）

**改动文件**

- 新增：`library/LoraLibraryFilterCombobox.tsx`（类型/底模下拉，底模可检索）· `library/LoraLibraryRow.tsx`（单列未展开行）· `library/LoraLibraryRowDetail.tsx`（原位展开详情，civitai/HF 双源，去试用词/配方块）· `library/lora-library-filter-labels.ts`（共享 label key）。
- 重写：`library/CivitaiLibraryPane.tsx` / `library/HuggingFaceLoraLibrary.tsx`（网格+抽屉 → 单列宽幅流 + 原位展开；搜索 portal 进顶栏搜索槽；类型/底模下拉；控件 portal 不变）· `library/LoraLibraryTabs.tsx`（源 segmented → 「Civitai ▾」下拉）· `LoraWorkbench.tsx`（顶栏合流：搜索槽 + 公开/我的下拉 + 来源槽 + 控件槽，删旧 pills 行；删未用 `Library` 图标）· `library/LoraLibraryTypeStates.tsx`（稀疏引导卡 → 单列引导行）。
- 删除（已退役、零外部 importer）：`LoraLibraryCard.tsx` / `LoraLibraryInspector.tsx` / `ContentTypeChipRow.tsx` / `FamilyChipRow.tsx` / `LibraryFilterChipRow.tsx`。
- 测试：重写 `LoraWorkbench.library.test.tsx` + `library/HuggingFaceLoraLibrary.test.tsx`（单列 + 原位展开 + 收藏在详情 + 源下拉 + 底模下拉，保留深链/NSFW 循环/清除筛选断言）；HF 测试加 `ResizeObserver` no-op stub（cmdk 依赖，jsdom 缺）。
- i18n：`en/ja/zh` 各 +14 键（`libraryScopeLabel`/`librarySourceLabel`/`baseModelSearchPlaceholder`/`baseModelSearchEmpty`/`communitySource`/`licenseLabel`/`safetyLabel`/`safetySafe`/`safetySensitive`/`detailAuthor`/`useThisLora`/`sampleStripLabel`/`sampleImageAlt`/`collapseDetail`）。

**验证**

- `tsc --noEmit`：`src/` 0 error（仅 `.next/dev/types/routes.d.ts` 幻影 = 已知 tsc×.next 竞态）。
- `eslint`（library + LoraWorkbench）：clean。
- 定向 vitest（同 R0 集合）：**7 文件 / 91 测试全绿**（数量与基线一致）。
- claude-in-chrome 真机（1568px，复用 owner dev）：单列库默认入口 / 搜索+公开/Civitai/推荐/安全/刷新同栏 / 类型·底模下拉（底模搜索框）/ 点行原位展开（大封面+触发词·底模·来源·授权·安全性+描述+作者+使用/收藏/打开来源+样例带）/ 源切 Hugging Face（URL `?source=huggingface`、搜索占位切换、安全 chip 正确隐藏、HF 单列）/ 控制台零错误 / 无冗余「工作台」顶栏。

**R1 close-review 修订（2026-07-19，owner 真机反馈后）**

owner 细看后反馈六点，已全部落地并真机复验：

1. **宽视口下太小** → 行整体放大（缩略图 44→56px、行内边距/元数据 text-2xs→text-xs、名称加 medium）。
2. **点击 LoRA 无过渡** → 展开详情加 `animate-in fade-in slide-in-from-top-2`（reduced-motion 全局降级）。
3. **收起控件与「使用此 LoRA」重叠** → 收起 chevron 从 absolute 挪进动作列顶部右对齐，不再叠按钮。
4. **公开/来源只有两个值，不要下拉** → 公开/我的、Civitai/HuggingFace 改 `LoraLibrarySegmented`（新共享件）紧凑 segmented 切换；类型/底模（多值）保留下拉，推荐(排序)保留下拉。
5. **模式导航按钮太小** → 生成/库/训练 TabsList h-9→h-11 / trigger h-7→h-9 + text-sm + 大图标。
6. **按钮无点击过渡** → 详情动作按钮 + segmented + 模式导航加 `active:scale-[0.97]` 按压过渡。

新增文件：`library/LoraLibrarySegmented.tsx`。复验：tsc src 0 error · eslint clean · 定向 vitest 7 文件/91 测试全绿 · 真机（顶栏 segmented + 放大行 + 展开详情无重叠 + 大按钮）通过。首行默认态经 owner 拍板**保持全收起**。

**R1 close-review 第二轮（2026-07-19，owner 二次真机反馈）**

1. **宽视口两侧留白太大** → 内容容器 `max-w-6xl`→`max-w-7xl`（1152→1280px），宽屏下收窄留白（`LoraWorkbench.tsx`）。
2. **点击 LoRA 无过渡、需要高级 CSS** → 详情原位展开改用 **`grid-template-rows: 0fr→1fr` 平滑高度揭示**（`globals.css` 新增 `@keyframes lora-detail-reveal` + `.lora-detail-reveal`，作用域仅 `.lora-*`，reduced-motion 由文件末尾全局块降级）；两 pane 把展开详情包进 `.lora-detail-reveal > overflow-hidden` 子树，下方结果行随高度顺滑推开而非硬跳。移除 DetailShell 里的基础 `animate-in fade/slide`。

复验：**full tsc `TSC_EXIT=0` / src 0 error**（node/StudioNodeWorkbench 的 relations-visibility 报错是另一会话在飞件、已被其并行修复，全程未触碰）· eslint clean · 定向 vitest 7 文件/91 全绿 · 真机（容器变宽 + 展开高度平滑揭示 + 详情完整不裁切 + 控制台零错误）通过。顺手修 `LoraLibraryRow` 缩略图三档回退 null 守卫（tsc）。

**R1 close-review 第三轮（2026-07-19，owner「收起也要平滑、不能闪」）**

- 收起也做平滑：把一次性 keyframe 换成**双向 grid-rows 过渡** + 新宿主组件 `library/LoraLibraryDetailReveal.tsx`。展开上升沿本次渲染即挂载详情（0fr，测试同步可命中），rAF 置 1fr 播开场；收起下降沿先置 0fr 播收起过渡，`transitionend`（或兜底 340ms timeout）后才卸载详情、换回未展开行——**收起期间行不与收缩中的详情叠现，无闪**。`globals.css` 的 `.lora-detail-reveal` 由 keyframe 改为 `transition: grid-template-rows`。两 pane 的展开/未展开都交给该宿主（`row`/`detail` 两个 slot）。
- 挂载/卸载用 React「渲染期依 prop 调整 state」模式（避免 `react-hooks/set-state-in-effect`），effect 只调度 rAF/timeout 回调。
- 测试：收起断言改 `await waitFor`（收起是过渡后异步卸载），给 3000ms 余量防 CI 计时被并发 tsc 饿死误判。

复验：eslint clean · full tsc `exit 0` / src 0 error · 定向 vitest 全绿（收起测试单独清跑通过；一次并发 tsc 时曾因计时饥饿假红，隔离后正常）。

**未验证 / 待办边界**

- 样例图点击当前打开封面预览（R1 占位）；R2 换共享来源配方 modal（左大图 + 右侧参数库 + 做同款）。
- 移动端 375px 结构仅在 R5 处理；本切片只做桌面。
- 「我的」库沿用现状（不在确认范围，仅顶栏合流后共享公开/我的 segmented）。
- **R3 记账（owner 真机时提出）**：Generate 页底模选择器要做成「二级搜索配置」（图三 = 现状分组 Select，云端 API / Runner + SDXL 系 / DiT 系两级，缺检索）——归入 R3 Generate 主台，届时把分组 + 可检索合到一处。

### R2 · 共享来源配方 modal（Library 侧完成 · Generate 侧待定，2026-07-19，Claude）

**已完成（Library 侧 + 共享组件）**

- 新增 `lora/LoraSourceRecipeModal.tsx`：大尺寸 modal，左固定大图（prev/next + 计数 + ←/→ 键盘切图），右独立滚动结构化配方（来源徽标 / 提示词+复制 / 负面提示词+复制 / 底模与执行[基础模型·检查点] / 参数[尺寸·采样器·调度器·步数·CFG·种子] / 标签 / 复制配方 / 打开来源）。variant=`library`（查看，无做同款）/`generate`（+做同款：`onApplyRecipe`，应用真实配方并关门，不直接生成）。Esc/遮罩/关闭/focus return 由 Radix Dialog 提供。复用现有 `CivitaiImageRecipe`，无新配方 API。
- Library 接线：`CivitaiLibraryPane` 样例图点击——有逐图配方（`minedPrompts.recipes`）时开 modal 并定位下标；无配方（纯预览兜底图）退回封面大图预览。i18n 三语 +26 键（`sourceRecipe*`）。
- 复验：tsc `exit 0` / src 0 error · eslint clean · Library 定向测试 18/18 · 真机（维里奈 LoRA 样例点开：大图 + 提示词/负面/底模与执行/参数完整 + prev/next 切图切配方 + Esc 关闭复位 + 控制台零错误；起初被默认 `sm:max-w-lg` 压窄，补 `sm:max-w-[min(96vw,64rem)]` 后大图占主位）。

**Generate 侧接线 → 并入 R3（owner 2026-07-19 拍板③）**

owner 选「并入 R3」：Generate 侧到 R3 建「并排监视台」的来源图带时再把图点接到共享 modal（generate variant，含做同款 + 额外 LoRA 挂载/含种子），避免对将被 R3 替换的当前 `LoraSourceRecipeStrip` 做返工。共享组件已就绪，R3 直接消费。R2 授权范围（共享 modal + Library 接线）至此完成。

### R3 · Generate 主状态（并排监视台）— 进行中（2026-07-19→20，Claude）

现状是布局 B（`LoraSpineBar` + 上半双栏[来源/配方·结果] + 全宽底部 composer），确认图是 A「并排监视台」（装配行 + 来源图带 + 60/40 输入左·结果右）。因是高风险 1550 行生成组件的大改，按**验证式子切片**推进（不一次性重写）：

- **G1 · 装配行** ✅（2026-07-20）：`LoraSpineBar` 补齐确认图缺的三件——① 挂载 LoRA **头像**（`item.asset.coverImageUrl` 代理图，per 挂载）；② 容量 **「N/max · ＋添加」**（＋添加路由去库，替代 D8 的 ●●○○○ 圆点计数）；③ **执行通道指示**「执行 Runner · 唯一通道」/「云端 API」（§3.3 分层表达，runner-only 静态显示不伪造下拉，底模未选不渲染）。新增 prop `onAddLora`；i18n `spine.addLora/executorLabel/executorRunner/executorCloud` 三语。复验：eslint clean · tsc `exit 0`/0 src error（含 coverImageUrl）· GenerateBranch 测试 27/27 · 真机（未挂载态见「0/3 · ＋添加」+「执行 Runner · 唯一通道」）。头像 per 挂载渲染（tsc 验证字段存在 + guarded）。
- **G2 · Generate 来源图接共享 modal** ✅（2026-07-20，点图接线部分）：`LoraSourceRecipeStrip` 点来源图从原素图预览 dialog 换成共享 `LoraSourceRecipeModal`（**generate variant + 做同款**，做同款用当前 includeSeed 应用真实配方并关门，不直接生成）。新增 strip props `baseModelFamily`/`sourceUrl`（GenerateBranch 传 recipeGroupAsset；source URL 暂用 loraUrl 兜底，civitai 无干净 modelPageUrl builder）。删素图预览 dialog + 相关 state。复验：eslint clean · tsc `exit 0`/0 src error · strip 测试 2/2（改写为「点图开共享 modal + 关闭/Esc」）。⚠ **仍留内联配方面板**（含额外挂载/含种子）——这两项确认图 modal 未含、待 G3 随 60/40 重排时并入 modal 或搭配状态条并删内联面板；来源图**移到装配行下横向带**也在 G3（当前仍在左栏 2-col 位）。generate-variant modal 真机走查待一次干净挂载（组件本身已在 R2 Library 侧真机验证，仅多一个做同款按钮）。
- **G3 · 60/40 并排监视台** 🔄 进行中（owner 2026-07-20：开新专注回合从头做）。**子切分（逐片可运行可截图）**：
  - **G3a 60/40 骨架** ✅ 待 owner 目验（2026-07-20，Claude）：内容壳（`flex-col gap-5` 外壳 + `md:grid-cols-2` 内层双栏）合并成**一张 `md:grid-cols-5` 网格**——三个直接子：推荐面板(`md:col-span-3 md:row-start-1`) / 结果监视列(`md:col-start-4 md:col-span-2 md:row-span-2`，去 `mx-auto max-w-md`，`order-last md:order-none` 保移动端顺序) / composer(`md:col-span-3 md:row-start-2`)。**无块搬移**：靠 grid 显式定位（`col-start`/`row-start`/`row-span`，全标准 Tailwind 无 arbitrary value）把源码顺序[推荐][结果][composer]渲染成左[推荐/composer]右[结果跨两行]，只删外壳 open + 内层 grid close 两处标签保持平衡。**退役布局 B 象牙纸皮肤**：composer 去 `.studio-composer`(反相米白纸)+全宽出血负 margin(`-mx-*/-mb-5/rounded-t-2xl`)，改新 LoRA 作用域类 `.lora-generate-input`（globals.css，仅 `--surface-composer-foreground: var(--foreground)` 一行重定义——28 处 `text-/border-surface-composer-foreground/*` 工具类零改动即在深炭面解析成浅色发丝；`--primary` 保暗主题默认→出图=白丸暗字，匹配确认图）。改动文件：`LoraWorkbench.tsx`（纯 JSX 重排，无逻辑/prop/hook 改动）+ `globals.css`（+`.lora-generate-input`）。验：full tsc `TSC_EXIT=0`/0 src error · eslint clean · 定向 vitest **7 文件/91 测试全绿**（同基线）· 真机 1440px（复用 owner dev 3000）：已挂载态(绝区零/Enchanting Eyes/Hands XL 三挂·云端 API)左输入/右结果 60/40 成型、composer 深炭化白 CTA、助手开→主台 marginRight 停靠不破、关→恢复、控制台零错误。**未验证边界**：推荐面板仍是 G3a 临时家（带完整内联配方，把 composer 顶下去）——G3b 换成装配行下横向来源图带 + Prompt 上方单行搭配状态条后左栏才紧凑；参考图仍在 composer 底 chip（G3c 升顶部大卡）；结果列头/元信息/aspect 待 G3d；触发词 chips/placeholder 深炭下偏暗=视觉层级 G3c 再收；移动端 R5；未跑 owner 账号真实出图（不花额度，仅验布局与主链结构）。
  - **G3b 来源图带 + 搭配状态条**（拆两片）：
    - **G3b-1 来源图缩略带（strip 瘦身）** ✅ 待 owner 目验（2026-07-20，Claude）：`LoraSourceRecipeStrip` 从「缩略图 + 常驻内联配方面板（M2c：提示词/负面/参数/hires/per-extra 挂载列/用原图 seed/一键同款）」瘦成**纯缩略带**——「来源图 N」+ 缩略图行 + **单击查看大图与完整配方** hint，点图只开 G2 已接的共享 modal（generate variant + 做同款，做同款由 parent `handleApplyRecipe` 自动挂额外 LoRA）。删内联面板 + `ExtraLoraList` 子件 + 退役 props（`selectedImageUrl`/`onSelectedImageUrlChange`/`onIncludeSeedChange`/`extraMountStatusByKey`/`extraStackFull`/`onMountExtraLora`），caller 同步删死态（`selectedImageUrl`/默认选第一张 effect/`recipeDefaultedFor`/`setIncludeSeed`；`recipeGroupKey` 保留=spine bar 用）。**行为收窄**：做同款 seed 策略固定随机（modal 无 seed 开关，§4）；per-extra 手动挂改由做同款自动挂 + 「常与它同挂」快挂承担。改动文件：`LoraSourceRecipeStrip.tsx`（重写瘦身）+ 其 `.test.tsx`（改测缩略带→modal→做同款）+ `LoraWorkbench.tsx`（call site + 删死态）+ `LoraWorkbench.test.tsx`（5 测经 `applyFirstRecipeViaModal` helper 走缩略→modal→做同款，civitai/HF 判据从 `recipeApply` 改 `sourceImagePreviewLabel`）+ i18n `sourceImagesModalHint` 三语。验：full tsc `TSC_EXIT=0` · eslint clean · 定向 vitest **7 文件/91 全绿** · 真机（已挂载三挂：来源图带瘦成缩略+hint、composer 上移紧凑、点缩略图开共享 modal 见做同款、控制台零错误——MISSING_MESSAGE 是 dev 热更旧 message 缓存残留，全量重载后消失，key 三语齐全）。
    - **G3b-seed · modal 补回「用原图 seed」开关** ✅ 待 owner 目验（2026-07-20，Claude）：共享 `LoraSourceRecipeModal` generate variant 做同款旁补「用原图 seed」勾选（仅当 `recipe.seed` 存在时显示），modal 内部持 `includeSeed` state，做同款按勾选应用（`onApplyRecipe` 签名扩成 `(recipe, includeSeed)`）；strip 去掉自持 includeSeed passthrough，caller 删 `const [includeSeed]` 死态。改动：`LoraSourceRecipeModal.tsx` + `LoraSourceRecipeStrip.tsx`(+其测试测「默认随机/勾选=原 seed」) + `LoraWorkbench.tsx` + i18n `sourceRecipeUseSeed` 三语。验：full tsc 0 · eslint clean · 定向 vitest 7 文件/91 全绿 · 真机（modal 见「用原图 seed」勾选，控制台零错误——旧 MISSING_MESSAGE 是 dev 缓存残留，fresh 重载消失）。
    - **G3b-2a · 删 tabs + 来源带常驻左栏顶 + 词库落底** ✅ 待 owner 目验（2026-07-20，Claude）：删「推荐/自己搭配」下划线 tabs；来源图缩略带常驻左栏顶（`md:row-start-1`，未挂载退化「纯底模/去库」引导）；**词库 `LoraTagPicker` 移到左栏底部**（新 grid child `md:row-start-3`，owner 拍板常驻）；结果列 `md:row-span-2→3`。`promptMode` state 退役（tabs 删 + 自动选图 effect 已在 G3b-1 删）；`handleAssistantEscapeToSelfBuild` 从切 selfBuild tab 改**滚动定位到词库**（`tagPickerRef.scrollIntoView`）。改动：`LoraWorkbench.tsx`（纯 JSX 重排 + ref）+ 其测试（2 个「自己搭配」用例去掉切 tab 步骤，词库现常驻）。验：full tsc `TSC_EXIT=0` · eslint clean · workbench+library 45/45 · 真机（tabs 消失、来源带在顶、词库在底常驻搜索+分类+词条列表、控制台零错误）。
    - **G3b-2b · 搭配状态条（完整版：摘要+展开+撤销）** ✅ 待 owner 目验（2026-07-20，Claude）：新 `LoraCollocationStatusBar`（Prompt 上方单行）——`hasLora`（有触发词或已应用配方）时显示「● 搭配 · 已应用来源配方 · 触发词×N 已加入」+ 查看（原位向下展开：来源配方名 + 配方参数名 + **内嵌 TriggerChipRow 可停用触发词 chip**）+ 撤销（仅已应用配方时）。**地基复用** `appliedRecipe` state，扩 `assetName`/`appliedParamLabels`/`snapshot`；`handleApplyRecipe` 应用前直接从闭包快照 12 项输入 + 组 scale（输入 vars 进 deps，避免 ref-during-render——项目 `react-hooks/refs` 禁 render 期改 ref）；`handleUndoRecipe` 整批回滚快照 + 清 appliedRecipe（extras 不自动卸载，装配行 chip 管）。**TriggerChipRow 从 composer 顶移进状态条展开**（主台更干净、Prompt 更突出），composer 删其直接引用。i18n `generate.collocation.*` 三语。改动：新 `LoraCollocationStatusBar.tsx` + `LoraWorkbench.tsx`（state/handlers/wire）+ 其测试（3 个触发词用例加 `expandCollocation()` 先展开 + 新增撤销回滚用例）+ `messages/*`。验：full tsc `TSC_EXIT=0` · eslint clean · 定向 vitest **7 文件/92 全绿**（+1 撤销用例）· 真机（状态条「搭配·触发词×3 已加入·查看」、点查看展开见 3 枚可读可停用触发词 chip、fresh 重载控制台零错误）。撤销真机未在 owner 会话演示（做同款会给其挂载栈加额外 LoRA、撤销不卸，避免动 owner 状态）——回滚逻辑由新单测覆盖。
  - **G3-fix · composer 对比度 + Prompt 主输入面** ✅ 待 owner 目验（2026-07-20，owner 真机反馈「字看不到 + prompt 放哪合理」）：
    - **根因**：G3a 的 `.lora-generate-input`（重定义 `--surface-composer-foreground: var(--foreground)`）**从未编译进样式表**（`document.styleSheets` 查 `.lora-generate-input` count=0，真机 probe 得 composer 的 `--surface-composer-foreground` = #161616 近黑）——于是 composer + `TriggerChipRow` 里所有 `text-/border-surface-composer-foreground/*` 在深炭面解析成近黑 = 隐形（prompt 正文因走继承 `--foreground` 幸存，故看着「只有部分字看不到」；runner 底模的参数标签 /65 最明显）。
    - **修（robust · 去脆弱依赖）**：把 `LoraWorkbench` composer 的 **29 处** + `TriggerChipRow` 的 6 处 `surface-composer-foreground` token 全迁到**标准暗主题 token**（`text-foreground` / `text-muted-foreground` / `border-border`，真机 probe `text-muted-foreground`=lab(66%) 可读）；删 composer 的 `lora-generate-input` class + globals.css 里那条没编译上的规则。标准 token 全站都在用、必编译，不再靠 dev CSS 热更。
    - **Prompt 主输入面（owner「设计下放哪合理」）**：触发词 strip（读得清了）→ **提示词** = 带「提示词」标签 + 发丝边框 + 微底（`bg-muted/20`）圈出的**高输入框**（`min-h-52`≈208px 真机确认、可纵向拉伸），确立为左栏视觉主角，不再是夹在触发词/参数间的 3 行短条 → Negative 折叠 → 参数 disclosure → 出图。i18n `promptLabel` 三语。
    - 验：full tsc `TSC_EXIT=0` · eslint clean · workbench+library 45/45 · 真机（触发词/提示词标签+chips 全可读、prompt 208px 高框主角、probe 确认 token lab(66%)/min-h 208px、fresh 重载控制台零 MISSING_MESSAGE）。⚠ 参数标签（Seed/Steps/CFG…）用同一 `text-muted-foreground`，未单独截 runner 底模图（避免动 owner 底模选择），但 token 同源已确认可读。
  - **G3c 左栏层级 + 参考图大卡** ✅ 待 owner 目验（2026-07-20，Claude）：参考图从 composer 底部动作行的紧凑 chip（`LoraReferenceImageChip`，已退役删除）升成**顶部大预览卡**——新 `LoraReferenceImageCards`：横排大卡（每张 aspect-square w-36 = 图 + × 移除 + 点图看大图 preview dialog + disabled 态）+ 同尺寸「＋添加」虚线卡（Popover 复用 `ImagePickerPopoverBody` 上传/最近/开库）+ 下方唯一「参考强度」滑杆；空态只留低高度「＋ 添加参考图」入口（不预留大卡高度、不显强度，§3.2.3）。放**composer 顶、搭配状态条上方**（左栏序：来源图 → 参考图 → 搭配 → 提示词 → 负面 → 参数 → 出图，贴确认图）；能力位驱动（`maxReferenceImages > 0 && referenceStrengthConfig`）。复用 `useImageUpload` 状态 + `AssetSelectorDialog`，与旧 chip 同源能力只换呈现；从动作行删旧 chip。i18n `ImageChip.referenceLabel/add/addReference` 三语（section 标题「参考图」，非旧 chip 的「图像」）。改动：新 `LoraReferenceImageCards.tsx`(+测试 empty/filled，加 ResizeObserver stub) + 删 `LoraReferenceImageChip.{tsx,test.tsx}` + `LoraWorkbench.tsx`(wire+去 chip) + `messages/*`。验：full tsc `TSC_EXIT=0` · eslint clean · 定向 vitest **14 文件/119 全绿** · 真机（切 runner 底模 WAI-Illustrious[与三挂 Illustrious 家族兼容]验：参考图区在源图带下、搭配条上，空态「＋添加参考图」低入口、runner 预算 + 参数 disclosure 皆可读；验毕切回云端底模复原 owner 状态）。filled 大卡由单测覆盖（未在 owner 会话塞真参考图）。
  - **G3d 结果列 polish** ✅ 待 owner 目验（2026-07-20，Claude）：右 40% 结果列补齐——① **「结果 / 历史 N」头**（历史计数仅 >1 张时显示）；② 主图**纵横比取自选中结果的 gen-time 快照**（无则退回方形，full 图不裁，贴确认图 832×1216 竖图）；③ 图下**两行元信息**——尺寸 · 步数 · 种子（缺项自动省略）/ 主 LoRA×强度 · 底模；④ 保留点击进大图预览 + 多结果会话缩略 filmstrip。`LoraResultHistoryItem` 扩 `width/height/steps/baseName/loraName`（出图成功时快照，反映本次而非当前面板值；`previewDimensions` 进 handleGenerate deps）。i18n `generate.resultLabel/resultHistoryCount/resultMetaSize/resultMetaSteps/resultMetaSeed/resultMetaAssembly` 三语。改动：`LoraWorkbench.tsx`（type + append + JSX）+ `messages/*`。验：full tsc `TSC_EXIT=0` · eslint clean · workbench 28/28（生成→filmstrip 带新字段全绿）· 真机（空态见「结果」头、无 history 计数、控制台零错误）。填充态元信息 + 动态纵横比由单测 append 覆盖（未在 owner 会话真出图花额度）。
  - **G4 确认图比对 + owner 目验**。5 状态矩阵（未挂/已挂×助手开关 + 搭配展开）+ 助手 900px 停靠阈值 = **R4**（G3 只做「已挂载·助手关闭·有参考图·有结果」主态）。
  - 护栏：不改 `useUnifiedGenerate`/挂载/参考图 img2img/参数校验/key-setup/filmstrip 业务；纯 JSX 重排 + 视觉。每片单独 tsc/lint/vitest + 真机截图。

### R4 · 助手停靠阈值 + 状态矩阵 ✅ 待 owner 目验（2026-07-20，Claude）

- **900px 停靠/覆盖阈值（§5 核心）**：`assistantMarginRight` 从「桌面恒停靠」改为**按可用宽度决策**——新增 `mainSectionRef` + ResizeObserver 量正文列父容器 `clientWidth`（不受本列 marginRight 影响，助手 dock 是 `fixed` 出流不计入）；`扣除助手宽后 ≥ LORA_ASSISTANT_DOCK_MIN_MAIN_PX(900)` 才停靠（push 正文），否则**右侧覆盖**（marginRight=0，`fixed right-0 z-40` 助手浮在满宽正文上，不继续压缩）。未测得宽度前默认可停靠避免开场闪。ResizeObserver 守卫 `typeof ResizeObserver === 'undefined'`（jsdom 无此 API，测试只测一次不订阅，不改共享 `vitest.setup.ts`）。新 presentation const `LORA_ASSISTANT_DOCK_MIN_MAIN_PX`（模块级，LoRA-only，非业务常量）。
- **状态矩阵**：五状态（未挂/已挂 × 助手开/关 + 搭配展开）本就由 G3 各条件渲染覆盖（未挂无来源带、空结果占位、搭配条展开原位、助手读当前真实 state 不伪造 LoRA 语义）；R4 只补齐助手停靠边界这一真缺口。
- 改动：`LoraWorkbench.tsx`（const + ref + ResizeObserver effect + `assistantMarginRight` 阈值 + section ref）。无 i18n / 无新测试（docking 是布局行为，真机验）。
- 验：full tsc `TSC_EXIT=0` · eslint clean · workbench 28/28 · **真机**：1440px 开助手 = **停靠**（正文左压、助手在侧）；resize→1189px = **覆盖**（正文满宽、助手浮盖结果列右部，ResizeObserver 实时翻转）；关助手 → probe 确认 `sectionMarginRight=0px`/`assistantWidth=0px`/`aria-hidden=true`（布局复原）；控制台零错误。
- ⚠ 未做：五状态的**填充态真机全走查**（做同款/出图会动 owner 会话状态或花额度）——助手四组合 + 搭配展开的读取逻辑沿用 G3 已验条件渲染，未逐一在 owner 会话演示。

### R5 · 移动端（375px · iOS 风） ✅ 待 owner 真机目验（2026-07-20，Claude · owner 拍板「自主设计 · 以苹果 UI 为主」）

- **⚠ 工具限制（关键）**：claude-in-chrome 浏览器视口**卡死在 ~1910px**，`resize_window` 降不到 768 以下（`matchesMd` 恒 true）——**无法真机截图 < 768 的移动布局**。故先出 iOS 风 mockup（owner 认可方向 + 「隐藏滑动边框」一处调整），再用响应式 Tailwind 盲写实现；**最终移动视觉由 owner 真手机 / 窄浏览器验**。桌面路径已 JS-probe 确认无回归。
- **隐藏横滑滚动条（owner 明确要求）**：新 `.lora-scrollbar-hide`（globals，LoRA 作用域）应用到全部 LoRA 横滑带——`LoraSpineBar` 系（flex-wrap 无条不需）、`LoraSourceRecipeStrip`/`LoraSourceImagePreviewStrip`/`LoraHuggingFaceShowcaseStrip`/`LoraLibraryRowDetail` + 结果 filmstrip；iOS 式无条滑动。
- **底部常驻「出图」动作条**：新 `.lora-mobile-actionbar`（globals，LoRA 作用域）——`< md` 固定视口底（模糊玻璃 + `env(safe-area-inset-bottom)` 安全区 + border-top），`≥ md` 退回内联自然流（不双出图）；出图 `flex-1 md:flex-none` 移动端拉宽成拇指区主 CTA，动作按钮 `h-10 md:h-8` 移动端 40px 触控。section 加 `pb-24 md:pb-0` 让内容清过固定条。
- **移动单列序（贴确认 mockup）**：grid 四子加 `order-1/2/3/4 md:order-none`——移动端 = 装配/来源 → composer（参考图/搭配/提示词/参数）→ 结果 → 词库；`md:order-none` 归零后由 grid 显式定位接管（桌面 60/40 不变）。
- 改动：`globals.css`（`.lora-scrollbar-hide` + `.lora-mobile-actionbar`）+ `LoraWorkbench.tsx`（scrollbar-hide + actionbar class + 出图/还原 h + section pb + 四子 order）+ 4 个 strip 组件（scrollbar-hide class）。纯 CSS/className，无逻辑/无 i18n/无新测试。
- 验：full tsc `TSC_EXIT=0` · eslint clean · 定向 vitest **14 文件/119 全绿** · **桌面 JS-probe 确认无回归**（`.lora-mobile-actionbar` `position:static`/`padding:0`、出图 `flex-grow:0`、grid 四子 `order:0` 且结果仍在右 40% 跨行、composer/词库 左列堆叠）。**移动 < 768 视觉待 owner 真机验**（工具无法渲染）。
- 移动端参数/负面折叠、结果大图 sheet 等细节，owner 真机后再收。

### R6 · 助手移动端近全屏 sheet（iOS 风） ✅ 待 owner 真机目验（2026-07-20，owner 拍板「近全屏」，在 R1–R5 commit 之后）

- `LoraAssistantDock` 移动端（`< 1024`）从 `return null` 改成 **vaul `Drawer` 底部 sheet**：`DrawerContent className="top-14 mt-0"` = 顶部留 3.5rem 缺口的**近全屏**（覆盖 drawer 默认 `mt-24`）；自带 iOS 抓手 / 圆角顶 / 遮罩模糊 / **软键盘避让**（`bottom: var(--keyboard-inset)`）/ 下滑关闭 / 触控开场不自动聚焦（不弹键盘，`isTouchPrimary`）。头部 = Bot + `DrawerTitle`(dockTitle) + 分享 + X 关闭（`onOpenChange(false)`）；body 复用桌面同一份 `PromptAssistantPanel {...panelProps}`（懒挂 `hasOpenedOnce`）。
- **断点对齐**：`useIsMobile` = `< MOBILE_BREAKPOINT(1024)`，桌面 `AssistantShell` = `lg:flex(≥1024)` —— 无 768–1024 空档（`< 1024` 走 Drawer，`≥ 1024` 走停靠）。R4 的 `assistantMarginRight` 在移动端本就 0（`!isAssistantMobile` 闸），Drawer 是 portal 覆盖，不冲突。
- 改动：`LoraAssistantDock.tsx`（去移动端 `return null` + 加 Drawer 分支 + 导入 Drawer/X）。纯呈现，复用现有助手能力/panelProps，无 i18n 新键（复用 `dockTitle`/`dockCollapse`）。
- 验：full tsc `TSC_EXIT=0` · eslint clean · workbench 28/28（jsdom `matchMedia` bail → `isMobile=false`，测的是桌面停靠路径，未回归）· 桌面 JS-probe 确认 `[role=complementary]` 仍渲染、`isMobile=false` 无 Drawer（桌面路径未动）。**移动 < 1024 sheet 视觉待 owner 真机验**（浏览器工具视口卡 1920，渲染不出移动 Drawer）。**未 commit**（R1–R5 已 commit `30bef023`，本条待 owner 认可后再提）。

#### 多 LoRA 挂载调查 + UX 修（owner 2026-07-20 真机提问后）

**调查结论（逐段核代码）**：runner **确实按权重应用全部挂载的 LoRA**——`GenerateBranch` 把 `stack.items` 全量写进 `advanced.loras`（无上限/无过滤）→ `submit-image.service` `prepareRunnerLoras` 每把进 R2（失败大声报 502，不静默）→ runner `workflow-builder` 每把建一个 `LoraLoader` 节点链起来带各自权重、无截断。**不还原不是 LoRA 没生效**，而是：① 底模不匹配（配方 `rinFlanimeIllustrious_v40` vs 用户选的 WAI-Illustrious）；② runner 暂不支持 hires/denoise/clipSkip；③ 单手是生成变数/构图。容量：**fal 5 / Replicate 2 / runner 3**（`provider-capabilities.ts`）——云端不止 1 个。关键还原开关 = **做同款**（转发配方精确 checkpointVersionId 给 runner v3 按需下载，`LoraWorkbench.tsx:1197`）。

**owner 拍板四改 + 状态**：

- ① **做同款也挂额外 LoRA** ✅（2026-07-20）：`handleApplyRecipe` 末尾调新抽的共享 `mountExtras(plan.extraLoras)`（与行内「补挂」共用，受容量 + 架构兼容闸约束）——做同款成为真还原一键动作。复验 tsc `exit 0` · lint clean · 定向 47/47（顺带修 G2 漏改的 negative-prompt 测试：thumbnail 现在开共享 modal，close 键改 `sourceRecipeClose`）。
- ② 明示「不匹配 / 不支持」差异 ✅（2026-07-20）：modal generate variant 加琥珀提示 `sourceRecipeRemakeHint`（做同款应用配方提示词/参数/底模并挂额外 LoRA，runner 不支持 hires 等、还原度可能有差）三语；runner 逐项不支持仍在内联面板。lint clean · recipe-strip 2/2。
- ③ 容量按后端真实上限 → **owner 拍板「保持 3」**（2026-07-20）：`MAX_STACK=3` 是刻意产品简化（代码注释 "cap UI at 3 for clarity"），挂载栈**基础模型无关**（从库挂载，与底模选择解耦），改 per-base 会引入「切低容量底模后超容量」态、需动挂载 hook；runner（LoRA 主线）本就是 3。装配行显示已 per-base（G1），够用。**不动 hook**。
- ④ 额外 LoRA 自动挂载改手动 ✅ 已满足：现状本就无静默 auto-mount，`handleMountExtraLora` 是用户点击手动挂；做同款（①）是显式动作。

## Last Verified

- 2026-07-19：根据 owner 已确认的 `lora-library.md`、`lora-generate.md`、LoRA 域契约、现有代码入口与在飞业务文档整理。仅新增交接文档，未修改运行代码。
- 2026-07-19（R1 实现）：Library 桌面单列重构落地，tsc/lint/定向 vitest 三绿 + 真机走查通过；等 owner 目验后再进 R2 与更新 `docs/status.md` / page 文档。
