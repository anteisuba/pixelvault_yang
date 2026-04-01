# PixelVault 全功能开发计划（Codex Review 修正版）

> **已合并到统一计划。** 本文件的 S1-S9 已与 Studio Redesign Plan 合并为三轨执行方案。
> 最新计划见: [`docs/plans/unified-development-plan.md`](plans/unified-development-plan.md)
>
> 映射关系:
> - S1 → Track A: A1 (数据层修复)
> - S2 → Track A: A2 (新模型接入)
> - S3 → Track A: A3 (校验+持久化)
> - S4 → Track B: B2 (合并到 Studio 重构的状态补全+重试+快捷键)
> - S5 → Track B: B3 (合并到卡片优化+Remix)
> - S6 → Track C: C1 (Storyboard 增量)
> - S7 → Track C: C2 (系列模式)
> - S8 → Track C: C3 (图片编辑)
> - S9 → Track C: C4 (漫画高级)

---

> 以下为原始 S1-S9 详细实现规格，保留作为实施参考。

---

## 依赖关系图

```
S1 数据层基础
├── S2 新模型接入 ← 依赖 S1B（能力覆盖）
│   └── S3 校验+持久化 ← 依赖 S2A（requiresReferenceImage）
│       └── S8 图片编辑 ← 依赖 S2D（Kontext）+ S3B（持久化）
├── S4 重试+快捷键 ← 依赖 S1C（计时器）
│   └── S7 系列模式 ← 依赖 S2 + S4
│       └── S9 漫画高级 ← 依赖 S6 + S7B
├── S5 卡片优化（独立）
└── S6 Storyboard 增量（独立）
```

---

## Codex Review 发现摘要

| # | 严重度 | 问题 | 解决 Sprint |
|---|--------|------|-------------|
| F1 | P0 | `requestCount` 硬编码为 1，不反映模型实际 cost | 1A |
| F2 | P1 | 能力系统按 adapter 解析，Kontext 无法覆盖 | 1B |
| F3 | P1 | 无参考图服务端校验，快捷键/API 可绕过 | 3A |
| F4 | P1 | 图片生成无计时器（只有视频有） | 1C |
| F5 | P1 | FLUX 2 Max / Recraft V4 Pro model ID 写错 | 1D |
| F6 | P2 | 图片编辑已存在，Sprint 3 不应重建 | 3B |
| F7 | P2 | Storyboard 已有大量基础设施 | 6 |
| F8 | P2 | R2 并行化逻辑写错（createApiUsageEntry 已在上传前完成） | 3C |
| F9 | P2 | 重试需要 lastPayload 快照，hook 当前未存储 | 4A |

---

## Sprint 1：数据层基础

### 1A. Credit 成本显示修复（Finding 1）

**问题**：所有 adapter 返回 `requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION`（永远是 1），但模型实际 cost 为 1-3。

**修改文件**：

- `src/services/generate-image.service.ts`
  - 在 `generateImageForUser` 顶部通过 `getModelById(input.modelId)` 获取 `builtInModel`
  - line ~203（失败记录）：`requestCount` → `builtInModel?.cost ?? generatedAsset.requestCount`
  - line ~352（成功 usage）：同上
  - line ~395（createGeneration）：同上
- `src/lib/model-options.ts`
  - line 20：`requestCount` → `getModelById(key.modelId)?.cost ?? API_USAGE.DEFAULT_REQUESTS_PER_GENERATION`

### 1B. 模型级能力覆盖系统（Finding 2）

**问题**：能力系统按 adapterType 解析（`ADAPTER_CAPABILITIES` keyed by `AI_ADAPTER_TYPES`），所有 FAL 模型共享相同能力。Kontext 作为 FAL 模型需要不同能力集（无 negativePrompt/referenceStrength/guidanceScale/steps/lora）。

**修改文件**：

