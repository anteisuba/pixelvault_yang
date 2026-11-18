import {
  NOVELAI_CHARACTER_GRID_SIZE,
  NOVELAI_IMAGE_DIMENSIONS,
  NOVELAI_SAMPLER_OPTIONS,
  getNovelAiCharacterLayoutMode,
  getNovelAiMaxCharacters,
} from '@/constants/novelai'
import type { AspectRatio } from '@/constants/config'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  stripNovelAiQualityTags,
  stripNovelAiUcPreset,
} from '@/lib/novelai-compose'
import type { AdvancedParams } from '@/types'
import type { ImageRecipeReading } from '@/types/image-recipe'
import { NovelAiCharacterLayoutSchema } from '@/types/novelai'
import { resolveClosestStudioAspectRatio } from '@/lib/studio-remix'
import { artistPromptTag, displayDanbooruTag } from '@/lib/tag-lookup'

/**
 * 「从图读串」勾选框的格子与落地规则（owner 2026-10-25）：
 * - 勾上的整格**替换**（NovelAI 做法），⛔ 接在后面；导入后由调用方给一条带「撤回」的提示。
 * - 默认勾正面 / 负面 / 角色，参数与种子不勾（与 NovelAI 导入框一致）。
 * - 没配方时是 Tagger 认出的三格（画师 · 角色 · 特征），勾上的拼成一串放进正面。
 */

export type ImageRecipeRowKey =
  | 'positive'
  | 'negative'
  | 'characters'
  | 'params'
  | 'seed'
  | 'artist'
  | 'character'
  | 'general'

export interface ImageRecipeRow {
  key: ImageRecipeRowKey
  /** 格子里那一行灰字。 */
  preview: string
  count?: number
  defaultOn: boolean
}

export interface ImageRecipeTarget {
  prompt: string
  advancedParams: AdvancedParams
  aspectRatio: AspectRatio
}

const SEED_MAX = 4294967295

function tagLine(tags: readonly string[]): string {
  return tags.join(', ')
}

function taggerLines(reading: ImageRecipeReading) {
  const tags = reading.tags
  return {
    artist: (tags?.artist ?? []).map(artistPromptTag),
    character: (tags?.character ?? []).map(displayDanbooruTag),
    general: (tags?.general ?? []).map(displayDanbooruTag),
  }
}

function seedOf(reading: ImageRecipeReading): number | null {
  const seed = Number(reading.recipe?.seed ?? NaN)
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= SEED_MAX
    ? seed
    : null
}

export function imageRecipeRows(
  reading: ImageRecipeReading,
  stepsLabel: (count: number) => string,
): ImageRecipeRow[] {
  const recipe = reading.recipe
  if (recipe) {
    const params = [
      recipe.steps !== null ? stepsLabel(recipe.steps) : null,
      recipe.cfg !== null ? `CFG ${recipe.cfg}` : null,
      recipe.sampler,
      recipe.width && recipe.height ? `${recipe.width}×${recipe.height}` : null,
    ].filter((part): part is string => !!part)
    const seed = seedOf(reading)
    return [
      { key: 'positive', preview: recipe.prompt, defaultOn: true },
      ...(recipe.negative
        ? [
            {
              key: 'negative' as const,
              preview: recipe.negative,
              defaultOn: true,
            },
          ]
        : []),
      ...(recipe.characters.length > 0
        ? [
            {
              key: 'characters' as const,
              preview: recipe.characters.map((c) => c.prompt).join(' / '),
              count: recipe.characters.length,
              defaultOn: true,
            },
          ]
        : []),
      ...(params.length > 0
        ? [
            {
              key: 'params' as const,
              preview: params.join(' · '),
              defaultOn: false,
            },
          ]
        : []),
      ...(seed !== null
        ? [{ key: 'seed' as const, preview: String(seed), defaultOn: false }]
        : []),
    ]
  }
  const lines = taggerLines(reading)
  return (['artist', 'character', 'general'] as const).flatMap((key) =>
    lines[key].length > 0
      ? [
          {
            key,
            preview: tagLine(lines[key]),
            count: lines[key].length,
            defaultOn: true,
          },
        ]
      : [],
  )
}

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value))
}

/** NovelAI 只有 `NOVELAI_IMAGE_DIMENSIONS` 那五档比例，挑最接近的一档。 */
function closestNovelAiAspectRatio(width: number, height: number): AspectRatio {
  const actual = Math.max(width, 1) / Math.max(height, 1)
  let best = '1:1'
  let bestGap = Infinity
  for (const [ratio, size] of Object.entries(NOVELAI_IMAGE_DIMENSIONS)) {
    const gap = Math.abs(size.width / size.height - actual)
    if (gap < bestGap) {
      best = ratio
      bestGap = gap
    }
  }
  return best as AspectRatio
}

/** 5×5 网格的格心（V4.5 只能落在格心上）。 */
function snapToGrid(value: number): number {
  const cell = Math.min(
    NOVELAI_CHARACTER_GRID_SIZE - 1,
    Math.max(0, Math.floor(value * NOVELAI_CHARACTER_GRID_SIZE)),
  )
  return (cell + 0.5) / NOVELAI_CHARACTER_GRID_SIZE
}

