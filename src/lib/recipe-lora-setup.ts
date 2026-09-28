import { z } from 'zod'

import {
  AdvancedParamsSchema,
  RecipeLoraSetupSchema,
  type LoraAssetRecord,
  type RecipeLoraSetup,
  type RecipeRecord,
} from '@/types'
import { NovelAiCharacterDraftSchema } from '@/types/novelai'

/**
 * LoRA 模板里的整套搭配（pages/prompts.md「LoRA 模板存整套」）。
 *
 * 两种存法都认：LoRA 台「存成模板」存的 `params.loraSetup`（装配台那一份记录原样 +
 * 底模目录 id），与素材库「存为模板」存的 `params.advancedParams.loras`（出图那一刻
 * 发出去的链接与权重，没有名字）。⛔ 这里不猜名字 —— 旧存的名字由调用方按收藏记录补。
 */

export interface RecipeLoraItem {
  url: string
  scale: number
  /** 新存的有；旧存的 `null`。 */
  asset: LoraAssetRecord | null
}

export interface RecipeLoraRead {
  /** LoRA 底模目录 id；旧存的没有。 */
  baseId: string | null
  items: RecipeLoraItem[]
}

const LegacyLorasSchema = AdvancedParamsSchema.pick({ loras: true })

const RecipeRunnerParametersSchema = AdvancedParamsSchema.pick({
  steps: true,
  guidanceScale: true,
  runnerSampler: true,
  runnerScheduler: true,
  runnerWidth: true,
  runnerHeight: true,
  runnerUpscaler: true,
})

export type RecipeRunnerParameters = z.infer<
  typeof RecipeRunnerParametersSchema
>

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readRecipeLoraSetup(params: unknown): RecipeLoraRead | null {
  const record = asRecord(params)
  if (!record) return null

  const setup = RecipeLoraSetupSchema.safeParse(record.loraSetup)
  if (setup.success) {
    return {
      baseId: setup.data.baseId,
      items: setup.data.items.map((item) => ({
        url: item.asset.loraUrl,
        scale: item.scale,
        asset: item.asset,
      })),
    }
  }

  const legacy = LegacyLorasSchema.safeParse(asRecord(record.advancedParams))
  const loras = legacy.success ? (legacy.data.loras ?? []) : []
  if (loras.length === 0) return null
  return {
    baseId: null,
    items: loras.map((lora) => ({
      url: lora.url,
      scale: lora.scale ?? 1,
      asset: null,
    })),
  }
}

/** 模板存出图那一刻的 Runner 参数；没存的那几格缺席（⛔ 补一个默认值）。 */
export function readRecipeRunnerParameters(
  params: unknown,
): RecipeRunnerParameters {
  const parsed = RecipeRunnerParametersSchema.safeParse(
    asRecord(asRecord(params)?.advancedParams) ?? {},
  )
  return parsed.success ? parsed.data : {}
}

/** 模板存下的出图比例（「1:1」一类）；没存就是 `null`，⛔ 猜一个。 */
export function readRecipeAspectRatio(params: unknown): string | null {
  const ratio = asRecord(params)?.aspectRatio
  return typeof ratio === 'string' ? ratio : null
}

/**
 * 模板的负面：LoRA 台存的与提示词页新建的在 `negativePrompt` 那一列，标签台存的随
 * 整组参数走（`advancedParams.negativePrompt`）—— 列里有就用列里的。
 */
export function readRecipeNegativePrompt(
  recipe: Pick<RecipeRecord, 'negativePrompt' | 'params'>,
): string {
  const column = recipe.negativePrompt?.trim()
  if (column) return column
  const nested = asRecord(
    asRecord(recipe.params)?.advancedParams,
  )?.negativePrompt
  return typeof nested === 'string' ? nested.trim() : ''
}

/** 标签台存的改了负面：整组参数里那一份一起改（套用时整组换，读的就是它）。 */
export function withRecipeNegativePrompt(
  params: unknown,
  negativePrompt: string,
): Record<string, unknown> {
  const record = asRecord(params) ?? {}
  return {
    ...record,
    advancedParams: {
      ...(asRecord(record.advancedParams) ?? {}),
      negativePrompt,
    },
  }
}

/**
 * 标签台存的各角色（有分角色才有）：只要写了标签、没关掉的那几位。按草稿的写法读 ——
 * 存下来的那一刻可能有一位还空着，⛔ 为它整组读不出来。
 */
export function readRecipeNovelAiCharacters(params: unknown): string[] {
  const layout = NovelAiCharacterDraftSchema.safeParse(
    asRecord(asRecord(params)?.advancedParams)?.novelAiLayout,
  )
  if (!layout.success) return []
  return layout.data.characters
    .filter(
      (character) =>
        character.enabled !== false && character.prompt.trim().length > 0,
    )
    .map((character) => character.prompt)
}

/**
 * 存进模板前把记录里用不上、又可能很长的几格拿掉（样例图地址、作者推荐的整段
 * 提示词）：「使用」只需要挂得回去，触发词已经写在模板正文里。
 */
export function trimLoraAssetForTemplate(
  asset: LoraAssetRecord,
): LoraAssetRecord {
  const next: LoraAssetRecord = { ...asset, previewImageUrls: [] }
  delete next.recommendedPrompt
  delete next.recommendedPromptAlternates
  return next
}

export function buildRecipeLoraSetup(
  baseId: string | null,
  entries: readonly { asset: LoraAssetRecord; scale: number }[],
): RecipeLoraSetup | null {
  if (!baseId || entries.length === 0) return null
  return {
    baseId,
    items: entries.map((entry) => ({
      asset: trimLoraAssetForTemplate(entry.asset),
      scale: entry.scale,
    })),
  }
}

const CIVITAI_DOWNLOAD_PATTERN = /civitai\.com\/api\/download\/models\/(\d+)/

/** 旧存的一把连名字都补不到时写什么：Hugging Face 用文件名，Civitai 用版本号。 */
export function loraTemplateFallbackName(url: string): string {
  const civitai = url.match(CIVITAI_DOWNLOAD_PATTERN)
  if (civitai) return `Civitai ${civitai[1]}`
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).at(-1)
    if (last) return decodeURIComponent(last).replace(/\.safetensors$/i, '')
  } catch {
    // 链接坏了就落到下面那一句。
  }
  return 'LoRA'
}

/**
 * 旧存的一把只有链接与权重：「使用」时按它拼一份挂载栈认得的记录。触发词本来就
 * 在模板正文里，⛔ 不编一个；家族取模板底模的家族，挂载兼容照常判。
 */
export function templateLoraAssetFromUrl(input: {
  url: string
  scale: number
  name: string | null
  baseModelFamily: string
}): LoraAssetRecord {
  const provider = input.url.includes('huggingface.co')
    ? 'huggingface'
    : CIVITAI_DOWNLOAD_PATTERN.test(input.url)
      ? 'civitai'
      : 'custom'
  return {
    id: `template-lora:${input.url}`,
    styleCode: '',
    name: input.name ?? loraTemplateFallbackName(input.url),
    source: 'imported',
    type: 'subject',
    baseModelFamily: input.baseModelFamily,
    provider,
    triggerWord: '',
    loraUrl: input.url,
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: input.scale,
    isPublic: false,
    isOwn: false,
    createdAt: new Date(0).toISOString(),
  }
}
