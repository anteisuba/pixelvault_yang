import 'server-only'

/**
 * Phase 1 style transformation handler.
 *
 * Resolves style from card or preset → calls generateImageForUser N times
 * (1 or 4 variants) via Promise.allSettled → aggregates results.
 *
 * @see 02-功能/功能-實作落地清單.md §1.2
 */

import { logger } from '@/lib/logger'
import { getTransformPresetById } from '@/constants/transform-presets'
import { generateImageForUser } from '@/services/generate-image.service'
import { compileRecipe } from '@/services/recipe-compiler.service'
import type {
  TransformInput,
  TransformOutput,
  TransformVariantResult,
} from '@/types/transform'

export async function handleStyleTransform(
  clerkId: string,
  input: TransformInput,
): Promise<TransformOutput> {
  const startTime = Date.now()

  // ─── 1. Resolve style → prompt + model ────────────────────────
  let compiledPrompt: string
  let modelId: string | undefined
  let apiKeyId: string | undefined

  if (input.style.type === 'style_card' && input.style.cardId) {
    // Use recipe compiler for card-based styles
    const recipe = await compileRecipe({
      userId: clerkId,
      styleCardId: input.style.cardId,
      freePrompt: 'Apply style transformation',
    })
    compiledPrompt = recipe.compiledPrompt
    modelId = recipe.modelId
  } else if (input.style.type === 'preset' && input.style.presetId) {
    // Use preset config directly
    const preset = getTransformPresetById(input.style.presetId)
    if (!preset) {
      throw new Error(`Unknown preset: ${input.style.presetId}`)
    }
    compiledPrompt = `${preset.name} style transformation, preserve original subject`
    modelId = preset.modelId
  } else {
    throw new Error('Style must specify either cardId or presetId')
  }

  // ─── 2. Generate N variants in parallel ───────────────────────
  const variantCount = input.variants
  const referenceImage = input.subject.imageData

  logger.info(`[handleStyleTransform] Starting ${variantCount} variant(s)`, {
    style: input.style.type,
    modelId,
    variantCount,
  })

  const results = await Promise.allSettled(
    Array.from({ length: variantCount }, () =>
      generateImageForUser(clerkId, {
        prompt: compiledPrompt,
        modelId: modelId!,
        aspectRatio: '1:1',
        referenceImage,
        apiKeyId,
        advancedParams: {
          referenceStrength: input.preservation.structure,
        },
      }),
    ),
  )

  // ─── 3. Map results to TransformOutput ────────────────────────
  let totalCost = 0
  const variants: TransformVariantResult[] = results.map((result) => {
    if (result.status === 'fulfilled') {
      const gen = result.value
      totalCost += 1
      return {
        status: 'success' as const,
        result: {
          url: gen.url,
          width: gen.width ?? 0,
          height: gen.height ?? 0,
          cost: 1,
        },
      }
    } else {
      const error = result.reason
      return {
        status: 'failed' as const,
        error: {
          code: error?.errorCode ?? 'GENERATION_FAILED',
          i18nKey: error?.i18nKey ?? 'Transform.errors.allFailed',
          retryable: true,
          displayMessage:
            error instanceof Error ? error.message : 'Generation failed',
        },
      }
    }
  })

  const successCount = variants.filter((v) => v.status === 'success').length
  logger.info(
    `[handleStyleTransform] Complete: ${successCount}/${variantCount} succeeded`,
    {
      durationMs: Date.now() - startTime,
      totalCost,
    },
  )

  return {
    original: {
      url: referenceImage ?? '',
      width: 0,
      height: 0,
    },
    variants,
    totalCost,
  }
}
