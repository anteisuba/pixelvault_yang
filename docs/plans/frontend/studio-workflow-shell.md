# PixelVault 前端执行计划：Studio Workflow Shell for Balanced 8

> Last updated: 2026-04-22
> Status: ready for `前端`
> Owner thread: `前端`
> Scope: 先把 Studio 主入口改成 workflow-first shell，不等于一次做完全部工作流深逻辑

## Why This Plan Exists

产品主线已经收敛为：

`用户目标 -> 工作流 -> 编译策略 -> 执行系统 -> 结果资产`

但当前 Studio 仍然主要按这些入口组织：

- `image / video / audio`
- quick / card
- route / model selection

这对内部能力是合理的，对普通用户不是最佳入口。

这份计划的目标不是重做整套 Studio，而是先在现有 Studio shell 上完成一次抽象上移：

- 主入口从“媒体模式 / 模型选择”改成“用户想做什么”
- 当前 `Balanced 8` 成为 Studio 第一层可见入口
- 现有 route / model / quick-card 逻辑后移到 advanced path，而不是被直接删除

## Task Packet

### Goal

- 把 Studio 改成 workflow-first shell
- 把 `Balanced 8` 映射成第一层可见工作流入口
- 保留现有 image / video / audio 生成能力，避免大规模回归

### Non-goals

- 不在这一轮一次做完所有 Wave 1.5 / Wave 2 workflow
- 不在这一轮重写 `useUnifiedGenerate`
- 不在这一轮重写整个 Studio layout
- 不在这一轮删除 quick / card / route selector / model selector
- 不在这一轮把 Cloudflare realtime 体验提前压进前端

### Read First

- `01-UI/02-現狀映射.md`
- `04-UI測試/02-現狀映射.md`
- `docs/progress/current-status-audit.md`
- `docs/tooling/ai-context.md`
- `docs/plans/product/media-workflow-catalog.md`
- `docs/plans/product/media-workflow-public-naming.md`
- `docs/plans/frontend/studio-feature-map.md`
- `src/components/business/studio/CLAUDE.md`
- `src/hooks/CLAUDE.md`
- `src/contexts/CLAUDE.md`
- `src/app/[locale]/(main)/studio/page.tsx`
- `src/components/business/StudioWorkspace.tsx`
- `src/components/business/studio/StudioTopBar.tsx`
- `src/components/business/studio/StudioSidebar.tsx`
- `src/components/business/studio/StudioCanvas.tsx`
- `src/components/business/studio/StudioBottomDock.tsx`
- `src/contexts/studio-context.tsx`
- `src/hooks/use-unified-generate.ts`

### Allowed File Scope

- `src/constants/**` 中与 workflow catalog / Studio entry 直接相关的文件
- `src/components/business/StudioWorkspace.tsx`
- `src/components/business/studio/**`
- `src/contexts/studio-context.tsx`
- `src/hooks/use-unified-generate.ts`，仅当 UI shell 需要最小编排补充
- `src/lib/**` 中与 workflow preset / selector mapping 直接相关的文件
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`
- `src/app/[locale]/(main)/studio/page.tsx`，如页面 metadata 或 layout 入口需要最小改动

### Validation

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/contexts/studio-context.test.ts`
- `npx vitest run src/hooks/use-unified-generate.test.ts`
- `npx vitest run src/components/business/studio/StudioInputImage.test.tsx src/components/business/studio/StudioVariantsGrid.test.tsx`
- 为新增 workflow shell 组件补测试
- 手工 smoke checklist：
  - desktop Studio
  - mobile Studio
  - image / video / audio 切换
  - i18n 文案
  - advanced path 可达

### Definition of Done

- Studio 第一层入口不再只围绕 model / route / quick-card
- `Balanced 8` 有明确可见的 workflow-first entry
- 现有 image / video / audio 生成主链路仍可达
- advanced path 仍保留 route / model 细粒度控制
- 新增文案全部 translation-ready

### Layers Changing

- `constants`
- `components/business`
- `contexts`
- `hooks`，仅最小必要范围
- `messages`

### Affected Map Entries

