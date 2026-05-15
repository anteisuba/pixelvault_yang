import 'server-only'

import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_PROMPTS,
  THREE_D_READY_NEGATIVE,
} from '@/constants/three-d-ready-prompt'
import { AI_MODELS } from '@/constants/models'
import { logger } from '@/lib/logger'
import { generateImageForUser } from '@/services/generate-image.service'
import type {
  GenerationRecord,
  MultiViewGenerateRequest,
  MultiViewGenerateResponseData,
} from '@/types'

/**
 * Default reference-aware model. Gemini Flash Image is fast, cheap, and
 * preserves identity well from a reference image — exactly what we want
 * for "render the same subject from another angle." Users can override.
 */
const DEFAULT_MULTIVIEW_MODEL = AI_MODELS.GEMINI_FLASH_IMAGE

/**
 * Generate three alternate camera angles (back / left / right) of a source
 * image, using a reference-aware text-to-image model. Each angle gets
 * persisted as its own Generation row, with the original front view as the
 * referenceImage.
 *
 * Runs the three calls in parallel. Partial failure is tolerated: any
 * angles that succeed are returned, and the failure is logged but does
 * not abort the whole batch — the user can still pick from whichever
 * views came back.
 */
export async function generateMultiView(
  clerkId: string,
  input: MultiViewGenerateRequest,
): Promise<MultiViewGenerateResponseData> {
  const modelId = input.modelId ?? DEFAULT_MULTIVIEW_MODEL

  const settled = await Promise.allSettled(
    GENERATED_VIEW_ANGLES.map((angle) =>
      generateImageForUser(clerkId, {
        prompt: MULTI_VIEW_PROMPTS[angle],
        modelId,
        aspectRatio: '1:1',
        referenceImage: input.imageUrl,
        ...(input.apiKeyId && { apiKeyId: input.apiKeyId }),
        ...(input.projectId && { projectId: input.projectId }),
        advancedParams: {
          negativePrompt: THREE_D_READY_NEGATIVE,
        },
      }),
    ),
  )

  const views: GenerationRecord[] = []
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]
    const angle = GENERATED_VIEW_ANGLES[i]
    if (result.status === 'fulfilled') {
      views.push(result.value)
    } else {
      logger.warn('Multi-view angle failed', {
        angle,
        sourceGenerationId: input.sourceGenerationId,
        reason:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      })
    }
  }

  if (views.length === 0) {
    const firstFailure = settled.find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined
    // Re-throw the first rejection so the route can surface a real error
    // (its `code` / `statusCode` get mapped by GenerateImageServiceError).
    throw firstFailure?.reason ?? new Error('Multi-view generation failed')
  }

  return { views }
}