- `src/constants/provider-capabilities.ts`
  - 新增 `MODEL_CAPABILITY_OVERRIDES: Partial<Record<string, Partial<CapabilityConfig>>>` 映射
  - 修改 `getCapabilityConfig(adapterType, modelId?)` — 先查 model override，再 fallback adapter
  - 修改 `hasCapability(adapterType, cap, modelId?)` — 委托给 getCapabilityConfig
  - 修改 `getMaxReferenceImages(adapterType, modelId?)` — 委托给 getCapabilityConfig
  - 修改 `getReferenceImageMode(adapterType, modelId?)` — 同上
- `src/components/business/AdvancedSettings.tsx` — 新增 `modelId?` prop，传给 getCapabilityConfig
- `src/components/business/CapabilityForm.tsx` — 新增 `modelId?` prop
- `src/components/business/studio/StudioToolbarPanels.tsx` — 传递 modelId 给能力函数

### 1C. 图片生成计时器（Finding 4）

**问题**：`startTimer()` 只在视频路径 `generateVideo()` 调用（line ~143），图片路径 `generateImage()` 无计时。`GenerationPreview` 不消费 `elapsedSeconds` / `error`。

**修改文件**：

- `src/hooks/use-unified-generate.ts`
  - `generateImage()` (line ~112)：`setStage('generating')` 后加 `startTimer()`
  - finally 块加 `stopTimer()`
- `src/components/business/studio/GenerationPreview.tsx`
  - 解构 `elapsedSeconds` from `useStudioGen()`
  - 生成中状态下显示 `formatTime(elapsedSeconds)` (格式: `0:05`, `1:15`)

### 1D. Model ID 纠正（Finding 5）

| 模型 | 错误 ID | 正确 ID |
|------|---------|---------|
| FLUX 2 Max | `fal-ai/flux-2/max` | `fal-ai/flux-2-max` |
| Recraft V4 Pro | 待确认 | `fal-ai/recraft/v4/pro/text-to-image` |
| Kontext Pro | — | `fal-ai/flux-pro/kontext` |
| Kontext Max | — | `fal-ai/flux-pro/kontext/max/multi` |
| gemini-2.5-flash | — | 需确认最终 GA ID |

---

## Sprint 2：新模型接入（依赖 Sprint 1B）

### 2A. ModelOption 接口扩展

**`src/constants/models.ts`**

- `ModelOption` 接口新增 `requiresReferenceImage?: boolean` 字段

### 2B. 模型注册

每个模型改 3 个文件：`models.ts`（enum + config）、`provider-capabilities.ts`（override，仅 Kontext）、`messages/{en,ja,zh}.json`（i18n）

| 模型 | enum 值 | externalModelId | adapterType | cost | 特殊字段 |
|------|---------|-----------------|-------------|------|----------|
| gemini-2.5-flash-image | `GEMINI_25_FLASH_IMAGE` | 待确认 GA ID | GEMINI | 1 | — |
| FLUX 2 Max | `FLUX_2_MAX` | `fal-ai/flux-2-max` | FAL | 3 | — |
| Recraft V4 Pro | `RECRAFT_V4_PRO` | `fal-ai/recraft/v4/pro/text-to-image` | FAL | 2 | — |
| FLUX Kontext Pro | `FLUX_KONTEXT` | `fal-ai/flux-pro/kontext` | FAL | 2 | `requiresReferenceImage: true` |
| FLUX Kontext Max | `FLUX_KONTEXT_MAX` | `fal-ai/flux-pro/kontext/max/multi` | FAL | 3 | `requiresReferenceImage: true` |

### 2C. Kontext 能力覆盖

```typescript
MODEL_CAPABILITY_OVERRIDES = {
  [AI_MODELS.FLUX_KONTEXT]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 1,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.FLUX_KONTEXT_MAX]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 4,
    referenceImageMode: 'native' as const,
  },
}
```

### 2D. FAL Adapter Kontext 分支

**`src/services/providers/fal.adapter.ts`** — `generateImage()` 扩展：

- 新增 `KONTEXT_MODEL_IDS` 和 `KONTEXT_MULTI_MODEL_IDS` 常量集合
- Kontext 单图：`body.image_url = referenceImages[0]`，不设 `strength`
- Kontext Max 多图：`body.image_urls = referenceImages`，设 `body.aspect_ratio`
- 非 Kontext 路径不变

