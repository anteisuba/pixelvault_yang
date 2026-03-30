# Studio 页面架构升级重构计划

> 实施后将复制到 `docs/plans/studio-refactor.md` 提交到 GitHub

## Context

Studio 页面是 PixelVault 的核心创作界面，经过多轮快速迭代后代码严重膨胀：
- **StudioWorkspace.tsx** 759 行、13 个 useState、12 个 hooks — 典型的 god component
- **CharacterCardManager.tsx** 826 行、内嵌 CreateForm/EditForm
- **VideoGenerateForm.tsx** 751 行、与 image 表单大量重复
- **API 路由**不一致：日志（console vs logger）、错误格式、限流头部各自为政
- **卡片系统** character/background/style 三套几乎相同的 CRUD 重复实现

目标：架构升级，引入 Context + 统一管道 + capability-driven 表单 + 标准化 API，为后续功能（W3/W4/E1）扫清障碍。

## 已确认范围（6 项扩展 + 基础重构）

| # | 扩展项 | 预估 CC 时间 |
|---|--------|-------------|
| 1 | StudioContext 全局状态树 | ~15 min |
| 2 | 统一生成管道 (GenerationPipeline) | ~20 min |
| 3 | Capability-Driven 表单渲染 | ~15 min |
| 4 | 卡片系统公共抽象 (useCardManager) | ~20 min |
| 5 | API 路由标准化模板 (createGenerationRoute) | ~15 min |
| 6 | 统一错误类层次 (GenerationError) | ~10 min |
| + | 基础：拆 god component、拆 CharacterCardManager、修硬编码颜色、统一日志 | ~20 min |

---

## Phase 1: Foundation（无 UI 变化）

### 1.1 统一错误类层次

**新建** `src/lib/errors.ts`

```
GenerationError (abstract)
  ├── ProviderError        // errorCode: PROVIDER_ERROR | PROVIDER_TIMEOUT, httpStatus: 502/504
  ├── ValidationError      // errorCode: VALIDATION_ERROR, httpStatus: 400, fieldErrors[]
  ├── RateLimitError       // errorCode: RATE_LIMIT_EXCEEDED, httpStatus: 429, retryAfterSeconds
  ├── AuthError            // errorCode: UNAUTHORIZED, httpStatus: 401
  ├── InsufficientCreditsError // errorCode: FREE_LIMIT_EXCEEDED, httpStatus: 403
  └── ApiKeyError          // errorCode: MISSING_API_KEY | INVALID_API_KEY, httpStatus: 400
```

每个错误类携带：`errorCode` + `httpStatus` + `i18nKey`。
客户端永远收到可翻译的错误消息。

**迁移策略**：保留旧 `GenerateImageServiceError` 直到所有路由迁移完成后再删除。

### 1.2 API 路由工厂

**新建** `src/lib/api-route-factory.ts`

```typescript
interface RouteConfig<TSchema, TResult> {
  schema: TSchema                 // Zod schema
  rateLimit: { limit: number; windowSeconds: number }
  maxDuration?: number
  handler: (clerkId: string, data: z.infer<TSchema>) => Promise<TResult>
}

function createApiRoute<T, R>(config: RouteConfig<T, R>)
  : (request: NextRequest) => Promise<NextResponse>
```

工厂内部统一处理：
1. Clerk auth → AuthError
2. Rate limit → RateLimitError + 一致的 `X-RateLimit-*` 头部
3. Zod safeParse → ValidationError（**所有** field errors，不只第一个）
4. 调用 handler
5. 统一 catch：GenerationError → 对应 HTTP 响应，未知错误 → 500 + `logger.error()`

### 1.3 常量补充

**修改** `src/constants/config.ts`：
- `STUDIO_MODES`: `'image' | 'video'`
- `RATE_LIMIT_CONFIGS`: 集中所有限流数字（目前散落在各路由文件）
- `MAX_DURATION_CONFIGS`: 记录并解释各路由的 maxDuration
- `VIDEO_GENERATION.EARLY_POLL_TOLERANCE = 5`（消除 use-generate-video.ts 中的魔法数字）

**修改** `src/constants/provider-capabilities.ts`：
- `getCapabilityFieldType(cap)` → `'slider' | 'select' | 'textarea' | 'seed' | 'lora'`

### 1.4 类型增强

**修改** `src/types/index.ts`：
- 新增 `GenerationConfigSchema`（统一 image + video）
- 将 `/api/image/edit` 的本地 `ImageEditSchema` 移到此处
- 收紧 `AdvancedParamsSchema`：`quality` → `z.enum(['auto','low','medium','high'])`

### 1.5 i18n 错误键

