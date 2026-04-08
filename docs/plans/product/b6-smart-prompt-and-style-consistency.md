# B6 智能提示词 + Recipe 风格一致性优化

## Context

两个独立但相关的问题：

1. **快速生成**画风趋同 — prompt enhance 的 5 个 system prompt 不感知当前模型，所有模型用同一套增强逻辑
2. **卡片生成**角色/背景与画风不统一 — recipe compiler 的 LLM fusion prompt 把 style 当作平级输入拼接，没有让风格"渗透"到角色和背景描述中

两个问题分别修改，互不依赖。

---

## Part A: 快速生成 — 模型感知增强 + 场景模板

### A1. 模型感知 Prompt Enhancement [后端]

**修改文件**: `src/services/prompt-enhance.service.ts`

当前 `enhancePrompt()` 签名：`(clerkId, prompt, style, apiKeyId?)`
新增 `modelId` 参数：`(clerkId, prompt, style, modelId?, apiKeyId?)`

根据 modelId 解析 adapterType，在 system prompt 中注入模型特定指令：

- FLUX/FAL: "优先使用摄影术语、镜头参数、自然光描述"
- NovelAI: "输出 danbooru 风格 tag，quality tags 在前"
- Gemini/OpenAI: "详细自然语言，注重构图和情绪"
- SeedDream/VolcEngine: "简洁清晰，中英文均可"

复用已有的 `MODEL_PROMPT_HINTS`（recipe-compiler.service.ts:50-65），提取为共享常量。

**改动链**:

1. `src/services/prompt-enhance.service.ts` — 签名 + system prompt 注入
2. `src/app/api/prompt/enhance/route.ts` — request schema 加 `modelId?`
3. `src/types/index.ts` — `PromptEnhanceRequestSchema` 加 `modelId`
4. `src/hooks/use-prompt-enhance.ts` — enhance() 传 modelId
5. `src/components/business/studio/StudioDockPanelArea.tsx` — 传当前 selectedModel

### A2. 场景灵感模板 [新增]

**新建文件**: `src/constants/prompt-templates.ts`

定义 10+ 场景模板，每个模板包含：

```ts
interface PromptTemplate {
  id: string
  messageKey: string // i18n key
  category:
    | 'portrait'
    | 'landscape'
    | 'anime'
    | 'concept'
    | 'photo'
    | 'abstract'
  prompt: string // 英文基础 prompt
  suggestedModels: AI_MODELS[] // 推荐模型列表
  aspectRatio: AspectRatio
  tags: string[] // 搜索用
}
```

模板示例：

- 赛博朋克街景（FLUX Pro, 16:9）
- 浮世绘风景（SeedDream, 3:4）
- 水彩人物（Gemini Flash, 1:1）
- 胶片风街拍（FLUX Pro, 3:4）
- 极简 Logo（Ideogram 3, 1:1）
- 奇幻角色（NovelAI, 3:4）
- 建筑摄影（Recraft, 16:9）
- 漫画分镜（NovelAI, 1:1）
- 产品渲染（OpenAI GPT Image, 1:1）
- 油画风景（Gemini, 16:9）

### A3. 灵感模板 UI [前端]

**修改文件**: `src/components/business/studio/StudioDockPanelArea.tsx`

在 prompt 输入区增加"灵感"按钮，点击展开模板面板：

- 分类筛选（portrait/landscape/anime/...）
- 每个模板卡片显示：缩略描述 + 推荐模型 badge + 宽高比
- 点击 → 自动填入 prompt + 设置 aspectRatio + 建议模型

复用已有 panel 机制（`TOGGLE_PANEL` action），新增 panel name `'templates'`。

**改动链**:

1. `src/constants/prompt-templates.ts` — 新建模板数据
2. `src/contexts/studio-context.tsx` — PanelName 加 `'templates'`
3. `src/components/business/studio/StudioToolbarPanels.tsx` — 添加灵感按钮
4. `src/components/business/studio/StudioDockPanelArea.tsx` — 渲染模板面板
5. `src/components/business/PromptTemplatePanel.tsx` — 新建模板选择面板
6. `src/messages/en.json`, `ja.json`, `zh.json` — i18n

---

## Part B: 卡片生成 — Recipe Compiler 风格渗透

### B1. 改进 LLM Fusion System Prompt [核心]

**修改文件**: `src/services/recipe-compiler.service.ts`

