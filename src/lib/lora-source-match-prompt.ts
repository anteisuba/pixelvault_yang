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

type SourceMatchedPromptSource = 'author' | 'mined' | 'fallback'

export interface SourceMatchedLoraPrompt {
  prompt: string
  negativePrompt: string
  scale: number
  source: SourceMatchedPromptSource
}

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
  const authorPrompt = asset.recommendedPrompt?.trim()
  const authorAlternate = asset.recommendedPromptAlternates?.find((variant) =>
    variant.prompt.trim(),
  )?.prompt
  const minedPrompt = minedOutfits.find((variant) =>
    variant.prompt.trim(),
  )?.prompt

  const source: SourceMatchedPromptSource = authorPrompt
    ? 'author'
    : authorAlternate
      ? 'author'
      : minedPrompt
        ? 'mined'
        : 'fallback'
  const basePrompt =
    authorPrompt ??
    authorAlternate?.trim() ??
    minedPrompt?.trim() ??
    buildLoraPromptTemplate(asset)
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
  }
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
