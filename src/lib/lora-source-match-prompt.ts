import type { CivitaiMinedPromptsResult, LoraAssetRecord } from '@/types'

import { buildLoraPromptTemplate } from './lora-prompt-template'
import { promptIncludesTrigger } from './prompt-text'

export const LORA_SOURCE_MATCH_SCALE = 0.85

const ANIME_SOURCE_MATCH_TAGS = [
  '2d style',
  'anime illustration',
  'clean lineart',
  'cel shading',
] as const

const ANIME_SOURCE_MATCH_NEGATIVE_TAGS = [
  '3d',
  '3d render',
  'cgi',
  'blender',
  'realistic',
  'photorealistic',
  'doll',
  'plastic skin',
  'shiny skin',
  'smooth face',
  'game render',
] as const

type SourceMatchedPromptSource =
  | 'author'
  | 'source_image'
  | 'community'
  | 'fallback'

export interface SourceMatchedLoraPrompt {
  prompt: string
  negativePrompt: string
  scale: number
  source: SourceMatchedPromptSource
  /**
   * False when no real source data was available and `prompt` is just the
   * trigger word wrapped in a generic scaffold. Callers should NOT silently
   * apply an unreliable result — a bare trigger produces output unrelated to
   * the LoRA's source image. The button should degrade to a disabled/hint
   * state instead. True only when an author or mined community prompt with
   * actual descriptive tokens backed the result.
   */
  reliable: boolean
}

/**
 * Minimum descriptive (non-trigger) tokens a prompt needs before it can
 * resemble a specific source image. A bare trigger word ("denia") carries
 * zero composition/outfit signal — the LoRA fires but pose, outfit, scene,
 * and framing are all random, which is exactly the "no relation to the
 * source" failure. Two descriptive tokens is the floor for "reliable".
 */
const SOURCE_MATCH_MIN_DESCRIPTIVE_TOKENS = 2

export function buildSourceMatchedLoraPrompt(
  asset: Pick<
    LoraAssetRecord,
    | 'baseModelFamily'
    | 'recommendedPrompt'
    | 'recommendedPromptAlternates'
    | 'triggerWord'
    | 'type'
  >,
  minedOutfits: readonly CivitaiMinedPromptsResult['outfits'][number][] = [],
): SourceMatchedLoraPrompt {
  const authorCandidate =
    asset.recommendedPrompt?.trim() ||
    asset.recommendedPromptAlternates
      ?.find((variant) => variant.prompt.trim())
      ?.prompt?.trim() ||
    null
  const minedCandidate =
    minedOutfits.find((variant) => variant.prompt.trim()) ?? null
  const minedPrompt = minedCandidate?.prompt?.trim() ?? null

  // Civitai image meta is the closest recoverable source prompt: direct
  // model-version images first, community images second. Author text
  // (description/trainedWords) is still useful, but it may be just a trigger
  // word or a generic usage note rather than the prompt for a source image.
  const authorIsRich =
    !!authorCandidate &&
    countDescriptiveTokens(authorCandidate, asset.triggerWord) >=
      SOURCE_MATCH_MIN_DESCRIPTIVE_TOKENS

  let basePrompt: string
  let source: SourceMatchedPromptSource
  let reliable: boolean

  if (minedPrompt) {
    basePrompt = minedPrompt
    source =
      minedCandidate?.source === 'model_version_image'
        ? 'source_image'
        : 'community'
    reliable = true
  } else if (authorIsRich && authorCandidate) {
    basePrompt = authorCandidate
    source = 'author'
    reliable = true
  } else {
    // Only a bare-trigger author prompt (or nothing) — too sparse to match the
    // source. Build something usable but flag it unreliable so the UI can stop
    // instead of silently shipping a generic image.
    basePrompt = authorCandidate ?? buildLoraPromptTemplate(asset)
    source = 'fallback'
    reliable = false
  }

  const promptWithTrigger = ensureTrigger(basePrompt, asset.triggerWord)
  const prompt = isAnimeLikeLora(asset.baseModelFamily)
    ? appendMissingTags(promptWithTrigger, ANIME_SOURCE_MATCH_TAGS)
    : promptWithTrigger

  return {
    prompt,
    negativePrompt: isAnimeLikeLora(asset.baseModelFamily)
      ? ANIME_SOURCE_MATCH_NEGATIVE_TAGS.join(', ')
      : '',
    scale: LORA_SOURCE_MATCH_SCALE,
    source,
    reliable,
  }
}

/**
 * Count comma-separated tokens in `prompt` that aren't the trigger word
 * itself. Used to decide whether an author prompt is rich enough to resemble
 * a source image or is effectively just the trigger.
 */
function countDescriptiveTokens(prompt: string, triggerWord: string): number {
  const trigger = normalizeTag(triggerWord)
  return splitTags(prompt)
    .map(normalizeTag)
    .filter((token) => token && token !== trigger).length
}

export function mergeNegativePrompt(
  existingNegativePrompt: string | undefined,
  recommendation: string,
): string {
  const existingTags = splitTags(existingNegativePrompt ?? '')
  const recommendedTags = splitTags(recommendation)
  const seen = new Set(existingTags.map(normalizeTag))
  const merged = [...existingTags]

  for (const tag of recommendedTags) {
    const normalized = normalizeTag(tag)
    if (!normalized || seen.has(normalized)) continue
    merged.push(tag)
    seen.add(normalized)
  }

  return merged.join(', ')
}

function ensureTrigger(prompt: string, triggerWord: string): string {
  const trimmed = prompt.trim()
  const trigger = triggerWord.trim()
  if (!trigger || promptIncludesTrigger(trimmed, trigger)) return trimmed
  return trimmed ? `${trigger}, ${trimmed}` : trigger
}

function appendMissingTags(prompt: string, tags: readonly string[]): string {
  const existing = new Set(splitTags(prompt).map(normalizeTag))
  const missing = tags.filter((tag) => !existing.has(normalizeTag(tag)))
  if (missing.length === 0) return prompt.trim()
  return [prompt.trim(), ...missing].filter(Boolean).join(', ')
}

function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isAnimeLikeLora(baseModelFamily: string): boolean {
  const value = baseModelFamily.toLowerCase()
  return (
    value.includes('illustrious') ||
    value.includes('noobai') ||
    value.includes('pony') ||
    value.includes('anima') ||
    value.includes('anime') ||
    value.includes('sdxl')
  )
}