/**
 * 勾上的格子落到台上：返回新的 提示词 / 参数 / 比例。
 * `characterModelId` = 这一台能摆角色的那个模型；没有（图片台、非 NAI）时角色接进正面。
 */
export function applyImageRecipe(
  reading: ImageRecipeReading,
  selected: ReadonlySet<ImageRecipeRowKey>,
  current: ImageRecipeTarget,
  characterModelId: string | undefined,
  /** 这一轮的主模型：参数按它的能力表夹紧；是 NovelAI 时剥掉重复的预设串。 */
  targetModel?: { adapterType: AI_ADAPTER_TYPES; modelId: string },
): ImageRecipeTarget {
  const next: ImageRecipeTarget = {
    prompt: current.prompt,
    advancedParams: { ...current.advancedParams },
    aspectRatio: current.aspectRatio,
  }
  const recipe = reading.recipe
  if (!recipe) {
    const lines = taggerLines(reading)
    const picked = (['artist', 'character', 'general'] as const).flatMap(
      (key) => (selected.has(key) ? lines[key] : []),
    )
    if (picked.length > 0) next.prompt = tagLine(picked)
    return next
  }

  const mode = getNovelAiCharacterLayoutMode(characterModelId)
  const characters = selected.has('characters') ? recipe.characters : []
  const config = targetModel
    ? getCapabilityConfig(targetModel.adapterType, targetModel.modelId)
    : undefined
  const novelAi = targetModel?.adapterType === AI_ADAPTER_TYPES.NOVELAI
  // NovelAI 写进图里的正面 / 负面已经带着网页端拼好的质量标签串与 UC 预设串；
  // 台上的两个开关还会再拼一遍 —— 认得出的整串剥掉，开关拨到同一档。
  // NovelAI 自己的图里认不出 = 当时那颗开关是关的；别家（A1111 / Civitai）的
  // 配方认不出就不碰开关。
  const fromNovelAi = recipe.source === 'novelai'
  const setPreset = (
    field: 'qualityToggle' | 'ucPreset',
    options: readonly string[] | undefined,
    detected: string | null,
    off: string,
  ) => {
    const value = detected ?? (fromNovelAi ? off : null)
    if (value && options?.includes(value)) {
      next.advancedParams = { ...next.advancedParams, [field]: value }
    }
  }
  let positive = recipe.prompt
  if (novelAi && selected.has('positive')) {
    const stripped = stripNovelAiQualityTags(positive)
    positive = stripped.prompt
    setPreset(
      'qualityToggle',
      config?.qualityToggleOptions,
      stripped.preset,
      'off',
    )
  }
  let negative = recipe.negative
  if (novelAi && selected.has('negative')) {
    const stripped = stripNovelAiUcPreset(negative)
    negative = stripped.negative
    setPreset('ucPreset', config?.ucPresetOptions, stripped.preset, 'none')
  }
  if (selected.has('positive')) {
    next.prompt =
      mode || characters.length === 0
        ? positive
        : [positive, ...characters.map((c) => c.prompt)].join(', ')
  }
  if (selected.has('negative'))
    next.advancedParams.negativePrompt = negative || undefined
  if (mode && characters.length > 0) {
    const layout = NovelAiCharacterLayoutSchema.safeParse({
      positioning: recipe.manualPositions ? 'manual' : 'auto',
      characters: characters
        .slice(0, getNovelAiMaxCharacters(characterModelId))
        .map((character) => {
          const center = character.center ?? { x: 0.5, y: 0.5 }
          return {
            prompt: character.prompt,
            negativePrompt: character.negative,
            position:
              mode === 'grid'
                ? { x: snapToGrid(center.x), y: snapToGrid(center.y) }
                : center,
          }
        }),
    })
    if (layout.success) next.advancedParams.novelAiLayout = layout.data
  }
  if (selected.has('params')) {
    // 按目标模型的能力表夹紧：步数 / CFG 落在它的值域里，采样器只收它认的那几档，
    // NovelAI 的尺寸只有五档（不在表里的比例 worker 会掉回 1024²）。
    const stepsRange = config?.steps ?? { min: 1, max: 100 }
    const cfgRange = config?.guidanceScale ?? { min: 0, max: 30 }
    if (recipe.steps !== null && Number.isInteger(recipe.steps))
      next.advancedParams.steps = clamp(recipe.steps, stepsRange)
    if (recipe.cfg !== null)
      next.advancedParams.guidanceScale = clamp(recipe.cfg, cfgRange)
    const samplers: readonly string[] =
      config?.samplerOptions ?? NOVELAI_SAMPLER_OPTIONS
    const sampler = NOVELAI_SAMPLER_OPTIONS.find(
      (s) => s === recipe.sampler && samplers.includes(s),
    )
    if (sampler) next.advancedParams.sampler = sampler
    if (recipe.width && recipe.height)
      next.aspectRatio = novelAi
        ? closestNovelAiAspectRatio(recipe.width, recipe.height)
        : resolveClosestStudioAspectRatio(recipe.width, recipe.height)
  }
  const seed = seedOf(reading)
  if (selected.has('seed') && seed !== null) next.advancedParams.seed = seed
  return next
}
