import 'server-only'

import type { Prisma } from '@/lib/generated/prisma/client'

import type {
  GenerationRecipe,
  GenerationRecipeGap,
  GenerationRecipeLora,
  GenerationRecipeRead,
  ImageGenerationRecipe,
  VideoGenerationRecipe,
} from '@/types/generation-recipe'
import { GenerationRecipeSchema } from '@/types/generation-recipe'
import { GenerationSnapshotSchema } from '@/types'
import { db } from '@/lib/db'

/**
 * 生成配方（`p-auto-recipe`）：提交时按台上的输入起草一份，随队列元数据走；
 * Worker 回调落库那一跳补上服务商回传的种子，写进 `Generation.recipe`。
 * 读的那一侧：新作品直接读；旧作品从旧 `snapshot` 现补，补不全的列进 `gaps`，不静默缺。
 */

/** 服务端注入、带过期链接或只对这一次有意义的高级参数，⛔ 进配方。 */
const SERVER_ONLY_ADVANCED_KEYS = new Set([
  'runnerLoras',
  'runnerCheckpoint',
  'runnerCheckpointApproximate',
])

type AdvancedRecord = Record<string, unknown>

function asRecord(value: unknown): AdvancedRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AdvancedRecord)
    : undefined
}

function readUserSeed(
  advanced: AdvancedRecord | undefined,
): number | undefined {
  const seed = advanced?.seed
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0
    ? seed
    : undefined
}

function readNegativePrompt(
  advanced: AdvancedRecord | undefined,
): string | undefined {
  const negative = advanced?.negativePrompt
  return typeof negative === 'string' && negative.trim() ? negative : undefined
}

function stripServerOnly(
  advanced: AdvancedRecord | undefined,
): AdvancedRecord | undefined {
  if (!advanced) return undefined
  const kept = Object.fromEntries(
    Object.entries(advanced).filter(
      ([key, value]) => !SERVER_ONLY_ADVANCED_KEYS.has(key) && value != null,
    ),
  )
  return Object.keys(kept).length > 0 ? kept : undefined
}

function readLoraRefs(
  advanced: AdvancedRecord | undefined,
): Array<{ url: string; scale?: number }> {
  const loras = advanced?.loras
  if (!Array.isArray(loras)) return []
  return loras.flatMap((item) => {
    const record = asRecord(item)
    if (!record || typeof record.url !== 'string') return []
    return [
      {
        url: record.url,
        ...(typeof record.scale === 'number' ? { scale: record.scale } : {}),
      },
    ]
  })
}

/** 按链接去本人（和平台）LoRA 库里补名字 / 底模 / 触发词 / Civitai 来源。 */
async function enrichLoras(
  userId: string,
  refs: Array<{ url: string; scale?: number }>,
): Promise<GenerationRecipeLora[]> {
  if (refs.length === 0) return []
  const assets = await db.loraAsset.findMany({
    where: {
      loraUrl: { in: refs.map((ref) => ref.url) },
      OR: [{ userId }, { userId: null }],
    },
    select: {
      id: true,
      userId: true,
      loraUrl: true,
      name: true,
      baseModelFamily: true,
      triggerWord: true,
      civitaiModelId: true,
      civitaiModelVersionId: true,
    },
  })
  // 本人的那条优先于平台的同链接记录。
  const byUrl = new Map<string, (typeof assets)[number]>()
  for (const asset of assets) {
    const existing = byUrl.get(asset.loraUrl)
    if (!existing || (existing.userId === null && asset.userId !== null)) {
      byUrl.set(asset.loraUrl, asset)
    }
  }
  return refs.map((ref) => {
    const asset = byUrl.get(ref.url)
    if (!asset) return ref
    return {
      ...ref,
      loraAssetId: asset.id,
      name: asset.name,
      baseModelFamily: asset.baseModelFamily,
      ...(asset.triggerWord ? { triggerWord: asset.triggerWord } : {}),
      ...(asset.civitaiModelId != null
        ? { civitaiModelId: asset.civitaiModelId }
        : {}),
      ...(asset.civitaiModelVersionId != null
        ? { civitaiModelVersionId: asset.civitaiModelVersionId }
        : {}),
    }
  })
}

export interface ImageRecipeDraftInput {
  userId: string
  modelId: string
  prompt: string
  aspectRatio?: string
  advancedParams?: unknown
  referenceImages?: string[]
  characterCardIds?: string[]
  imageOperation?: 'precise-edit'
}

export async function buildImageRecipeDraft(
  input: ImageRecipeDraftInput,
): Promise<ImageGenerationRecipe> {
  const advanced = asRecord(input.advancedParams)
  const seed = readUserSeed(advanced)
  const loras = await enrichLoras(input.userId, readLoraRefs(advanced))
  return {
    version: 1,
    kind: 'image',
    modelId: input.modelId,
    prompt: input.prompt,
    negativePrompt: readNegativePrompt(advanced),
    seed,
    seedSource: seed != null ? 'user' : 'unknown',
    aspectRatio: input.imageOperation ? undefined : input.aspectRatio,
    advancedParams: stripServerOnly(advanced),
    loras: loras.length > 0 ? loras : undefined,
    referenceImages: input.referenceImages?.length
      ? input.referenceImages
      : undefined,
    characterCardIds: input.characterCardIds?.length
      ? input.characterCardIds
      : undefined,
    imageOperation: input.imageOperation,
  }
}