当前 `buildFusionSystemPrompt()` (line 67-93) 的问题：

- "Start with the subject/character, then integrate the action, background, and style naturally" — 风格排最后
- 没有明确指示"用风格的视觉语言重新描述角色和背景"

改为（自然语言版）：

```
Rules:
- The STYLE input defines the visual language for the entire image.
  Apply the style's color palette, mood, medium, and aesthetic
  to how you describe the character AND the background.
- For example, if the style is "watercolor painting," describe the
  character with soft edges, transparent washes, and muted tones —
  not just append "watercolor" at the end.
- Start with the subject/character described IN the style's visual language,
  then integrate the environment/background IN the same style.
- The output should feel like a single cohesive prompt where every element
  belongs to the same artistic world.
```

Tag-based（NovelAI）版本：

```
- Style tags should MODIFY character and background tags, not just be appended.
- Example: if style is "watercolor," use tags like "(watercolor:1.3), soft_edges,
  transparent_colors" AND apply them to character (e.g., watercolor_portrait)
  rather than just listing them separately.
```

### B2. 传递结构化风格属性 [增强]

**修改文件**: `src/services/recipe-compiler.service.ts`

当前 `compileWithLlm()` 只接收 `stylePrompt` 字符串。
StyleCard 已有 `attributes`（artStyle, colorPalette, mood, influences），但没被用。

改进 user message 构造：

```
STYLE: ${parts.stylePrompt}

STYLE ATTRIBUTES (use these to harmonize all elements):
- Art Style: ${attributes.artStyle}
- Color Palette: ${attributes.colorPalette}
- Mood: ${attributes.mood}
- Influences: ${attributes.influences}
```

**改动链**:

1. `src/services/recipe-compiler.service.ts` — system prompt 改进 + 传入 attributes
2. `src/services/card-recipe.service.ts` — compile 时传入 styleCard.attributes

### B3. 风格关键词验证 [质量保障]

**修改文件**: `src/lib/llm-output-validator.ts`

已有 `validateFusionOutput()` 检查角色关键词保留。新增风格关键词检查：

- 提取 style prompt 中的核心词（art style name, mood, palette）
- 检查编译后 prompt 是否包含至少 2 个风格关键词
- 不包含 → 警告日志（不拒绝，避免误杀）

---

## 执行顺序

1. **Part B1** (30 min) — 改 fusion system prompt，立即提升卡片生成质量
2. **Part B2** (20 min) — 传递结构化属性，进一步增强
3. **Part A1** (30 min) — 模型感知增强，改善快速生成多样性
4. **Part A2 + A3** (1-2 hr) — 场景模板数据 + UI
5. **Part B3** (20 min) — 风格验证
6. **i18n** (15 min) — en/ja/zh 三语言同步

## 验证

1. `npx tsc --noEmit` + `npx vitest run` 通过
2. 快速生成：同一 prompt 用 FLUX vs NovelAI 增强 → 产出明显不同的增强结果
3. 卡片生成：角色卡 + "浮世绘"风格卡 → 角色描述使用浮世绘视觉语言
4. 模板：点击"赛博朋克"模板 → prompt 自动填充 + 模型建议 FLUX Pro

## 关键文件

| 文件                                                     | 改动                                     |
| -------------------------------------------------------- | ---------------------------------------- |
| `src/services/recipe-compiler.service.ts`                | fusion prompt 风格渗透 + 传入 attributes |
| `src/services/prompt-enhance.service.ts`                 | 模型感知 system prompt                   |
| `src/constants/prompt-templates.ts`                      | 新建 — 10+ 场景模板                      |
| `src/app/api/prompt/enhance/route.ts`                    | request schema 加 modelId                |
| `src/types/index.ts`                                     | PromptEnhanceRequestSchema               |
| `src/hooks/use-prompt-enhance.ts`                        | enhance() 传 modelId                     |
| `src/components/business/studio/StudioDockPanelArea.tsx` | 传 modelId + 模板面板                    |
| `src/components/business/PromptTemplatePanel.tsx`        | 新建 — 模板选择 UI                       |
| `src/contexts/studio-context.tsx`                        | PanelName 加 'templates'                 |
| `src/lib/llm-output-validator.ts`                        | 风格关键词验证                           |
| `src/messages/{en,ja,zh}.json`                           | i18n                                     |
