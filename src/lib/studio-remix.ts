import { z } from 'zod'

import type { StudioModelOption } from '@/types/model-option'
import { STUDIO_IMAGE_ASPECT_RATIOS } from '@/constants/studio'
import type {
  AdvancedParams,
  CharacterImagePick,
  GenerationRecord,
  GenerationSnapshot,
  RecipeRecord,
  ReplayPayload,
} from '@/types'
import {
  AdvancedParamsSchema,
  CharacterImagePickSchema,
  GenerationSnapshotSchema,
} from '@/types'
import { readRecipeNegativePrompt } from '@/features/lora/core'
import { findOptionByModelId } from '@/lib/model-options'

type SupportedStudioAspectRatio = (typeof STUDIO_IMAGE_ASPECT_RATIOS)[number]

/**
 * 「做同款 / 使用模板」落到工作台的**同一份**配方 —— 素材 / 画廊（自己的与别人公开的）/
 * 提示词库模板三处入口都先变成它，再走同一个 `useStudioPresetApply().apply`。
 */
export interface StudioRemixPreset {
  /** 空串 = 没有可带的提示词（⛔ 拿空串盖掉用户已有的那句）。 */
  prompt: string
  /** `null` = 来源没记比例（模板没存），保持当前。 */
  aspectRatio: SupportedStudioAspectRatio | null
  /** 这一台能选上的那条线路；`null` 而 `sourceModelId` 在 = 原来那个型号现在用不了。 */
  optionId: string | null
  /** 来源原本用的型号（提示「X 已不可用，保持当前模型」用）。 */
  sourceModelId: string | null
  snapshot: GenerationSnapshot | null
  advancedParams?: AdvancedParams
  /** 当时在场的角色 —— 只有自己的作品才有（别人的角色卡不是你的）。 */
  characters: StudioRemixCharacters | null
  /** 模板的出处：套上后出的图记在这一版模板下（`recipeUsage`）。 */
  recipe?: { id: string; version: number }
}

export function parseGenerationSnapshot(
  snapshot: unknown,
): GenerationSnapshot | null {
  const parsed = GenerationSnapshotSchema.safeParse(snapshot)
  return parsed.success ? parsed.data : null
}

function isSupportedStudioAspectRatio(
  value: string | undefined,
): value is SupportedStudioAspectRatio {
  return STUDIO_IMAGE_ASPECT_RATIOS.some((ratio) => ratio === value)
}

function getAspectRatioValue(ratio: SupportedStudioAspectRatio): number {
  const [width, height] = ratio.split(':').map(Number)
  return width / height
}

export function resolveClosestStudioAspectRatio(
  width: number,
  height: number,
): SupportedStudioAspectRatio {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const actualRatio = safeWidth / safeHeight

  return STUDIO_IMAGE_ASPECT_RATIOS.reduce<SupportedStudioAspectRatio>(
    (closest, candidate) => {
      const candidateValue = getAspectRatioValue(candidate)
      const closestValue = getAspectRatioValue(closest)

      return Math.abs(candidateValue - actualRatio) <
        Math.abs(closestValue - actualRatio)
        ? candidate
        : closest
    },
    '1:1',
  )
}

/**
 * ⭐ 以来源**实际跑的型号**为准（生成记录的 `model` / 模板的 `modelId`）。
 * 🔬 11-19 真机：Gemini 3.1 Flash Lite 出的图，重混成了 Gemini 3 Pro（贵 4 倍）。根因是
 *   旧逻辑先按 `apiKeyId` 找线路、不看型号 —— 同一把 Gemini key 会被路由借给同家别的
 *   型号用，快照里的 key 挂在 3 Pro 那条线路上，于是整条换成了 3 Pro。
 * 所以 key 只用来在**同型号**的几条线路里挑回原来那条；型号对不上就不认它。
 * 这一台的名单里找不到这个型号（退役 / 不在这一台）→ `null`（调用方保持当前选择并
 * 提示），⛔ 退到同家第一个。
 */
function resolveOptionId(
  modelId: string | null | undefined,
  apiKeyId: string | undefined,
  options: StudioModelOption[],
): string | null {
  if (!modelId) return null
  const sameModel = options.filter(
    (option) => findOptionByModelId([option], modelId) !== undefined,
  )
  if (apiKeyId) {
    const savedRoute = sameModel.find((option) => option.keyId === apiKeyId)
    if (savedRoute) return savedRoute.optionId
  }
  return sameModel[0]?.optionId ?? null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 坏掉的单格丢掉、其余照留（⛔ 一格不合就整份丢）。 */
function readAdvancedParams(value: unknown): AdvancedParams {
  const record = asRecord(value)
  if (!record) return {}
  const whole = AdvancedParamsSchema.safeParse(record)
  if (whole.success) return whole.data
  const kept: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (AdvancedParamsSchema.safeParse({ [key]: entry }).success)
      kept[key] = entry
  }
  const parsed = AdvancedParamsSchema.safeParse(kept)
  return parsed.success ? parsed.data : {}
}