**修改** `src/messages/{en,ja,zh}.json`：
- 新增 `errors.provider.failed/timeout`
- 新增 `errors.validation.invalidInput`
- 新增 `errors.rateLimit / errors.auth / errors.credits / errors.apiKey`

---

## Phase 2: Hooks 层（无 UI 变化）

### 2.1 卡片管理器通用 Hook

**新建** `src/hooks/use-card-manager.ts`

```typescript
function useCardManager<TRecord, TCreate, TUpdate>(config: {
  cardType: string
  api: { list, create, update, delete }
  selectionMode: 'single' | 'multi'
  maxSelections?: number
  projectId?: string | null
}): {
  cards, isLoading, error,
  activeCardId, setActiveCardId, activeCard,       // single mode
  activeCardIds, toggleCardSelection, activeCards,  // multi mode
  create, update, remove, refresh
}
```

**重构现有 hooks 为薄包装**：
- `use-background-cards.ts` → `useCardManager({ cardType: 'background', ... })`
- `use-style-cards.ts` → `useCardManager({ cardType: 'style', ... })`
- `use-character-cards.ts` → `useCardManager` + 额外的 variant 树操作逻辑

### 2.2 统一生成 Hook

**新建** `src/hooks/use-unified-generate.ts`

合并 `useStudioGenerate` + `useGenerateVideo` 逻辑：
- `generate(config)` 按 `outputType` 路由到 image 或 video API
- video 模式保留轮询状态机，但用 `VIDEO_GENERATION.EARLY_POLL_TOLERANCE` 替代魔法数字
- 返回统一状态：`{ stage, isGenerating, elapsedSeconds, result, error, reset }`

---

## Phase 3: Context 层

### 3.1 StudioContext（useReducer 模式）

**新建** `src/contexts/studio-context.tsx` + `src/hooks/use-studio-context.ts`

**采用 useReducer 单一 Provider** — 所有状态变化通过 dispatch(action) 集中处理，频繁修改时最安全可预测。

State 结构：
```
StudioState
├── UI: mode, panels{7个面板的开关}, tokenInput
├── Form: prompt, aspectRatio, advancedParams
└── （derived state 在 Context value 中计算）
```

Action 类型：
```
StudioAction =
  | { type: 'SET_MODE'; payload: 'image' | 'video' }
  | { type: 'TOGGLE_PANEL'; payload: PanelName }
  | { type: 'CLOSE_PANEL'; payload: PanelName }
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_ASPECT_RATIO'; payload: AspectRatio }
  | { type: 'SET_ADVANCED_PARAMS'; payload: AdvancedParams }
  | { type: 'SET_TOKEN_INPUT'; payload: string }
  | { type: 'RESET_FORM' }
```

Context value（暴露给子组件的）：
```
StudioContext
├── state + dispatch（reducer 状态）
├── Cards: characters(useCardManager), backgrounds(useCardManager), styles(useCardManager)
├── Generation: generate(), isGenerating, lastGeneration（from useUnifiedGenerate）
├── ImageUpload: useImageUpload 实例
├── PromptEnhance: usePromptEnhance 实例
├── Projects: useProjects 实例
└── Civitai: useCivitaiToken 实例
```

**设计要点**：
- 新增状态只需：(1) 加到 StudioState type，(2) 加 StudioAction case，(3) 加 reducer case
- 组合现有 hooks（useCardManager, useImageUpload 等），不重新实现
- `ApiKeysContext` 保持独立（Studio 外部也在用）
- Provider 放在 Studio layout 层
- 使用 `useMemo` 对 context value 做 memoization 减少不必要的重渲染

---

## Phase 4: 组件分解（UI 不变）

### 4.1 StudioWorkspace 拆分

**新建** `src/components/business/studio/` 目录：

| 新组件 | 对应原 StudioWorkspace 行号 | 职责 |
|--------|---------------------------|------|
| `StudioModeSelector.tsx` | ~277-325 | image/video 切换 + 免费额度显示 |
| `StudioCardSelectors.tsx` | ~329-408 | 三个卡片下拉 + API Key 面板 |
| `StudioPromptArea.tsx` | ~410-422 | 提示词输入框 |
| `StudioGenerateBar.tsx` | ~424-474 | 宽高比 + 生成按钮 + 警告 |
| `StudioPreview.tsx` | ~477-481 | 最新生成预览 |
| `StudioToolbarPanels.tsx` | ~483-612 | 工具栏 + 可折叠面板 |
| `StudioCardManagement.tsx` | ~614-694 | 可折叠卡片管理器 |
| `StudioProjectHistory.tsx` | ~696-731 | 可折叠项目 + 历史 |
| `StudioVideoMode.tsx` | ~734-744 | 视频模式表单 + 历史 |

