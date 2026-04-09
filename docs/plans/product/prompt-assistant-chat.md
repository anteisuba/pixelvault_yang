# Prompt 对话式助手

## Context

用户在 Studio 生成图片时，写 prompt 是最大的门槛。即使有 Image Reverse 提取画风，用户仍然需要手动拼接。不同模型（NovelAI 用 tag、FLUX 用自然语言、Kontext 用指令式）需要完全不同的 prompt 格式。

核心需求：用户用自然语言描述意图 → AI 理解参考图 + 意图 + 当前模型 → 输出该模型专用的专业 prompt → 可迭代修改。

## UI 交互

### 入口

点击底部工具栏 **追加** 按钮 → 右侧弹出侧边栏

### 侧边栏布局

```
┌─────────────────────────────────────┐
│  Prompt 助手                    ✕   │
├─────────────────────────────────────┤
│  [详细] [艺术] [写实] [动漫] [标签]  │  ← 风格预设快捷入口
│  ─────────────────────────────────  │
│  当前模型: KontextMax (fal.ai)      │  ← 自动检测，影响输出格式
│                                     │
│  [参考图缩略图] (如果已上传)         │
│                                     │
│  用户: 保持画风，换个坐姿            │
│                                     │
│  AI: 根据 Kontext 指令格式:         │
│  ┌─────────────────────────────┐    │
│  │ Change the pose to sitting  │    │
│  │ elegantly. Maintain the     │    │
│  │ high-detail digital painting│    │
│  │ quality: intricate light... │    │
│  └─────────────────────────────┘    │
│              [填入 Prompt ✓]        │
│                                     │
│  用户: 背景换成星空                  │
│                                     │
│  AI: 已更新:                        │
│  ┌─────────────────────────────┐    │
│  │ ...against a vast starry    │    │
│  │ night sky with nebula...    │    │
│  └─────────────────────────────┘    │
│              [填入 Prompt ✓]        │
│                                     │
│  ┌─────────────────────────┐ [发送] │
│  │ 输入你的需求...          │        │
│  └─────────────────────────┘        │
└─────────────────────────────────────┘
```

### 风格预设快捷入口

顶部按钮点击 = 快捷指令，等同于用户在对话框输入：

- **详细** → "用详细风格增强当前 prompt，添加环境、光线、纹理细节"
- **艺术** → "用艺术风格增强，添加艺术运动、媒介、色彩参考"
- **写实** → "用摄影写实风格增强，添加镜头参数、光线设置"
- **动漫** → "用动漫风格增强，添加角色设计、氛围描述"
- **标签** → "转换为 danbooru 风格 tag 格式"

### 删除的 UI

- **增强按钮/面板** — 被对话式助手完全取代（PromptEnhancer, PromptEnhanceButton, PromptComparisonPanel）

## 模型感知 Prompt 生成

### 核心：根据当前模型自动适配输出格式

AI 助手感知当前选中的模型，输出该模型最适合的 prompt 格式：

| 模型                 | 输出格式     | 特点                                                                               |
| -------------------- | ------------ | ---------------------------------------------------------------------------------- |
| **NovelAI**          | Danbooru tag | `masterpiece, best quality, 1girl, pink_hair, (watercolor:1.3), soft_lighting`     |
| **FLUX Pro/Dev**     | 摄影自然语言 | `A young woman with pink hair, shot on 35mm f/2.8, golden hour rim lighting...`    |
| **Kontext Pro/Max**  | 指令式编辑   | `Change the pose to sitting. Keep the exact same character. Maintain...`           |
| **Gemini**           | 详细自然语言 | `Create an image of... with rich visual detail, specific spatial relationships...` |
| **OpenAI GPT Image** | 构图+情绪    | `A contemplative scene depicting... emphasizing mood and composition...`           |
| **SeedDream**        | 简洁中英文   | `女孩坐在王座上，粉色长发，数字绘画风格，光效粒子`                                 |
| **Ideogram**         | 设计+排版    | `Logo design: minimalist geometric... Text: "TITLE" in bold sans-serif...`         |
| **Recraft**          | 插画+设计    | `Professional illustration, clean vector style, consistent color harmony...`       |

