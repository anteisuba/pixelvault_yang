import 'server-only'

/**
 * Phase 2 pose transformation handler.
 *
 * Takes an input image + pose instruction → generates variants with the
 * subject in a different pose while preserving identity.
 *
 * Uses FLUX Kontext (via FAL) for pose-guided generation.
 *
 * @see 02-功能/功能-路線決策結論書.md §5 — pose dimension
 * @see 02-功能/功能-實作落地清單.md §2.1
 */

import { logger } from '@/lib/logger'
import { DIMENSION_PROVIDERS } from '@/constants/transform-dimensions'
import { generateImageForUser } from '@/services/generate-image.service'
import type {
  TransformInput,
  TransformOutput,
  TransformVariantResult,
} from '@/types/transform'

export async function handlePoseTransform(
  clerkId: string,
  input: TransformInput,
): Promise<TransformOutput> {
  const startTime = Date.now()

  const poseConfig = DIMENSION_PROVIDERS.pose
  const instruction =
    (input.transformation.params?.instruction as string) ??
    'Change the pose naturally'
  const referenceImage = input.subject.imageData
  const variantCount = input.variants

  const prompt = `${instruction}, preserve the original subject's identity and appearance`

  logger.info(`[handlePoseTransform] Starting ${variantCount} variant(s)`, {
    instruction,
    modelId: poseConfig.defaultModelId,
    variantCount,
  })

  const results = await Promise.allSettled(
    Array.from({ length: variantCount }, () =>
      generateImageForUser(clerkId, {
        prompt,
        modelId: poseConfig.defaultModelId,
        aspectRatio: '1:1',
        referenceImage,
        advancedParams: {
          referenceStrength: input.preservation.structure,
        },
      }),
    ),
  )

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
    `[handlePoseTransform] Complete: ${successCount}/${variantCount} succeeded`,
    { durationMs: Date.now() - startTime, totalCost },
  )

  return {
    original: { url: referenceImage ?? '', width: 0, height: 0 },
    variants,
    totalCost,
  }
}
