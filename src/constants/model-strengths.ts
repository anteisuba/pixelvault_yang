/**
 * Model-level strengths and prompt hints.
 *
 * Used by prompt-enhance.service to generate model-aware enhancement,
 * and can be surfaced in the UI for model recommendations.
 */

import { AI_MODELS } from '@/constants/models'
import { MEDIA_MODEL_STRENGTHS } from '@/constants/model-strengths.media'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * 负向提示的能力档位 —— 这是**产品事实**，不是偏好：
 * - `unsupported` 请求体里根本没有这个字段，写了就是静默丢弃（FLUX / gpt-image /
 *   Gemini / Ideogram / Recraft 都是这一档，官方文档明写「用正向说法代替」）；
 * - `supported` 有常规 negative_prompt 字段；
 * - `nouns-only` 有字段但**禁止否定词**，只能写名词（Veo 一类）；
 * - `undesired-content` NovelAI 的 UC 字段，自带一套强调语法。
 */
export const NEGATIVE_PROMPT_SUPPORTS = [
  'unsupported',
  'supported',
  'nouns-only',
  'undesired-content',
] as const

export type NegativePromptSupport = (typeof NEGATIVE_PROMPT_SUPPORTS)[number]

export interface ModelStrength {
  /** What this model excels at */
  bestFor: string[]
  /** Prompt output format preference */
  promptStyle: 'natural-language' | 'tag-based'
  /** Hint injected into prompt enhancement system prompt */
  enhanceHint: string
  /** Whether the target takes a negative prompt, and in which dialect */
  negativePrompt: NegativePromptSupport
  /**
   * Editing dialect, for models whose image-edit path is written differently
   * from their generation path. Absent on generation-only models.
   */
  editHint?: string
  /** Static Round-1 routing weights. Values are normalized 0.0-1.0. */
  routerWeights?: Partial<ModelRouterWeights>
}

export interface ModelRouterWeights {
  referenceFit: number
  costEfficiency: number
  latency: number
  health: number
}

export const DEFAULT_MODEL_ROUTER_WEIGHTS: ModelRouterWeights = {
  referenceFit: 0.4,
  costEfficiency: 0.6,
  latency: 0.6,
  health: 0.8,
}

export const MODEL_ROUTER_SCORE_WEIGHTS = {
  taskFit: 40,
  styleFit: 30,
  referenceFit: 12,
  costEfficiency: 8,
  latency: 6,
  health: 4,
  preferenceBoost: 8,
} as const

export const USER_PREFERENCE_WEIGHT = 0.15

/**
 * Per-adapter fallback hints (shared with recipe-compiler).
 * When a specific model isn't in MODEL_STRENGTHS, use this.
 */
