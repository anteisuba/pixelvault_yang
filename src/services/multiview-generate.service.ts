import 'server-only'

import { randomUUID } from 'crypto'

import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_PROMPTS,
  THREE_D_READY_NEGATIVE,
} from '@/constants/three-d-ready-prompt'
import { AI_MODELS } from '@/constants/models'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { getProviderLabel } from '@/constants/providers'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/generate-image.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { ProviderError } from '@/services/providers/types'
import { createApiUsageEntry } from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import type {
  MultiViewImageRecord,
  MultiViewGenerateRequest,
  MultiViewGenerateResponseData,
} from '@/types'

/**
 * Default to a fal reference-edit model so side-view outputs are fetchable
 * provider URLs for Hunyuan3D multi-view inputs.
 */
const DEFAULT_MULTIVIEW_MODEL = AI_MODELS.FLUX_KONTEXT_PRO

/**
 * Generate three temporary alternate camera angles (back / left / right) of
 * a source image, using a reference-aware text-to-image model.
 *
 * Runs the three calls in parallel. Partial failure is tolerated: any angles
 * that succeed are returned, and the failure is logged but does not abort the
 * whole batch. The returned URLs are provider artifacts, not Generation rows;
 * the final 3D run remains the only archived output.
 */
export async function generateMultiView(
  clerkId: string,
  input: MultiViewGenerateRequest,
): Promise<MultiViewGenerateResponseData> {
  const dbUser = await ensureUser(clerkId)
  const modelId = input.modelId ?? DEFAULT_MULTIVIEW_MODEL
  const executionRoute = await resolveGenerationRoute(dbUser.id, {
    modelId,
    apiKeyId: input.apiKeyId,
  })
  const provider = getProviderLabel(executionRoute.providerConfig)
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)
  const breaker = getCircuitBreaker(executionRoute.adapterType)

  const settled = await Promise.allSettled(
    GENERATED_VIEW_ANGLES.map((angle) =>
      withRetry(
        () =>
          breaker.call(async () => {
            const startedAt = Date.now()
            const result = await providerAdapter.generateImage({
              prompt: MULTI_VIEW_PROMPTS[angle],
              modelId: executionRoute.modelId,
              aspectRatio: '1:1',
              providerConfig: executionRoute.providerConfig,
              apiKey: executionRoute.apiKey,
              referenceImage: input.imageUrl,
              advancedParams: {
                negativePrompt: THREE_D_READY_NEGATIVE,
              },
            })

            await createApiUsageEntry({
              userId: dbUser.id,
              adapterType: executionRoute.adapterType,
              provider,
              modelId: executionRoute.modelId,
              requestCount: executionRoute.creditCost,
              inputImageCount: 1,
              outputImageCount: 1,
              width: result.width,
              height: result.height,
              durationMs: Date.now() - startedAt,
              wasSuccessful: true,
            })

            return {
              id: `tmp-${angle}-${randomUUID()}`,
              view: angle,
              url: result.imageUrl,
              width: result.width,
              height: result.height,
              prompt: MULTI_VIEW_PROMPTS[angle],
              model: executionRoute.modelId,
              provider,
            } satisfies MultiViewImageRecord
          }),
        {
          maxAttempts: 2,
          baseDelayMs: 1500,
          label: `${executionRoute.adapterType}.generateMultiView.${angle}`,
        },
      ),
    ),
  )

  const views: MultiViewImageRecord[] = []
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
    const reason = firstFailure?.reason
    if (reason instanceof GenerateImageServiceError) throw reason
    const message =
      reason instanceof Error ? reason.message : 'Multi-view generation failed'
    const status = reason instanceof ProviderError ? reason.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  return { views }
}