### 2E. 所有新模型 i18n

- `src/messages/en.json` / `ja.json` / `zh.json` 补充模型名和描述

---

## Sprint 3：服务端校验 + 图片编辑持久化 + 上传并行化（Finding 3, 6, 8）

### 3A. 参考图必需校验（Finding 3）

**问题**：`GenerateRequestSchema` 的 referenceImage/referenceImages 全局可选，无模型条件校验。只做按钮禁用，快捷键/API 可绕过。

**服务端**（`src/services/generate-image.service.ts`）：

- `resolveGenerationRoute` 之后，检查 `builtInModel?.requiresReferenceImage`
- 如果 true 且无 referenceImage/referenceImages → 抛出 `GenerateImageServiceError('VALIDATION_ERROR', ...)`

**客户端**（`src/components/business/studio/StudioGenerateBar.tsx`）：

- `canGenerate` 条件增加：如果 `model.requiresReferenceImage` 且无参考图 → false
- 按钮禁用时显示提示文本（"此模型需要参考图"）

### 3B. 图片编辑 R2 持久化（Finding 6）

**问题**：现有 `image-edit.service.ts` 已有 upscale（`fal-ai/aura-sr`）和 remove-bg（`fal-ai/birefnet/v2`），`ImageDetailModal.tsx` 已有操作按钮。但结果只下载，不保存到 R2/DB/Gallery。

**修改文件**：

- `src/types/index.ts` — `ImageEditSchema` 新增 `persist?: boolean` 字段
- `src/services/image-edit.service.ts` — 新增 `persistEditedImage(userId, resultUrl, sourceGenerationId, action)` 函数
  - 调用已有 `fetchAsBuffer` → `uploadToR2` → `createGeneration` 工具函数
- `src/app/api/image/edit/route.ts` — 当 `persist: true` 时调用 `persistEditedImage`
- `src/components/business/ImageDetailModal.tsx` — 新增"保存到 Gallery"按钮（调用 edit API with `persist: true`）

### 3C. R2 上传并行化（Finding 8）

**问题**：原方案的 `Promise.all([参考图上传, 生成图上传, createApiUsageEntry])` 逻辑错误。`createApiUsageEntry` 已在 R2 上传前完成（line ~346）。`createGeneration` 依赖上传后的 `permanentUrl`（line ~379）。

**正确做法**（`src/services/generate-image.service.ts` lines 363-383）：

```typescript
// 之前：串行
const refUrl = await uploadRef(...)   // 等待
const outUrl = await uploadOut(...)   // 等待

// 之后：并行
const [refUrl, outUrl] = await Promise.all([
  uploadRef(...),   // 同时
  uploadOut(...),   // 同时
])
// createGeneration 在两者完成后调用（不变）
// createApiUsageEntry 已在上传前完成（不动）
```

### 3D. Provider 超时

- `src/services/providers/fal.adapter.ts` — 图片生成 fetch 添加 `AbortSignal.timeout(120_000)`
- `src/services/providers/gemini.adapter.ts` — 同上

---

## Sprint 4：错误处理 + 重试 + 快捷键（Finding 9）

### 4A. 重试基础设施（Finding 9）

**问题**：hook 暴露 `error` 但没有保存上次请求 payload，也没有 `retry()` 入口。`GenerationPreview` 不消费错误态。

**`src/hooks/use-unified-generate.ts`**：

- 新增 `lastRequestPayload: UnifiedGenerateInput | null` state
- `generate()` 入口处存储 `setLastRequestPayload(input)`
- 新增 `retry()` 方法：
  ```typescript
  const retry = useCallback(() => {
    if (lastRequestPayload) {
      setError(null)
      generate(lastRequestPayload)
    }
  }, [lastRequestPayload, generate])
  ```
- `reset()` 中清除 `lastRequestPayload`
- 返回值新增 `retry` 和 `lastRequestPayload`

**`src/contexts/studio-context.tsx`** — StudioGenContext 暴露 `retry` 方法

### 4B. 错误 + 重试 UI

**`src/components/business/studio/GenerationPreview.tsx`**：

