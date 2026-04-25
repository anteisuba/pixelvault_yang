# Components & Hooks Reference

AI 开发指引：本文档列出所有可复用组件和 hooks 的公共 API。新增功能时优先复用已有组件，避免重复造轮子。

## 组件层级

| 层级   | 路径                       | 规则                                             |
| ------ | -------------------------- | ------------------------------------------------ |
| UI 层  | `src/components/ui/`       | 无状态、无业务逻辑、纯展示                       |
| 业务层 | `src/components/business/` | 可使用 hooks，禁止直接调用 API                   |
| 布局层 | `src/components/layout/`   | 页面框架（Navbar、MobileTabBar、LocaleSwitcher） |

---

## UI 组件 (`src/components/ui/`)

### 表单控件

#### `AspectRatioSelector`

宽高比选择器，支持多种输入格式。

```tsx
import { AspectRatioSelector } from '@/components/ui/aspect-ratio-selector'

;<AspectRatioSelector
  options={[
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
  ]}
  value="1:1"
  onChange={(value) => {}}
  disabled={false}
  variant="primary" // 'primary' | 'neutral'
/>
```

#### `OptionGroup`

单选按钮组，用于离散选项（如 OpenAI quality/style/background）。

```tsx
import { OptionGroup } from '@/components/ui/option-group'

;<OptionGroup
  options={[
    { value: 'vivid', label: 'Vivid' },
    { value: 'natural', label: 'Natural' },
  ]}
  value="vivid"
  onChange={(value) => {}}
  disabled={false}
  allowDeselect={false} // 是否允许取消选择
  variant="primary" // 'primary' | 'neutral'
/>
```

#### `ParamSlider`

带标签和数值显示的滑块，用于连续数值参数。

```tsx
import { ParamSlider } from '@/components/ui/param-slider'

;<ParamSlider
  label="Guidance Scale"
  value={7.5}
  onChange={(v) => {}}
  min={1}
  max={20}
  step={0.5}
  disabled={false}
  formatValue={(v) => `${v}`} // 可选：自定义显示格式
/>
```

#### `SeedInput`

种子值输入框 + 随机骰子按钮。值为 `undefined` 或 `-1` 表示随机。

```tsx
import { SeedInput } from '@/components/ui/seed-input'

;<SeedInput
  label="Seed"
  value={42} // undefined = 随机
  onChange={(v) => {}}
  randomLabel="Random"
  disabled={false}
/>
```

#### `ImageDropZone`

拖拽上传区域。

```tsx
import { ImageDropZone } from '@/components/ui/image-drop-zone'

;<ImageDropZone
  isDragging={false}
  onDrop={(e) => {}}
  onDragOver={(e) => {}}
  onDragLeave={() => {}}
  onClick={() => {}}
  uploadLabel="Drop an image or click to upload"
  formatsLabel="JPG, PNG, WebP"
/>
```

#### `Textarea`

标准文本域（shadcn 封装）。

```tsx
import { Textarea } from '@/components/ui/textarea'
```

#### `Input`

标准输入框（shadcn 封装）。

```tsx
import { Input } from '@/components/ui/input'
```

#### `Slider`

Radix UI 滑块原语（由 `ParamSlider` 内部使用，一般不直接调用）。

```tsx
import { Slider } from '@/components/ui/slider'
```

### 布局 & 容器

#### `CollapsiblePanel`

可折叠面板，带标题、描述和可选 badge。

```tsx
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'

;<CollapsiblePanel
  title="Advanced Settings"
  description="Fine-tune generation parameters"
  badge={<Badge variant="secondary">Optional</Badge>}
  defaultOpen={false}
>
  {children}
</CollapsiblePanel>
```

#### `ErrorAlert`

错误提示区块。

```tsx
import { ErrorAlert } from '@/components/ui/error-alert'

;<ErrorAlert title="Error" message="Something went wrong">
  {optionalChildren}
</ErrorAlert>
```

#### `MetadataList`

键值对列表，用于展示图片元数据。