export const ADAPTER_PROMPT_HINTS: Record<string, string> = {
  [AI_ADAPTER_TYPES.FAL]:
    'Target model: FLUX. Prefer photographic terminology, specific lens/camera details, precise lighting descriptions, and full natural language sentences.',
  [AI_ADAPTER_TYPES.NOVELAI]:
    'Target model: NovelAI (anime diffusion). Prefer comma-separated danbooru-style tags. Quality tags first, then character tags, then style and scene. Natural-language sentences are acceptable on V5 but tags remain the reliable dialect. A reference image is optional: one image becomes img2img, not a character lock. Do not assume Director / Vibe Transfer.',
  [AI_ADAPTER_TYPES.GEMINI]:
    'Target model: Gemini image generation. Prefer natural, descriptive English sentences with rich visual detail.',
  [AI_ADAPTER_TYPES.VOLCENGINE]:
    'Target model: Seedream (VolcEngine). Prefer concise, clear descriptions. Works well with both English and Chinese.',
  [AI_ADAPTER_TYPES.OPENAI]:
    'Target model: GPT Image. Prefer detailed natural language descriptions with emphasis on composition and mood.',
  [AI_ADAPTER_TYPES.DEEPSEEK]:
    'Target model: DeepSeek text planning. Prefer structured, concrete cinematic writing with clear story beats, scene logic, and production-ready details.',
  [AI_ADAPTER_TYPES.HUGGINGFACE]:
    'Target model: Stable Diffusion. Prefer comma-separated descriptive phrases with quality modifiers.',
  [AI_ADAPTER_TYPES.REPLICATE]:
    'Target model: Replicate hosted model. Prefer detailed natural language descriptions.',
  [AI_ADAPTER_TYPES.BYTEPLUS]:
    'Target model: Seedream / Seedance (BytePlus ModelArk — same family as VolcEngine). Prefer structured, concrete clauses in a fixed order: subject, action, environment, camera, lighting, style. Chinese and English both work equally well. Do not mix in tag or weight syntax.',
  [AI_ADAPTER_TYPES.FISH_AUDIO]:
    'Target model: Fish Audio S2 (text-to-speech). The prompt IS the spoken script — write the exact words to be said, with real punctuation, and nothing else. Delivery is steered by square-bracket emotion tags such as [sad], [excited], [whispering]: put one at the start of the sentence it colours, and use at most three in a script. No stage directions, no visual language.',
  [AI_ADAPTER_TYPES.ELEVENLABS]:
    'Target model: ElevenLabs v3 (speech), SFX v2, and Music v2. For speech the prompt IS the spoken script; delivery comes from inline audio tags in square brackets such as [whispers], [laughs], [sighs], [sarcastic] — only audible events, never visual direction. SSML is not supported: shape pacing with punctuation and tags instead. For sound effects and music, describe the sound itself, not a picture of it.',
  [AI_ADAPTER_TYPES.MINIMAX]:
    'Target model: MiniMax H3 (video). Prefer plain natural-language sentences in shot order: what is in frame, what moves, how the camera moves. No tag syntax and no weight brackets.',
  // 两个站同一个模型，方言自然也是同一条（见 registry 的 MINIMAX_CN 注释）。
  [AI_ADAPTER_TYPES.MINIMAX_CN]:
    'Target model: MiniMax H3 (video, CN station — same model as the global one). Prefer plain natural-language sentences in shot order: what is in frame, what moves, how the camera moves. Chinese works as well as English. No tag syntax and no weight brackets.',
  [AI_ADAPTER_TYPES.RUNNER]:
    'Target model: self-hosted SDXL / Illustrious / Pony checkpoint on the Comfy runner. Prefer English comma-separated danbooru-style tags with quality tags first, then subject, then scene. Parenthesised weights such as (tag:1.2) are parsed here. Negatives are tags, not sentences.',
  /**
   * ⛔ 纯文本 LLM 线路（ANTHROPIC / XAI）**有意不列**：`ADAPTER_PROMPT_HINTS` 说的是
   * 「送进生成器的那段文字该长什么样」，而这两条线路不出图/不出声，只做结构化推理，
   * 由各自的任务系统提示词管形状。给它们编一条「提示词方言」等于凭空多一条约束。
   * DEEPSEEK 上面有条目是因为它同时承担有输出形状要求的文本任务。
   */
}

/**
 * NovelAI 的权重语法 —— **不是** A1111 那套圆括号加冒号数字。写错的代价很具体：
 * 那串括号不会被当成权重，而是被当作普通 token 喂进 tokenizer，用户看到的是
 * 「加了权重但画面没反应，还多了奇怪的东西」。
 * 来源 https://docs.novelai.net/en/image/
 */
const NOVELAI_PROMPT_SYNTAX =
  'Emphasis is NovelAI-specific: {tag} multiplies weight by 1.05 per brace layer, [tag] divides by 1.05; V4+ also takes numeric emphasis 1.3::tag :: and V4.5+ negative emphasis -1::tag ::. A1111 parenthesised weights are read as literal text. Multiple characters: shared scene first, then base and per-character segments split by |, each without a count tag. Our layer sends no character positions, so | is ordering only, never placement. Letters to render go last as Text: the words. Unwanted content goes in the Undesired Content field as tags, where {tag} means avoid harder.'

// ── 各家官方 prompt 指南的共用方言片段 ─────────────────────────────
// 同族模型共享一份写法，逐 id 只补自己的差异（档位、站点、能力边界）。

/** 来源 https://docs.bfl.ai/guides/prompting_guide_flux2 */
const FLUX2_PROMPT_SYNTAX =
  'Write 30-80 words of plain English. Word order carries weight: the subject and its single most important detail go first, background last. Structured JSON prompts are officially supported and are the better shape once several subjects must be placed — {"scene": ..., "subjects": [{"description": ..., "position": ...}], "style": ..., "lighting": ...}. The API takes no negative prompt, so state the positive fact instead: sharp focus, clean background, even skin tone.'