- `01-UI/02-現狀映射.md`
  - Studio shell
  - Studio top bar / sidebar / canvas / dock
- `04-UI測試/02-現狀映射.md`
  - Studio component coverage
  - loading / empty / panel state regression risk

## Current Slice Reality

### What the code already has

直接代码检查显示，当前 Studio 已经不是旧版“单页表单”：

- `StudioWorkspace.tsx` 已经是统一 shell
- `studio-context.tsx` 已拆成 `Form / Data / Gen` 三个 context
- `StudioTopBar.tsx` 已在顶部提供 image / video / audio toggle
- `StudioCanvas.tsx` / `StudioBottomDock.tsx` / `StudioGallery.tsx` 已形成稳定 workbench 骨架

这意味着本计划不该再做一次“从零搭 Studio”。

### What is still missing

- 用户第一眼看到的仍是 mode / route / model 语义，而不是 workflow 语义
- quick / card 是创作方法，不应该继续担任产品第一层入口
- `Balanced 8` 已在产品层确定，但前端还没有一层对应的 IA
- `studio-feature-map.md` 仍保留部分较旧的 video entry 描述，执行时以直接代码为准

## Product Mapping Target

这轮前端只负责把第一层入口改对，不负责把每个 workflow 的深层逻辑全部做完。

### Wave 1 / Balanced 8

#### 图片

- 快速出图
- 动漫插画
- 角色一致图
- 改图 Remix
- 海报排版

#### 视频

- 电影短片
- 角色转视频

#### 声音

- 配音旁白

## Design Constraints

### Constraint 1

不要把现有 `outputType`、`workflowMode`、`selectedOptionId` 这些内部状态直接删掉。

这一轮应做的是：

- 上层增加 workflow 选择
- 下层继续复用现有生成壳

### Constraint 2

不要一开始就把每个 workflow 做成完全独立页面。

当前更合适的是：

- 同一个 Studio route
- 同一个 shell
- 不同 workflow 驱动不同默认状态、默认面板、默认 copy 和默认工具暴露

### Constraint 3

不要把“对普通用户友好”误解为“完全隐藏高级能力”。

这轮应保留一个 advanced path：

- route selection
- model selection
- quick / card
- provider-specific advanced controls

只是它们不再是第一眼入口。

## Execution Strategy

## Phase 1 — Add Workflow Fact Layer

先加 workflow 自身的前端事实层，不要直接把产品文档硬编码进组件。

### Deliverables

- 新增 `src/constants/workflows.ts` 或等价文件
- 定义稳定的 workflow ID
- 为每个 workflow 声明：
  - `mediaGroup`
  - `launchTier`
  - `defaultOutputType`
  - `publicNameKey`
  - `descriptionKey`
  - `advancedModeAllowed`
- 提供从 workflow 到现有 Studio state 的 mapping helper

### Guidance

- workflow constants 由 `前端` 线程拥有
- 不要把 workflow copy 散落在组件里
- 不要让后续后端 slice 来回修改同一套前端 workflow 常量

## Phase 2 — Add Workflow Selection State To Studio

在 `studio-context.tsx` 中加入 workflow 选择，但不拆掉现有状态骨架。

### Recommended state additions

- `selectedWorkflowId`
- 可选：`isAdvancedMode`

### Expected behavior

- workflow 选择驱动 `outputType`
- workflow 切换时可同步默认 panel / default mode / default helper copy
- `quick / card` 变成某些 workflow 的内部工作方式，而不是顶层产品分类

### Important rule

不要把 `selectedWorkflowId` 和 `outputType` 设计成互相打架的双真相。

推荐做法：

- workflow 是第一层真相
- `outputType` 保留为派生后仍可直接使用的执行态

## Phase 3 — Build Workflow-First Entry Shell

这一步才动主要可见 UI。

### Minimum visible change

- 顶部或侧边第一层先选媒体组：
  - 图片
  - 视频
  - 声音
- 第二层展示该组下的 workflow 入口
- 当前激活 workflow 在 shell 中有清晰高亮和一句话说明

### Recommended component additions