### System Prompt 设计

```
You are a professional AI image generation prompt engineer.

CURRENT MODEL: {modelId} ({adapterType})
MODEL PROMPT STYLE: {modelStrength.enhanceHint}

The user will describe what they want in natural language (any language).

{如果有参考图}
A reference image is attached. Analyze its visual characteristics
(art medium, color palette, lighting, texture, composition, mood)
and incorporate those qualities into the prompt unless the user
explicitly asks to change them.

RULES:
- Output ONLY the prompt text in a markdown code block
- Adapt the output format to the current model:
  * NovelAI → danbooru comma-separated tags with quality/emphasis
  * FLUX → photographic natural language with camera/lens details
  * Kontext → instruction-style ("Change X to Y. Keep Z the same.")
  * Gemini/OpenAI → rich descriptive natural language
  * SeedDream → concise bilingual descriptions
- Be specific about visual details
- Preserve the user's intent exactly
- Each response is a complete, ready-to-use prompt
- Support multi-turn: build on previous context
```

## 后端

### API

```
POST /api/prompt/assistant
{
  messages: { role: 'user' | 'assistant', content: string }[],
  referenceImageUrl?: string,   // 当前参考图 URL 或 base64
  modelId?: string,             // 当前选中模型
  adapterType?: string,         // 适配器类型
  currentPrompt?: string        // 当前 prompt 区内容
}

Response:
{
  success: true,
  data: { prompt: string }      // 生成的 prompt
}
```

### Service

`src/services/prompt-assistant.service.ts`:

- 复用 `llmTextCompletion()` (multimodal，支持传参考图)
- 复用 `getModelEnhanceHint()` 获取模型特定指令
- 复用 `resolveLlmTextRoute()` 解析可用 LLM
- 保持对话上下文（messages 数组）

### 风格预设快捷指令

点击顶部风格按钮时，等同于向对话追加一条 user message：

```ts
const STYLE_SHORTCUTS: Record<string, string> = {
  detailed:
    'Enhance with rich environment, lighting, material, and texture details.',
  artistic:
    'Enhance with art style references, medium descriptions, and color palette.',
  photorealistic:
    'Enhance with camera parameters, lens specs, lighting setup, and film stock.',
  anime:
    'Enhance with anime descriptors, character design details, and atmosphere.',
  tags: 'Convert to danbooru-style comma-separated tags for NovelAI.',
}
```

## 改动清单

| 文件                                                     | 改动                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `src/app/api/prompt/assistant/route.ts`                  | 新建 — 对话式 prompt 生成 API                              |
| `src/services/prompt-assistant.service.ts`               | 新建 — 对话处理 + multimodal LLM + 模型感知                |
| `src/hooks/use-prompt-assistant.ts`                      | 新建 — 对话状态管理 (messages, send, fill)                 |
| `src/components/business/PromptAssistantPanel.tsx`       | 新建 — 对话 UI + 风格快捷按钮                              |
| `src/components/business/studio/StudioDockPanelArea.tsx` | 追加按钮 → 打开助手侧边栏                                  |
| `src/contexts/studio-context.tsx`                        | PanelName 加 'assistant'                                   |
| `src/constants/model-strengths.ts`                       | 已有 — 提供 enhanceHint                                    |
| `src/types/index.ts`                                     | PromptAssistantRequest/Response schema                     |
| `src/messages/{en,ja,zh}.json`                           | i18n                                                       |
| 删除/废弃                                                | PromptEnhancer, PromptEnhanceButton, PromptComparisonPanel |

## 执行顺序

1. 后端: API route + service (对话 + multimodal + 模型感知)
2. Hook: use-prompt-assistant
3. UI: PromptAssistantPanel (对话框 + 风格预设横排)
4. 集成: 追加按钮 → 打开助手
5. 清理: 删除旧增强组件
6. i18n
