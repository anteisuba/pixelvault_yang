/**
 * Model-specific prompt templates for character card generation.
 *
 * Different AI models respond better to different prompt styles:
 * - Tag-based: NovelAI and anime-focused models prefer comma-separated tags
 * - Natural language: Gemini and OpenAI prefer descriptive sentences
 * - Weighted tokens: FLUX/SD models support emphasis syntax like (tag:1.3)
 */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { CharacterAttributes } from '@/types'

// ─── Prompt Style Types ────────────────────────────────────────

type PromptStyle = 'tag' | 'natural' | 'weighted'

const ADAPTER_PROMPT_STYLES: Record<AI_ADAPTER_TYPES, PromptStyle> = {
  [AI_ADAPTER_TYPES.NOVELAI]: 'tag',
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'weighted',
  [AI_ADAPTER_TYPES.FAL]: 'weighted',
  [AI_ADAPTER_TYPES.REPLICATE]: 'weighted',
  [AI_ADAPTER_TYPES.GEMINI]: 'natural',
  [AI_ADAPTER_TYPES.OPENAI]: 'natural',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'natural',
}

// ─── Tag-Based Prompt (NovelAI / Anime Models) ─────────────────

function buildTagPrompt(attrs: CharacterAttributes): string {
  const tags: string[] = []

  if (attrs.artStyle) tags.push(attrs.artStyle)
  if (attrs.expression) tags.push(attrs.expression)
  if (attrs.hairColor && attrs.hairStyle) {
    tags.push(`${attrs.hairColor} ${attrs.hairStyle} hair`)
  } else if (attrs.hairColor) {
    tags.push(`${attrs.hairColor} hair`)
  } else if (attrs.hairStyle) {
    tags.push(`${attrs.hairStyle} hair`)
  }
  if (attrs.eyeColor) tags.push(`${attrs.eyeColor} eyes`)
  if (attrs.skinTone) tags.push(`${attrs.skinTone} skin`)
  if (attrs.bodyType) tags.push(attrs.bodyType)
  if (attrs.outfit) tags.push(attrs.outfit)
  if (attrs.accessories) tags.push(attrs.accessories)
  if (attrs.pose) tags.push(attrs.pose)
  if (attrs.distinguishingFeatures) tags.push(attrs.distinguishingFeatures)

  if (tags.length === 0 && attrs.freeformDescription) {
    return attrs.freeformDescription
  }

  return tags.join(', ')
}

// ─── Weighted Token Prompt (FLUX / SD / HuggingFace) ───────────

function buildWeightedPrompt(attrs: CharacterAttributes): string {
  const parts: string[] = []

  if (attrs.artStyle) parts.push(attrs.artStyle)
  if (attrs.expression) parts.push(`(${attrs.expression}:1.1)`)

  // Hair — high weight for character identity
  if (attrs.hairColor && attrs.hairStyle) {
    parts.push(`(${attrs.hairColor} ${attrs.hairStyle} hair:1.3)`)
  } else if (attrs.hairColor) {
    parts.push(`(${attrs.hairColor} hair:1.3)`)
  } else if (attrs.hairStyle) {
    parts.push(`(${attrs.hairStyle} hair:1.2)`)
  }

  if (attrs.eyeColor) parts.push(`(${attrs.eyeColor} eyes:1.2)`)
  if (attrs.skinTone) parts.push(attrs.skinTone)
  if (attrs.bodyType) parts.push(attrs.bodyType)
  if (attrs.outfit) parts.push(`(${attrs.outfit}:1.1)`)
  if (attrs.accessories) parts.push(attrs.accessories)
  if (attrs.pose) parts.push(attrs.pose)
  if (attrs.distinguishingFeatures)
    parts.push(`(${attrs.distinguishingFeatures}:1.2)`)

  if (parts.length === 0 && attrs.freeformDescription) {
    return attrs.freeformDescription
  }

  return parts.join(', ')
}

// ─── Natural Language Prompt (Gemini / OpenAI / VolcEngine) ────

function buildNaturalPrompt(attrs: CharacterAttributes): string {
  const sentences: string[] = []

  if (attrs.artStyle) {
    sentences.push(`${attrs.artStyle} illustration`)
  }

  // Character description
  const charParts: string[] = []
  if (attrs.hairColor || attrs.hairStyle) {
    const hair = [attrs.hairColor, attrs.hairStyle].filter(Boolean).join(' ')
    charParts.push(`${hair} hair`)
  }
  if (attrs.eyeColor) charParts.push(`${attrs.eyeColor} eyes`)
  if (attrs.skinTone) charParts.push(`${attrs.skinTone} skin`)
  if (attrs.bodyType) charParts.push(attrs.bodyType)

  if (charParts.length > 0) {
    sentences.push(`A character with ${charParts.join(', ')}`)
  }

  if (attrs.outfit) sentences.push(`Wearing ${attrs.outfit}`)
  if (attrs.accessories) sentences.push(`With ${attrs.accessories}`)
  if (attrs.expression) sentences.push(`${attrs.expression} expression`)
  if (attrs.pose) sentences.push(attrs.pose)
  if (attrs.distinguishingFeatures) sentences.push(attrs.distinguishingFeatures)

  if (sentences.length === 0 && attrs.freeformDescription) {
    return attrs.freeformDescription
  }

  const result = sentences.join('. ')
  if (attrs.colorPalette) {
    return `${result}. Color palette: ${attrs.colorPalette}`
  }
  return result
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Build a model-specific prompt from character attributes.
 * Uses the appropriate prompt style for each adapter type.
 */
export function buildModelSpecificPrompt(
  attributes: CharacterAttributes,
  adapterType: AI_ADAPTER_TYPES,
): string {
  const style = ADAPTER_PROMPT_STYLES[adapterType]

  switch (style) {
    case 'tag':
      return buildTagPrompt(attributes)
    case 'weighted':
      return buildWeightedPrompt(attributes)
    case 'natural':
      return buildNaturalPrompt(attributes)
    default:
      return buildNaturalPrompt(attributes)
  }
}

/**
 * Get the prompt style used for a given adapter type.
 */
export function getPromptStyle(adapterType: AI_ADAPTER_TYPES): PromptStyle {
  return ADAPTER_PROMPT_STYLES[adapterType]
}