```tsx
import { MetadataList } from '@/components/ui/metadata-list'

;<MetadataList
  items={[{ key: 'model', label: 'Model', value: 'DALL-E 3', icon: <Icon /> }]}
  labelClassName="text-sm"
/>
```

### 对话框 & 弹层

#### `ConfirmDialog`

确认对话框（基于 AlertDialog）。

```tsx
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

;<ConfirmDialog
  trigger={<Button>Delete</Button>}
  title="Are you sure?"
  description="This action cannot be undone."
  cancelLabel="Cancel"
  confirmLabel="Delete"
  onConfirm={() => {}}
  variant="destructive" // 'destructive' | 'default'
/>
```

#### `Dialog` / `AlertDialog` / `Sheet` / `Select`

Radix UI 原语封装，参见 shadcn/ui 文档。

### 展示

#### `Badge`

标签徽章。Variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`。

```tsx
import { Badge } from '@/components/ui/badge'
```

#### `Button`

按钮。Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`。Sizes: `default`, `sm`, `lg`, `icon`。

```tsx
import { Button } from '@/components/ui/button'
```

---

## 业务组件 (`src/components/business/`)

### 生成相关

#### `AdvancedSettings`

**核心组件** — 能力感知的高级参数面板。根据 adapter 类型自动显示/隐藏对应控件。可用于 GenerateForm、ArenaForm 或任何需要高级参数的场景。

```tsx
import { AdvancedSettings } from '@/components/business/AdvancedSettings'

;<AdvancedSettings
  adapterType={AI_ADAPTER_TYPES.NOVELAI} // 决定显示哪些控件
  params={advancedParams} // AdvancedParams 对象
  onChange={setAdvancedParams} // 更新回调
  hasReferenceImage={true} // 为 true 时显示 referenceStrength
  disabled={false}
/>
```

**各 adapter 显示的控件：**

| Adapter     | negativePrompt | guidanceScale | steps | seed | referenceStrength | quality | background | style |
| ----------- | :------------: | :-----------: | :---: | :--: | :---------------: | :-----: | :--------: | :---: |
| NovelAI     |       v        |       v       |   v   |  v   |         v         |         |            |       |
| fal.ai      |       v        |       v       |   v   |  v   |                   |         |            |       |
| HuggingFace |       v        |       v       |   v   |  v   |                   |         |            |       |
| Replicate   |       v        |       v       |   v   |  v   |                   |         |            |       |
| OpenAI      |                |               |       |      |                   |    v    |     v      |   v   |
| Gemini      | _(不显示面板)_ |               |       |      |                   |         |            |       |

#### `GenerateForm`

图片生成表单（Studio 页面主表单）。内部使用 `useGenerationForm` hook。无 props。

#### `VideoGenerateForm`

视频生成表单。无 props。

#### `ArenaForm`

竞技场对战表单。

```tsx
import { ArenaForm } from '@/components/business/ArenaForm'

;<ArenaForm isCreating={false} onBattle={(input: StartBattleInput) => {}} />
```

#### `ModelSelector`

模型下拉选择器。

```tsx
import { ModelSelector } from '@/components/business/ModelSelector'

;<ModelSelector
  value="sdxl"
  onChange={(modelId) => {}}
  options={studioModelOptions} // StudioModelOption[]
/>
```

#### `PromptEnhancer`

提示词增强面板（含风格选择 + 对比预览）。

```tsx
import { PromptEnhancer } from '@/components/business/PromptEnhancer'

;<PromptEnhancer
  prompt="a cat"
  isEnhancing={false}
  disabled={false}
  enhanced={null}
  enhancedOriginal={null}
  enhancedStyle={null}
  onEnhance={(style) => {}}
  onUseEnhanced={(text) => {}}
  onDismiss={() => {}}
/>
```

#### `ReverseEngineerPanel`

图片反向工程面板（上传图片 -> 生成提示词 -> 可选批量生成变体）。

```tsx
import { ReverseEngineerPanel } from '@/components/business/ReverseEngineerPanel'

;<ReverseEngineerPanel
  onUsePrompt={(prompt) => {}}
  selectedModels={[{ modelId: 'sdxl' }]}
/>
```

### API Key 管理

