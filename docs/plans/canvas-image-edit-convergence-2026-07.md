# Task Packet: 画布吸收图片编辑能力

> 设计权力限定（2026-07-19）：本包继续负责图片编辑能力、结果放置、迁移与回归；深炭制片桌、纸卡、石绿等只描述当前 Canvas 实现，不是未来视觉约束。业务收口后另走域级设计确认。

> 状态：**画布总计划下的图片纵向子包；待 Workspace/Surface/Capability seam 完成后启动 I1**（2026-07-13）。总顺序与跨模块边界以 `canvas-modular-redesign-2026-07.md` 为准；本包只拥有六项真实图片编辑能力、图片结果放置与旧编辑页迁移。
> owner 已确认 Haivis 工作区的 UI、CSS 密度与助手交互作为画布重构对标，并授权按最佳专业桌面体验修订旧硬规则；现采用自适应 32/36/44px 命中区，品牌材质与其余 a11y 底线继续成立。本稿不授权删除路由、改 provider 契约或绕过总计划直接施工 UI。

> **Execution status supersedes the planning header (2026-07-14):** the image vertical slice is implemented through runtime-backed editing, layer preview/placement, assistant references, and legacy edit redirect. Remaining checks are owner visual QA and real Fish provider validation.

## Goal

- 将用户可见的“节点编辑”统一命名为**画布**，让 `/studio/node` 成为 PixelVault 的主力高级创作工作区。
- 把现有 `/studio/edit` 中已经可运行的图片编辑能力收进画布对象上下文，最终撤下独立“编辑”导航入口。
- 保留 PixelVault 的语义节点、素材收割、卡匣、助手和生成链路；学习 Haivis 的分栏、CSS 刻度、对象近场工具和助手交互，再翻译进深炭制片桌，不把画布改成通用白板。

## Why Now

- `/studio/edit` 当前是“先选源图 → 再进任务子页”的工具目录，操作完成后与画布编排、素材引用、视频链路脱节。
- 画布已经支持散图上传、素材选择、节点详情、生成结果和持久化，具备承接图片编辑的对象与空间基础。
- `docs/references/ui-inspiration/haivis-canvas-2026-07.md` 提供了适合本项目的交互证据：对象选中态、近场工具条、快捷编辑 prompt、右侧助手引用当前对象。

## Non-goals

- 本轮不为视觉换皮打断当前业务：保留现有深炭制片桌、纸场记卡、石绿选中态用于回归；吞噬/卡匣和 ScriptDoc 的业务与交互契约继续有效。前半句不授权未来改版沿用现有皮肤。
- 不把右侧助手改成属性面板；参数仍遵守“轻编辑靠近节点、重编辑进入详情/专用面板”。
- 不在第一期实现目前只有占位页的对象替换、风格迁移、文字/海报。
- 不在第一期改 provider、计费、权限、数据库 schema 或 Node Workflow 图模型。
- 不直接 404 旧 `/studio/edit` 深链；撤页必须带兼容跳转。

## Task Scene / Type

- UI + product workflow + route migration；后续若新增编辑 lineage/节点契约，再单独拆 architecture/backend 任务包。

## Read First

- `AGENTS.md`
- `CLAUDE.md`
- `docs/WORKFLOW.md`
- `docs/scenes/ui-page.md`
- `docs/brand-dna.md`
- `docs/forbidden.md`
- `docs/references/frontend.md`
- `docs/references/pages/node-canvas.md`
- `docs/plans/canvas-baseline.md`
- `docs/references/ui-inspiration/haivis-canvas-2026-07.md`
- `docs/checklists/ui.md`

## Current Product Facts

### 画布已有基础

- 路由：`/studio/node`；实现入口：`StudioNodeWorkbench` + React Flow。
- 已有：散图上传/粘贴/素材选择、图片节点、节点详情、生成结果 `generationId`、项目持久化、助手 dock、卡匣、添加菜单、选中/拖拽/撤销/重做。
- 当前可见名称仍是“节点编辑 / 节点工作台”，需要三语与 metadata 同步改为“画布”。