- `StudioWorkflowPicker.tsx`
- `StudioWorkflowGroupTabs.tsx`
- `StudioWorkflowSummary.tsx`

名称可调整，但职责不要混。

### Recommended reuse

- 复用 `StudioWorkspace.tsx` 作为 shell 入口
- 复用 `StudioCanvas.tsx`
- 复用 `StudioBottomDock.tsx`
- 复用 `StudioGallery.tsx`
- 复用 `StudioSidebar.tsx` 的 project / history / API key 区域

### Components most likely to change

- `StudioTopBar.tsx`
- `StudioSidebar.tsx`
- `StudioPromptArea.tsx`
- `StudioToolbarPanels.tsx`
- `StudioQuickRouteSelector.tsx`

## Phase 4 — Map Each Workflow To Existing Capabilities

这一步不是“实现所有 workflow 深逻辑”，而是保证每个 workflow 都能落到现有能力上。

### Image workflows

- 快速出图
  - 默认走当前 quick image 路径
- 动漫插画
  - 仍走 image shell，但给出更偏动漫插画的 route / model 推荐
- 角色一致图
  - 默认强调 reference image、多参考、card 和一致性相关工具
- 改图 Remix
  - 默认强调 reference image / edit / remix affordance
- 海报排版
  - 默认强调文字感、排版感、设计模型推荐

### Video workflows

- 电影短片
  - 默认走现有 video flow
- 角色转视频
  - 默认强调 reference image / identity preservation / character-assisted setup

### Audio workflow

- 配音旁白
  - 默认走现有 audio flow
  - 把 voice selector / voice trainer 作为更靠前工具

### Important boundary

如果某个 workflow 还没有真正的一等能力闭环，这一轮可以先做到：

- 有稳定入口
- 有正确文案与默认工具
- 可落到最接近的现有执行路径

不要为了“名字对应”硬造假功能。

## Phase 5 — Demote Old Entry Concepts To Advanced Path

这一步决定 Studio 是否真的完成抽象上移。

### Should remain available but de-emphasized

- route selector
- model selector
- quick / card toggle
- provider-specific advanced params

### Suggested entry points

- sidebar secondary section
- advanced drawer / sheet
- workflow summary 区里的 “高级设置”

### Explicit anti-goal

不要把旧入口藏到不可发现，也不要继续把它们放在第一视觉层。

## Phase 6 — i18n, Mobile, And Regression Polish

这一阶段必须做，因为 `04-UI測試` 已明确 Studio 是高风险区。

### Required checks

- 新增 workflow 名称和说明进入 `en / ja / zh`
- mobile 下 workflow picker 不要过挤
- shell 首屏空态要清楚
- current workflow 切换时，prompt / panel / preview 的保留策略要一致
- audio mode 不要因为 image/video shell 改造被挤到边缘状态

## File Ownership Guidance For `前端`

为避免和 `后端` 线程冲突，这一轮前端优先拥有：

- `src/constants/workflows.ts` 或等价前端 workflow 常量
- `src/components/business/StudioWorkspace.tsx`
- `src/components/business/studio/**`
- `src/contexts/studio-context.tsx`
- `src/messages/**`

这一轮不要主动改：

- `src/app/api/**`
- `src/services/generate-audio.service.ts`
- `src/services/generate-video.service.ts`
- `workers/execution/**`

如果前端在实现中发现 API contract 不够支撑，应回传 `探索` 或与 `后端` 对齐，不要自行改后端 contract。

## Recommended Order For `前端`

执行顺序建议固定为：

1. workflow constants + i18n keys
2. context state + mapping helper
3. workflow picker shell
4. old entry demotion to advanced path
5. regression tests + mobile polish

不要先改视觉，再补状态模型。

## Open Questions Already Resolved By This Plan

### Should the first visible cut still lead with model names?

No.

模型和 route 依然存在，但它们应该后移。

### Should quick / card remain a top-level product split?

No.

它们是工作方式，不是用户目标。

### Should frontend wait for Cloudflare execution before changing Studio IA?

No.

Workflow shell 可以先于 Cloudflare execution 落地。
前端只需要保留当前 submit/status 路径兼容即可。