- 解构 `error, retry` from `useStudioGen()`
- 新增错误状态渲染：当 `error && !isGenerating` → 显示错误信息 + "重试" 按钮
- 生成完成后显示耗时 `{elapsedSeconds}s` + credit 消耗（从 `lastGeneration.requestCount` 读取）

### 4C. Cmd+Enter 快捷键

**`src/contexts/studio-context.tsx`**：

- 从 `StudioGenerateBar` 提取生成触发逻辑为 `triggerGenerate()` 方法暴露到 context
- `StudioGenerateBar` 和 `StudioPromptArea` 都消费此方法

**`src/components/business/studio/StudioPromptArea.tsx`**：

- 添加 `onKeyDown` handler
- `(e.metaKey || e.ctrlKey) && e.key === 'Enter'` → 调用 `triggerGenerate()` from context

**`src/components/business/studio/StudioGenerateBar.tsx`**：

- 在生成按钮上显示 `⌘↵` / `Ctrl+↵` 快捷键提示

---

## Sprint 5：卡片优化 + 工具功能补完

### 5A. 卡片搜索/筛选

- `src/components/business/CharacterCardManager.tsx` / `StyleCardManager.tsx`
- 卡片列表顶部添加搜索输入框，按名称/标签过滤

### 5B. 卡片复制

- 卡片操作菜单新增"复制"选项
- 调用现有 create API，预填当前卡片数据

### 5C. 卡片排序

- 排序下拉：最近使用 / 创建时间 / 名称
- 在 hook 中实现排序逻辑

### 5D. R2 上传失败清理日志

- `src/services/generate-image.service.ts` — 存储阶段 catch 块记录孤儿 key 到 logger

---

## Sprint 6：Storyboard 增量增强（Finding 7）

**现有基础设施**（不需要重建）：

| 层 | 已有 |
|----|------|
| Schema | Story + StoryPanel models（`prisma/schema.prisma:322-353`） |
| Service | CRUD, reorder, narrative generation with 4 tones（`story.service.ts`） |
| Hooks | `useStoryList()` + `useStoryEditor()`（`use-storyboard.ts`） |
| API client | 完整 CRUD（`api-client/storyboard.ts`） |
| Pages | 列表页 + 详情页（scroll/comic 双模式渲染 + PNG 导出） |

### 6A. Schema 扩展

**`prisma/schema.prisma`** — Story 新增：

- `characterCardId? String`、`styleCardId? String`、`modelId? String`
- StoryPanel 新增：`scenePrompt? @db.Text`

### 6B. Panel 级图片生成

- `src/services/story.service.ts` 新增 `generatePanelImage()` — 编译配方 → 调用生成 → 更新面板
- 新增 API route `POST /api/stories/[id]/panels/generate`
- 新增 `batchGeneratePanels()` — 顺序生成所有面板

### 6C. 编辑模式 UI

- `storyboard/[id]/page.tsx` — 添加查看/编辑模式切换
- 编辑模式：每个面板显示 scenePrompt 输入 + 生成按钮

---

## Sprint 7：系列模式 + 角色一致性增强（依赖 Sprint 2, 4）

### 7A. 配方编译器增强 — 多参考图智能裁剪

**问题**：当前 `recipe-compiler.service.ts` lines 381-390 将角色卡的 `sourceImageUrl` + `referenceImages` 平铺传给 adapter。但不同模型 maxReferenceImages 不同（Gemini 14、Kontext Max 4、FAL 通用 1）。

**修改文件**：

- `src/services/recipe-compiler.service.ts`
  - `compileRecipe()` 参考图收集部分（lines 381-390）：
    - 导入 `getMaxReferenceImages` from `provider-capabilities`
    - 按 `adapterType + modelId` 获取 `maxRef`
    - 角色卡 `sourceImageEntries`（已有字段 `prisma/schema.prisma:366`，结构化存储含 viewType）优先加载
    - 排序策略：`front > three-quarter > side > back > full-body`
    - 裁剪到 `maxRef` 数量
  - 单参考图模型（maxRef=1）：只用 `sourceImageUrl`
  - 多参考图模型（maxRef>1）：`sourceImageUrl` + `sourceImageEntries` 按 viewType 优先级