### 独立编辑页真实能力

| 能力      | 当前状态 | 现有实现                                       | 画布候选形态                                           |
| --------- | -------- | ---------------------------------------------- | ------------------------------------------------------ |
| 超分辨率  | 可运行   | `/api/image/edit`；2x/4x                       | 图片选中工具条直接动作；结果生成新散图                 |
| 去背景    | 可运行   | `/api/image/edit`；透明图输出                  | 图片选中工具条直接动作；结果生成新散图                 |
| 局部重绘  | 可运行   | `StudioInpaintEditor` + `/api/image/inpaint`   | 工具条进入重编辑面板；画笔/蒙版必须保留大空间          |
| 扩展画布  | 可运行   | `StudioOutpaintEditor` + `/api/image/outpaint` | 工具条进入重编辑面板；结果生成新散图                   |
| 图层分解  | 可运行   | `/api/image/decompose`，返回多层结果           | 先在详情面板预览层；用户选择“铺到画布”后再批量生成散图 |
| 元素提取  | 可运行   | `/api/image/extract`，并自动保存素材           | 近场 prompt/预设；结果生成透明散图并继续保留素材记录   |
| 对象替换  | 占位     | 无可运行 task page                             | 后续统一指令编辑契约，不在第一期露出                   |
| 风格迁移  | 占位     | 无可运行 task page                             | 后续结合 StyleCard/参考图契约，不在第一期露出          |
| 文字/海报 | 占位     | 无可运行 task page                             | 后续先定义文字是否是可编辑对象/图层，不在第一期露出    |

## Proposed Product Model

### 1. 页面与命名

- 用户可见名称：`节点编辑` → **画布**；页面标题：`节点工作台` → **画布**。
- 第一阶段保留内部 route 常量和 `/studio/node` URL，先只改用户心智与导航，避免把命名迁移和功能迁移绑成一次高风险大改。
- 独立“编辑”导航入口在能力迁完并验收后移除。
- `/studio/edit` 与已有 `/studio/edit/<task>` 不直接删除为 404：统一重定向到 `/studio/node`。带 `sourceUrl/generationId/width/height` 的旧链接应把源图导入画布并聚焦；无法迁移的 task 参数给一次性说明，不静默丢失。
- canonical URL 本期锁定保留 `/studio/node`；只改用户可见名称。未来若单独证明 URL 迁移价值，再评估 `/studio/canvas`，且必须保留 `/studio/node` 兼容 redirect。

### 2. 对象与结果

- 编辑目标只允许是**单个图片对象**（散图、镜头图、生成图片）；多选时隐藏破坏性编辑入口并说明仅支持单图。
- 默认**不覆盖源图**。每次成功编辑都生成一个新的图片对象，放在源图右侧，并保留 `generationId/sourceGenerationId`；源对象继续可见。
- 结果动作统一为：`采用结果`、`继续编辑`、`保存/已保存到素材`、`撤销画布放置`。API 已落库的生成记录不伪装成可物理撤回。
- 第一阶段不新增“编辑节点类型”。编辑是一种作用于图片对象的操作，结果仍是图片对象；只有未来需要可重放参数链时，再评估显式 transformation node。

### 3. UI 分层（学习 Haivis CSS 纪律，翻译进 PixelVault 材质）

```text
L0 常驻：画布 + 顶栏 + 现有 CastDock/HUD + 可折叠助手
L1 选中：图片选中框 + 名称/尺寸/来源 + 类型相关工具条
L2 快动作：超分、去背景、下载/保存等一击任务
L3 轻任务：元素提取 / 指令编辑 prompt，贴近对象展开
L4 重任务：局部重绘、扩图、图层分解，进入 NodeDetailPanel 的专用工作区
```

