import {
  NOVELAI_CHARACTER_GRID_SIZE,
  NOVELAI_SAMPLER_OPTIONS,
  getNovelAiCharacterLayoutMode,
  getNovelAiMaxCharacters,
} from '@/constants/novelai'
import type { AspectRatio } from '@/constants/config'
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
  if (selected.has('positive')) {
    next.prompt =
      mode || characters.length === 0
        ? recipe.prompt
        : [recipe.prompt, ...characters.map((c) => c.prompt)].join(', ')
  }
  if (selected.has('negative'))
    next.advancedParams.negativePrompt = recipe.negative || undefined
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
    if (recipe.steps !== null && Number.isInteger(recipe.steps))
      next.advancedParams.steps = Math.min(100, Math.max(1, recipe.steps))
    if (recipe.cfg !== null)
      next.advancedParams.guidanceScale = Math.min(30, Math.max(0, recipe.cfg))
    const sampler = NOVELAI_SAMPLER_OPTIONS.find((s) => s === recipe.sampler)
    if (sampler) next.advancedParams.sampler = sampler
    if (recipe.width && recipe.height)
      next.aspectRatio = resolveClosestStudioAspectRatio(
        recipe.width,
        recipe.height,
      )
  }
  const seed = seedOf(reading)
  if (selected.has('seed') && seed !== null) next.advancedParams.seed = seed
  return next
}
