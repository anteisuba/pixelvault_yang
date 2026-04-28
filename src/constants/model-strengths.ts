/**
 * Model-level strengths and prompt hints.
 *
 * Used by prompt-enhance.service to generate model-aware enhancement,
 * and can be surfaced in the UI for model recommendations.
 */

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export interface ModelStrength {
  /** What this model excels at */
  bestFor: string[]
  /** Prompt output format preference */
  promptStyle: 'natural-language' | 'tag-based'
  /** Hint injected into prompt enhancement system prompt */
  enhanceHint: string
}

/**
 * Per-adapter fallback hints (shared with recipe-compiler).
 * When a specific model isn't in MODEL_STRENGTHS, use this.
 */
export const ADAPTER_PROMPT_HINTS: Record<string, string> = {
  [AI_ADAPTER_TYPES.FAL]:
    'Target model: FLUX. Prefer photographic terminology, specific lens/camera details, precise lighting descriptions, and full natural language sentences.',
  [AI_ADAPTER_TYPES.NOVELAI]:
    'Target model: NovelAI (anime diffusion). Output as comma-separated danbooru-style tags. Include quality tags (masterpiece, best quality) at the start. Character tags before style and background tags.',
  [AI_ADAPTER_TYPES.GEMINI]:
    'Target model: Gemini image generation. Prefer natural, descriptive English sentences with rich visual detail.',
  [AI_ADAPTER_TYPES.VOLCENGINE]:
    'Target model: Seedream (VolcEngine). Prefer concise, clear descriptions. Works well with both English and Chinese.',
  [AI_ADAPTER_TYPES.OPENAI]:
    'Target model: GPT Image. Prefer detailed natural language descriptions with emphasis on composition and mood.',
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
  },
  [AI_MODELS.FLUX_2_DEV]: {
    bestFor: ['creative', 'concept', 'artistic'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model is versatile for creative and conceptual imagery. Use vivid descriptive language with emphasis on composition, mood, and artistic direction.',
  },
  [AI_MODELS.FLUX_2_SCHNELL]: {
    bestFor: ['quick-iteration', 'draft', 'general'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This is a fast model for quick iterations. Keep prompts concise but descriptive. Focus on the key visual elements rather than excessive detail.',
  },
  [AI_MODELS.GEMINI_FLASH_IMAGE]: {
    bestFor: ['general', 'concept', 'text-in-image', 'instruction-following'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model follows complex instructions well. Use rich natural language with detailed scene descriptions, spatial relationships, and specific visual requirements.',
  },
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: {
    bestFor: ['general', 'concept', 'creative', 'editing'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model handles diverse generation and editing tasks well. Use detailed natural language with explicit composition, visual intent, and image-editing instructions when relevant.',
  },
  [AI_MODELS.NOVELAI_V4_FULL]: {
    bestFor: ['anime', 'illustration', 'character-design'],
    promptStyle: 'tag-based',
    enhanceHint:
      'This model specializes in anime/illustration. Use danbooru-style tags: quality tags first (masterpiece, best quality), then character features (hair, eyes, clothing), then scene tags. Avoid photographic terminology.',
  },
  [AI_MODELS.NOVELAI_V45_FULL]: {
    bestFor: ['anime', 'illustration', 'character-design', 'detailed'],
    promptStyle: 'tag-based',
    enhanceHint:
      'Advanced anime model with fine detail. Use danbooru tags with emphasis syntax like (feature:1.3). Quality tags first, then character details, then style and scene tags.',
  },
  [AI_MODELS.IDEOGRAM_3]: {
    bestFor: ['logo', 'typography', 'graphic-design', 'text-in-image'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model excels at typography and graphic design. When the subject involves text, specify the exact text, font style, and layout. Use design terminology (minimalist, bold, geometric).',
  },
  [AI_MODELS.RECRAFT_V4_PRO]: {
    bestFor: ['illustration', 'icon', 'brand', 'vector-style'],
    promptStyle: 'natural-language',
    enhanceHint:
      'This model produces clean, professional illustrations. Use design terminology with emphasis on style consistency, color harmony, and visual hierarchy.',
  },
  [AI_MODELS.SEEDREAM_45]: {
    bestFor: ['general', 'cinematic', 'landscape', 'portrait'],
    promptStyle: 'natural-language',
    enhanceHint:
      'Advanced model good at cinematic composition. Use film terminology (wide shot, depth of field), describe lighting mood, and specify color grading references.',
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
  if (adapterType) return ADAPTER_PROMPT_HINTS[adapterType] ?? null
  return null
}