## Handoff Checklist For `前端`

- 第一刀先改入口结构，不先碰深层生成逻辑
- 每改一个 workflow entry，都明确它落到现有哪条能力路径
- 任何新增可见文案都必须同步 `en / ja / zh`
- 任何新增 panel / workflow state，都要更新 `studio-context` reducer 和测试
- 实装完成后，把变动回传 `探索`，并用 `01-UI` + `04-UI測試` 做独立 review

## Review & 回流

### Phase 1 Diff Review — 2026-04-24 (Claude Code)

**Verdict**: Pass

**Scope reviewed**:

- `src/constants/workflows.ts`（新建）
- `src/messages/{en,ja,zh}.json` — 三语 `workflows.*` namespace 追加（+40/-3 per file，-3 来自 JSON 尾部闭合调整，非内容删除）

**合规检查**:

- 所有改动都在 packet 的 Allowed Scope 内 ✓
- 未改 `studio-context.tsx`、`components/**`、`hooks/**`、`services/**`、`app/api/**`、`types/index.ts` ✓
- `as const` + 推导类型，无重复 interface ✓
- Balanced 8 精确 8 条，命名与 `media-workflow-public-naming.md` 对齐 ✓
- i18n key 命名 `workflows.<ID>.{name,description}` 三语对齐 ✓
- tsc + lint + vitest (74 files / 593 tests) 全绿 ✓

**Findings（均 non-blocking，留给 Phase 2+ 处理）**:

- **F1 (P3, confidence 6/10)** · 当前所有 8 条 workflow 的 `defaultOutputType === mediaGroup`，字段暂时冗余。plan 本意是这俩要解耦（比如未来 "海报排版" 可能 mediaGroup=image 但 output 带设计稿预览）。Phase 2 接入 StudioContext 时如果还观察不到差异，考虑合并；否则保留。
- **F2 (P4, confidence 7/10)** · 8 条 workflow 全部 `advancedModeAllowed: true`。统一值通常意味着字段还没在驱动任何分支逻辑。Phase 5（demote old entry to advanced path）时验证是否每一条都该允许；如果"快速出图"目标是给完全新手用，可能该设 false。

**回流动作（已执行）**:

- 01-UI / 04-UI測試 — 无变更（本 Phase 无 UI 表面，`workflows.ts` 是数据层，待 Phase 2 接入 StudioContext 后再回流）
- 02-功能 / 03-功能測試 — 无变更（本 Phase 纯前端常量 + i18n）

**下一刀 Phase 2 建议**：

- 在 `studio-context.tsx` 加 `selectedWorkflowId` state + `getWorkflowStudioDefaults(workflowId)` 驱动 `outputType`
- 不要把 `selectedWorkflowId` 和 `outputType` 做成双真相（plan Constraint 1）
- 先写 context test，再接 UI

### Phase 2 Diff Review — 2026-04-24 (Claude Code)

**Verdict**: Pass

**Scope reviewed**:

- `src/contexts/studio-context.tsx`（新增 `selectedWorkflowId` state、`SET_SELECTED_WORKFLOW_ID` action、`setSelectedWorkflowId` / `getSelectedWorkflow` 暴露在 context value）
- `src/contexts/studio-context.test.ts`（2 条 reducer 纯函数测试新增 + `makeInitialState` helper 补字段）
- `src/contexts/studio-context.test.tsx`（新建，5 条 provider/hook 集成测试）

**合规检查**:

- 核心文件 `studio-context.tsx` + 新建 `.test.tsx` 在 Allowed Scope 内 ✓
- `.test.ts` 虽未显式列入 packet 的 Allowed Scope，但因为 reducer 的 `SET_SELECTED_WORKFLOW_ID` 新增 + `StudioFormState` 接口扩字段，已有 reducer test 的 `makeInitialState` 必须补 `selectedWorkflowId` 否则 TS 直接报错——**属于合理连带修改**，不算擅自扩 scope
- `components/**`、`hooks/**`、`services/**`、`messages/**`、`app/api/**`、`types/index.ts` 零修改 ✓
- 现有 `outputType` setter（`SET_OUTPUT_TYPE`）保留，未删除 ✓
- workflow 切换驱动 outputType、但手动 override 仍可覆盖：不是双真相，而是 workflow 是 trigger、outputType 是可独立操作的执行态 ✓
- `useCallback` 把 setter 稳定化，`useMemo` deps 正确包含新增 ref ✓