**新增类型**（`src/types/index.ts`）：

```typescript
export const SourceImageEntrySchema = z.object({
  url: z.string().url(),
  storageKey: z.string(),
  viewType: z.enum(['front', 'three-quarter', 'side', 'back', 'full-body', 'closeup', 'other']),
  isPrimary: z.boolean().default(false),
})
export type SourceImageEntry = z.infer<typeof SourceImageEntrySchema>
```

### 7B. 系列模式（批量连续生成）

**新建 hook**：`src/hooks/use-series-generate.ts`

```typescript
interface SeriesGenerateInput {
  scenes: string[]                    // 场景描述数组
  studioConfig: StudioFormState       // 共享的 studio 配置
  autoChainReference?: boolean        // 每次结果自动加入下一次参考图
}

interface SeriesGenerateState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  current: number                     // 当前进度 0-based
  total: number
  results: (GenerationRecord | null)[] // 每个场景的结果
  errors: (string | null)[]
}

function useSeriesGenerate(): {
  state: SeriesGenerateState
  start: (input: SeriesGenerateInput) => Promise<void>
  pause: () => void
  resume: () => void
  cancel: () => void
}
```

**实现逻辑**：

- 遍历 `scenes` 数组，逐个调用 `generateAPI`（不并行，需要顺序参考链）
- `autoChainReference=true`：每次生成成功后将 `result.url` 注入下一次 `referenceImages`
- 失败时记录 error，继续下一个场景（不中断整个系列）
- `pause/resume` 通过 `AbortController` + 标志位控制

**新建组件**：`src/components/business/studio/SeriesGeneratePanel.tsx`

- 多行 textarea（每行一个场景描述）或可拖拽列表
- "开始批量生成" 按钮 + 进度条 "正在生成 3/8..."
- 每个场景的状态指示（pending / generating / done / error）
- 结果网格预览
- "全部发送到 Storyboard" 按钮

**Studio 集成**：

- `StudioLeftPanel.tsx` 新增 "系列模式" tab/toggle
- 系列模式下隐藏单个 prompt textarea，显示 SeriesGeneratePanel

### 7C. 参考图自动回填

**修改文件**：`src/components/business/studio/GenerationPreview.tsx`

- 生成完成后，除现有拖拽功能外，新增 "用作下一张参考" 按钮
- 点击后调用 `imageUpload.addReferenceFromUrl(lastGeneration.url)` 自动填入参考图区域
- 按钮仅在当前模型支持参考图时显示（`maxReferenceImages > 0`）

### 7D. 卡片 hover 预览增强

**修改文件**：

- `src/components/business/CharacterCardItem.tsx`
- `src/components/business/StyleCardItem.tsx`（如存在）

hover 时显示 shadcn `HoverCard` popover：

- 完整 characterPrompt / stylePrompt（截断到 200 字）
- sourceImageUrl 缩略图
- LoRA 数量
- advancedParams 摘要（如有）

---

## Sprint 8：图片编辑（依赖 Sprint 2D, 3B）

### 8A. 指令式编辑（Kontext 复用）

**方案**：利用 FLUX Kontext（Sprint 2 已接入）实现"参考图 + 编辑指令"模式。Kontext 的 `referenceImageMode: 'native'` 天然支持理解编辑意图。

**新增 UI**：`src/components/business/ImageEditPanel.tsx`

- 入口：ImageDetailModal → "编辑此图" 按钮 → 打开编辑面板
- 流程：
  1. 当前图片自动填入参考图
  2. 用户输入编辑指令（如 "把头发改成红色"、"添加眼镜"、"改为夜晚场景"）
  3. 模型固定为 Kontext Pro（或用户可选 Kontext Max）
  4. 调用现有 studio generate API（modelId=kontext, referenceImages=[当前图], prompt=编辑指令）
  5. 结果显示在面板内，可 "替换原图"（保存到 Gallery）或 "另存为新图"

**修改文件**：

