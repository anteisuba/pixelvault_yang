import type { AspectRatio } from '@/constants/config'
import { STUDIO_IMAGE_ASPECT_RATIOS } from '@/constants/studio'
import {
  AdvancedParamsSchema,
  LoraSchema,
  type AdvancedParams,
  type CivitaiImageRecipe,
  type CivitaiRecipeExtraLora,
} from '@/types'

/**
 * Map a Civitai per-image recipe into the pieces a PixelVault generation
 * request understands ("一键同款", docs/plans/lora-recipe-workflow.md M1.3).
 *
 * Honesty contract: every recipe field that cannot be applied — unsupported
 * by our request schema (sampler/clipSkip) or out of its bounds — is listed
 * in `skippedParams` so the UI can show "未应用：sampler, clipSkip" instead
 * of silently dropping it. `extraLoras` non-empty means the source image
 * stacked other LoRAs and faithful reproduction is limited; UI must warn.
 *
 * This module is pure mapping. It does NOT merge with the user's current
 * prompt/negative state (M2 UI concern) and does not pick a model (the
 * existing compatibility routing owns that).
 */

export interface CivitaiRecipeGenerationPlan {
  /** Cleaned positive prompt, ready to place into the prompt box. */
  prompt: string
  /**
   * negativePrompt / guidanceScale / steps / seed — only fields that
   * passed AdvancedParamsSchema bounds. Undefined when nothing mapped.
   */
  advancedParams: AdvancedParams | undefined
  /** Target LoRA scale from the image's real weight; undefined → keep current. */
  loraScale: number | undefined
  /** Nearest supported aspect ratio derived from image size; undefined → keep current. */
  aspectRatio: AspectRatio | undefined
  /** Recipe fields present but not applied (unsupported or out of bounds). */
  skippedParams: string[]
  /** Other LoRAs stacked on the source image — non-empty limits fidelity. */
  extraLoras: CivitaiRecipeExtraLora[]
}

/** meta.Size arrives as "512x768" (occasionally with spaces or ×). */
const SIZE_RAW_PATTERN = /^(\d+)\s*[x×]\s*(\d+)$/i

function parseRecipeDimensions(
  recipe: CivitaiImageRecipe,
): { width: number; height: number } | null {
  if (recipe.width && recipe.height) {
    return { width: recipe.width, height: recipe.height }
  }
  const match = recipe.sizeRaw
    ? SIZE_RAW_PATTERN.exec(recipe.sizeRaw.trim())
    : null
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  return { width, height }
}

/**
 * Nearest supported aspect ratio by log-ratio distance (log keeps 2:1 and
 * 1:2 equally far from 1:1, unlike linear difference).
 */
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

export function buildCivitaiRecipeGenerationPlan(
  recipe: CivitaiImageRecipe,
): CivitaiRecipeGenerationPlan {
  const skippedParams: string[] = []
  const advanced: AdvancedParams = {}

  if (recipe.negativePrompt !== undefined) {
    if (
      AdvancedParamsSchema.shape.negativePrompt.safeParse(recipe.negativePrompt)
        .success
    ) {
      advanced.negativePrompt = recipe.negativePrompt
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
    } else {
      skippedParams.push('cfgScale')
    }
  }

  if (recipe.steps !== undefined) {
    if (AdvancedParamsSchema.shape.steps.safeParse(recipe.steps).success) {
      advanced.steps = recipe.steps
    } else {
      skippedParams.push('steps')
    }
  }

  if (recipe.seed !== undefined) {
    if (AdvancedParamsSchema.shape.seed.safeParse(recipe.seed).success) {
      advanced.seed = recipe.seed
    } else {
      skippedParams.push('seed')
    }
  }

  // No generation path accepts these today — always surfaced, never silent.
  if (recipe.sampler !== undefined) skippedParams.push('sampler')
  if (recipe.clipSkip !== undefined) skippedParams.push('clipSkip')

  let loraScale: number | undefined
  if (recipe.loraWeight !== undefined) {
    if (LoraSchema.shape.scale.safeParse(recipe.loraWeight).success) {
      loraScale = recipe.loraWeight
    } else {
      skippedParams.push('loraWeight')
    }
  }

  const dimensions = parseRecipeDimensions(recipe)
  let aspectRatio: AspectRatio | undefined
  if (dimensions) {
    aspectRatio = nearestAspectRatio(dimensions.width, dimensions.height)
  } else if (recipe.sizeRaw !== undefined) {
    skippedParams.push('size')
  }

  return {
    prompt: recipe.prompt,
    advancedParams: Object.keys(advanced).length > 0 ? advanced : undefined,
    loraScale,
    aspectRatio,
    skippedParams,
    extraLoras: recipe.extraLoras ?? [],
  }
}
