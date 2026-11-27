import { readRecipeNegativePrompt } from '@/features/lora/core'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { isStyleMediumTag } from '@/lib/tag-lookup'
import { styleChipsOf } from '@/lib/template-save-include'
import {
  AdvancedParamsSchema,
  type AdvancedParams,
  type RecipeRecord,
} from '@/types'
import type { TagChip } from '@/types/tag-composer'

/**
 * 画风块（5B-2）允许随画风一起保存、并在「叠加画风」时合并进工作台的参数白名单。
 * ⚠ 有意不含 `novelAiLayout`（角色）、`novelAi`（精确参考）、`novelAiSceneTexts`、
 * `inpaintMask`、`seed`、`aspectRatio` —— 叠加画风绝不覆盖创作者当前画布里的主角与构图。
 */
export const STYLE_OVERLAY_PARAM_KEYS = [
  'sampler',
  'steps',
  'guidanceScale',
  'cfgRescale',
  'qualityToggle',
  'ucPreset',
  'pixaiMode',
] as const satisfies readonly (keyof AdvancedParams)[]

type StyleOverlayParamKey = (typeof STYLE_OVERLAY_PARAM_KEYS)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isArtistChip(chip: TagChip): boolean {
  return chip.text.trim().toLowerCase().startsWith('artist:')
}

function isStyleChip(chip: TagChip): boolean {
  const lowered = chip.text.trim().toLowerCase()
  return (
    lowered.startsWith('artist:') ||
    isStyleMediumTag(lowered.replace(/\s+/g, '_'))
  )
}

function chipKey(chip: TagChip): string {
  return chip.text.trim().toLowerCase()
}

/**
 * 另存「画风块」时构造的 `recipe.params`：带 `styleBlock: true` 标记，并一并留住
 * 负面标签（UC）与画风相关采样/预设参数，剥离角色构图、精确参考、种子与比例。
 */
export function buildStyleBlockParams(
  params: Record<string, unknown>,
  include: { negative?: boolean; params?: boolean } = {},
): Record<string, unknown> {
  const rawAdvanced = isRecord(params.advancedParams)
    ? params.advancedParams
    : undefined
  const pickedAdvanced: Record<string, unknown> = {}

  if (
    rawAdvanced &&
    include.negative !== false &&
    typeof rawAdvanced.negativePrompt === 'string' &&
    rawAdvanced.negativePrompt.trim().length > 0
  ) {
    pickedAdvanced.negativePrompt = rawAdvanced.negativePrompt
  }

  if (rawAdvanced && include.params !== false) {
    for (const key of STYLE_OVERLAY_PARAM_KEYS) {
      if (rawAdvanced[key] !== undefined) {
        pickedAdvanced[key] = rawAdvanced[key]
      }
    }
  }

  return {
    promptDialect: 'tags',
    styleBlock: true,
    ...(Object.keys(pickedAdvanced).length > 0
      ? { advancedParams: pickedAdvanced }
      : {}),
  }
}

/** 判断一张标签模板是否本身就是纯画风块（显式 `styleBlock: true` 或全部由画师/画法词组成）。 */
export function isStyleBlockTemplate(
  recipe: Pick<RecipeRecord, 'params' | 'compiledPrompt'>,
): boolean {
  if (isRecord(recipe.params) && recipe.params.styleBlock === true) return true
  const chips = parseTagChips(recipe.compiledPrompt)
  return chips.length > 0 && chips.every(isStyleChip)
}

export interface OverlayTagStyleResult {
  positive: TagChip[]
  negative: TagChip[]
  advancedParams: AdvancedParams
  addedStyleCount: number
}

/**
 * 将一张模板作为「画风块」叠加进当前标签台，不清空当前主角、角色页、场景词与精确参考：
 * 1. 纯画风块（`isStyleBlockTemplate`）整块合入；完整画面模板只提取其中的画师 / 画法词
 *    （若该模板完全不含画师/画法词，则合入其全部标签，避免点下去毫无变化）。
 * 2. 若新画风带 `artist:` 词，先替换当前正向里的旧 `artist:` 词，免得两个画风打架；
 *    画师与画法前置，其余画风氛围词去重后顺接，保留全部现有主体与场景词。
 * 3. 负面（UC）按标签去重合并；采样器 / 步数 / CFG / 预设等白名单参数覆盖更新，
 *    `novelAiLayout` / `novelAi` / `seed` / `inpaintMask` 等原样保留。
 */
export function overlayTagStyleTemplate(input: {
  currentPositive: readonly TagChip[]
  currentNegative: readonly TagChip[]
  currentAdvancedParams: AdvancedParams
  recipe: Pick<RecipeRecord, 'compiledPrompt' | 'negativePrompt' | 'params'>
}): OverlayTagStyleResult {
  const allTemplateChips = parseTagChips(input.recipe.compiledPrompt)
  const extractedStyleChips = styleChipsOf(allTemplateChips)
  const incomingStyleChips = isStyleBlockTemplate(input.recipe)
    ? allTemplateChips
    : extractedStyleChips.length > 0
      ? extractedStyleChips
      : allTemplateChips

  const incomingHasArtist = incomingStyleChips.some(isArtistChip)
  const incomingFront = incomingStyleChips.filter(isStyleChip)
  const incomingExtra = incomingStyleChips.filter((chip) => !isStyleChip(chip))

  const basePositive = incomingHasArtist
    ? input.currentPositive.filter((chip) => !isArtistChip(chip))
    : [...input.currentPositive]

  const seenPositive = new Set<string>()
  const nextPositive: TagChip[] = []
  const pushPositive = (chip: TagChip) => {
    const key = chipKey(chip)
    if (!key || seenPositive.has(key)) return
    seenPositive.add(key)
    nextPositive.push(chip)
  }

  for (const chip of incomingFront) pushPositive(chip)
  for (const chip of basePositive) pushPositive(chip)
  for (const chip of incomingExtra) pushPositive(chip)

  const recipeNegativeChips = parseTagChips(
    readRecipeNegativePrompt(input.recipe),
  )
  const seenNegative = new Set<string>()
  const nextNegative: TagChip[] = []
  const pushNegative = (chip: TagChip) => {
    const key = chipKey(chip)
    if (!key || seenNegative.has(key)) return
    seenNegative.add(key)
    nextNegative.push(chip)
  }
  for (const chip of input.currentNegative) pushNegative(chip)
  for (const chip of recipeNegativeChips) pushNegative(chip)

  const nextAdvanced: AdvancedParams = { ...input.currentAdvancedParams }
  const rawRecipeAdvanced =
    isRecord(input.recipe.params) &&
    isRecord(input.recipe.params.advancedParams)
      ? input.recipe.params.advancedParams
      : null
  if (rawRecipeAdvanced) {
    const parsed = AdvancedParamsSchema.safeParse(rawRecipeAdvanced)
    if (parsed.success) {
      const mutable = nextAdvanced as Record<StyleOverlayParamKey, unknown>
      for (const key of STYLE_OVERLAY_PARAM_KEYS) {
        if (parsed.data[key] !== undefined) {
          mutable[key] = parsed.data[key]
        }
      }
    }
  }

  if (nextNegative.length > 0) {
    nextAdvanced.negativePrompt = serializeTagChips(nextNegative)
  }

  return {
    positive: nextPositive,
    negative: nextNegative,
    advancedParams: nextAdvanced,
    addedStyleCount: incomingStyleChips.length,
  }
}
