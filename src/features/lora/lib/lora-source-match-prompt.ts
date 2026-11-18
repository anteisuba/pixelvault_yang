import { normalizeToLoraBaseFamily } from '@/features/lora/constants/lora-base-models'
import { LORA_PROMPT_DIALECTS } from '@/features/lora/constants/lora-prompt-dialects'
import type {
  CivitaiImageRecipe,
  CivitaiMinedPromptsResult,
  LoraAssetRecord,
} from '@/types'

import { buildLoraPromptTemplate } from './lora-prompt-template'
import { promptIncludesTrigger } from '@/lib/prompt-text'
import { toRunnerPromptSyntax } from '@/lib/runner-prompt-syntax'

type SourceMatchedPromptSource =
  | 'author'
  | 'source_image'
  | 'community'
  | 'fallback'

export interface SourceMatchedLoraPrompt {
  prompt: string
  negativePrompt: string
  source: SourceMatchedPromptSource
  /**
   * False when no real source data was available and `prompt` is just the
   * trigger word wrapped in a generic scaffold. Callers must not present an
   * unreliable result as a faithful restore — a bare trigger produces output
   * unrelated to the LoRA's source image. True only when an author or mined
   * community prompt with actual descriptive tokens backed the result.
   * (No LoRA weight here: without a source recipe the weight is unknown, so
   * the mounted one stays.)
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

type SourceMatchAsset = Pick<
  LoraAssetRecord,
  | 'baseModelFamily'
  | 'recommendedPrompt'
  | 'recommendedPromptAlternates'
  | 'triggerWord'
  | 'type'
>

export function buildSourceMatchedLoraPrompt(
  asset: SourceMatchAsset,
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

  // ⛔ No words appended to the prompt: "restore" means the source's words, not
  // ours. The negative is unknown here, so it is the family's own staples (a
  // family we can't normalize gets none — we don't guess a dialect).
  const family = normalizeToLoraBaseFamily(asset.baseModelFamily)
  const dialect = family ? LORA_PROMPT_DIALECTS[family] : null

  return {
    prompt: ensureTrigger(toRunnerPromptSyntax(basePrompt), asset.triggerWord),
    negativePrompt: dialect ? dialect.negative.join(', ') : '',
    source,
    reliable,
  }
}

/** 「忠实还原」照哪张来源图出：参数齐全的那张原样复现；没有 = 只能近似。 */
export type LoraRestorePlan =
  | { kind: 'faithful'; recipe: CivitaiImageRecipe }
  | ({ kind: 'approximate' } & SourceMatchedLoraPrompt)

/**
 * 一张来源图的配方够不够「原样复现」：真 Civitai 元数据（⛔ AI 反推的不算），且 prompt /
 * sampler / steps / CFG / seed / 尺寸都写了。缺任何一项，照它出的就只是近似。
 */
export function isCompleteSourceRecipe(recipe: CivitaiImageRecipe): boolean {
  return (
    recipe.source !== 'ai_inferred' &&
    recipe.sampler !== undefined &&
    recipe.steps !== undefined &&
    recipe.cfgScale !== undefined &&
    recipe.seed !== undefined &&
    (recipe.sizeRaw !== undefined ||
      (recipe.baseWidth !== undefined && recipe.baseHeight !== undefined) ||
      (recipe.width !== undefined && recipe.height !== undefined))
  )
}

const RESTORE_SOURCE_PRIORITY: readonly CivitaiImageRecipe['source'][] = [
  'model_version_image',
  'community_image',
]

/**
 * 「忠实还原」：有参数齐全的来源图配方 → 原样用它（版本自己的示例图优先于社区图）；
 * 没有 → 退回作者 / 挖到的提示词，`approximate` 让界面如实说「只能近似」。
 */
export function resolveLoraRestorePlan(
  asset: SourceMatchAsset,
  mined: {
    outfits: readonly CivitaiMinedPromptsResult['outfits'][number][]
    recipes: readonly CivitaiImageRecipe[]
  },
): LoraRestorePlan {
  for (const source of RESTORE_SOURCE_PRIORITY) {
    const recipe = mined.recipes.find(
      (candidate) =>
        candidate.source === source && isCompleteSourceRecipe(candidate),
    )
    if (recipe) return { kind: 'faithful', recipe }
  }
  return {
    kind: 'approximate',
    ...buildSourceMatchedLoraPrompt(asset, mined.outfits),
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

function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