- 不新增第二套底部 dock；图片编辑入口只从选中对象工具条和详情面板出现。
- 工具条第一期顺序：`快速编辑（元素提取）`、`超分`、`去背景`、`局部重绘`、`扩图`、`图层分解`、`更多`。
- 固定显示不超过 5 个动作；窄节点、多语言或小屏下，低频项进入“更多”。关键任务不能只靠 icon，至少有 tooltip + 首次文字标签。
- 快动作运行时在源节点上显示明确进度；完成后新结果节点进入视野并短暂高亮。失败在源节点和 toast 同时大声暴露。
- 助手引用当前图片时显示可移除 chip；助手只能发起已注册 capability，不复制一套独立编辑实现。
- 移动端不保留横向悬浮长工具条，改用 `ResponsivePopover/ResponsiveDialog` 对应底部抽屉。

### 4. Haivis 对齐基线（owner 已确认）

详细实测证据见 `docs/references/ui-inspiration/haivis-canvas-2026-07.md`。施工图必须体现：

- **空间**：桌面默认是画布 `minmax(0,1fr)` + 助手固定列；助手收起时列宽动画到 0，画布同步获得空间。默认态不再用浮动 overlay 压住节点。
- **助手 chrome**：全高、单分隔线、无 backdrop blur、无重投影；PixelVault 用纸笺材质翻译，不复制纯白。
- **密度**：域内文字 14/20、辅助字 12/16；控制条 44px、外圆角 12px、内圆角 8px。不得全局修改 root font-size。
- **浮层**：常驻控制 / 小菜单 / 对象任务面板只保留三档层级和阴影；同一时刻最多一个同类临时层。
- **对象上下文**：选中图片才出现工具条；快捷编辑打开后长工具条暂退；对象管理动作进入“更多”。
- **动效**：Haivis 的 300ms 分栏轨道翻译为项目现有 `duration-slow` 320ms + `ease-standard`；不引入新任意时长。
- **命中区**：采用 `compact=32px`、`default=36px`、`touch=44px` 三档；任何 pointer 目标不得低于 24px。Haivis 26–27px 头部目标提升到 32px，composer 的 32px 桌面目标可保留。

### 5. 画布助手与 Studio Image 助手的对应

两边共享视觉原语，不合并业务状态：

| 层             | 共享 shell                           | 画布专属                                     | Studio Image 专属             |
| -------------- | ------------------------------------ | -------------------------------------------- | ----------------------------- |
| Header         | 会话名、新建、历史、分享、收起       | ScriptDoc 展开/恢复                          | 无 ScriptDoc                  |
| Message stream | 用户/助手消息、结果媒体、错误/运行态 | 节点引用、聚焦节点、应用变更确认             | 提示词改写/风格提取结果       |
| Composer input | 多行输入、引用 chip、发送            | 当前选中节点/素材 chip                       | 当前参考图 chip               |
| 左侧工具       | 添加上下文、workflow skills          | 剧本大纲/角色与画风/阶段工作流               | 图片风格/详细/LoRA/标签工作流 |
| 右侧工具       | 推理模式、模型/route                 | `CanvasAssistantRouteSelector`、应用前先询问 | API route、回复语言、联网搜索 |

边界：

- 历史对话需要真实会话持久化；分享需要权限/只读链接契约。两者未落地前不得仅添加空按钮。
- “Skills”翻译成 PixelVault 已有 workflow/快捷路线，不复制 Haivis 的亚马逊/品牌模板。
- Haivis 的“Agent”实际是图像/视频模态；PixelVault 使用真实的“输出类型/任务”命名，固定域页面可不显示。
- 推理模式和自动模型只在后端真实支持、最终 route 可追溯时出现。

### 6. 当前助手实现边界与先修风险

代码审查确认，两个助手目前只能共享视觉骨架，不能直接合并业务 hook：

