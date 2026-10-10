import type { AspectRatio } from '@/constants/config'
import { normalizeCivitaiRunnerSampling } from '@/constants/runner-sampling'
import { STUDIO_IMAGE_ASPECT_RATIOS } from '@/constants/studio'
import { mergeNegativePrompt } from '@/lib/lora-source-match-prompt'
import { toRunnerPromptSyntax } from '@/lib/runner-prompt-syntax'
import {
  AdvancedParamsSchema,
  LoraSchema,
  RunnerSeedStringSchema,
  type AdvancedParams,
  type CivitaiImageRecipe,
  type CivitaiRecipeExtraLora,
} from '@/types'

/** Pure Civitai source-image recipe to PixelVault request mapping. */
export interface CivitaiRecipeGenerationPlan {
  prompt: string
  advancedParams: AdvancedParams | undefined
  loraScale: number | undefined
  aspectRatio: AspectRatio | undefined
  /** Fields present in the source metadata but not executable by our Runner. */
  skippedParams: string[]
  /** Fields the one-click action can write into the generation request. */
  appliedParams: string[]
  extraLoras: CivitaiRecipeExtraLora[]
}

/** meta.Size arrives as "512x768" (occasionally with spaces or ×). */
const SIZE_RAW_PATTERN = /^(\d+)\s*[x×]\s*(\d+)$/i

function parseSizeRaw(
  value: string | undefined,
): { width: number; height: number } | null {
  const match = value ? SIZE_RAW_PATTERN.exec(value.trim()) : null
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  return { width, height }
}

/** 原图超过这个像素数多半是放大过的成品，不能直接当出图尺寸。 */
const NATIVE_SIZE_MAX_PIXELS = 1_600_000
/** 放大过的原图按比例缩回这个面积（≈1MP，SDXL / Anima 的原生档）。 */
const NATIVE_SIZE_TARGET_PIXELS = 1024 * 1024

function parseBaseDimensions(
  recipe: CivitaiImageRecipe,
): { width: number; height: number } | null {
  if (recipe.baseWidth && recipe.baseHeight) {
    return { width: recipe.baseWidth, height: recipe.baseHeight }
  }
  const sized = parseSizeRaw(recipe.sizeRaw)
  if (sized || recipe.sizeRaw !== undefined) return sized
  // 元数据没写 Size：没放大过的原图本身就是出图尺寸；放大过的按比例缩回 ≈1MP。
  const { width, height } = recipe
  if (!width || !height) return null
  if (width * height <= NATIVE_SIZE_MAX_PIXELS) return { width, height }
  const scale = Math.sqrt(NATIVE_SIZE_TARGET_PIXELS / (width * height))
  return {
    width: Math.round((width * scale) / 64) * 64,
    height: Math.round((height * scale) / 64) * 64,
  }
}

/**
 * 配方参数是不是步数蒸馏档的（少步数 + 低 CFG）。来源图没写底模时据此挑 Turbo
 * 这类蒸馏底模——拿蒸馏参数去跑完整底模会欠采样，画风整体发虚。
 */
export function isDistilledRecipeSampling(recipe: CivitaiImageRecipe): boolean {
  return (
    recipe.steps !== undefined &&
    recipe.cfgScale !== undefined &&
    recipe.steps <= 15 &&
    recipe.cfgScale < 2.5
  )
}

function parseDisplayDimensions(
  recipe: CivitaiImageRecipe,
): { width: number; height: number } | null {
  return (
    parseBaseDimensions(recipe) ??
    (recipe.width && recipe.height
      ? { width: recipe.width, height: recipe.height }
      : null)
  )
}

function nearestAspectRatio(width: number, height: number): AspectRatio {
  let best: AspectRatio = STUDIO_IMAGE_ASPECT_RATIOS[0]
  let bestDiff = Number.POSITIVE_INFINITY
  const target = Math.log(width / height)
  for (const ratio of STUDIO_IMAGE_ASPECT_RATIOS) {
    const [w = 1, h = 1] = ratio.split(':').map(Number)
    const diff = Math.abs(target - Math.log(w / h))
    if (diff < bestDiff) {
      bestDiff = diff
      best = ratio
    }
  }
  return best
}