#### `ApiKeyManager`

API 密钥管理面板（完整的增删改查 + 健康检查）。无 props。

#### `ApiKeyForm`

新增 API Key 表单。

```tsx
<ApiKeyForm
  onAdd={(data: CreateApiKeyRequest) => Promise.resolve()}
  onCancel={() => {}}
  isSubmitting={false}
/>
```

#### `ApiKeyRow`

单条 API Key 显示行（含开关、删除、验证）。

#### `ApiKeyHealthDot`

API Key 健康状态指示灯。

```tsx
<ApiKeyHealthDot status="available" /> // 'available' | 'unavailable' | 'no_key' | undefined
```

### 画廊 & 展示

#### `ImageCard`

单张图片卡片（含缩略图、hover 预览、操作按钮）。

```tsx
<ImageCard
  generation={generationRecord}
  showVisibility={true}
  showDelete={true}
  onDelete={(id) => {}}
/>
```

#### `ImageDetailModal`

图片详情弹窗（含元数据、下载、可见性切换）。

#### `GalleryGrid`

图片网格布局（含空状态）。

#### `GalleryFeed`

画廊信息流（无限滚动 + 筛选）。

#### `GalleryFilterBar`

画廊筛选栏。

### 竞技场

#### `ArenaGrid`

对战结果网格（含投票、胜者标记、ELO 变化）。

#### `ArenaLeaderboard`

ELO 排行榜。

### 首页

| 组件                | 用途         |
| ------------------- | ------------ |
| `HomepageShell`     | 首页容器框架 |
| `HomepageHero`      | Hero 区域    |
| `HomepageFeatures`  | 功能特性展示 |
| `HomepageModels`    | 支持模型展示 |
| `HomepageWorkflow`  | 工作流程展示 |
| `HomepageSceneCard` | 场景卡片     |

---

## Hooks (`src/hooks/`)

### 表单 & 输入

#### `useGenerationForm`

生成表单的共享状态管理，组合了 `useImageUpload` + `usePromptEnhance`。

```tsx
import { useGenerationForm } from '@/hooks/use-generation-form'

const {
  prompt,
  setPrompt,
  aspectRatio,
  setAspectRatio,
  advancedParams,
  setAdvancedParams,
  // 图片上传（委托自 useImageUpload）
  referenceImage,
  isDragging,
  fileInputRef,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  openFilePicker,
  handleInputChange,
  clearImage,
  // 提示词增强（委托自 usePromptEnhance）
  isEnhancing,
  enhanced,
  enhancedOriginal,
  enhancedStyle,
  enhancePrompt,
  clearEnhancement,
  applyEnhancedPrompt,
  // 工具
  resetForm,
} = useGenerationForm({ defaultAspectRatio: '1:1' })
```

#### `useImageUpload`

图片上传状态管理（拖拽 + 文件选择 + base64 转换）。

```tsx
import { useImageUpload } from '@/hooks/use-image-upload'

const {
  referenceImage, // string | undefined (base64 data URL)
  isDragging,
  fileInputRef,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  openFilePicker,
  handleInputChange,
  clearImage,
} = useImageUpload()
```

#### `usePromptEnhance`

提示词增强（调用 AI 优化提示词）。

```tsx
import { usePromptEnhance } from '@/hooks/use-prompt-enhance'

const {
  isEnhancing,
  enhanced, // 增强后的提示词
  original, // 增强前的原始提示词
  style, // 使用的增强风格
  enhance, // (prompt, style, apiKeyId?) => Promise
  clearEnhancement,
} = usePromptEnhance()
```

### 生成 & API 调用

#### `useGenerateImage`

图片生成 hook。

```tsx
import { useGenerateImage } from '@/hooks/use-generate'

const {
  isGenerating,
  error,
  generatedGeneration, // GenerationRecord | null
  generate, // (params: GenerateRequest) => Promise
  reset,
} = useGenerateImage()
```

#### `useGenerateVideo`

视频生成 hook（含排队 + 轮询状态）。

