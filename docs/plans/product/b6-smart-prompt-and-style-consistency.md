# B6 智能提示词 + Recipe 风格一致性优化 v2

## Context

三个相关问题：

1. **快速生成画风趋同** — prompt enhance 不感知模型，所有模型用同一套增强逻辑
2. **卡片生成角色/背景与画风不统一** — recipe compiler 把 style 当平级输入，没有渗透
3. **无法从参考图提取特定维度** — Image Reverse 输出一大段混合 prompt，用户无法选择性提取画风/角色/背景

v2 方案核心变化：**从 Image Reverse 入手**，让用户上传图片后选择提取维度（画风/角色/背景/整体），而非输出一个 blob。

---

## Part A: Image Reverse 结构化提取（核心改动）

### A1. 选择维度 → 按需提取 [核心交互]

用户上传图片后，**先出现多选项**让用户选择要提取的维度，选完再调 AI：

```
┌─────────────────────────────────┐
│  [源图缩略图]                    │
│                                  │
│  从这张图提取什么？（可多选）      │
│  ☐ 🎨 画风 (Art Style)          │
│  ☐ 👤 角色 (Character)          │
│  ☐ 🏞 背景 (Background)         │
│  ☐ 📋 整体 (Overall)            │
│                                  │
│           [提取 →]               │
└─────────────────────────────────┘
          ↓ 点击提取
┌─────────────────────────────────┐
│  🎨 画风:                        │
│  "水彩画风格，柔和透明色调..."     │
│                       [填入 ✓]   │
│  🏞 背景:                        │
│  "樱花树下，阳光斑驳..."          │
│                       [填入 ✓]   │
└─────────────────────────────────┘
```

好处：

- **省 token** — 选画风就只提取画风，不浪费 API 调用
- **更精准** — AI 专注一个维度，质量更高
- **更快** — 短任务响应更快

### A2. System Prompt 按维度动态生成 [后端]

**文件**: `src/services/image-analysis.service.ts`

新增 `dimensions` 参数，按选中的维度组装 system prompt：

```ts
type AnalysisDimension = 'artStyle' | 'character' | 'background' | 'overall'

// 每个维度有专门的提取指令
const DIMENSION_PROMPTS: Record<AnalysisDimension, string> = {
  artStyle:
    'Focus ONLY on the visual style: art medium, technique, color palette, mood, lighting, brush strokes, influences. Ignore characters and specific objects.',
  character:
    'Focus ONLY on the characters/people: appearance, clothing, pose, expression, accessories. Ignore background and style.',
  background:
    'Focus ONLY on the environment/setting: location, architecture, nature, weather, time of day. Ignore characters.',
  overall:
    'Describe the entire image as a complete AI image generation prompt covering all aspects.',
}
```

用户选了 [画风, 背景] → system prompt 拼接两个维度指令 → LLM 返回 JSON `{ artStyle: "...", background: "..." }`

### A3. 类型 + API 更新

**文件**: `src/types/index.ts` + `src/app/api/image/analyze/route.ts`

```ts
export const AnalyzeImageRequestSchema = z.object({
  imageData: z.string().min(1),
  dimensions: z
    .array(z.enum(['artStyle', 'character', 'background', 'overall']))
    .min(1),
  apiKeyId: z.string().optional(),
})
```

响应保持 `generatedPrompt`（兼容旧行为 = overall），新增 `dimensions` 结果：

```ts
export interface AnalyzeImageResponseData {
  id: string
  generatedPrompt: string // 兼容：overall 维度的文本
  dimensions: Record<string, string> | null // 新增：选中维度的结果
  sourceImageUrl: string
}
```

### A4. ReverseEngineerPanel UI 改造 [前端]

**文件**: `src/components/business/ReverseEngineerPanel.tsx`

两阶段 UI：

1. **选择阶段**: 图片上传后显示 4 个 checkbox + [提取] 按钮
2. **结果阶段**: 每个选中维度显示提取结果 + 独立 [填入 Prompt] 按钮

[填入] 按钮行为：

- 单个维度 → 直接填入 prompt 区
- 多个维度勾选填入 → 用换行合并填入

### A5. 风格迁移工作流 [串联]

有了 A1-A4，风格迁移自然实现：

1. 用户上传**风格源图** → 选 [🎨 画风] → 提取 → 点 [填入]
2. artStyle prompt 自动填入 prompt 区
3. 用户上传**内容源图**作为 reference image
4. 点击生成 → 内容保留（reference image）+ 画风改变（artStyle prompt）

无需新建功能，复用现有 UI 流程。

---

## Part B: 卡片生成 — Recipe Compiler 风格渗透

### B1. 改进 LLM Fusion System Prompt [核心]

**文件**: `src/services/recipe-compiler.service.ts`