/** 来源 https://docs.bfl.ai/guides/prompting_guide_kontext_i2i */
const FLUX_EDIT_DIALECT =
  'Change the named thing and nothing else: Change the car to red. Replace "OPEN" with "CLOSED". Name the target with a noun, never a pronoun, and spell out what must survive — while maintaining the same facial features, pose, framing and lighting. One change per sentence; vague verbs such as improve or enhance move the whole frame. Quote any text exactly as it should appear.'

/** 来源 https://ai.google.dev/gemini-api/docs/image-generation */
const GEMINI_PROMPT_FORMULA =
  'Write a narrative paragraph, never a comma-separated attribute list: subject, action, location, composition, then style and lighting as full sentences. Describe what should be in frame in positive terms — "an empty street at dawn" works, asking for the absence of cars does not, because a negated thing tends to appear. Aspect ratio is a request parameter, never prose. With several reference images say what each one contributes: the jacket from the second image worn by the person in the first. When editing, name the single element that changes and close with "Do not change any other elements." The API does not take a negative prompt.'

/** 来源 https://www.volcengine.com/docs/82379/1829186 */
const SEEDREAM_PROMPT_SYNTAX =
  'Chinese and English both work; stay under roughly 300 characters. Generation prompts read subject + action + environment, then camera, lighting and style as short clauses — not tags, not weights. Text to be rendered goes inside English double quotes. For a set, say how many images and what varies between them, e.g. a 4-image set, one per season. A negative prompt field exists here: fill it with plain nouns and short phrases.'

/** 来源 https://www.volcengine.com/docs/82379/1829186 */
const SEEDREAM_EDIT_DIALECT =
  'Edits read change-verb + target + attribute: Change the jacket to red leather. Replace the background with a rainy street. Name what must stay identical (face, pose, framing) in the same sentence, and quote any text to be rewritten exactly as it should appear.'

/** 来源 https://civitai.com/models/257749 · https://huggingface.co/OnomaAIResearch */
const SDXL_TAG_NEGATIVE_DIALECT =
  'Negatives are a long comma-separated tag string (worst quality, low quality, bad anatomy, jpeg artifacts, watermark, signature), never a sentence.'

