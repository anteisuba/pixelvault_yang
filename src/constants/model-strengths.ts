/**
 * Model-level strengths and prompt hints.
 *
 * Used by prompt-enhance.service to generate model-aware enhancement,
 * and can be surfaced in the UI for model recommendations.
 */

import { AI_MODELS } from '@/constants/models'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export interface ModelStrength {
  /** What this model excels at */
  bestFor: string[]
  /** Prompt output format preference */
  promptStyle: 'natural-language' | 'tag-based'
  /** Hint injected into prompt enhancement system prompt */
  enhanceHint: string
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

export const ARENA_WINRATE_WEIGHT = 0.25
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
  [AI_ADAPTER_TYPES.DASHSCOPE]:
    'Target model: Qwen (DashScope) text/vision. Prefer concrete natural language; strong at Chinese scriptwriting and shot breakdowns. Return strict JSON when the task asks for structured output.',
  [AI_ADAPTER_TYPES.HUGGINGFACE]:
    'Target model: Stable Diffusion. Prefer comma-separated descriptive phrases with quality modifiers.',
  [AI_ADAPTER_TYPES.REPLICATE]:
    'Target model: Replicate hosted model. Prefer detailed natural language descriptions.',
}

/** Per-model strengths and enhancement hints */
export const MODEL_STRENGTHS: Partial<Record<AI_MODELS, ModelStrength>> = {
  [AI_MODELS.FLUX_2_PRO]: {
    bestFor: ['photorealistic', 'portrait', 'product', 'architecture'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model excels at photorealism. Use camera terminology (lens, focal length, aperture), lighting setups (golden hour, studio softbox), and film stock references. Avoid anime/cartoon descriptors.',
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
    enhanceHint:
      'This fast FLUX.2 model is best for quick iterations and budget previews. Keep prompts concise but specific, with the core subject, composition, and lighting up front.',
    routerWeights: {
      referenceFit: 0.35,
      costEfficiency: 1,
      latency: 0.95,
      health: 0.86,
    },
  },
  [AI_MODELS.GEMINI_FLASH_IMAGE]: {
    bestFor: ['general', 'concept', 'text-in-image', 'instruction-following'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model follows complex instructions well. Use rich natural language with detailed scene descriptions, spatial relationships, and specific visual requirements.',
    routerWeights: {
      referenceFit: 0.85,
      costEfficiency: 0.85,
      latency: 0.9,
      health: 0.9,
    },
  },
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: {
    bestFor: ['general', 'concept', 'creative', 'editing'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model handles diverse generation and editing tasks well. Use detailed natural language with explicit composition, visual intent, and image-editing instructions when relevant.',
    routerWeights: {
      referenceFit: 0.9,
      costEfficiency: 0.45,
      latency: 0.6,
      health: 0.95,
    },
  },
  [AI_MODELS.NOVELAI_V45_FULL]: {
    bestFor: ['anime', 'illustration', 'character-design', 'detailed'],
    promptStyle: 'tag-based',
    enhanceHint:
      'NovelAI V4.5 Full. Use danbooru tags with emphasis like (feature:1.3). Quality tags first, then character details, then style and scene. Reference image is optional img2img, not character lock.',
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
    enhanceHint:
      'NovelAI V4.5 Curated. Same tag dialect as Full, cleaner dataset. Quality tags first, then character, then scene. Reference image is optional img2img.',
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
    enhanceHint:
      'NovelAI V5 Full. Prefer danbooru tags; short natural-language clauses are also understood. Quality tags first, then character, then scene. Do not rely on Director, Vibe Transfer, or Precise Reference — they are not on V5 yet. One optional reference image is img2img only.',
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
    enhanceHint:
      'NovelAI V5 Curated. Tag dialect first; short natural-language clauses are ok. Cleaner dataset, easier to steer. No Director / Vibe Transfer on V5 yet. One optional reference image is img2img only.',
    routerWeights: {
      referenceFit: 0.4,
      costEfficiency: 0.4,
      latency: 0.45,
      health: 0.7,
    },
  },
  // Illustrious/NoobAI carries the hosted LoRA anime line. NovelAI is a
  // closed API — same tag dialect, no Civitai LoRA slot.
  [AI_MODELS.ILLUSTRIOUS_XL]: {
    bestFor: ['anime', 'illustration', 'character-design', 'detailed'],
    promptStyle: 'tag-based',
    enhanceHint:
      'NoobAI/Illustrious-family anime model driven by danbooru tags. Emit comma-separated tags with quality tags first, then character tags, then style and scene. Emphasis syntax like (feature:1.3) works.',
    routerWeights: {
      referenceFit: 0.6,
      costEfficiency: 0.9,
      latency: 0.6,
      health: 0.8,
    },
  },
  [AI_MODELS.IDEOGRAM_3]: {
    bestFor: ['logo', 'typography', 'graphic-design', 'text-in-image'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model excels at typography and graphic design. When the subject involves text, specify the exact text, font style, and layout. Use design terminology (minimalist, bold, geometric).',
    routerWeights: {
      referenceFit: 0.4,
      costEfficiency: 0.65,
      latency: 0.7,
      health: 0.84,
    },
  },
  [AI_MODELS.RECRAFT_V4_PRO]: {
    bestFor: ['illustration', 'icon', 'brand', 'vector-style'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model produces clean, professional illustrations. Use design terminology with emphasis on style consistency, color harmony, and visual hierarchy.',
    routerWeights: {
      referenceFit: 0.45,
      costEfficiency: 0.65,
      latency: 0.7,
      health: 0.84,
    },
  },
  [AI_MODELS.SEEDREAM_45]: {
    bestFor: ['general', 'cinematic', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    enhanceHint:
      'Advanced model good at cinematic composition. Use film terminology (wide shot, depth of field), describe lighting mood, and specify color grading references.',
    routerWeights: {
      referenceFit: 0.7,
      costEfficiency: 0.65,
      latency: 0.7,
      health: 0.86,
    },
  },
  [AI_MODELS.SEEDREAM_50_PRO]: {
    bestFor: ['general', 'cinematic', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    enhanceHint:
      'Reasoning-based model that plans before it draws. Give it dense layout and typography instructions — it renders native text in 14 languages and holds structured designs together.',
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
    enhanceHint:
      'Value tier of Seedream 5.0. Keep prompts concise and concrete; it can ground time-sensitive subjects with a web search.',
    routerWeights: {
      referenceFit: 0.65,
      costEfficiency: 0.85,
      latency: 0.8,
      health: 0.86,
    },
  },
}

/**
 * Per-text-model strengths for the Qwen (DashScope) LLM line. These models are
 * not generation models (not in `AI_MODELS`), so they live in a separate map
 * keyed by their LLM text model id. Surfaced through `getModelEnhanceHint`,
 * which downstream text services call with the per-call `modelId`.
 */
export const TEXT_MODEL_STRENGTHS: Record<string, ModelStrength> = {
  [LLM_TEXT_MODEL_IDS.QWEN3_MAX]: {
    bestFor: ['chinese-script', 'storyboard', 'recipe-fusion', 'reasoning'],
    promptStyle: 'natural-language',
    enhanceHint:
      'Flagship Qwen text model — strongest for Chinese scriptwriting, shot breakdowns, and recipe fusion. Prefer rich, concrete natural language; structure output as the requested JSON when asked.',
  },
  [LLM_TEXT_MODEL_IDS.QWEN_PLUS]: {
    bestFor: ['chinese-text', 'long-context', 'storyboard', 'general'],
    promptStyle: 'natural-language',
    enhanceHint:
      'Balanced 1M-context Qwen model — the default workhorse for most text tasks (keywords, storyboard JSON, enhancement). Prefer clear natural language; long source material is fine given the large context window.',
  },
  [LLM_TEXT_MODEL_IDS.QWEN_FLASH]: {
    bestFor: ['keyword-extraction', 'quick-rewrite', 'intent-parse'],
    promptStyle: 'natural-language',
    enhanceHint:
      'Cheap, fast Qwen model for high-frequency near-deterministic tasks (keyword extraction, quick rewrites). Keep instructions concise and the expected output shape explicit.',
  },
  [LLM_TEXT_MODEL_IDS.QWEN3_VL_PLUS]: {
    bestFor: ['image-breakdown', 'vision', 'chinese-text-in-image'],
    promptStyle: 'natural-language',
    enhanceHint:
      'Vision-capable Qwen model — good for reverse-engineering images and reading text-in-image, with strong Chinese understanding. Describe what to extract from the image in plain natural language.',
  },
}

/**
 * Get the enhancement hint for a model, falling back to adapter-level hint.
 */
export function getModelEnhanceHint(
  modelId: string,
  adapterType?: string,
): string | null {
  const modelHint = MODEL_STRENGTHS[modelId as AI_MODELS]?.enhanceHint
  if (modelHint) return modelHint
  const textModelHint = TEXT_MODEL_STRENGTHS[modelId]?.enhanceHint
  if (textModelHint) return textModelHint
  if (adapterType) return ADAPTER_PROMPT_HINTS[adapterType] ?? null
  return null
}

export function isTagBasedPromptModel(modelId: string): boolean {
  return MODEL_STRENGTHS[modelId as AI_MODELS]?.promptStyle === 'tag-based'
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
