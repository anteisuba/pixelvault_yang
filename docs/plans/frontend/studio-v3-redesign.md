# Studio V3 重设计计划

> **Last updated**: 2026-03-31 — Phase 1 已实现，Phase 2-5 根据 post-implementation review 修订

## Context

当前 Studio 的核心 UX 问题：
- 必须创建画风卡才能生成（新手门槛过高）
- 参考图有两个入口（工具栏 + 画风卡编辑器）
- 卡片编辑内嵌在页面里，保存按钮被截断看不到
- 功能入口分散，反馈不清晰
- 没有项目系统 UI——无法按项目隔离生成历史和卡片 (Issue #20)

## 设计决策摘要 (Design Review 确认)

### 交互模式: Toggle 模式切换
顶部**分段按钮组** (Segmented Control) 切换「快速生成」vs「卡片生成」：
- 快速生成: 模型选择器 → Prompt → 比例 → 参考图/LoRA(按模型能力自动显隐) → 生成
- 卡片生成: 卡片选择器(角色/背景/画风) → Prompt → 比例 → 生成
- 两种模式 UI 完全不同，用户一目了然当前流程

Toggle 视觉:
- 激活态: `bg-primary text-white`（赤陶色填充）
- 非激活态: `border-border/60 text-muted-foreground`
- 与 StyleCardEditor 现有模式切换风格一致
- a11y: `role="tablist"` + `role="tab"` + `aria-selected`

### 信息层级
**左侧 (配置)**:
- 快速模式: Toggle(1st) → 模型选择器(2nd) → Prompt(3rd) → 比例+生成(4th) → 参考图/LoRA(折叠,5th)
- 卡片模式: Toggle(1st) → 卡片选择器(2nd) → Prompt(3rd) → 比例+生成(4th)
- 卡片模式下模型由画风卡内嵌的 modelId 决定，不显示独立模型选择器

**右侧 (结果)**:
- Hero 大图区占 60% 高度（最新生成结果 + [下载][收藏][重新生成]操作栏）
- 下方历史网格（4列桌面, 3列平板, 2列移动）

### 右侧面板行为
- **空状态**: 2-3 张示例生成图（30% 透明度）+ 引导文案"在左侧写下描述，开始你的第一次创作"
- **生成等待**: Hero 区域显示步骤进度条 "正在生成... (Step 2/3)" + 模型名，渐变背景色
- **生成完成**: Hero 大图展示 + 操作栏 fade-in
- **生成失败**: 红色 toast + Hero 区显示重试按钮
- **历史网格交互**: 点击 → 切换为 Hero 展示；**可拖拽到左侧参考图区域**；hover 显示模型名+时间

### 快速模式能力显隐
选了模型后，根据 `provider-capabilities` 自动显示/隐藏参考图和 LoRA 入口：
- 模型支持 LoRA → 显示 LoRA 配置折叠区
- 模型支持参考图 → 显示参考图上传折叠区
- 模型两者都不支持 → 只显示 Prompt + 比例
- 未选模型时 → 两个都显示

### 响应式布局
- **桌面 (≥1024px)**: 左右 40/60 分栏，左侧 `sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto`
- **平板 (768-1023px)**: 左右 35/65 分栏，减小间距
- **移动 (<768px)**: 上下堆叠，生成完成后 `scrollIntoView({ behavior: 'smooth' })` 自动滚动到结果区
- Toggle 在移动端全宽显示

### 无障碍 (a11y)
- Toggle: `role="tablist"` + `role="tab"` + `aria-selected`
- 生成按钮: `aria-busy="true"` + `aria-disabled`
- 模型选择器: 原生 `<select>` 或 `aria-haspopup="listbox"`
- 参考图上传: `aria-label` 在拖放区
- 右侧结果: `aria-live="polite"` 朗读"生成完成"
- 所有可交互元素: 最小触控目标 44×44px
- 键盘 Tab 顺序: Toggle → 模型/卡片 → Prompt → 比例 → 生成

### 交互状态表

| 功能 | Loading | Empty | Error | Success | Partial |
|------|---------|-------|-------|---------|---------|
| 右侧结果区 | 步骤进度条+模型名 | 示例图+引导文案 | 红色toast+重试按钮 | Hero大图+操作栏 | — |
| 模型选择器 | Spinner | 默认选第一个 | "无可用模型" | 显示选中模型 | 无key时警告badge |
| 卡片下拉 | Spinner | "还没有卡片，创建一张" | toast | 显示卡片名 | — |
| 参考图上传 | 进度条 | 拖放区 | "上传失败，重试" | 缩略图+删除 | — |
| 生成按钮 | Loader2旋转+禁用 | — | — | 恢复可点 | — |

### 项目系统 (Issue #20)
Studio 顶部（Toggle 之上）放项目选择器：
- 下拉菜单显示用户所有项目 + "新建项目" 按钮
- 切换项目后: 右侧历史只显示该项目的生成记录，卡片下拉只显示该项目的卡片
- 生成时自动传 `projectId` 到 API（已有字段支持）
- 新建项目: 内联输入框（名称+可选描述），不跳转页面
- 空状态: "还没有项目，创建第一个开始创作"
- 数据模型已完备: `Project` 关联 `generations`, `characterCards`, `backgroundCards`, `styleCards`, `cardRecipes`

```
┌───────────────────────────────────────────────┐
│ 项目: [我的动漫角色 ▼] [+ 新建]                  │
│─────────────────────┬─────────────────────────│
│ [■ 快速][□ 卡片]    │  该项目的 Hero + 历史     │
│ ...                 │  ...                     │
└─────────────────────┴─────────────────────────┘
```

### 设计系统对齐
- 背景: `#faf9f5` (米白)
- 文字: `#141413` (近黑)
- 主色/CTA: `#d97757` (赤陶)
- 字体: Space Grotesk (标题/UI) + Lora (正文)
- 动效: fade-in + translate-up, 300-600ms ease-out
- 历史网格 hover: `ring-2 ring-primary/30`
- 卡片下拉: 复用 shadcn `Select`
- Sheet 抽屉: 复用 shadcn `Sheet`

---

## 目标架构

### 布局: 左右分栏 4:6 + 项目选择器 + Toggle 模式切换
```
┌─────────────────────────────────────────────────────────┐
│ 项目: [我的动漫角色 ▼] [+ 新建]                            │
├──────────────────────┬──────────────────────────────────┤
│ 左侧 40% (配置)      │ 右侧 60% (结果)                  │
│                      │                                  │
│ [■ 快速生成][□ 卡片]  │  ┌──────────────────────────┐    │
│                      │  │                          │    │
│ 模型: [gemini ▼]     │  │   Hero 大图 (60% 高度)    │    │
│                      │  │   [下载] [收藏] [重新生成]  │  │
│ [prompt textarea]    │  │                          │  │
│                      │  └──────────────────────────┘  │
│ 1:1 16:9 9:16        │                                │
│            [✨ 生成]  │  历史记录 (网格, 可拖拽到参考图)  │
│                      │  ┌───┐ ┌───┐ ┌───┐ ┌───┐     │
│ ▸ 参考图 (按模型显隐) │  │   │ │   │ │   │ │   │     │
│ ▸ LoRA  (按模型显隐) │  └───┘ └───┘ └───┘ └───┘     │
│ ▸ 高级参数            │                                │
└──────────────────────┴────────────────────────────────┘

切换到「卡片生成」后：
┌──────────────────────┬────────────────────────────────┐
│ [□ 快速][■ 卡片生成]  │  (右侧不变)                     │
│                      │                                │
│ 角色: [Denia ▼][编辑] │                                │
│ 背景: [无 ▼]          │                                │
│ 画风: [Anime ▼][编辑] │                                │
│  └ 模型: fal/flux-lora│                                │
│                      │                                │
│ [prompt textarea]    │                                │
│ 1:1 16:9 9:16        │                                │
│            [✨ 生成]  │                                │
└──────────────────────┴────────────────────────────────┘
```

- **桌面 (≥1024px)**: side-by-side 40/60
- **平板 (768-1023px)**: side-by-side 35/65
- **移动 (<768px)**: 上下堆叠，生成后自动滚动到结果区
- 左侧 sticky + 自身滚动

### 核心变更: 无需画风卡即可生成
- 快速模式: 顶部直接选模型（不再依赖画风卡提供 modelId）
- 卡片模式: 模型由画风卡内嵌的 modelId 决定，不显示独立模型选择器
- API Key 自动路由：模型 → adapter → 用户已存的 key 或平台 key
- 参考图/LoRA 根据模型能力自动显隐（快速模式）

### API 变更
扩展现有 `/api/studio/generate`：
- `StudioGenerateSchema` 新增 `modelId: z.string().optional()` + `apiKeyId: z.string().optional()`
- 有 `modelId` 时跳过 recipe compilation，直接调用 `generateImageForUser`
- 有 `styleCardId` 时走原来的 `compileAndGenerate` 流程
- **双重 refine 校验** (post-review 修订):
  1. `modelId || styleCardId` — 至少一个必填（防止两者都空穿透到服务层报 500）
  2. `!(modelId && styleCardId)` — 互斥（防止冲突）
- `apiKeyId` 用于 saved route / custom model（与 `GenerateRequestSchema` 一致）

### 卡片编辑
- 选择: CardDropdown（轻量 Popover）
- 编辑/创建: 打开 Sheet 抽屉（解决保存按钮不可见问题）
- 批量管理: 后续考虑独立 /cards 页面

---

## Phase 1: 左右分栏布局 + 项目选择器 + Toggle ✅ DONE

**状态**: 已实现 (2026-03-31)
**目标**: 把单列 StudioWorkspace 改为左右分栏 + 顶部项目选择器 + Toggle 模式切换

### 修改文件清单:

#### 1. `src/contexts/studio-context.tsx` — Context 扩展

**重命名**: `mode: StudioMode` → `outputType: OutputType`
- `type OutputType = 'image' | 'video'`（原 `StudioMode`）
- action `SET_MODE` → `SET_OUTPUT_TYPE`
- 所有引用处同步更新

**新增 FormState 字段** (已实现 + Phase 2 修订):
```ts
// 在 StudioFormState 中添加:
workflowMode: 'quick' | 'card'    // 快速生成 vs 卡片生成 (Phase 1 已实现)
selectedModelId: string | null     // Phase 1 已实现 (Phase 2 将重命名为 selectedOptionId)
// Phase 2 修订: selectedModelId → selectedOptionId: string | null
// 原因: 只存 modelId 会丢失 apiKeyId，saved route / custom model 无法工作
// ModelSelector 的 optionId 格式: "workspace:modelId" 或 "saved:keyId"
// 生成时通过 findSelectedModel(options, optionId) 解析出 modelId + keyId
```

**新增 Actions** (Phase 1 已实现):
```ts
| { type: 'SET_WORKFLOW_MODE'; payload: 'quick' | 'card' }
| { type: 'SET_MODEL_ID'; payload: string | null }
// Phase 2: SET_MODEL_ID → SET_OPTION_ID, payload 类型不变
```

**Reducer 新增 case** (Phase 1 已实现):
```ts
case 'SET_WORKFLOW_MODE':
  return { ...state, workflowMode: action.payload }
case 'SET_MODEL_ID':
  return { ...state, selectedModelId: action.payload }
case 'SET_OUTPUT_TYPE':  // 原 SET_MODE
  return { ...state, outputType: action.payload }
```

**initialFormState 更新**:
```ts
const initialFormState: StudioFormState = {
  outputType: 'image',      // 原 mode
  workflowMode: 'quick',    // 新增，默认快速模式
  selectedModelId: null,     // 新增
  prompt: '',
  aspectRatio: '1:1',
  advancedParams: {},
  tokenInput: '',
  panels: {},
}
```

**StudioProvider 更新**:
- 暴露 `workflowMode`, `selectedModelId` 到 FormContext value
- 暴露 `setWorkflowMode`, `setSelectedModelId` dispatch 包装函数

#### 2. `src/contexts/studio-context.test.ts` — 测试更新

**更新现有测试**:
- `SET_MODE` → `SET_OUTPUT_TYPE`（回归测试，确保改名后行为不变）

**新增测试**:
```ts
describe('SET_WORKFLOW_MODE', () => {
  it('switches to card mode', () => {
    const state = makeInitialState()
    const result = studioFormReducer(state, {
      type: 'SET_WORKFLOW_MODE',
      payload: 'card',
    })
    expect(result.workflowMode).toBe('card')
  })

  it('switches back to quick mode', () => {
    const state = { ...makeInitialState(), workflowMode: 'card' as const }
    const result = studioFormReducer(state, {
      type: 'SET_WORKFLOW_MODE',
      payload: 'quick',
    })
    expect(result.workflowMode).toBe('quick')
  })
})

describe('SET_MODEL_ID', () => {
  it('sets selected model', () => {
    const state = makeInitialState()
    const result = studioFormReducer(state, {
      type: 'SET_MODEL_ID',
      payload: 'gemini-2.0-flash',
    })
    expect(result.selectedModelId).toBe('gemini-2.0-flash')
  })

  it('clears selected model', () => {
    const state = { ...makeInitialState(), selectedModelId: 'some-model' }
    const result = studioFormReducer(state, {
      type: 'SET_MODEL_ID',
      payload: null,
    })
    expect(result.selectedModelId).toBeNull()
  })
})
```

#### 3. `src/hooks/use-card-manager.ts` — Race condition 修复

**当前问题**: 快速切换项目时，旧 projectId 的 API 响应会覆盖新数据

**修复方案**: 在 useEffect 中加 stale request guard

```ts
// 修改前 (lines 80-84):
useEffect(() => {
  refresh()
}, [refresh])

// 修改后:
useEffect(() => {
  let ignore = false

  const load = async () => {
    setIsLoading(true)
    const result = await config.api.list(config.projectId)
    if (!ignore && result.success && result.data) {
      setCards(result.data)
    }
    if (!ignore) {
      setIsLoading(false)
    }
  }

  load()
  return () => { ignore = true }
}, [config.api, config.projectId])
```

注意: 原来的 `refresh` callback 仍保留给手动刷新场景（创建/更新/删除后），但 useEffect 不再使用 refresh，而是内联 async 函数 + ignore flag。

#### 4. `src/components/business/StudioWorkspace.tsx` — 布局重构

**当前结构**: 单列，所有内容垂直排列
**目标结构**: ProjectBar → 左右分栏（左配置 / 右结果）

```tsx
// StudioWorkspaceInner 的 return:
<div className="space-y-4">
  {/* 项目选择器 - 全宽顶部 */}
  <ProjectSelector />

  {/* 左右分栏 */}
  <div className="flex flex-col lg:flex-row lg:gap-6">
    {/* 左侧配置区 */}
    <StudioLeftPanel className="w-full lg:w-2/5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" />

    {/* 右侧结果区 */}
    <StudioRightPanel className="w-full lg:w-3/5 mt-6 lg:mt-0" />
  </div>
</div>
```

**移动端**: `flex-col` 使左右面板上下堆叠
**平板**: 可用 `md:flex-row md:gap-4` 或保持 lg 断点
**桌面**: `lg:flex-row` 左右并排

#### 5. `src/components/business/studio/ProjectSelector.tsx` (新建)

**功能**: 项目下拉选择 + 新建项目

**数据来源**: `StudioDataContext` 中的 `projects` (已有 `useProjects` hook)

**UI 结构**:
```tsx
<div className="flex items-center gap-3">
  {/* 项目下拉 - 使用 shadcn Select */}
  <Select value={activeProjectId} onValueChange={setActiveProjectId}>
    <SelectTrigger className="w-[200px] border-border/60">
      <SelectValue placeholder={t('selectProject')} />
    </SelectTrigger>
    <SelectContent>
      {projects.map(p => (
        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>

  {/* 新建按钮 - Popover 内联表单 */}
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="border-border/60">
        <Plus className="h-4 w-4 mr-1" />
        {t('newProject')}
      </Button>
    </PopoverTrigger>
    <PopoverContent>
      {/* 名称输入 + 描述输入 + 创建按钮 */}
    </PopoverContent>
  </Popover>
</div>
```

**空状态**: 无项目时显示 "还没有项目，创建第一个开始创作" + 创建按钮

**首次进入**: 保持 `activeProjectId = null`（"All Generations" 状态）。
> **POST-REVIEW 修订**: 原计划自动选第一个项目，但系统支持 null 项目状态。
> 删除项目时 generations 移回 projectId=null，如果不保留 null 入口这些数据会丢失。
> `useProjects` 已用 `pid ?? 'unassigned'` 正确查询无项目的记录。

#### 6. `src/components/business/studio/StudioLeftPanel.tsx` (新建)

**功能**: 左侧配置区容器，包含 Toggle + 根据模式显示不同内容

**结构**:
```tsx
export function StudioLeftPanel({ className }: { className?: string }) {
  const { workflowMode, dispatch } = useStudioForm()

  return (
    <div className={cn('space-y-4', className)}>
      {/* Toggle 模式切换 */}
      <div role="tablist" className="flex rounded-lg border border-border/60 p-1">
        <button
          role="tab"
          aria-selected={workflowMode === 'quick'}
          onClick={() => dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            workflowMode === 'quick'
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:bg-muted/30'
          )}
        >
          {t('quickMode')}
        </button>
        <button
          role="tab"
          aria-selected={workflowMode === 'card'}
          onClick={() => dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'card' })}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            workflowMode === 'card'
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:bg-muted/30'
          )}
        >
          {t('cardMode')}
        </button>
      </div>

      {/* 快速模式: 模型选择器 */}
      {workflowMode === 'quick' && (
        <ModelSelector /> // Phase 2 实现，Phase 1 先放占位
      )}

      {/* 卡片模式: 卡片选择器 */}
      {workflowMode === 'card' && (
        <>
          <CardDropdown type="character" />
          <CardDropdown type="background" />
          <CardDropdown type="style" />
        </>
      )}

      {/* 共用: Prompt + 比例 + 生成按钮 */}
      <StudioPromptArea />
      <StudioGenerateBar />
    </div>
  )
}
```

**Phase 1 范围**: Toggle + 卡片模式复用现有 CardDropdown + Prompt + GenerateBar
**Phase 2 才加**: 模型选择器（快速模式）

#### 7. `src/components/business/studio/StudioRightPanel.tsx` (新建)

**功能**: 右侧结果区容器

**Phase 1 结构** (简化版，Phase 4 完善):
```tsx
export function StudioRightPanel({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Hero 预览区 - Phase 4 实现 GenerationPreview */}
      <GenerationPreview />

      {/* 历史网格 - 复用 HistoryPanel */}
      <HistoryPanel />
    </div>
  )
}
```

#### 8. `src/components/business/studio/GenerationPreview.tsx` (新建)

**Phase 1 简化版**: 空状态 + 最新结果展示

```tsx
export function GenerationPreview() {
  const { latestResult, isGenerating } = useStudioGen()
  const t = useTranslations('StudioV3')

  // 空状态
  if (!latestResult && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] rounded-xl border border-border/40 bg-muted/10">
        <p className="text-muted-foreground font-serif text-sm">
          {t('emptyStateHint')}
        </p>
      </div>
    )
  }

  // 生成中 - Phase 4 加进度条
  if (isGenerating) {
    return (
      <div className="flex items-center justify-center min-h-[300px] rounded-xl border border-border/40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  // 成功 - Phase 4 加操作栏
  return (
    <div className="rounded-xl overflow-hidden border border-border/40">
      <img src={latestResult.url} alt="" className="w-full" />
    </div>
  )
}
```

#### 9. `src/components/business/studio/index.ts` — 更新 barrel exports

```ts
export { ProjectSelector } from './ProjectSelector'
export { StudioLeftPanel } from './StudioLeftPanel'
export { StudioRightPanel } from './StudioRightPanel'
export { GenerationPreview } from './GenerationPreview'
// 保留现有 exports
export { StudioGenerateBar } from './StudioGenerateBar'
export { StudioPromptArea } from './StudioPromptArea'
export { StudioModeSelector } from './StudioModeSelector'
export { StudioErrorBoundary } from './StudioErrorBoundary'
```

### Context 扩展详细说明:

**StudioDataContext 变更**:
- `activeProjectId` 已在 `useProjects()` hook 中管理
- 切换项目时: `useBackgroundCards(activeProjectId)` 和 `useStyleCards(activeProjectId)` 自动响应
- 不需要额外的 DataState 字段，因为 `useProjects` 已提供 `activeProjectId` + `setActiveProjectId`

**FormContext 变更** (Phase 1 已实现):
- `workflowMode` 控制左侧面板显示哪套 UI ✅
- `selectedModelId` → Phase 2 重命名为 `selectedOptionId`（存 ModelSelector 的 optionId 而非裸 modelId）
- `outputType` 替换原来的 `mode`（保持 image/video 切换，与 workflowMode 正交）✅

---

## Phase 2: 模型直选 + 无卡片生成 (POST-REVIEW 修订版)

**目标**: 快速模式下模型选择器 + prompt 即可生成

### 修改文件:
- `src/contexts/studio-context.tsx` — `selectedModelId` → `selectedOptionId`, `SET_MODEL_ID` → `SET_OPTION_ID`
- `src/contexts/studio-context.test.ts` — 同步更新测试
- `src/components/business/studio/StudioLeftPanel.tsx` — 替换占位为 ModelSelector，构建 modelOptions
- `src/components/business/studio/StudioGenerateBar.tsx` — 修改 canGenerate + handleGenerate 逻辑
- `src/types/index.ts` — 扩展 StudioGenerateSchema
- `src/app/api/studio/generate/route.ts` — 处理 modelId + apiKeyId 直传
- `src/services/studio-generate.service.ts` — modelId 直传时跳过 recipe compilation
- `src/hooks/use-studio-model-options.ts` (新建) — 构建快速模式 model options（复用 VideoGenerateForm 的模式）

### Context 重命名 (修订: 防止能力倒退):
```ts
// studio-context.tsx
// Phase 1 已有:
selectedModelId: string | null
// Phase 2 改为:
selectedOptionId: string | null    // ModelSelector 的 optionId
// optionId 格式: "workspace:{modelId}" 或 "saved:{keyId}"
// 生成时: findSelectedModel(options, optionId) → { modelId, keyId }
```

**修订原因**: 只存 modelId 会丢失 saved route 的 apiKeyId 信息。
现有系统中 `VideoGenerateForm` 已用相同模式:
- `StudioModelOption.optionId` 存选择
- 提交时从 option 解析 `modelId` + `keyId`(→apiKeyId)
- `resolveGenerationRoute` 依赖 apiKeyId 区分 saved/workspace/free 三条路径

### StudioLeftPanel 中的 ModelSelector 集成:
```ts
// 构建 options (复用 VideoGenerateForm 的模式)
const imageModels = getAvailableImageModels()
const builtInOptions: StudioModelOption[] = imageModels.map(model => ({
  optionId: `workspace:${model.id}`,
  modelId: model.id,
  adapterType: model.adapterType,
  providerConfig: model.providerConfig,
  requestCount: model.cost,
  isBuiltIn: true,
  sourceType: 'workspace',
}))
const savedOptions = buildSavedModelOptions(
  keys.filter(key => key.isActive),
  key => imageModels.some(m => m.id === key.modelId),
)
const modelOptions = [...builtInOptions, ...savedOptions]
const selectedModel = findSelectedModel(modelOptions, state.selectedOptionId)
```

### canGenerate 新逻辑:
```ts
// 旧: !!styles.activeCardId && !!selectedStyleCard?.modelId
// 新:
const canGenerate = (
  (formState.workflowMode === 'quick' && !!selectedModel?.modelId) ||
  (formState.workflowMode === 'card' && !!styles.activeCardId && !!selectedStyleCard?.modelId)
) && !!formState.prompt.trim()
```

### handleGenerate 新逻辑 (快速模式):
```ts
if (state.workflowMode === 'quick' && selectedModel) {
  await generate({
    mode: 'image',
    image: {
      modelId: selectedModel.modelId,
      apiKeyId: selectedModel.keyId,    // ← 关键: 传 apiKeyId 以支持 saved route
      freePrompt: state.prompt,
      aspectRatio: state.aspectRatio,
      projectId: projects.activeProjectId ?? undefined,
      referenceImages: ...,
      advancedParams: ...,
    },
  })
}
```

### Schema 双重校验 (修订: 防止两者都空):
```ts
// src/types/index.ts
export const StudioGenerateSchema = z.object({
  // ...现有字段
  modelId: z.string().optional(),
  apiKeyId: z.string().optional(),     // ← 新增: saved route 支持
  styleCardId: z.string().optional(),
  // ...其他字段
}).refine(
  (data) => !!(data.modelId || data.styleCardId),
  { message: 'Either modelId or styleCardId is required' }
).refine(
  (data) => !(data.modelId && data.styleCardId),
  { message: 'Cannot specify both modelId and styleCardId', path: ['modelId'] }
)
```

### studio-generate.service.ts 变更:
```ts
export async function compileAndGenerate(clerkId: string, input: StudioGenerateInput) {
  // 新增: modelId 直传路径
  if (input.modelId) {
    // 跳过 recipe compilation，直接生成
    return generateImageForUser(clerkId, {
      modelId: input.modelId,
      apiKeyId: input.apiKeyId,         // ← 传递 apiKeyId
      prompt: input.freePrompt,
      aspectRatio: input.aspectRatio,
      referenceImages: input.referenceImages,
      advancedParams: input.advancedParams,
      projectId: input.projectId,
    })
  }

  // 原有路径: 卡片模式 → compileRecipe → generateImageForUser
  const recipe = await compileRecipe(clerkId, input)
  return generateImageForUser(clerkId, recipe)
}
```

### Phase 2 测试:
- `StudioGenerateSchema` 双重校验: 两者都空 → error; 两者都有 → error; 只有一个 → pass
- `compileAndGenerate` modelId 路径: apiKeyId 正确透传
- canGenerate 逻辑: quick mode + selectedModel → true, card mode + no card → false
- saved route 端到端: 选 saved option → apiKeyId 传到后端 → resolveGenerationRoute 走 saved 路径

---

## Phase 3: 快速模式能力区 + 参考图/LoRA

**目标**: 快速模式下根据模型能力自动显隐参考图/LoRA/高级参数

### 修改文件:
- `src/components/business/studio/StudioLeftPanel.tsx` — 快速模式增强选项（内联）
- `src/components/business/StyleCardEditor.tsx` — 去掉「参考图模式」(仅保留 LoRA 模式)
- `src/components/business/StudioToolbar.tsx` — 精简或移除

### 能力显隐逻辑 (在 StudioLeftPanel 内):
```ts
const model = getAvailableImageModels().find(m => m.id === selectedModelId)
const capabilities = model ? getProviderCapabilities(model.adapterType) : null

const showReferenceImage = !selectedModelId || (capabilities?.maxReferenceImages ?? 0) > 0
const showLoRA = !selectedModelId || model?.supportsLora
const showAdvancedParams = !!selectedModelId
```

### 历史网格拖拽到参考图 (POST-REVIEW 修订):

**问题**: `useImageUpload.addFromUrl()` 不存在。现有 hook 只支持本地文件上传 (FileReader.readAsDataURL)。

**修订方案**:
1. **给 `useImageUpload` 新增 `addFromUrl(url: string)` 方法**:
   - fetch(url) → blob → FileReader.readAsDataURL → base64
   - 验证 MIME type (image/jpeg, image/png, image/webp)
   - 验证文件大小 (与现有 MAX_FILE_SIZE 一致)
   - 错误处理: CORS 失败 / 格式不对 → toast 提示
2. **CORS 前提**: R2 图片 URL 需要 CORS 配置允许同源 fetch (确认 R2 bucket CORS policy)
3. **实现**:
   - 右侧历史网格: `draggable="true"` + `onDragStart` 设置 `dataTransfer.setData('text/uri-list', imageUrl)`
   - 左侧参考图区域: `onDrop` 检测 `text/uri-list` → 调用 `addFromUrl(url)`
   - 复用现有 `ReferenceImageSection` (已有 onDrop handler，需扩展识别 URL 类型)
4. **降级**: 如果 CORS 受限，改用 proxy endpoint `/api/proxy-image?url=xxx` 中转

---

## Phase 4: 右侧面板 + 卡片编辑 Sheet

**目标**: 完善右侧结果展示 + 卡片编辑用 Sheet

### 修改文件:
- `src/components/business/studio/StudioRightPanel.tsx` — GenerationPreview + 历史网格
- `src/components/business/studio/GenerationPreview.tsx` — Hero大图 + 空状态 + 进度条
- `src/components/business/studio/CardManagementSheet.tsx` (新建) — 卡片编辑 Sheet
- `src/components/business/HistoryPanel.tsx` — 适配右侧面板网格布局 + 拖拽支持
- `src/components/business/CardDropdown.tsx` — 添加"编辑"入口打开 Sheet

### GenerationPreview 完整实现:

**空状态**:
```tsx
<div className="flex flex-col items-center justify-center h-full opacity-30">
  <div className="grid grid-cols-2 gap-3">
    {exampleImages.map(img => <img key={img} src={img} className="rounded-lg" />)}
  </div>
  <p className="mt-4 text-muted-foreground font-serif">{t('emptyStateHint')}</p>
</div>
```

**生成中**:
```tsx
<div className="flex flex-col items-center justify-center h-full">
  <div className="w-2/3 h-2 rounded-full bg-border/60 overflow-hidden">
    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
  </div>
  <p className="mt-3 text-sm text-muted-foreground">{stepLabel} ({step}/{totalSteps})</p>
  <p className="text-xs text-muted-foreground">{modelName}</p>
</div>
```

**成功**:
```tsx
<div className="relative">
  <img src={result.url} className="w-full rounded-lg" />
  <div className="absolute bottom-3 right-3 flex gap-2">
    <Button variant="outline" size="icon">{/* 下载 */}</Button>
    <Button variant="outline" size="icon">{/* 收藏 */}</Button>
    <Button variant="outline" size="sm">{/* 重新生成 */}</Button>
  </div>
</div>
```

### CardManagementSheet:
- 用 shadcn `Sheet` 包裹 `StyleCardEditor`
- 从 CardDropdown 的"编辑"按钮触发 `<Sheet open={isEditing}>`
- Sheet 内保存按钮始终可见（解决当前保存按钮被截断的问题）

---

## Phase 5: 动画、移动端、i18n

### 修改文件:
- `src/messages/en.json`, `ja.json`, `zh.json` — 新增翻译 key
- 各面板组件 — 添加 fold/unfold 动画 (300-600ms ease-out)
- 移动端适配 — 生成后 `scrollIntoView({ behavior: 'smooth' })`
- Toggle 切换动画: 内容 crossfade 200ms

### 新增 i18n keys:

**en.json**:
```json
{
  "StudioV3": {
    "quickMode": "Quick Generate",
    "cardMode": "Card Generate",
    "emptyStateHint": "Write a description on the left to start creating",
    "generating": "Generating...",
    "step": "Step {current}/{total}",
    "noModels": "No available models",
    "noApiKey": "No API key for this model",
    "createCard": "Create a card",
    "dragToReference": "Drag to use as reference",
    "selectProject": "Select project",
    "newProject": "New project",
    "noProjects": "No projects yet, create your first one"
  }
}
```

**zh.json**:
```json
{
  "StudioV3": {
    "quickMode": "快速生成",
    "cardMode": "卡片生成",
    "emptyStateHint": "在左侧写下描述，开始你的第一次创作",
    "generating": "正在生成...",
    "step": "步骤 {current}/{total}",
    "noModels": "无可用模型",
    "noApiKey": "该模型无可用 API Key",
    "createCard": "创建卡片",
    "dragToReference": "拖拽作为参考图",
    "selectProject": "选择项目",
    "newProject": "新建项目",
    "noProjects": "还没有项目，创建第一个开始创作"
  }
}
```

**ja.json**:
```json
{
  "StudioV3": {
    "quickMode": "クイック生成",
    "cardMode": "カード生成",
    "emptyStateHint": "左側に説明を書いて作成を開始",
    "generating": "生成中...",
    "step": "ステップ {current}/{total}",
    "noModels": "利用可能なモデルなし",
    "noApiKey": "このモデルのAPIキーがありません",
    "createCard": "カードを作成",
    "dragToReference": "ドラッグして参照画像に",
    "selectProject": "プロジェクトを選択",
    "newProject": "新規プロジェクト",
    "noProjects": "プロジェクトがありません。最初の一つを作成しましょう"
  }
}
```

---

## 验证步骤

1. **Phase 1**: 本地启动，确认桌面/平板/移动端布局正确，Toggle 切换流畅
1b. **Phase 1**: 创建项目 → 切换项目 → 历史和卡片按项目过滤
2. **Phase 2**: 快速模式: 选模型+写prompt+生成 → 成功出图（生成记录属于当前项目）
3. **Phase 3**: 快速模式: 选支持LoRA的模型 → LoRA区显示；选不支持的 → 隐藏
4. **Phase 4**: 空状态显示示例图；生成中显示进度条；历史图片可拖到参考图
5. **Phase 4**: 卡片模式: 点击"编辑" → Sheet 打开 → 保存按钮可见可点
6. **Phase 5**: 动画流畅，移动端生成后自动滚动，三语完整
7. 运行现有测试: `pnpm test`
8. a11y: 键盘 Tab 顺序正确，screen reader 可朗读生成状态

## NOT in scope

- **项目独立管理页面** — Studio 内有项目选择器，但独立的 /projects 管理页面后续
- **/cards 独立管理页面** — 卡片编辑用 Sheet 解决，批量管理后续
- **多图并行生成** — 当前一次一张，后续考虑
- **图片编辑（upscale/去背景）** — 已有独立 API，不在 Studio 重设计范围
- **视频生成** — 独立功能，不影响图片 Studio

## What already exists (可复用)

### Phase 1 已实现的组件 (不要重新创建):
- `StudioLeftPanel` — 左侧配置面板 (Toggle + CardDropdown + Prompt + GenerateBar + Toolbar + 卡片管理)
- `StudioRightPanel` — 右侧结果面板 (GenerationPreview + HistoryPanel)
- `GenerationPreview` — 生成预览 (空状态 + 生成中 + 结果展示)
- `StudioModeSelector` — Image/Video 模式切换 (已用 SET_OUTPUT_TYPE)
- `StudioWorkspace` — 左右分栏布局 + ProjectSelector + ModeSelector

### 可直接复用:
- `StudioGenerateBar` — 生成按钮+逻辑（Phase 2 修改 canGenerate）
- `StudioPromptArea` — 提示词输入区
- `ReferenceImageSection` — 参考图上传组件
- `useImageUpload` — 图片上传 hook (Phase 3 需要扩展 addFromUrl)
- `StyleCardEditor` — LoRA 配置（去掉参考图模式后复用）
- `CardDropdown` — 卡片选择下拉
- `ModelSelector` — 模型选择器 (Phase 2 直接复用，与 VideoGenerateForm 相同模式)
- `buildSavedModelOptions` / `findSelectedModel` — ModelSelector 配套工具函数
- shadcn `Sheet`, `Select`, `Button`, `Input`, `Textarea` — UI 原语
- `resolveGenerationRoute` — API Key 自动路由（后端已有，支持 saved/workspace/free 三路径）
- `provider-capabilities` — 模型能力查询（已有）
- `ProjectSelector` — 项目选择器 (支持 null = "All Generations")
- `useProjects` hook — 项目 CRUD + null 状态 + 历史查询
- `useCharacterCards`, `useBackgroundCards`, `useStyleCards` — 卡片管理 hooks
- `useUnifiedGenerate` — 统一生成 hook

## Failure Modes

| 代码路径 | 失败场景 | 有测试? | 有错误处理? | 用户可见? |
|----------|---------|---------|------------|----------|
| modelId 直传生成 | 模型不存在/已下线 | 待写 | 有(resolveRoute 会抛错) | toast 报错 |
| modelId + styleCardId 同传 | 前端 bug | 待写(Zod refine) | 有(400) | 400 错误 |
| **两者都空** | **前端 bug 或绕过** | **待写(Zod refine)** | **Phase 2 新增** | **400 错误** |
| 快速模式无 API key | 用户没配 key | 待写 | 有(ApiKeyError) | 内联警告 |
| **saved route apiKeyId 缺失** | **只传 modelId 没传 apiKeyId** | **待写** | **resolveRoute 走 workspace fallback** | **可能用错 key** |
| 项目切换 race condition | 快速切换 3 次 | ✅ Phase 1 已修 | ✅ stale guard | ✅ 修复后无闪烁 |
| 历史拖拽到参考图 | 跨域图片 URL | 无 | Phase 3 需实现 addFromUrl + CORS | 可能静默失败 |
| **null 项目状态** | **删除项目后 generations 无入口** | **N/A** | **✅ 已保留 null** | **✅ All Generations 入口** |

**已修复 (Phase 1)**: 项目切换 race condition — `useCardManager` 的 `useEffect` 加 stale request guard。
**待修复 (Phase 2)**: Schema 双重校验 + apiKeyId 透传 + selectedOptionId 重命名。
**待修复 (Phase 3)**: `useImageUpload.addFromUrl()` 实现 + CORS 确认。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | DONE | 4 issues, 0 critical gaps, scope reduced |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | DONE | score: 5/10 → 8/10, 7 decisions made (incl. Issue #20 project system) |
| **Post-impl Review** | Manual | Phase 1 后复查 | 1 | **DONE** | **5 issues found, all addressed below** |

### Post-implementation Review (2026-03-31)

| # | 问题 | 严重度 | 修订 |
|---|------|--------|------|
| P1 | Schema 只做互斥校验，缺少至少一个约束 → 两者都空时 500 而非 400 | **High** | 加 `modelId \|\| styleCardId` refine |
| P1 | Quick mode 只存 selectedModelId 丢失 apiKeyId → saved route 能力倒退 | **High** | 改为 selectedOptionId + 提取 modelId/keyId |
| P1 | 自动选第一个 project 丢失 null 状态 → 无项目 generations 无入口 | **Medium** | 保留 null 默认 + "All Generations" 入口 |
| P2 | Phase 1 内容已实现但计划未标记 → 重复实现风险 | **Medium** | 标记 ✅ DONE |
| P2 | 拖拽依赖 addFromUrl() 但 hook 无此 API | **Medium** | Phase 3 前需实现 + CORS 确认 |

**UNRESOLVED:** 0 decisions pending
**VERDICT:** Phase 1 ✅ shipped. Phase 2-5 plan revised and ready.