- **Node 助手**：流式文本、节点摘要/引用、route、BYOK、research、ScriptDoc 与应用确认；当前是 text-only，没有图片附件、视觉理解、编辑工具执行、历史或分享。
- **Studio 助手**：image/video/audio 共用的非流式 prompt 助手，支持一张参考图、语言、route、research、填入/追加/复制；不执行图片编辑，刷新后会话丢失。
- **可共享地基**：`ui/prompt-input.tsx`、`ImagePickerPopoverBody`、`MainModelPicker`、`QuickSetupDialog`、ResponsiveDialog/Popover、motion token；新增 shell 必须用 slots/CSS variables 换皮。
- **不可共享边界**：`useAssistantConversation` / `usePromptAssistant`、消息领域类型、API/service/system prompt、ScriptDoc 与 Studio prompt 写回动作。

施工前必须先消除四个会话正确性风险：

1. Node API schema 在服务层截断前就限制最多 16 条消息，长到约第 9 轮可能直接 400；客户端请求必须先构造最多 16 条、保持 role pair 完整的 replay window，完整历史与模型上下文窗口分离。
2. Node `retry()` 当前会再次 append 最后一条 user turn；重试必须复用原请求，不得制造重复历史。
3. Node 会话没有稳定 `projectId` 隔离；切项目可能带旧消息、却注入新项目节点上下文。会话 key 必须包含 `projectId`。
4. Studio prompt assistant 当前是 image/video/audio 共用 singleton；目标选择**按 modality 隔离会话**，未来历史入口可跨模态筛选，但输入上下文不得串台。

历史/分享、Node 真正看图、助手执行去背景等 capability 都是独立业务片，不能借 shell 重构顺带伪造。

## Capability Contract Before UI

后续施工前先把现有编辑任务从“路由目录”抽成共享 capability registry，避免画布复制 `EDIT_TASKS` 的静态展示逻辑：

```ts
type CanvasImageEditCapability = {
  id: EditTaskKind
  availability: 'ready' | 'hidden'
  interaction: 'instant' | 'prompt' | 'mask' | 'outpaint' | 'layers'
  input: { minImages: 1; maxImages: 1 }
  output: 'single-image' | 'image-layers'
  models: readonly string[]
  defaultModelId: string | null
}
```

- registry 是 UI、参数面板和执行路由的共同事实源；provider/model 仍沿用现有 allowlist 与服务端校验。
- `availability=hidden` 对应当前三个占位能力，遵守“不支持不渲染”。
- 自动模型只有真实存在、可解释且结果能追溯最终模型时才显示。

## Delivery Slices

> **Execution update (2026-07-14):** C1/C1a/C1b are covered by the shared assistant shell, conversation persistence/share, and capability runtime. C2/C3/C4 image capabilities use the runtime; C5 has preview → select → place with one undo; C6 deletes the old edit shells and keeps `/studio/edit` compatibility redirect. C7 (object replace, style transfer, text/poster) remains a follow-up.

### C0 · 拍板与基线

- ✅ owner 已拍板 Haivis UI/CSS/助手交互为对标输入，并授权按最佳方案锁定“页面/命名、结果不覆盖、工具条分层、旧路由策略”四项。
- Claude 输出同屏概念稿：画布默认态 / 图片选中态 / 快捷编辑 / 助手收起与展开 / Studio Image 助手对应态；沿用 PixelVault 暖炭、纸笺与石绿，不复制蓝紫选中色。
- 为当前 `/studio/node` 保存桌面/移动视觉基线，记录在飞 S5/S6 冲突文件。

### C1 · 图片 capability 地基（依赖总计划 W0/O1/E1）

- 三语导航、metadata、空态和页面内“节点工作流”用户文案改为“画布”；技术类型名、数据库名、API 名暂不改。
- 抽取共享 capability registry 与执行适配层；现有 `/studio/edit` 继续可用，作为回归参照。
- 增加“选中单图片对象”的上下文模型与工具条骨架，不接真实调用。

### C1a · Assistant shell 对接（跨线依赖，由总计划 W1/AS1 拥有）