`buildFusionSystemPrompt()` (line 67-93) 改进 Rules：

自然语言版（Gemini/OpenAI/FLUX 等）：

```
- The STYLE input defines the visual language for the entire image.
  Apply the style's color palette, mood, medium, and aesthetic
  to how you describe the character AND the background.
- Do NOT just append style keywords. Instead, describe the character
  and background IN the style's visual language from the start.
- Example: if style is "watercolor," describe the character with
  soft edges, transparent washes, muted tones — not "a girl, watercolor style."
- The output should feel like a single cohesive prompt where every
  element belongs to the same artistic world.
```

Tag-based 版（NovelAI）：

```
- Style tags should MODIFY character and background tags, not just be appended.
- Apply style modifiers to character tags (e.g., watercolor_portrait, ink_sketch_style).
- Most important: subject + style-modified character tags first, then background + quality.
```

### B2. 传递结构化风格属性 [增强]

**文件**: `src/services/recipe-compiler.service.ts`

compileWithLlm() 的 user message 中增加结构化属性：

```
STYLE: ${parts.stylePrompt}

STYLE ATTRIBUTES (apply these to ALL elements):
- Art Style: ${attributes.artStyle}
- Color Palette: ${attributes.colorPalette}
- Mood: ${attributes.mood}
- Influences: ${attributes.influences}
```

**改动链**:

1. `src/services/recipe-compiler.service.ts` — system prompt + user message
2. `src/services/card-recipe.service.ts` — compile 时传入 styleCard.attributes

---

## Part C: 模型能力矩阵 + 增强感知

### C1. 模型能力矩阵 [新增]

**新建文件**: `src/constants/model-strengths.ts`

```ts
export interface ModelStrength {
  bestFor: string[] // ['photorealistic', 'portrait', 'product']
  promptStyle: 'natural-language' | 'tag-based'
  enhanceHint: string // 注入 prompt enhance 的模型特定指令
}
```

提取现有 `MODEL_PROMPT_HINTS`（recipe-compiler.service.ts:50-65）为共享常量，
并扩展到每个模型级别（不仅 adapter 级别）。

### C2. 模型感知 Prompt Enhancement [后端]

**文件**: `src/services/prompt-enhance.service.ts`

enhancePrompt() 新增 `modelId` 参数，查 C1 的矩阵注入 hint：

```ts
const modelHint = getModelEnhanceHint(modelId)
const systemPrompt = `${STYLE_SYSTEM_PROMPTS[style]}\n\n${modelHint}`
```

---

## 执行顺序

| 步骤 | 内容                                                 | 时间   |
| ---- | ---------------------------------------------------- | ------ |
| 1    | **B1** Fusion system prompt 风格渗透                 | 20 min |
| 2    | **B2** 传递结构化风格属性                            | 15 min |
| 3    | **A2** Image Reverse 后端：维度 system prompt + 类型 | 30 min |
| 4    | **A3** Image Reverse API 路由更新                    | 10 min |
| 5    | **A4** ReverseEngineerPanel UI：选择 → 提取 → 填入   | 1 hr   |
| 6    | **C1** 模型能力矩阵                                  | 20 min |
| 7    | **C2** 模型感知增强                                  | 20 min |
| 8    | **i18n** en/ja/zh 同步                               | 15 min |

## 验证

1. `npx tsc --noEmit` + `npx vitest run` 通过
2. Image Reverse: 上传图片 → 看到 4 个分类（画风/角色/背景/整体）
3. 点 "画风 [使用]" → 只有画风描述填入 prompt
4. 卡片生成: 角色卡 + "浮世绘"风格卡 → 输出 prompt 中角色描述使用浮世绘语言
5. 增强: 选 FLUX Pro 增强 → 出现摄影术语；选 NovelAI → 出现 danbooru tag

## 关键文件

| 文件                                               | 改动                                |
| -------------------------------------------------- | ----------------------------------- |
| `src/services/image-analysis.service.ts`           | 结构化 system prompt + JSON 解析    |
| `src/types/index.ts`                               | ImageAnalysisCategories schema      |
| `src/components/business/ReverseEngineerPanel.tsx` | 分类展示 + 选择使用 UI              |
| `src/hooks/use-reverse-image.ts`                   | 状态管理支持 categories             |
| `src/services/recipe-compiler.service.ts`          | fusion prompt 风格渗透 + attributes |
| `src/services/card-recipe.service.ts`              | 传入 styleCard.attributes           |
| `src/constants/model-strengths.ts`                 | 新建 — 模型能力矩阵                 |
| `src/services/prompt-enhance.service.ts`           | 模型感知 system prompt              |
| `src/messages/{en,ja,zh}.json`                     | i18n                                |