- `src/components/business/ImageDetailModal.tsx` — 新增 "编辑此图" 按钮
- `src/components/business/ImageEditPanel.tsx`（新建）— 编辑指令输入 + 模型选择 + 生成 + 结果预览
- 复用现有 `generateAPI` from `src/lib/api-client.ts`，不新建 API route

### 8B. Outpainting（画布扩展）

**方案**：利用 fal.ai 的 fill/outpaint endpoint

**前置确认**：需确认 fal.ai 具体 endpoint，候选：

- `fal-ai/flux-pro/v1/fill`（inpainting/outpainting 兼用）
- `fal-ai/creative-outpainting`（如存在）

**新增 service**：`src/services/tools/outpaint.service.ts`

```typescript
interface OutpaintInput {
  imageUrl: string
  direction: 'left' | 'right' | 'up' | 'down' | 'all'
  expandRatio: number  // 1.5x, 2x
  prompt?: string      // 可选的扩展区域描述
  apiKey: string
}

async function outpaintImage(input: OutpaintInput): Promise<ImageEditResult>
```

**新增 API route**：`src/app/api/image/outpaint/route.ts`

- auth → validate → call service → 可选 persist to R2（复用 Sprint 3B 的持久化）

**UI**（集成到 ImageDetailModal）：

- "扩展画布" 按钮
- 方向选择器（上/下/左/右/全部）
- 扩展比例选择（1.5x / 2x）
- 可选 prompt 输入
- 结果预览 + 保存

### 8C. Inpainting（局部重绘）— 开发量最大

**方案**：Canvas mask 编辑器 + `fal-ai/flux-pro/v1/fill`

**新增组件**：`src/components/business/MaskEditor.tsx`

- 基于 `<canvas>` 的涂抹选区工具
- 功能：
  - 画笔涂抹（白色 = 编辑区域）
  - 画笔大小调节（slider 10-100px）
  - 橡皮擦模式
  - 撤销/重做 (undo stack)
  - 全选/清空
- 输出：mask 图片 data URL（黑白，白色为编辑区域）
- 叠加在原图上显示（半透明遮罩）

**新增 service**：`src/services/tools/inpaint.service.ts`

```typescript
interface InpaintInput {
  imageUrl: string
  maskUrl: string       // base64 或上传后的 URL
  prompt: string        // 重绘区域描述
  modelId?: string      // 默认 flux-pro fill
  apiKey: string
}

async function inpaintImage(input: InpaintInput): Promise<ImageEditResult>
```

**新增 API route**：`src/app/api/image/inpaint/route.ts`

**UI 流程**：

1. ImageDetailModal → "局部重绘" → 打开 MaskEditor overlay
2. 用户涂抹选区 → 输入重绘描述
3. 提交：mask 上传 R2 → 调用 inpaint service
4. 结果预览 → 保存到 Gallery

---

## Sprint 9：漫画高级功能（依赖 Sprint 6, 7B）

### 9A. 对话气泡叠加

**新增组件**：`src/components/business/storyboard/BubbleEditor.tsx`

- 基于 CSS 定位（非 canvas），可拖拽气泡元素
- 气泡类型：
  - `speech`（对话框，圆角矩形 + 尾巴指向）
  - `thought`（思考框，云朵形状）
  - `narration`（旁白框，矩形无尾巴）
  - `shout`（爆炸形）
- 属性：text、position (x%, y%)、type、fontSize、tailDirection
- 存储到 StoryPanel 的新字段

**Schema 扩展**（`prisma/schema.prisma`）：

```prisma
model StoryPanel {
  // 现有字段...
  bubbles  Json?  // SpeechBubble[]
}
```

**类型定义**（`src/types/index.ts`）：

```typescript
export const SpeechBubbleSchema = z.object({
  id: z.string().uuid(),
  text: z.string().max(200),
  type: z.enum(['speech', 'thought', 'narration', 'shout']),
  positionX: z.number().min(0).max(100),  // 百分比
  positionY: z.number().min(0).max(100),
  fontSize: z.enum(['sm', 'md', 'lg']).default('md'),
  tailDirection: z.enum(['left', 'right', 'top', 'bottom', 'none']).default('bottom'),
})
export type SpeechBubble = z.infer<typeof SpeechBubbleSchema>
```