- 本图片子包不抽取全局 assistant shell；由总计划 W1/AS1 交付 shell/header/composer/reference-chip/menu primitives，Node 与 Studio Image 继续持有各自 hook、请求、消息 schema 与业务控制。
- Node 默认 dock 改为稳定 grid 列；收起后列宽归零并保持会话 mounted；expanded ScriptDoc 双栏继续保留。
- 统一 header 与 composer 空间语法；先接现有能力，新建/route/引用/发送/收起必须回归可用。
- 历史与分享先写独立产品/后端子任务；没有真实数据与权限契约时不进入本 UI 片。

### C1b · 会话正确性先修（跨线依赖，由总计划 AS1 拥有）

- Node 请求发送前建立 16 条以内的成对 replay window；补长会话不会 400 的契约测试。
- 修复 retry 重复 user turn；用稳定 `projectId` 隔离 Node 会话，切项目时不得串消息。
- Studio prompt 会话按 image/video/audio modality 隔离；共享 UI 不共享 singleton conversation。
- 这片只修正确性与隔离，不引入历史数据库、分享权限或新的多模态 provider 契约。

### C2 · 两个低风险快动作

- 迁移超分、去背景。
- 成功结果生成新散图并落在源图右侧；失败、重复点击、额度/API key、项目刷新均可验证。
- 这是首个端到端 vertical slice，用来验证 lineage、放置与状态反馈。

### C3 · Prompt 型编辑

- 迁移元素提取；近场 prompt/预设面板明确当前文件名。
- 保持“自动保存素材”现有语义，同时在画布生成透明散图。
- 若要增加通用“快速编辑”，必须先有真实 instruction-edit API 契约；不得拿对象替换占位页冒充。

### C4 · 重编辑工作区

- 迁移局部重绘与扩图，复用 `StudioInpaintEditor` / `StudioOutpaintEditor` 的核心编辑器，不复制业务逻辑。
- 重编辑使用专用大面板/全屏 ResponsiveDialog；画布仍可感知但不与蒙版操作争夺指针。

### C5 · 图层分解

- 迁移 decompose；结果先在专用面板预览与选择。
- 默认不把所有层自动炸到画布；用户点击“铺到画布”后，按原图位置附近整齐排布所选层。
- PSD 下载/层素材保存沿用现有结果能力；批量节点创建要支持一次 undo。

### C6 · 撤下独立编辑页

- 删除侧栏与移动端“编辑”入口。
- `/studio/edit` 及子路由改兼容 redirect；图库/结果页的“在 Studio 编辑”链接改为画布导入链接。
- 删除只服务旧页面壳/任务网格/占位页的代码；共享编辑器、API client、hooks 与服务端 route 保留。
- 同步三语、routes、测试、docs/status；完成后归档或删除本任务包。

### C7 · 后续能力（另立项）

- 对象替换、风格迁移、文字/海报先做 provider/API 与数据模型确认，再决定是 prompt capability、StyleCard 引用还是可编辑文本对象。
- 若需要“可重放编辑历史”，另立 transformation graph/lineage 方案，不塞进 C1–C6。

## Ownership Split

- **Claude / Fable → Sonnet**：C0 概念稿、选中态/工具条/面板 IA、响应式与全部 UI 实现；按现行规则画布域由 Claude 端到端负责。
- **Codex**：capability registry、执行适配、lineage/结果放置业务逻辑、路由兼容、服务端/API 契约与测试；不单独重构画布视觉。
- 混合片每片先写 task packet，明确允许文件与并行冲突，避免碰当前 S5/S6 在飞文件。

## Allowed File Scope（本轮调查与规划）

- `docs/plans/canvas-image-edit-convergence-2026-07.md`
- `docs/references/ui-inspiration/**`
- `docs/references/pages/node-canvas.md`、`docs/plans/canvas-baseline.md`
- `docs/brand-dna.md`、`docs/checklists/ui.md`、`docs/scenes/ui-page.md`、`docs/references/frontend.md`
- `docs/status.md`

## Forbidden File Scope（本轮调查与规划）

- `src/**`
- `prisma/**`
- `.claude/**`
- CI / git hooks

## Five Intake Answers / Locked Decisions