/** Per-model strengths and enhancement hints */
export const MODEL_STRENGTHS: Partial<Record<AI_MODELS, ModelStrength>> = {
  // ── OpenAI ──────────────────────────────────────────────────────
  // 来源 https://developers.openai.com/api/docs/guides/image-generation
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: {
    bestFor: ['general', 'concept', 'creative', 'editing', 'text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint:
      'GPT Image 2. Write detailed natural language: subject, setting, composition, lighting, mood. Words that must be rendered go in quotes or ALL CAPS and stay short — long strings degrade. With multiple references, address them by position: Image 1: the model. Image 2: the jacket. Then instruct across them — put the jacket from Image 2 on the person in Image 1. Masks are prompt-guided rather than pixel-exact, so state the change and then write Do not change anything else. The API takes no negative prompt field: describe the wanted result, not the unwanted one.',
    editHint:
      'Editing is the same prompt box. Address each input as Image 1 / Image 2 in the order attached, say exactly what changes, and end with Do not change anything else. With a mask, the mask narrows the region but the sentence still has to name the change. Replace rendered words by quoting both: replace "SALE" with "SOLD".',
    routerWeights: {
      referenceFit: 0.9,
      costEfficiency: 0.45,
      latency: 0.6,
      health: 0.95,
    },
  },
  [AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE]: {
    bestFor: ['general', 'concept', 'creative', 'editing', 'text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint:
      'GPT Image 2.5 Flare. Describe the subject, composition, lighting and desired style in natural language. Quote text to render exactly. Identify reference images by position (Image 1, Image 2) and explain their roles. Describe the wanted result; there is no negative prompt field.',
    editHint:
      'Change only the named element and specify what to preserve. Refer to each source as Image 1 / Image 2 in attachment order. Quote replacement text exactly and keep unrelated details unchanged.',
  },
  [AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST]: {
    bestFor: ['general', 'concept', 'creative', 'editing', 'text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint:
      'GPT Image 2.5 Sunburst. Use precise natural-language instructions for composition, materials, lighting and fine details. Quote text to render exactly. Give every reference image a clear role and state what must remain consistent. There is no negative prompt field.',
    editHint:
      'Change the specified element with precise location and attributes. Identify sources as Image 1 / Image 2 in attachment order, preserve the subject and composition, and explicitly keep unrelated details unchanged.',
  },
  // ── Google Gemini ───────────────────────────────────────────────
  // 来源 https://ai.google.dev/gemini-api/docs/image-generation
  [AI_MODELS.GEMINI_PRO_IMAGE]: {
    bestFor: ['general', 'concept', 'text-in-image', 'instruction-following'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint: `Gemini 3 Pro Image. ${GEMINI_PROMPT_FORMULA} This tier holds the most references: up to 6 objects, 5 characters and 3 style images in one request — give each a role in the sentence instead of listing them.`,
    editHint:
      'Say which element changes and leave the rest alone: Change the mug on the desk to a glass tumbler. Do not change any other elements. For composites, name the role of every input image in the instruction.',
  },
  [AI_MODELS.GEMINI_FLASH_IMAGE]: {
    bestFor: ['general', 'concept', 'text-in-image', 'instruction-following'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint: `Gemini 3.1 Flash Image. ${GEMINI_PROMPT_FORMULA} It accepts up to 14 reference images, so it is the tier for busy composites — still describe each one's role rather than listing them.`,
    editHint:
      'Say which element changes and leave the rest alone: Change the sky to overcast. Do not change any other elements. Name the role of each input image when combining several.',
    routerWeights: {
      referenceFit: 0.85,
      costEfficiency: 0.85,
      latency: 0.9,
      health: 0.9,
    },
  },
  [AI_MODELS.GEMINI_FLASH_LITE_IMAGE]: {
    bestFor: ['general', 'quick-iteration', 'draft', 'instruction-following'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint: `Gemini 3.1 Flash-Lite Image, the cheapest Gemini tier — best for drafts and variations. ${GEMINI_PROMPT_FORMULA} Keep the paragraph tight; this tier rewards one clear scene over a dense stack of clauses.`,
    editHint:
      'Say which element changes and leave the rest alone: Change the shirt to navy. Do not change any other elements.',
  },
  // ── Black Forest Labs (FLUX) ────────────────────────────────────
  // 来源 https://docs.bfl.ai/guides/prompting_guide_flux2
  [AI_MODELS.FLUX_2_PRO]: {
    bestFor: ['photorealistic', 'portrait', 'product', 'architecture'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint: `FLUX.2 Pro, the photoreal flagship. Use camera terminology (lens, focal length, aperture), a named lighting setup and a film stock reference; skip anime and cartoon descriptors. ${FLUX2_PROMPT_SYNTAX}`,
    editHint: `Attaching references routes this id to the same /edit endpoint as FLUX.2 Pro Edit. ${FLUX_EDIT_DIALECT}`,
    routerWeights: {
      referenceFit: 0.7,
      costEfficiency: 0.55,
      latency: 0.6,
      health: 0.92,
    },
  },
  [AI_MODELS.FLUX_2_FLASH]: {
    bestFor: ['quick-iteration', 'draft', 'general'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint: `FLUX.2 Flash, the fast budget tier — for previews and iteration. Put the core subject, composition and lighting up front and keep the tail short. ${FLUX2_PROMPT_SYNTAX}`,
    routerWeights: {
      referenceFit: 0.35,
      costEfficiency: 1,
      latency: 0.95,
      health: 0.86,
    },
  },
  [AI_MODELS.FLUX_2_PRO_EDIT]: {
    bestFor: ['editing', 'multi-reference', 'product', 'retouch'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint: `FLUX.2 Pro Edit — up to 8 input images, prompt-driven transform. The prompt is an instruction, not a scene description: say what changes and what is preserved. JSON prompts are supported for placement-heavy edits, same schema as generation. ${FLUX2_PROMPT_SYNTAX}`,
    editHint: FLUX_EDIT_DIALECT,
  },
  [AI_MODELS.FLUX_KONTEXT_MAX]: {
    bestFor: ['editing', 'style-transfer', 'character-consistency', 'general'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint:
      'FLUX.1 Kontext Max, an in-context editor: it takes one or more images plus an instruction. Keep the instruction short and literal — one edit per sentence, nouns instead of pronouns, and an explicit preservation clause so identity and framing survive. Style transfer works by naming the target style and stating that composition and subject stay unchanged. Structured prompt objects belong to FLUX.2, not here — this is plain instruction text — and there is no negative prompt, so phrase everything as what the result should be.',
    editHint: FLUX_EDIT_DIALECT,
    routerWeights: {
      referenceFit: 0.85,
      costEfficiency: 0.4,
      latency: 0.5,
      health: 0.88,
    },
  },
  // FLUX.1 dev + LoRA。⚠ 它**不是** FLUX.2：没有 JSON prompt 那套结构化输入。
  // 来源 https://fal.ai/models/fal-ai/flux-lora
  [AI_MODELS.FLUX_LORA]: {
    bestFor: ['general', 'stylized', 'character-consistency', 'lora'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint:
      'FLUX.1 dev with community LoRAs. Plain descriptive English sentences, roughly one to three of them: subject, then setting, then lighting and style. When a LoRA is attached its trigger word must appear verbatim in the prompt, near the front — a missing trigger silently produces the base model. Do not stack many LoRA triggers in one prompt; they fight. The model is guidance-distilled and takes no negative prompt, so write the positive fact instead.',
  },
  // ── Seedream (ByteDance) ────────────────────────────────────────
  // 同一个模型三个站：fal / 火山方舟 / BytePlus ModelArk。方言同源，逐条只补站点差异。
  // 来源 https://www.volcengine.com/docs/82379/1829186
  [AI_MODELS.SEEDREAM_50_PRO]: {
    bestFor: ['general', 'cinematic', 'landscape', 'portrait', 'text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 5.0 Pro on fal — reasoning model that plans a layout before drawing, so dense layout and typography instructions pay off and native text renders in 14 languages. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
    routerWeights: {
      referenceFit: 0.72,
      costEfficiency: 0.6,
      latency: 0.65,
      health: 0.88,
    },
  },
  [AI_MODELS.SEEDREAM_50_LITE]: {
    bestFor: ['general', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 5.0 Lite on fal — the value tier; it can ground a time-sensitive subject with a web search, so naming the real thing beats describing it. Keep prompts concise and concrete. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
    routerWeights: {
      referenceFit: 0.65,
      costEfficiency: 0.85,
      latency: 0.8,
      health: 0.86,
    },
  },
  [AI_MODELS.SEEDREAM_50_VOLCENGINE]: {
    bestFor: ['general', 'cinematic', 'portrait', 'chinese-text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 5.0 on 火山方舟 (cn station) — the entry that still does 组图生成, so say the panel count in the prompt. Chinese prompts are first-class here. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
  },
  [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE]: {
    bestFor: ['general', 'cinematic', 'portrait', 'chinese-text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 5.0 Pro on 火山方舟 (cn station) — single-image only (text-to-image, one-image edit, multi-reference), so do not ask it for a panel set; use the base 5.0 id for that. Dense layout and typography instructions pay off. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
  },
  [AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE]: {
    bestFor: ['general', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 5.0 Lite on 火山方舟 (cn station) — the cheap tier; keep prompts short and concrete, Chinese or English. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
  },
  [AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS]: {
    bestFor: ['general', 'cinematic', 'portrait', 'text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 5.0 Pro on BytePlus ModelArk (international station) — same model and same dialect as the 火山 entry, different keys and region. Dense layout and typography instructions pay off. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
  },
  [AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS]: {
    bestFor: ['general', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 5.0 Lite on BytePlus ModelArk (international station) — the cheap tier; keep prompts short and concrete. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
  },
  // 4.5 两条已退役（RETIRED_MODEL_IDS），条目保留是为了历史生成还能解析出方言。
  [AI_MODELS.SEEDREAM_45]: {
    bestFor: ['general', 'cinematic', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 4.5 on fal (retired — kept so archived generations still resolve a dialect). Film terminology works well: wide shot, depth of field, colour grading reference. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
    routerWeights: {
      referenceFit: 0.7,
      costEfficiency: 0.65,
      latency: 0.7,
      health: 0.86,
    },
  },
  [AI_MODELS.SEEDREAM_45_VOLCENGINE]: {
    bestFor: ['general', 'cinematic', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    negativePrompt: 'supported',
    enhanceHint: `Seedream 4.5 on 火山方舟 (retired — kept so archived generations still resolve a dialect). Chinese prompts are first-class. ${SEEDREAM_PROMPT_SYNTAX}`,
    editHint: SEEDREAM_EDIT_DIALECT,
  },
  // ── Ideogram / Recraft（排版与品牌线）───────────────────────────
  // 来源 https://docs.ideogram.ai/using-ideogram/prompting-guide
  [AI_MODELS.IDEOGRAM_3]: {
    bestFor: ['logo', 'typography', 'graphic-design', 'text-in-image'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint:
      'Ideogram 3. Natural language, at most about 150 words — past that it starts dropping details. The words to render go in double quotes and near the front: Poster with the headline "GRAND OPENING" above a neon storefront. Then layout, typography feel, palette, background. Keep the rendered string short and spell it exactly as it should appear. Magic Prompt rewrites thin prompts, so a detailed prompt is also how you keep control. The API takes no negative prompt: describe what should be there.',
    routerWeights: {
      referenceFit: 0.4,
      costEfficiency: 0.65,
      latency: 0.7,
      health: 0.84,
    },
  },
  // 来源 https://www.recraft.ai/docs/api-reference/styles
  [AI_MODELS.RECRAFT_V4_PRO]: {
    bestFor: ['illustration', 'icon', 'brand', 'vector-style'],
    promptStyle: 'natural-language',
    negativePrompt: 'unsupported',
    enhanceHint:
      'Recraft V4 Pro. Describe content only — the look comes from the style / style_id request parameter, so style adjectives such as flat vector illustration duplicate and fight the selected style_id. Name the subject, the layout and the colour roles, and keep the sentence short. Words to render go in double quotes. This is the vector/SVG-capable model, so it is the one to use when the same style_id must hold across a whole icon or brand set. The API takes no negative prompt.',
    routerWeights: {
      referenceFit: 0.45,
      costEfficiency: 0.65,
      latency: 0.7,
      health: 0.84,
    },
  },
  // ── NovelAI ─────────────────────────────────────────────────────
  // 来源 https://docs.novelai.net/en/image/
  [AI_MODELS.NOVELAI_V45_FULL]: {
    bestFor: ['anime', 'illustration', 'character-design', 'detailed'],
    promptStyle: 'tag-based',
    negativePrompt: 'undesired-content',
    enhanceHint: `NovelAI V4.5 Full. English danbooru tags, comma separated: subject and character first, then outfit, pose, expression, then scene and lighting. ${NOVELAI_PROMPT_SYNTAX} The V4.5 Full quality string is appended at the END, not the front: location, very aesthetic, masterpiece, no text. A reference image is img2img, not a character lock.`,
    routerWeights: {
      referenceFit: 0.55,
      costEfficiency: 0.55,
      latency: 0.45,
      health: 0.78,
    },
  },
  [AI_MODELS.NOVELAI_V45_CURATED]: {
    bestFor: ['anime', 'illustration', 'character-design'],
    promptStyle: 'tag-based',
    negativePrompt: 'undesired-content',
    enhanceHint: `NovelAI V4.5 Curated. Same tag dialect and emphasis syntax as Full on a cleaner dataset. Subject and character first, then outfit and pose, then scene. ${NOVELAI_PROMPT_SYNTAX} Curated ships its own quality preset — do not paste Full's quality string here. A reference image is img2img only.`,
    routerWeights: {
      referenceFit: 0.5,
      costEfficiency: 0.55,
      latency: 0.45,
      health: 0.78,
    },
  },
  [AI_MODELS.NOVELAI_V5_FULL]: {
    bestFor: ['anime', 'illustration', 'character-design', 'detailed'],
    promptStyle: 'tag-based',
    negativePrompt: 'undesired-content',
    enhanceHint: `NovelAI V5 Full. Tags first; short natural-language clauses are also understood. Subject and character, then outfit and pose, then scene. ${NOVELAI_PROMPT_SYNTAX} Quality string is , very aesthetic, masterpiece, no text. Director, Vibe Transfer and Precise Reference are not on V5 yet; one reference image is img2img only.`,
    routerWeights: {
      referenceFit: 0.45,
      costEfficiency: 0.4,
      latency: 0.45,
      health: 0.7,
    },
  },
  [AI_MODELS.NOVELAI_V5_CURATED]: {
    bestFor: ['anime', 'illustration', 'character-design'],
    promptStyle: 'tag-based',
    negativePrompt: 'undesired-content',
    enhanceHint: `NovelAI V5 Curated. Tag dialect first, short natural-language clauses are fine; cleaner dataset, easier to steer. ${NOVELAI_PROMPT_SYNTAX} Quality string is , very aesthetic, masterpiece, no text. No Director / Vibe Transfer on V5 yet; one reference image is img2img only.`,
    routerWeights: {
      referenceFit: 0.4,
      costEfficiency: 0.4,
      latency: 0.45,
      health: 0.7,
    },
  },
  // ── SDXL 系（托管 + Comfy Runner）────────────────────────────────
  // Illustrious/NoobAI carries the hosted LoRA anime line. NovelAI is a
  // closed API — same tag dialect, no Civitai LoRA slot.
  // 来源 https://civitai.com/models/257749 · https://huggingface.co/OnomaAIResearch
  [AI_MODELS.ILLUSTRIOUS_XL]: {
    bestFor: ['anime', 'illustration', 'character-design', 'detailed'],
    promptStyle: 'tag-based',
    negativePrompt: 'supported',
    enhanceHint: `NoobAI/Illustrious-family anime model driven by danbooru tags. Lead with the quality prefix masterpiece, best quality, then character tags, then style and scene, comma separated. Emphasis syntax like (feature:1.3) works here — this family uses the A1111/Comfy parser, unlike NovelAI. ${SDXL_TAG_NEGATIVE_DIALECT}`,
    routerWeights: {
      referenceFit: 0.6,
      costEfficiency: 0.9,
      latency: 0.6,
      health: 0.8,
    },
  },
  [AI_MODELS.ANIMA_PENCIL_XL]: {
    bestFor: ['anime', 'illustration', 'character-design'],
    promptStyle: 'tag-based',
    negativePrompt: 'supported',
    enhanceHint: `Anima Pencil-XL, an SDXL anime checkpoint driven by danbooru tags. Lead with the quality prefix masterpiece, best quality, then character tags, then style and scene, comma separated. A1111/Comfy emphasis like (feature:1.2) is parsed. ${SDXL_TAG_NEGATIVE_DIALECT}`,
  },
  // ─── Comfy Runner 上的自托管 checkpoint ───────────────────────────
  // 它们与上面那些托管模型共享同一条 tag 方言，但每个底模有**自己的必带前缀** ——
  // 漏掉前缀不是「效果差一点」，是画面直接垮（Pony 尤其明显）。
  [AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE]: {
    bestFor: ['anime', 'illustration', 'character-design', 'detailed'],
    promptStyle: 'tag-based',
    negativePrompt: 'supported',
    enhanceHint: `WAI-Illustrious recipe clone on the Comfy runner. Lead with the quality prefix masterpiece, best quality, then character tags, then style and scene, comma separated. A1111/Comfy emphasis like (feature:1.2) is parsed. ${SDXL_TAG_NEGATIVE_DIALECT}`,
  },
  [AI_MODELS.ANIMA_PENCIL_XL_RUNNER]: {
    bestFor: ['anime', 'illustration', 'character-design'],
    promptStyle: 'tag-based',
    negativePrompt: 'supported',
    enhanceHint: `Anima Pencil-XL on the Comfy runner. Same dialect as the hosted entry: quality prefix masterpiece, best quality first, then character tags, then style and scene, comma separated. A1111/Comfy emphasis like (feature:1.2) is parsed. ${SDXL_TAG_NEGATIVE_DIALECT}`,
  },
  [AI_MODELS.PONY_DIFFUSION_V6]: {
    bestFor: ['anime', 'illustration', 'character-design', 'stylized'],
    promptStyle: 'tag-based',
    negativePrompt: 'supported',
    enhanceHint:
      'Pony Diffusion V6 XL on the Comfy runner. It is score-conditioned: EVERY positive prompt must start with score_9, score_8_up, score_7_up, immediately followed by a source tag — source_anime, source_cartoon, source_furry or source_pony. Only then the danbooru tags. Without that prefix the output collapses; it is not an optional quality booster. A1111/Comfy emphasis like (feature:1.2) is parsed. Negatives are barely used on Pony — the whole convention is score_6, score_5, score_4 plus worst quality, low quality.',
  },
  [AI_MODELS.SDXL_10_RUNNER]: {
    bestFor: ['general', 'concept', 'illustration'],
    promptStyle: 'tag-based',
    negativePrompt: 'supported',
    enhanceHint: `Plain SDXL 1.0 on the Comfy runner. Emit comma-separated English tags and short descriptive phrases, quality modifiers first. It is NOT danbooru-trained, so anime character tags will not resolve — describe the subject in ordinary vocabulary. A1111/Comfy emphasis like (feature:1.2) is parsed. ${SDXL_TAG_NEGATIVE_DIALECT}`,
  },
  [AI_MODELS.ANIMA_DIT_RUNNER]: {
    bestFor: ['anime', 'illustration', 'character-design'],
    promptStyle: 'tag-based',
    negativePrompt: 'supported',
    enhanceHint: `Anima (Cosmos-Predict2 DiT) on the Comfy runner. Danbooru tags remain the reliable dialect; short natural-language clauses are also understood because the text encoder is Qwen-Image, not CLIP. Tags first, then a clause or two of scene description. Keep tag vocabulary English. ${SDXL_TAG_NEGATIVE_DIALECT}`,
  },
}
/**
 * Get the enhancement hint for a model, falling back to adapter-level hint.
 */
export function getModelEnhanceHint(
  modelId: string,
  adapterType?: string,
): string | null {
  const modelHint =
    MODEL_STRENGTHS[modelId as AI_MODELS]?.enhanceHint ??
    MEDIA_MODEL_STRENGTHS[modelId as AI_MODELS]?.enhanceHint
  if (modelHint) return modelHint
  if (adapterType) return ADAPTER_PROMPT_HINTS[adapterType] ?? null
  return null
}

/**
 * 目标模型到底吃不吃负向提示。**返回 null 表示「不知道」**，不是「不支持」——
 * 编不出来的默认值会让调用方把一段负向文本喂给一个根本没有这个字段的模型，
 * 然后静默丢弃。调用方自己决定未知时怎么办。
 */
export function getModelNegativePromptSupport(
  modelId: string,
): NegativePromptSupport | null {
  return (
    MODEL_STRENGTHS[modelId as AI_MODELS]?.negativePrompt ??
    MEDIA_MODEL_STRENGTHS[modelId as AI_MODELS]?.negativePrompt ??
    null
  )
}

/**
 * Tag 方言模型的**显式名册**。
 *
 * ⚠ 这里**不能**退回「在 `MODEL_STRENGTHS` 里有条目且 promptStyle 是 tag-based
 * 就算」那条判定：漏的是每一个还没写 strength 条目的 tag 模型，而漏判的表现是
 * 助手给 Pony / Illustrious 写了一段电影感散文，用户拿到一张糊图。名册显式列出，
 * 加模型时漏了这里，下面那条一致性测试会红。
 */
export const TAG_BASED_PROMPT_MODEL_IDS: ReadonlySet<string> = new Set<string>([
  AI_MODELS.NOVELAI_V45_FULL,
  AI_MODELS.NOVELAI_V45_CURATED,
  AI_MODELS.NOVELAI_V5_FULL,
  AI_MODELS.NOVELAI_V5_CURATED,
  AI_MODELS.ILLUSTRIOUS_XL,
  AI_MODELS.ANIMA_PENCIL_XL,
  AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
  AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
  AI_MODELS.PONY_DIFFUSION_V6,
  AI_MODELS.SDXL_10_RUNNER,
  AI_MODELS.ANIMA_DIT_RUNNER,
])

export function isTagBasedPromptModel(modelId: string): boolean {
  return TAG_BASED_PROMPT_MODEL_IDS.has(modelId)
}

/**
 * Hard dialect for NovelAI / Illustrious-style generators. Chat stays in the
 * user's language; the thing that goes into the prompt box must be English
 * danbooru tags. Natural-language paragraphs are the wrong input dialect.
 */
export const TAG_BASED_GENERATION_PROMPT_RULE = `GENERATION PROMPT DIALECT — this target model does not eat natural-language paragraphs.
- Keep chatting in the user's language.
- When you deliver a generation prompt ([[prompt]] positive, or a code block meant to be pasted into the generator), output English danbooru-style comma-separated tags only.
- Order: quality tags first, then subject count, character, outfit, pose, expression, then scene / background / lighting.
- Example dialect: masterpiece, best quality, 1girl, long hair, looking at viewer, school uniform, sitting, indoors.
- Negative: English tags (lowres, bad anatomy), not sentences.
- Do not write a cinematic paragraph as the generation prompt. Explanation stays outside the prompt block.
- This overrides any instruction to write the prompt block in the same language as your prose: tag vocabulary is English-normalised.`