**渲染集成**：

- `StoryComicRenderer` / `StoryScrollRenderer` 在每个 panel 图片上叠加渲染 bubbles
- 编辑模式下气泡可拖拽 + 编辑文字

### 9B. 多模板导出 PNG/PDF

**修改文件**：`src/components/business/StoryExportButton.tsx`

**当前状态**：仅支持 html2canvas → PNG（全页截图，scale: 2，backgroundColor: `#faf9f5`）

**布局模板系统**（`src/constants/storyboard.ts`，新建）：

```typescript
export const COMIC_TEMPLATES = {
  FOUR_PANEL:   { name: '4格漫画', cols: 2, rows: 2, maxPanels: 4 },
  SIX_PANEL:    { name: '6格漫画', cols: 2, rows: 3, maxPanels: 6 },
  EIGHT_PANEL:  { name: '8格漫画', cols: 2, rows: 4, maxPanels: 8 },
  SINGLE_STRIP: { name: '单列条漫', cols: 1, rows: null, maxPanels: null },
  FREE_FORM:    { name: '自由排版', cols: null, rows: null, maxPanels: null },
} as const
```

**PDF 导出**：

- 新增依赖：`jspdf`（轻量 PDF 生成）
- 流程：html2canvas 生成各页 PNG → jspdf 拼接为多页 PDF
- 每个模板对应一种分页策略

**导出选项 UI**：

- 模板选择下拉
- 格式选择：PNG / PDF
- 品质选择：标准 (scale: 1) / 高清 (scale: 2) / 超清 (scale: 3)
- 背景色选择（默认 `#faf9f5` / 白色 / 透明）

### 9C. 剧本模式（LLM 拆分场景 → 批量生成）

**利用现有 LLM 基础设施**：`src/services/llm-text.service.ts` 的 `llmTextCompletion()`，支持 Gemini / OpenAI / VolcEngine 三个 adapter。

**新增 service**：`src/services/script-to-scenes.service.ts`

```typescript
interface ScriptToScenesInput {
  script: string           // 用户输入的剧本文字
  targetPanelCount?: number // 目标面板数（默认 4-8）
  style?: string           // 画风提示（可选）
  userId: string
}

interface SceneDescription {
  index: number
  scenePrompt: string       // 生成用 prompt（英文）
  caption?: string          // 对话文字
  narration?: string        // 旁白文字
  cameraAngle?: string      // 镜头角度（close-up / medium / wide / bird-eye）
}

async function splitScriptToScenes(input: ScriptToScenesInput): Promise<SceneDescription[]>
```

**LLM System Prompt**：

```
你是一个漫画分镜师。将用户的剧本拆分为 {targetPanelCount} 个独立场景。
每个场景输出：
- scenePrompt: 用于 AI 图片生成的英文描述（包含人物、动作、表情、场景、光线）
- caption: 该面板的对话文字（如有）
- narration: 连接叙事（如有）
- cameraAngle: 镜头角度

输出 JSON 数组格式。
```

**API route**：`POST /api/stories/script-to-scenes`

**完整流程 UI**：`src/components/business/storyboard/ScriptModePanel.tsx`

1. **输入阶段**：大 textarea 输入剧本 + 目标面板数 slider (4-12)
2. **拆分阶段**：调用 script-to-scenes API → 显示场景列表（可编辑每个 scenePrompt）
3. **配置阶段**：选择角色卡 + 风格卡 + 模型（共享配置）
4. **生成阶段**：调用 Series Generate（Sprint 7B 的 `useSeriesGenerate`）逐个生成
5. **完成阶段**：自动创建 Story，填入 panels + captions + narrations

**复用链路**：

- `llm-text.service.ts`（剧本拆分）
- `useSeriesGenerate`（Sprint 7B，批量生成）
- `recipe-compiler.service.ts`（编译配方）
- `story.service.ts`（Sprint 6B，创建故事）

---

## 关键文件清单