export interface VideoRecipeDraftInput {
  modelId: string
  prompt: string
  workflowId?: string
  negativePrompt?: string
  aspectRatio?: string
  /** 秒数；`auto` = 让模型自己定。 */
  duration?: number | 'auto'
  resolution?: string
  seed?: number
  generateAudio?: boolean
  referenceImages?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
  characterCardIds?: string[]
}

export function buildVideoRecipeDraft(
  input: VideoRecipeDraftInput,
): VideoGenerationRecipe {
  const seed =
    input.seed != null && Number.isInteger(input.seed) && input.seed >= 0
      ? input.seed
      : undefined
  const nonEmpty = (list?: string[]) => (list?.length ? list : undefined)
  return {
    version: 1,
    kind: 'video',
    modelId: input.modelId,
    prompt: input.prompt,
    workflowId: input.workflowId,
    negativePrompt: input.negativePrompt?.trim()
      ? input.negativePrompt
      : undefined,
    aspectRatio: input.aspectRatio,
    duration: input.duration,
    resolution: input.resolution,
    seed,
    seedSource: seed != null ? 'user' : 'unknown',
    generateAudio: input.generateAudio,
    referenceImages: nonEmpty(input.referenceImages),
    videoUrls: nonEmpty(input.videoUrls),
    audioUrls: nonEmpty(input.audioUrls),
    characterCardIds: nonEmpty(input.characterCardIds),
  }
}

/**
 * 回调落库前定稿：用户没填种子、服务商回传了真实种子的，记成 `provider`。
 * 草稿坏了（老版本队列元数据、手改过的行）就不写配方，⛔ 不因此拖垮落库。
 */
export function finalizeGenerationRecipe(
  draft: unknown,
  providerSeed: number | undefined,
): Prisma.InputJsonValue | undefined {
  const parsed = GenerationRecipeSchema.safeParse(draft)
  if (!parsed.success) return undefined
  const recipe = parsed.data
  if (
    recipe.seedSource !== 'user' &&
    providerSeed != null &&
    Number.isSafeInteger(providerSeed) &&
    providerSeed >= 0
  ) {
    const withSeed: GenerationRecipe = {
      ...recipe,
      seed: providerSeed,
      seedSource: 'provider',
    }
    return withSeed as Prisma.InputJsonValue
  }
  return recipe as Prisma.InputJsonValue
}

function gapsOf(recipe: GenerationRecipe): GenerationRecipeGap[] {
  const gaps: GenerationRecipeGap[] = []
  if (recipe.seed == null) gaps.push('seed')
  if (
    recipe.kind === 'image' &&
    recipe.loras?.some((lora) => !lora.name || !lora.baseModelFamily)
  ) {
    gaps.push('loraDetails')
  }
  return gaps
}

/** 2026-11-02 之前的图片作品：从旧 `snapshot` 尽量补一份。 */
function deriveImageRecipeFromSnapshot(generation: {
  prompt: string
  model: string
  seed: bigint | null
  snapshot: unknown
}): ImageGenerationRecipe | null {
  const parsed = GenerationSnapshotSchema.safeParse(generation.snapshot)
  // 比例等字段超出旧 schema 的老行，至少留住提示词和模型。
  const raw = asRecord(generation.snapshot)
  const advanced = asRecord(
    parsed.success ? parsed.data.advancedParams : raw?.advancedParams,
  )
  if (!raw && !generation.prompt) return null
  const seed =
    generation.seed != null &&
    generation.seed <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(generation.seed)
      : readUserSeed(advanced)
  const refs = readLoraRefs(advanced)
  const referenceImages = Array.isArray(raw?.referenceImages)
    ? raw.referenceImages.filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      )
    : []
  const compiledPrompt =
    typeof raw?.compiledPrompt === 'string' ? raw.compiledPrompt : undefined
  return {
    version: 1,
    kind: 'image',
    modelId: typeof raw?.modelId === 'string' ? raw.modelId : generation.model,
    prompt: compiledPrompt ?? generation.prompt,
    negativePrompt: readNegativePrompt(advanced),
    seed,
    // 旧作品分不清是用户填的还是服务商回传的；有种子就当能原样复刻。
    seedSource: seed != null ? 'provider' : 'unknown',
    aspectRatio:
      typeof raw?.aspectRatio === 'string' ? raw.aspectRatio : undefined,
    advancedParams: stripServerOnly(advanced),
    loras: refs.length > 0 ? refs : undefined,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    imageOperation:
      raw?.imageOperation === 'precise-edit' ? 'precise-edit' : undefined,
  }
}

/** 本人作品的配方。别人的作品（画廊「做同款」）等 `p-gallery-recipe` 按公开部分另做。 */
export async function readGenerationRecipe(
  generationId: string,
  userId: string,
): Promise<GenerationRecipeRead | null> {
  const generation = await db.generation.findFirst({
    where: { id: generationId, userId },
    select: {
      id: true,
      outputType: true,
      prompt: true,
      model: true,
      seed: true,
      snapshot: true,
      recipe: true,
    },
  })
  if (!generation) return null

  const stored = GenerationRecipeSchema.safeParse(generation.recipe)
  if (stored.success) {
    return {
      generationId: generation.id,
      source: 'stored',
      recipe: stored.data,
      gaps: gapsOf(stored.data),
    }
  }

  if (generation.outputType === 'IMAGE') {
    const derived = deriveImageRecipeFromSnapshot(generation)
    if (derived) {
      return {
        generationId: generation.id,
        source: 'derived',
        recipe: derived,
        gaps: gapsOf(derived),
      }
    }
  }

  return {
    generationId: generation.id,
    source: 'none',
    recipe: null,
    gaps: ['recipe'],
  }
}