**重写** `StudioWorkspace.tsx` → ~40 行的薄编排器：
```tsx
<StudioProvider>
  <StudioModeSelector />
  {mode === 'image' ? <ImageModeLayout /> : <StudioVideoMode />}
</StudioProvider>
```

所有子组件通过 `useStudioContext()` 获取状态，零 prop drilling。

### 4.2 CapabilityForm

**新建** `src/components/business/CapabilityForm.tsx`（替代 AdvancedSettings.tsx 304 行）

由 `provider-capabilities.ts` 配置驱动，自动渲染 UI 字段：
- 读取 `ADAPTER_CAPABILITIES[adapterType]`
- 每个 capability → 对应的字段组件（Slider/Select/Textarea/Seed/Lora）
- 换模型 → 表单自动重组
- 新增模型 → 零 UI 代码

### 4.3 CharacterCardManager 拆分

**拆为**：
- `CharacterCardManager.tsx` (~100 行，布局 + 模式切换)
- `CharacterCardCreateForm.tsx` (~200 行)
- `CharacterCardEditForm.tsx` (~200 行)
- `CharacterVariantGrid.tsx` (~150 行)

---

## Phase 5: API 路由迁移（渐进式）

迁移顺序（按问题严重程度）：

| 优先级 | 路由 | 问题 |
|--------|------|------|
| 1 | `/api/image/edit` | 本地 schema + 业务逻辑在路由 |
| 2 | `/api/generate-video` | console.error |
| 3 | `/api/generate-long-video/*` (4 个) | console.error × 4 |
| 4 | `/api/image/analyze` | 错误上下文丢失 |
| 5 | `/api/studio/generate` | 限流头部缺失 |
| 6 | `/api/generate` | 参考实现，最后统一格式 |

每个路由改写为 `createApiRoute(config)` 形式，每个路由一个独立 commit。

---

## Phase 6: 清理

- 删除 `GenerateImageServiceError`（所有路由迁移后）
- 删除已提取到常量的魔法数字
- 删除不再被直接 import 的旧 hooks（如果有）
- 替换组件中的硬编码颜色为设计令牌

---

## 关键文件清单

### 新建文件（~15 个）
| 文件 | Phase |
|------|-------|
| `src/lib/errors.ts` | 1 |
| `src/lib/api-route-factory.ts` | 1 |
| `src/hooks/use-card-manager.ts` | 2 |
| `src/hooks/use-unified-generate.ts` | 2 |
| `src/contexts/studio-context.tsx` | 3 |
| `src/hooks/use-studio-context.ts` | 3 |
| `src/components/business/studio/StudioModeSelector.tsx` | 4 |
| `src/components/business/studio/StudioCardSelectors.tsx` | 4 |
| `src/components/business/studio/StudioPromptArea.tsx` | 4 |
| `src/components/business/studio/StudioGenerateBar.tsx` | 4 |
| `src/components/business/studio/StudioPreview.tsx` | 4 |
| `src/components/business/studio/StudioToolbarPanels.tsx` | 4 |
| `src/components/business/studio/StudioCardManagement.tsx` | 4 |
| `src/components/business/studio/StudioProjectHistory.tsx` | 4 |
| `src/components/business/studio/StudioVideoMode.tsx` | 4 |
| `src/components/business/CapabilityForm.tsx` | 4 |
| `src/components/business/CharacterCardCreateForm.tsx` | 4 |
| `src/components/business/CharacterCardEditForm.tsx` | 4 |
| `src/components/business/CharacterVariantGrid.tsx` | 4 |

### 修改文件（~20 个）
| 文件 | Phase |
|------|-------|
| `src/constants/config.ts` | 1 |
| `src/constants/provider-capabilities.ts` | 1 |
| `src/types/index.ts` | 1 |
| `src/messages/en.json` | 1 |
| `src/messages/ja.json` | 1 |
| `src/messages/zh.json` | 1 |
| `src/hooks/use-background-cards.ts` | 2 |
| `src/hooks/use-style-cards.ts` | 2 |
| `src/hooks/use-character-cards.ts` | 2 |
| `src/components/business/StudioWorkspace.tsx` | 4 |
| `src/components/business/CharacterCardManager.tsx` | 4 |
| `src/app/api/image/edit/route.ts` | 5 |
| `src/app/api/generate-video/route.ts` | 5 |
| `src/app/api/generate-long-video/route.ts` | 5 |
| `src/app/api/generate-long-video/status/route.ts` | 5 |
| `src/app/api/generate-long-video/cancel/route.ts` | 5 |
| `src/app/api/generate-long-video/retry/route.ts` | 5 |
| `src/app/api/image/analyze/route.ts` | 5 |
| `src/app/api/studio/generate/route.ts` | 5 |
| `src/app/api/generate/route.ts` | 5 |