| 文件 | Sprint |
|------|--------|
| `src/constants/provider-capabilities.ts` | 1B, 2C |
| `src/constants/models.ts` | 1D, 2A, 2B |
| `src/services/generate-image.service.ts` | 1A, 3A, 3C, 5D |
| `src/hooks/use-unified-generate.ts` | 1C, 4A |
| `src/components/business/studio/GenerationPreview.tsx` | 1C, 4B, 7C |
| `src/services/providers/fal.adapter.ts` | 2D, 3D |
| `src/services/providers/gemini.adapter.ts` | 3D |
| `src/components/business/studio/StudioGenerateBar.tsx` | 3A, 4C |
| `src/components/business/studio/StudioPromptArea.tsx` | 4C |
| `src/contexts/studio-context.tsx` | 4A, 4C |
| `src/services/image-edit.service.ts` | 3B |
| `src/components/business/ImageDetailModal.tsx` | 3B, 8A, 8B, 8C |
| `src/messages/{en,ja,zh}.json` | 2E, 全部新 UI |
| `prisma/schema.prisma` | 6A, 9A |
| `src/services/story.service.ts` | 6B, 9C |
| `src/services/recipe-compiler.service.ts` | 7A |
| `src/hooks/use-series-generate.ts`（新建） | 7B, 9C |
| `src/components/business/studio/SeriesGeneratePanel.tsx`（新建） | 7B |
| `src/components/business/ImageEditPanel.tsx`（新建） | 8A |
| `src/components/business/MaskEditor.tsx`（新建） | 8C |
| `src/services/tools/outpaint.service.ts`（新建） | 8B |
| `src/services/tools/inpaint.service.ts`（新建） | 8C |
| `src/services/script-to-scenes.service.ts`（新建） | 9C |
| `src/components/business/storyboard/BubbleEditor.tsx`（新建） | 9A |
| `src/components/business/storyboard/ScriptModePanel.tsx`（新建） | 9C |
| `src/constants/storyboard.ts`（新建） | 9B |
| `src/services/llm-text.service.ts` | 9C（复用） |

---

## 验证方式

| Sprint | 验证 |
|--------|------|
| 1 | `npx tsc --noEmit` 通过；生成图片后 DB 中 requestCount 反映 model.cost；生成中显示秒数 |
| 2 | 每个新模型成功生成图片；Kontext 选中时 AdvancedSettings 只显示 seed |
| 3 | Kontext 无参考图时按钮禁用 + 服务端拒绝；upscale 结果保存到 Gallery；并行上传减少 2-3s |
| 4 | 生成失败显示错误 + 重试按钮可用；Cmd+Enter 触发生成 |
| 5 | 卡片搜索筛选可用；R2 失败日志可查 |
| 6 | 创建 Story → 添加 panel scenePrompt → 生成 panel 图片成功 |
| 7 | 同角色卡 3 张系列图视觉一致；批量生成 "3/8" 进度正常；自动参考链生效 |
| 8 | Kontext 指令编辑成功（改发色等）；outpaint 扩展画布可用；inpaint mask 涂抹+重绘可用 |
| 9 | 气泡拖拽+文字编辑可用；4格/6格模板 PNG+PDF 导出；剧本输入→自动拆分→批量生成→创建故事 |

---

## 全局总览

| Sprint | 内容 | 新建文件 | 改动文件 | 依赖 |
|--------|------|----------|----------|------|
| **1** | 数据层基础（credit/能力/计时器/ID） | 0 | ~8 | 无 |
| **2** | 5 个新模型接入 | 0 | ~7 | S1B |
| **3** | 校验 + 持久化 + 并行化 + 超时 | 0 | ~7 | S2A |
| **4** | 重试 + 错误 UI + 快捷键 | 0 | ~4 | S1C |
| **5** | 卡片优化 + 日志 | 0 | ~4 | 无 |
| **6** | Storyboard 增量 | 0-1 | ~4 | 无 |
| **7** | 系列模式 + 角色一致性 | 2 | ~5 | S2, S4 |
| **8** | 图片编辑（指令/扩展/重绘） | 4 | ~3 | S2D, S3B |
| **9** | 漫画高级（气泡/导出/剧本） | 4 | ~4 | S6, S7B |