```tsx
import { useGenerateVideo } from '@/hooks/use-generate-video'

const {
  isGenerating,
  stage, // 'idle' | 'queued' | 'generating' | 'uploading'
  elapsedSeconds,
  error,
  generatedGeneration,
  generate, // (params: GenerateVideoRequest) => Promise
  reset,
} = useGenerateVideo()
```

#### `useArena`

竞技场对战流程管理。

```tsx
import { useArena } from '@/hooks/use-arena'

const {
  step, // 'idle' | 'creating' | 'generating' | 'voting' | 'revealed'
  matchId,
  match, // ArenaMatchRecord | null
  eloUpdates,
  error,
  entryProgress, // EntryProgress[]
  startBattle, // (input: StartBattleInput) => Promise
  vote, // (entryId: string) => Promise
  reset,
} = useArena()
```

`StartBattleInput`:

```ts
interface StartBattleInput {
  prompt: string
  aspectRatio: AspectRatio
  models?: ArenaModelSelection[]
  referenceImage?: string
  advancedParams?: AdvancedParams
}
```

#### `useAsyncAction`

通用异步操作封装（loading/error/data 状态管理）。

```tsx
import { useAsyncAction } from '@/hooks/use-async-action'

const { execute, isLoading, error, data, reset } = useAsyncAction(asyncFn)
```

### 数据管理

#### `useApiKeys`

API 密钥 CRUD + 健康检查。

```tsx
import { useApiKeys } from '@/hooks/use-api-keys'

const {
  keys, // UserApiKeyRecord[]
  isLoading,
  error,
  healthMap, // Record<string, ApiKeyHealthStatus>
  create,
  update,
  remove,
  verify,
  refresh,
} = useApiKeys()
```

#### `useGallery`

画廊数据（无限滚动 + 筛选）。

#### `useGenerationVisibility`

图片可见性切换。

#### `useReverseImage`

图片反向工程流程。

#### `useOnboarding`

新手引导步骤管理。

---

## 能力系统 (`src/constants/provider-capabilities.ts`)

控制不同 AI 提供商支持哪些高级参数。新增模型/提供商时必须在此注册。

### 类型

```ts
type ProviderCapability =
  | 'negativePrompt'
  | 'guidanceScale'
  | 'steps'
  | 'seed'
  | 'referenceStrength'
  | 'quality'
  | 'background'
  | 'style'

interface NumericRange {
  min: number
  max: number
  step: number
  default: number
}

interface CapabilityConfig {
  capabilities: readonly ProviderCapability[]
  guidanceScale?: NumericRange
  steps?: NumericRange
  referenceStrength?: NumericRange
  qualityOptions?: readonly string[]
  styleOptions?: readonly string[]
  backgroundOptions?: readonly string[]
}
```

### API

```ts
import {
  hasCapability,
  getCapabilityConfig,
  ADAPTER_CAPABILITIES,
} from '@/constants/provider-capabilities'

// 检查某 adapter 是否支持某能力
hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'negativePrompt') // true
hasCapability(AI_ADAPTER_TYPES.GEMINI, 'negativePrompt') // false

// 获取完整能力配置
const config = getCapabilityConfig(AI_ADAPTER_TYPES.NOVELAI)
// config.guidanceScale => { min: 1, max: 20, step: 0.5, default: 5 }
```

### 新增提供商步骤

1. 在 `ADAPTER_CAPABILITIES` 中添加新 adapter 的 `CapabilityConfig`
2. 在对应 adapter 的 `generateImage()` 中读取 `advancedParams`
3. `AdvancedSettings` 组件会自动适配，无需修改

---

## 数据流概览

```
用户操作
  └─> 业务组件 (business/)
       ├─> hooks/ (状态管理)
       │    └─> lib/api-client.ts (HTTP 调用)
       │         └─> app/api/ (路由)
       │              └─> services/ (业务逻辑)
       │                   └─> providers/ (AI 适配器)
       └─> ui/ (展示)
```

### 高级参数数据流

```
AdvancedSettings 组件
  └─> advancedParams state (hook)
       └─> api-client (POST body)
            └─> API route (Zod 校验)
                 └─> service (generateImageForUser)
                      └─> adapter.generateImage({ advancedParams })
```