/** 种子列可能是 string / bigint；-1 与负数 = 随机，不带。 */
function readSeed(value: unknown): number | null {
  const seed =
    typeof value === 'number'
      ? value
      : typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string' && /^\d+$/.test(value)
          ? Number(value)
          : null
  return seed !== null &&
    Number.isSafeInteger(seed) &&
    seed >= 0 &&
    AdvancedParamsSchema.shape.seed.safeParse(seed).success
    ? seed
    : null
}

function withoutEmpty(params: AdvancedParams): AdvancedParams | undefined {
  return Object.keys(params).length > 0 ? params : undefined
}

const CHARACTER_HEAD = /^\[Character: @/
const CHARACTER_HANDLE = /^\[Character: @([^\]\s(]+)/
const REFERENCE_HEADER = '\n\nReference images:\n'
const REFERENCE_LEGEND_LINE = /^(Image \d+ = @|Keep @)/

/**
 * 把卡片总线编译进正文的那段前缀拿掉，剩下用户自己写的那句。
 *
 * 前缀形状来自 `lib/card-bus-compile.ts` 的 `compileImageOutlet`（服务端
 * `studio-generate.service` 拼成 `前缀 + "\n\n" + 用户正文`）：
 * - 有角色图：`[Character: @x]…` 若干段 + `Reference images:` 图例行 + `Keep @x…` 行；
 * - 没图：`[Character: @x (名字)]` 段（可带一行外观文字），段与段之间空一行。
 *
 * ⚠ 只给**没存原话的旧作品**兜底（新作品读快照里的 `freePrompt`）；外观文字里
 * 自己带空行的旧卡会剥不干净，那种就原样留着，⛔ 不猜。
 */
export function stripCompiledCharacterPrefix(prompt: string): string {
  const text = prompt.trim()
  if (!CHARACTER_HEAD.test(text)) return text
  const referenceAt = text.indexOf(REFERENCE_HEADER)
  if (referenceAt >= 0) {
    const lines = text.slice(referenceAt + REFERENCE_HEADER.length).split('\n')
    let index = 0
    while (index < lines.length && REFERENCE_LEGEND_LINE.test(lines[index]!)) {
      index += 1
    }
    return lines.slice(index).join('\n').trim()
  }
  const segments = text.split('\n\n')
  let index = 0
  while (index < segments.length && CHARACTER_HEAD.test(segments[index]!)) {
    index += 1
  }
  return segments.slice(index).join('\n\n').trim()
}

/** 编译前缀里点到名的角色 `@handle`（按出现顺序、去重）。 */
export function readCompiledCharacterHandles(prompt: string): string[] {
  const text = prompt.trim()
  if (!CHARACTER_HEAD.test(text)) return []
  const head = text.split(REFERENCE_HEADER)[0]!
  const handles = head
    .split('\n\n')
    .map((segment) => CHARACTER_HANDLE.exec(segment)?.[1])
    .filter((handle): handle is string => Boolean(handle))
  return [...new Set(handles)]
}

const SnapshotUserPartsSchema = z.object({
  freePrompt: z.string().optional().catch(undefined),
  characterCards: z
    .array(
      z.object({
        id: z.string(),
        lookId: z.string().optional(),
        imagePicks: z
          .array(CharacterImagePickSchema)
          .optional()
          .catch(undefined),
      }),
    )
    .optional()
    .catch(undefined),
})

/**
 * 只读快照里「用户原话 + 在场角色」两格 —— ⛔ 不用整份 `GenerationSnapshotSchema`
 * 去卡（比例不在它的枚举里等任一格不合，整份 parse 失败，原话也跟着丢）。
 */
function readSnapshotUserParts(snapshot: unknown) {
  const parsed = SnapshotUserPartsSchema.safeParse(snapshot)
  return parsed.success ? parsed.data : null
}

/**
 * 这张图用户**自己写的**那句提示词：快照里的原话 → 没存的旧作品剥掉角色编译前缀。
 * 重混回填、详情「提示词」栏、复制提示词都读它（⛔ 直接读 `generation.prompt`，
 * 那是发给服务商的编译串）。
 */
export function getGenerationUserPrompt(generation: GenerationRecord): string {
  const parts = readSnapshotUserParts(generation.snapshot)
  const original = parts?.freePrompt?.trim()
  if (original) return original
  return stripCompiledCharacterPrefix(generation.prompt)
}

/** 重混时要挂回的角色：快照里记下的（含造型）；旧作品从编译前缀里认 `@handle`。 */
export type StudioRemixCharacters =
  | {
      kind: 'ids'
      /** `imagePicks` = 当时勾的那几张；旧快照没记就是 `undefined`（调用方只挂主图）。 */
      cards: {
        id: string
        lookId?: string
        imagePicks?: CharacterImagePick[]
      }[]
    }
  | { kind: 'handles'; handles: string[] }

export function getGenerationRemixCharacters(
  generation: GenerationRecord,
): StudioRemixCharacters {
  const cards = readSnapshotUserParts(generation.snapshot)?.characterCards
  if (cards?.length) return { kind: 'ids', cards }
  return {
    kind: 'handles',
    handles: readCompiledCharacterHandles(generation.prompt),
  }
}

export function getGenerationPromptPreview(
  generation: GenerationRecord,
): string {
  return getGenerationUserPrompt(generation)
}

/** 自己的作品（整行带快照，`GET /api/generations/<id>` 只给本人）。 */
export function buildStudioRemixPreset(
  generation: GenerationRecord,
  options: StudioModelOption[],
): StudioRemixPreset {
  const snapshot = parseGenerationSnapshot(generation.snapshot)
  const prompt = getGenerationUserPrompt(generation)
  const aspectRatio = isSupportedStudioAspectRatio(snapshot?.aspectRatio)
    ? snapshot.aspectRatio
    : resolveClosestStudioAspectRatio(generation.width, generation.height)
  const modelId = generation.model || snapshot?.modelId || null
  // 快照没存参数（旧作品 / 快照不合）时，负面词还在列上。
  const negative = generation.negativePrompt?.trim()
  const advancedParams =
    snapshot?.advancedParams ??
    (negative ? { negativePrompt: negative } : undefined)

  return {
    prompt,
    aspectRatio,
    optionId: resolveOptionId(modelId, snapshot?.apiKeyId, options),
    sourceModelId: modelId,
    snapshot,
    advancedParams,
    characters: getGenerationRemixCharacters(generation),
  }
}

/**
 * 别人公开的作品：只用公开接口**已经给出**的那几格（`GET /api/generations/<id>/replay`，
 * 提示词与负面按 `isPromptPublic` 抹，种子 / 比例 / 型号公开）。⛔ 编造没给的字段；
 * ⛔ 挂角色（那是作者的角色卡）。
 */
export function buildReplayStudioPreset(
  payload: ReplayPayload,
  options: StudioModelOption[],
): StudioRemixPreset {
  const advancedParams: AdvancedParams = {
    ...(payload.negativePrompt
      ? { negativePrompt: payload.negativePrompt }
      : {}),
    ...(payload.seed !== null ? { seed: payload.seed } : {}),
    ...(payload.novelAiLayout ? { novelAiLayout: payload.novelAiLayout } : {}),
    ...(payload.novelAiWidth && payload.novelAiHeight
      ? {
          novelAiWidth: payload.novelAiWidth,
          novelAiHeight: payload.novelAiHeight,
        }
      : {}),
  }
  return {
    prompt: payload.prompt ? stripCompiledCharacterPrefix(payload.prompt) : '',
    aspectRatio: payload.aspectRatio,
    optionId: resolveOptionId(payload.modelId, undefined, options),
    sourceModelId: payload.modelId,
    snapshot: null,
    advancedParams: withoutEmpty(advancedParams),
    characters: null,
  }
}

/**
 * 提示词库的图片 / 视频模板（`?template=<id>`）：存了什么带什么 —— 型号 · 提示词 ·
 * 负面（列上那份优先，没有再读参数里那份）· 比例 · 参数 · 种子。
 * ⚠ 标签模板（`getRecipeTemplateKind === 'TAGS'`）不走这里，照标签台 / LoRA 台自己的套用。
 */
export function buildTemplateStudioPreset(
  recipe: RecipeRecord,
  options: StudioModelOption[],
): StudioRemixPreset {
  const params = asRecord(recipe.params)
  const rawAspect = params?.aspectRatio
  const aspectRatio =
    typeof rawAspect === 'string' && isSupportedStudioAspectRatio(rawAspect)
      ? rawAspect
      : null
  const negative = readRecipeNegativePrompt(recipe)
  const advanced = readAdvancedParams(params?.advancedParams)
  const seed = readSeed(recipe.seed)
  const advancedParams: AdvancedParams = {
    ...advanced,
    ...(negative ? { negativePrompt: negative } : {}),
    ...(seed !== null && advanced.seed === undefined ? { seed } : {}),
  }
  return {
    prompt: recipe.compiledPrompt.trim(),
    aspectRatio,
    optionId: resolveOptionId(recipe.modelId, undefined, options),
    sourceModelId: recipe.modelId || null,
    snapshot: null,
    advancedParams: withoutEmpty(advancedParams),
    characters: null,
    recipe: { id: recipe.id, version: recipe.version },
  }
}