**Findings（均 P3-P4，非阻塞）**:

- **F1 (P3, confidence 7/10)** · test 4 揭示 workflow 和 outputType 可**暂时不一致**。packet 接受；但 Phase 5（demote old entry to advanced path）必须回来决定：是允许发散，还是要求 `SET_OUTPUT_TYPE` 必须走"高级模式 opt-in 守护"
- **F2 (P4, confidence 9/10)** · 所有 8 条 workflow 的 `defaultOutputType === mediaGroup`，`getWorkflowStudioDefaults` 只返回 `{outputType}`。Phase 3-4 扩展 helper return shape（+default panel / mode / helper copy）时要处理上游消费方向后兼容
- **F3 (P4, confidence 8/10)** · context value 同时暴露 `dispatch` 和 `setSelectedWorkflowId`，consumer 可绕过 helper 直接 dispatch。Phase 3 接 UI 时应写入 `src/contexts/CLAUDE.md`: "UI 组件一律用 `setSelectedWorkflowId`，不直接 dispatch"
- **F4 (P4, confidence 7/10)** · `studio-context.test.tsx` 的 10 个 `vi.mock` 就是 `StudioDataContext` 注入链路最小集合。Phase 3 加依赖 hook 时这里的 mock 阵列也要跟着加

**回流动作（已执行）**:

- 04-UI測試/4.2 用戶交互 — 更新 `studio-context.test.ts` 测试数（+2 reducer case，总 38 条）+ 新增 `studio-context.test.tsx`（5 provider/hook case）
- 01-UI / 02-功能 / 03-功能測試 — 无变更（本 Phase 纯 context state + 纯前端逻辑）
- Phase 2 标记 **完成**

**下一刀 Phase 3 建议**：

- 引入 `StudioWorkflowPicker.tsx` / `StudioWorkflowGroupTabs.tsx` / `StudioWorkflowSummary.tsx`，接 `selectedWorkflowId` + `setSelectedWorkflowId`
- 顶部第一层改成 media group (图片 / 视频 / 声音) tabs，第二层是该组下的 workflow cards
- 现有 `StudioTopBar` 的 image / video / audio toggle **保留**但降级到 advanced path
- i18n 消费 `publicNameKey` / `descriptionKey` 时加 fallback（key 不存在时显示 id），避免下个 Wave workflow 时产生 i18n 空白
- Phase 5 再看 F1 的双真相取舍

### Phase 3 Diff Review — 2026-04-24 (Claude Code)

**Verdict**: Pass

**Scope reviewed**:

- 新建 `src/components/business/studio/StudioWorkflowGroupTabs.tsx`（93 行）+ `.test.tsx`（60 行）
- 新建 `src/components/business/studio/StudioWorkflowPicker.tsx`（81 行）+ `.test.tsx`（66 行）
- 新建 `src/components/business/studio/StudioWorkflowSummary.tsx`（32 行）+ `.test.tsx`（54 行）
- `src/components/business/StudioWorkspace.tsx`（单处 17 行插入，在 `<StudioTopBar />` 下方渲染新 workflow 条带）

**合规检查**:

- 所有改动都在 packet Allowed Scope 内 ✓
- `studio-context.tsx` / `studio-context.test.{ts,tsx}` 零改动（Phase 2 已定，本 Phase 只消费）✓
- `StudioTopBar.tsx` 零改动，现有 image/video/audio toggle 保留原位（packet 的"并存"要求）✓
- `src/constants/workflows.ts` / `src/messages/**` / `src/hooks/**` / `src/services/**` / `src/app/api/**` / `src/types/**` 全部零改动 ✓
- 3 个新组件职责不混：GroupTabs 只改本地 tab 展开态不调 context、Picker 负责 setSelectedWorkflowId、Summary 只读 getSelectedWorkflow ✓
- 设计语言符合 CLAUDE.md：米白 `bg-background`、accent 走 `primary/5` + `primary/50`、`font-display` (Space Grotesk heading) + `font-serif` (Lora body)、fade-in + translate-up 500ms ease-out 动画 ✓
- shadcn primitives 复用：`Tabs / TabsList / TabsTrigger` + `Card / CardContent`，未造新 UI 原子 ✓
- a11y：workflow card `aria-pressed={selected}` + `data-selected`；summary fallback `aria-live="polite"` ✓
- 响应式：cards 在 mobile `overflow-x-auto`，sm 起 grid 2→lg 3→xl 5 列 ✓

**Findings（均 P3-P4 非阻塞）**:

- **F1 (P3, confidence 7/10)** · `StudioWorkflowGroupTabs` 用 render-prop `children?: (currentMediaGroup) => ReactNode` 把 tab 状态传给 parent 组合 Summary + Picker。设计上 OK，但意味着**任何想复用 tab 状态的地方必须用 render-prop**。如果 Phase 4/5 需要在其他位置观察 tab state，要么把 tab state 上移到 context，要么接受 render-prop 的包裹嵌套。Phase 3 不处理
- **F2 (P3, confidence 8/10)** · `StudioWorkspace.tsx` 的插入块用了 `mx-auto grid w-full max-w-6xl` 做容器。此前 Studio 顶部可能没用 `max-w-6xl` 限宽，新 workflow 条带的宽度会在超宽屏上和下方 canvas/dock 的宽度**视觉不对齐**。**建议 Phase 4 接 capability mapping 前先做**：要么把新条带也包在 `StudioResizableLayout` 或类似布局下、要么统一对齐策略
- **F3 (P4, confidence 9/10)** · `StudioWorkflowGroupTabs` 用 `useTranslations('StudioPage')` 消费 `modeImage / modeVideo / modeAudio`，而 Picker / Summary 用 `useTranslations()` 消费 `workflows.*`。两种消费风格并存，对后续扩展工作流文案的人要先知道这个分治。可接受但值得在 `components/business/studio/CLAUDE.md` 里留一行说明
- **F4 (P4, confidence 8/10)** · Summary fallback 直接显示 `selectedWorkflowId`（原始 SCREAMING_SNAKE id）给用户看会很丑。真实触发条件：`getWorkflowById` 返回 undefined——只在 `selectedWorkflowId` 是非法值时发生，正常流程不会触发。兜底 OK 但不用户友好；Phase 5 可以换成一个泛化占位文案
- **F5 (P4, confidence 9/10)** · Phase 2 Review F1 识别的"workflow 和 outputType 可暂时不一致"语义，本 Phase 并未触发（Picker 只调 `setSelectedWorkflowId`，一切按 reducer 语义走）。但 Phase 4（workflow → capability 路径映射）若要把 `workflowMode` / `selectedOptionId` 也纳入 workflow 默认，会重新触达这个问题

**回流动作（已执行）**:

- 04-UI測試/4.2 用戶交互 — 追加 3 个 workflow 组件测试文件（8 cases）
- 01-UI/1.2.1 Studio 主工作台 — 追加 workflow-first 条带出现位置说明
- 02-功能 / 03-功能測試 — 无变更（本 Phase 纯前端 UI）
- Phase 3 标记 **完成**

**下一刀 Phase 4 建议**：

- 把每个 workflow 落到现有能力路径（快速出图 → quick image quick route；角色一致图 → reference image + character card 启动态；电影短片 → video flow + 推荐模型；配音旁白 → audio flow + voice selector 靠前）
- 实现方式：`getWorkflowStudioDefaults(id)` 扩展返回 `{ outputType, workflowMode, recommendedModelIds, defaultPanel }`；workflow 切换时把这些默认推入 context
- 视觉对齐：先吸收本轮 F2（顶部条带宽度与下方 canvas 对齐）
- **不要在 Phase 4 动**：Phase 5 的 demote old entry to advanced path，那是独立一刀