function toRunnerSeed(seed: CivitaiImageRecipe['seed']): string | undefined {
  if (seed === undefined) return undefined
  const value = typeof seed === 'number' ? String(seed) : seed
  const parsed = RunnerSeedStringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function buildCivitaiRecipeGenerationPlan(
  recipe: CivitaiImageRecipe,
): CivitaiRecipeGenerationPlan {
  const skippedParams: string[] = []
  const appliedParams: string[] = ['prompt']
  const advanced: AdvancedParams = {}

  if (recipe.negativePrompt !== undefined) {
    const negativePrompt = toRunnerPromptSyntax(recipe.negativePrompt)
    if (
      AdvancedParamsSchema.shape.negativePrompt.safeParse(negativePrompt)
        .success
    ) {
      advanced.negativePrompt = negativePrompt
      appliedParams.push('negativePrompt')
    } else {
      skippedParams.push('negativePrompt')
    }
  }

  if (recipe.cfgScale !== undefined) {
    if (
      AdvancedParamsSchema.shape.guidanceScale.safeParse(recipe.cfgScale)
        .success
    ) {
      advanced.guidanceScale = recipe.cfgScale
      appliedParams.push('cfg')
    } else {
      skippedParams.push('cfgScale')
    }
  }

  if (recipe.steps !== undefined) {
    if (AdvancedParamsSchema.shape.steps.safeParse(recipe.steps).success) {
      advanced.steps = recipe.steps
      appliedParams.push('steps')
    } else {
      skippedParams.push('steps')
    }
  }

  if (recipe.seed !== undefined) {
    const runnerSeed = toRunnerSeed(recipe.seed)
    if (runnerSeed) {
      advanced.runnerSeed = runnerSeed
      appliedParams.push('seed')
      const numericSeed = Number(runnerSeed)
      if (AdvancedParamsSchema.shape.seed.safeParse(numericSeed).success) {
        advanced.seed = numericSeed
      }
    } else {
      skippedParams.push('seed')
    }
  }

  const normalizedSampling = normalizeCivitaiRunnerSampling(
    recipe.sampler,
    recipe.scheduler,
  )
  if (recipe.sampler !== undefined) {
    if (normalizedSampling.sampler) {
      advanced.runnerSampler = normalizedSampling.sampler
      appliedParams.push('sampler')
    } else {
      skippedParams.push('sampler')
    }
  }
  if (recipe.scheduler !== undefined || normalizedSampling.scheduler) {
    if (normalizedSampling.scheduler) {
      advanced.runnerScheduler = normalizedSampling.scheduler
      appliedParams.push('scheduler')
    } else {
      skippedParams.push('scheduler')
    }
  }
  if (recipe.clipSkip !== undefined) skippedParams.push('clipSkip')

  let loraScale: number | undefined
  if (recipe.loraWeight !== undefined) {
    if (LoraSchema.shape.scale.safeParse(recipe.loraWeight).success) {
      loraScale = recipe.loraWeight
      appliedParams.push('loraWeight')
    } else {
      skippedParams.push('loraWeight')
    }
  }

  const baseDimensions = parseBaseDimensions(recipe)
  if (baseDimensions) {
    const widthValid = AdvancedParamsSchema.shape.runnerWidth.safeParse(
      baseDimensions.width,
    ).success
    const heightValid = AdvancedParamsSchema.shape.runnerHeight.safeParse(
      baseDimensions.height,
    ).success
    if (widthValid && heightValid) {
      advanced.runnerWidth = baseDimensions.width
      advanced.runnerHeight = baseDimensions.height
      appliedParams.push('size')
    } else {
      skippedParams.push('size')
    }
  } else if (recipe.sizeRaw !== undefined) {
    skippedParams.push('size')
  }

  const dimensions = parseDisplayDimensions(recipe)
  const aspectRatio = dimensions
    ? nearestAspectRatio(dimensions.width, dimensions.height)
    : undefined

  const hires =
    recipe.hiresUpscaler?.trim().toLowerCase() === 'latent'
      ? AdvancedParamsSchema.shape.runnerHires.safeParse({
          scale: recipe.hiresUpscale,
          denoise: recipe.denoisingStrength,
          ...(recipe.hiresSteps ? { steps: recipe.hiresSteps } : {}),
          ...(recipe.hiresCfgScale !== undefined
            ? { cfg: recipe.hiresCfgScale }
            : {}),
        })
      : null
  if (hires?.success && hires.data) {
    advanced.runnerHires = hires.data
    appliedParams.push('hiresUpscale', 'hiresUpscaler', 'denoisingStrength')
    if (recipe.hiresSteps !== undefined) appliedParams.push('hiresSteps')
    if (recipe.hiresCfgScale !== undefined) appliedParams.push('hiresCfgScale')
  } else {
    for (const key of [
      'hiresUpscale',
      'hiresUpscaler',
      'denoisingStrength',
      'hiresSteps',
      'hiresCfgScale',
    ] as const) {
      if (recipe[key] !== undefined) skippedParams.push(key)
    }
  }

  return {
    // 来源多是 A1111 / Forge 写法，Runner 是 ComfyUI：翻成它认的，权重才不丢。
    prompt: toRunnerPromptSyntax(recipe.prompt),
    advancedParams: Object.keys(advanced).length > 0 ? advanced : undefined,
    loraScale,
    aspectRatio,
    skippedParams,
    appliedParams,
    extraLoras: recipe.extraLoras ?? [],
  }
}

export interface ApplyRecipePlanOptions {
  includeSeed: boolean
}

export function applyRecipePlanToAdvancedParams(
  existing: AdvancedParams | undefined,
  plan: CivitaiRecipeGenerationPlan,
  { includeSeed }: ApplyRecipePlanOptions,
): AdvancedParams {
  const next: AdvancedParams = { ...existing }
  const planParams = plan.advancedParams
  if (!planParams) return next

  if (planParams.negativePrompt !== undefined) {
    next.negativePrompt = mergeNegativePrompt(
      existing?.negativePrompt,
      planParams.negativePrompt,
    )
  }
  if (planParams.guidanceScale !== undefined) {
    next.guidanceScale = planParams.guidanceScale
  }
  if (planParams.steps !== undefined) next.steps = planParams.steps
  if (includeSeed && planParams.seed !== undefined) next.seed = planParams.seed
  if (includeSeed && planParams.runnerSeed !== undefined) {
    next.runnerSeed = planParams.runnerSeed
  }
  if (planParams.runnerSampler !== undefined) {
    next.runnerSampler = planParams.runnerSampler
  }
  if (planParams.runnerScheduler !== undefined) {
    next.runnerScheduler = planParams.runnerScheduler
  }
  if (planParams.runnerWidth !== undefined) {
    next.runnerWidth = planParams.runnerWidth
  }
  if (planParams.runnerHeight !== undefined) {
    next.runnerHeight = planParams.runnerHeight
  }
  if (planParams.runnerHires !== undefined)
    next.runnerHires = planParams.runnerHires
  return next
}