1. **结果**：一个统一“画布”，可在图片对象上直接生成、编辑、拆分与继续编排；独立编辑导航最终消失。
2. **事实源**：`StudioNodeWorkbench` / `src/types/node-workflow.ts` / `src/constants/edit-tasks.ts` / `src/components/business/studio/edit/**` / `/api/image/*`。
3. **必须不变**：现有画布数据、S5/S6 交互、助手定位、provider/计费/权限、旧项目可加载。
4. **完成证据**：6 项真实能力在画布可完成；结果是新对象且 lineage 正确；刷新不丢；旧编辑链接不 404；桌面/移动/i18n/visual 全过。
5. **文档同步**：本轮已更新 inspiration、画布施工图、全局 UI 命中区规则与 `status.md`；施工中继续覆盖状态，完成后归档/删除本包。

owner 授权“做最优选择”后锁定：

- A. **只改用户可见名称为“画布”**；canonical URL 暂留 `/studio/node`，避免同时引入 bookmarks、i18n routes、analytics 与外部深链迁移。`/studio/canvas` 另立无业务价值证明前不做。
- B. **编辑结果一律创建新对象，不覆盖源图**；保留 lineage、可撤销和对比基础。
- C. **第一期只迁 6 个真实能力，3 个占位能力完全隐藏**；不把 disabled 菜单当路线图。
- D. **图层分解先预览/选择，再由用户铺到画布**；避免一次生成大量对象破坏空间与 undo。

## Acceptance Criteria

- 选中单个图片对象才显示图片编辑工具；切换到视频/音频/多选时工具准确消失或降级。
- 超分、去背景、元素提取、局部重绘、扩图、图层分解复用现有服务能力，无重复 provider 路由。
- 每次成功编辑创建可追溯的新图片对象；源图不被静默替换。
- loading/error/额度不足/API key 缺失均在当前对象上下文可见。
- `/studio/edit` 旧入口在撤页后仍有清晰兼容路径；外部/历史链接不 404。
- en/ja/zh、键盘、自适应命中区（fine 32/36、coarse 44）、reduced motion、375/768/1024/1440 视口均通过 UI checklist。

## Validation / Evidence

- 机械：`npm run lint`、全量 `tsc`、相关 Vitest、i18n completeness。
- 浏览器：owner 的 3000 实例直接复用；逐项实跑 6 个编辑任务，验证网络请求、结果节点、刷新持久化、撤销与错误态。
- 视觉：画布桌面与移动专属快照；明确更新哪些 intentional baseline。
- 迁移：逐个访问 `/zh|en|ja/studio/edit` 与 9 个子路由；验证 redirect、源图 query 导入与说明文案。

## Documentation Sync

- 已把 owner 确认的 Haivis 对标、稳定分栏/assistant shell 边界与响应策略沉淀到 `docs/references/pages/node-canvas.md`。
- 已把 44px 一刀切修订为 32/36/44px 自适应规则，并同步 UI 规则链；已在 `docs/status.md` 记录本任务包仍处规划态、未改产品代码。

## Source of Truth

- 参考方法：`docs/references/ui-inspiration/haivis-canvas-2026-07.md`
- 画布契约：`docs/references/pages/node-canvas.md`、`docs/plans/canvas-baseline.md`
- 当前 UI：`src/components/business/node/StudioNodeWorkbench.tsx`、`StudioNodeAssistantDock.tsx`、`AssistantConversation.tsx`、`src/components/business/studio-shared/chrome/StudioAssistantDock.tsx`、`src/components/business/prompts/PromptAssistantPanel.tsx`、`src/components/business/studio/edit/**`
- 当前能力：`src/constants/edit-tasks.ts`、`src/app/api/image/**`

## Last Verified

- Date: 2026-07-13
- Method: 只读核对 `/studio/node`、`/studio/image`、`/studio/edit` 及 9 个子路由、两套助手与现有编辑任务组件/API；在 Haivis 登录页实时读取 DOM/computed style 并可逆打开 header/composer/对象菜单；未发送消息、未运行生成、未改产品代码。