---

## 验证方案

### 每个 Phase 的验证
- **Phase 1-2**：`pnpm tsc --noEmit`（类型检查）+ 现有行为不变
- **Phase 3**：启动 dev server，Studio 页面正常运作（Provider 透明包装）
- **Phase 4**：视觉回归——重构前后截图对比，像素级一致
- **Phase 5**：每个迁移路由返回相同的响应格式 + 用 Vitest 跑现有 API 测试
- **Phase 6**：全量回归——`pnpm build` + `pnpm test`

### 端到端验证
1. 打开 Studio 页面 → 选择模型 → 填写 prompt → 生成图片 → 成功
2. 切换 video 模式 → 生成视频 → 轮询完成 → 成功
3. 创建/切换/删除项目 → 查看历史 → 正常
4. 创建/编辑/删除各类卡片（character/background/style）→ 正常
5. 触发限流 → 收到一致的 429 + i18n 错误消息
6. 使用无效 API Key → 收到可翻译的错误消息

---

## 架构图

### 重构后组件层次
```
StudioPage (server component)
└── ApiKeysProvider
    └── StudioProvider (NEW - 全局状态树)
        ├── StudioModeSelector (image/video 切换)
        ├── [mode === 'image']
        │   ├── StudioCardSelectors (卡片下拉 × 3)
        │   ├── StudioPromptArea (提示词输入)
        │   ├── StudioGenerateBar (宽高比 + 生成按钮)
        │   ├── StudioPreview (最新生成预览)
        │   ├── StudioToolbarPanels (工具栏 + 折叠面板)
        │   ├── StudioCardManagement (卡片 CRUD)
        │   └── StudioProjectHistory (项目 + 历史)
        └── [mode === 'video']
            └── StudioVideoMode (视频表单 + 历史)
```

### 数据流
```
用户操作
  ↓
StudioContext (useStudioContext)
  ├── useCardManager × 3 (character/background/style)
  ├── useUnifiedGenerate (image + video 统一入口)
  ├── useImageUpload
  ├── usePromptEnhance
  └── useProjects
  ↓
api-client.ts (类型安全的 fetch 封装)
  ↓
createApiRoute (统一路由模板)
  ├── Clerk auth
  ├── Rate limit + 一致头部
  ├── Zod validate + 一致错误格式
  └── Service handler
  ↓
GenerationError 层次 (统一错误处理)
  ↓
客户端收到: { success, data?, error?, errorCode?, i18nKey? }
```

### API 路由标准化前后对比
```
BEFORE (每个路由手写):          AFTER (工厂生成):
auth()                          createApiRoute({
rateLimit(userId, ...)            schema: GenerationConfigSchema,
try {                             rateLimit: RATE_LIMIT_CONFIGS.generate,
  const body = await req.json()   handler: async (userId, data) => {
  const parsed = schema.safeParse    return generateForUser(userId, data)
  if (!parsed.success) {          }
    // 格式 A 或 B 或 C...      })
  }                             // auth + rateLimit + validate + log + error
  const result = await service    // 全部由工厂统一处理
  return NextResponse.json(...)
} catch (e) {
  console.error(...)  // ← BUG
  return NextResponse.json(...)
}
```

---

## PR 策略

**一个大 PR**，每个 Phase 一个独立 commit（共 6 个 commit）：
1. `refactor: foundation — error hierarchy, route factory, constants, types, i18n`
2. `refactor: hooks — useCardManager, useUnifiedGenerate`
3. `refactor: context — StudioContext with useReducer`
4. `refactor: components — decompose StudioWorkspace, CapabilityForm`
5. `refactor: api routes — migrate to createApiRoute factory`
6. `refactor: cleanup — remove legacy code, fix hardcoded colors`

实施后将 plan 复制到 `docs/plans/studio-refactor.md` 提交到 GitHub。

---

## NOT in scope

| 项目 | 原因 |
|------|------|
| tRPC/GraphQL API 层替换 | 属于 12 个月理想态，本次用 REST + 工厂模式已足够 |
| 可拖拽面板系统 | 需要 UI 库（如 react-grid-layout），超出重构范围 |
| 工作区布局预设保存 | 依赖拖拽系统，延后 |
| 深色模式 / 主题系统 | 需要完整设计系统升级，本次只修硬编码颜色 |
| Pipeline 编辑器（生成→编辑→放大） | Phase F4 功能，本次只统一入口 |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: SCOPE_EXPANSION, 6 proposals, 6 accepted, 0 deferred, 0 critical gaps |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT:** CEO CLEARED — eng review recommended before implementation but not blocking given time constraints.
