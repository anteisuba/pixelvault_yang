import 'server-only'

import { API_USAGE, FREE_TIER } from '@/constants/config'
import { getModelById } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getProviderLabel,
  PROVIDER_FALLBACK_MAP,
  type ProviderConfig,
} from '@/constants/providers'
import type { GenerateRequest, GenerationRecord } from '@/types'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import {
  createGeneration,
  getFreeGenerationCountToday,
} from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
import {
  ProviderError,
  type ProviderGenerationResult,
} from '@/services/providers/types'
import {
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import {
  attachUsageEntryToGeneration,
  completeGenerationJob,
  createApiUsageEntry,
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { validatePrompt } from '@/lib/prompt-guard'

export interface ResolvedGenerationRoute {
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  isFreeGeneration?: boolean
  /** Credit cost for this generation (from model config, fallback 1) */
  creditCost: number
}

type GenerateImageServiceErrorCode =
  | 'CUSTOM_MODEL_REQUIRES_ROUTE'
  | 'FREE_LIMIT_EXCEEDED'
  | 'INVALID_JOB'
  | 'INVALID_ROUTE_SELECTION'
  | 'JOB_NOT_FOUND'
  | 'MISSING_API_KEY'
  | 'NOVELAI_TIER_LIMIT'
  | 'PLATFORM_KEY_MISSING'
  | 'PROVIDER_ERROR'
  | 'UNSUPPORTED_MODEL'
  | 'USER_NOT_FOUND'
  | 'VALIDATION_ERROR'

export class GenerateImageServiceError extends Error {
  readonly code: GenerateImageServiceErrorCode
  readonly status: number

  constructor(
    code: GenerateImageServiceErrorCode,
    message: string,
    status: number,
  ) {
    super(message)
    this.code = code
    this.status = status
    this.name = 'GenerateImageServiceError'
  }
}

export function isGenerateImageServiceError(
  error: unknown,
): error is GenerateImageServiceError {
  return error instanceof GenerateImageServiceError
}

export async function resolveGenerationRoute(
  userId: string,
  { modelId, apiKeyId }: Pick<GenerateRequest, 'modelId' | 'apiKeyId'>,
): Promise<ResolvedGenerationRoute> {
  const builtInModel = getModelById(modelId)

  if (apiKeyId) {
    const selectedApiKey = await getApiKeyValueById(apiKeyId, userId)

    if (!selectedApiKey) {
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        'Selected API key is unavailable',
        400,
      )
    }

    if (selectedApiKey.modelId !== modelId) {
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        'Selected API key does not match the chosen model',
        400,
      )
    }

    return {
      modelId: selectedApiKey.modelId,
      adapterType: selectedApiKey.adapterType,
      providerConfig: selectedApiKey.providerConfig,
      apiKey: selectedApiKey.keyValue,
      creditCost:
        builtInModel?.cost ?? API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  }

  if (!builtInModel) {
    throw new GenerateImageServiceError(
      'CUSTOM_MODEL_REQUIRES_ROUTE',
      'Custom models require selecting an active API key',
      400,
    )
  }

  // Auto-find an active key for this model's adapter
  const autoKey = await findActiveKeyForAdapter(
    userId,
    builtInModel.adapterType,
  )
  if (autoKey) {
    // VolcEngine requires endpoint IDs (ep-xxx), not model names.
    // If the user's key stores an endpoint ID, use it; otherwise fall through
    // to the built-in model name (works for pay-per-use models).
    const effectiveModelId =
      autoKey.adapterType === AI_ADAPTER_TYPES.VOLCENGINE &&
      autoKey.modelId.startsWith('ep-')
        ? autoKey.modelId
        : modelId
    return {
      modelId: effectiveModelId,
      adapterType: autoKey.adapterType,
      providerConfig: autoKey.providerConfig,
      apiKey: autoKey.keyValue,
      creditCost: builtInModel.cost,
    }
  }

  // Free tier: use platform API key for eligible models
  if (FREE_TIER.ENABLED && builtInModel.freeTier) {
    const freeCount = await getFreeGenerationCountToday(userId)
    if (freeCount >= FREE_TIER.DAILY_LIMIT) {
      throw new GenerateImageServiceError(
        'FREE_LIMIT_EXCEEDED',
        `Free tier limit reached (${FREE_TIER.DAILY_LIMIT}/day). Bind your own API key to continue.`,
        429,
      )
    }

    const platformKey = getSystemApiKey(builtInModel.adapterType)
    if (!platformKey) {
      throw new GenerateImageServiceError(
        'PLATFORM_KEY_MISSING',
        'Free tier is temporarily unavailable. Please bind your own API key.',
        503,
      )
    }

    return {
      modelId,
      adapterType: builtInModel.adapterType,
      providerConfig: builtInModel.providerConfig,
      apiKey: platformKey,
      isFreeGeneration: true,
      creditCost: builtInModel.cost,
    }
  }

  throw new GenerateImageServiceError(
    'MISSING_API_KEY',
    'Please bind your own API key for this model in the API Keys settings',
    400,
  )
}

export async function recordFailedUsage(params: {
  userId: string
  generationJobId: string
  adapterType: AI_ADAPTER_TYPES
  provider: string
  modelId: string
  creditCost: number
  durationMs: number
  referenceImage?: string
  errorMessage: string
}) {
  await Promise.allSettled([
    createApiUsageEntry({
      userId: params.userId,
      generationJobId: params.generationJobId,
      adapterType: params.adapterType,
      provider: params.provider,
      modelId: params.modelId,
      requestCount: params.creditCost,
      inputImageCount: params.referenceImage ? 1 : 0,
      outputImageCount: 0,
      durationMs: params.durationMs,
      wasSuccessful: false,
      errorMessage: params.errorMessage,
    }),
    failGenerationJob(params.generationJobId, {
      requestCount: params.creditCost,
      errorMessage: params.errorMessage,
    }),
  ])
}

export async function generateImageForUser(
  clerkId: string,
  input: GenerateRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)

  // Validate prompt before processing
  const promptCheck = validatePrompt(input.prompt)
  if (!promptCheck.valid) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      promptCheck.reason ?? 'Invalid prompt',
      400,
    )
  }

  const executionRoute = await resolveGenerationRoute(dbUser.id, input)

  // Validate: models that require reference images must have at least one
  const builtInModel = getModelById(input.modelId)
  if (builtInModel?.requiresReferenceImage) {
    const hasRef =
      input.referenceImage || (input.referenceImages?.length ?? 0) > 0
    if (!hasRef) {
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        'This model requires at least one reference image',
        400,
      )
    }
  }

  const provider = getProviderLabel(executionRoute.providerConfig)
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      `Unsupported model: ${executionRoute.modelId}`,
      400,
    )
  }

  const generationJob = await createGenerationJob({
    userId: dbUser.id,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: executionRoute.modelId,
  })

  const providerCallStartedAt = Date.now()
  let generatedAsset: ProviderGenerationResult

  const breaker = getCircuitBreaker(executionRoute.adapterType)

  try {
    generatedAsset = await breaker.call(() =>
      withRetry(
        () =>
          providerAdapter.generateImage({
            prompt: input.prompt,
            modelId: executionRoute.modelId,
            aspectRatio: input.aspectRatio,
            providerConfig: executionRoute.providerConfig,
            apiKey: executionRoute.apiKey,
            referenceImage: input.referenceImage,
            referenceImages: input.referenceImages,
            advancedParams: input.advancedParams,
          }),
        {
          maxAttempts: 2,
          baseDelayMs: 1500,
          label: `${executionRoute.adapterType}.generateImage`,
        },
      ),
    )

    logger.info('Image generated successfully', {
      adapter: executionRoute.adapterType,
      modelId: executionRoute.modelId,
      durationMs: Date.now() - providerCallStartedAt,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Image generation failed'

    await recordFailedUsage({
      userId: dbUser.id,
      generationJobId: generationJob.id,
      adapterType: executionRoute.adapterType,
      provider,
      modelId: executionRoute.modelId,
      creditCost: executionRoute.creditCost,
      durationMs: Date.now() - providerCallStartedAt,
      referenceImage: input.referenceImage,
      errorMessage: message,
    })

    // Wrap raw provider errors so API routes can return proper status codes
    if (error instanceof GenerateImageServiceError) {
      throw error
    }

    // Attempt provider fallback (only for free-tier / platform-key generation)
    const isTransient =
      (error instanceof ProviderError && error.status >= 500) ||
      (error instanceof Error &&
        /timeout|econnreset|fetch failed/i.test(error.message))

    if (isTransient && executionRoute.isFreeGeneration) {
      const fallbackModelId = PROVIDER_FALLBACK_MAP[executionRoute.modelId]
      if (fallbackModelId) {
        logger.warn('Primary provider failed, attempting fallback', {
          failedModel: executionRoute.modelId,
          fallbackModel: fallbackModelId,
          error: message,
        })
        try {
          // Recursive call with fallback model — will resolve a new route
          return await generateImageForUser(clerkId, {
            ...input,
            modelId: fallbackModelId,
          })
        } catch (fallbackError) {
          logger.error('Fallback provider also failed', {
            fallbackModel: fallbackModelId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          })
          // Fall through to throw original error
        }
      }
    }

    const status = error instanceof ProviderError ? error.status : 502
    // Map known provider error patterns to specific service error codes
    const code =
      error instanceof ProviderError && error.status === 403
        ? 'NOVELAI_TIER_LIMIT'
        : 'PROVIDER_ERROR'
    throw new GenerateImageServiceError(code, message, status)
  }

  const usageEntry = await createApiUsageEntry({
    userId: dbUser.id,
    generationJobId: generationJob.id,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: executionRoute.modelId,
    requestCount: executionRoute.creditCost,
    inputImageCount: input.referenceImage
      ? 1
      : (input.referenceImages?.length ?? 0),
    outputImageCount: 1,
    width: generatedAsset.width,
    height: generatedAsset.height,
    durationMs: Date.now() - providerCallStartedAt,
    wasSuccessful: true,
  })

  const storageKey = generateStorageKey('IMAGE', dbUser.id)
  // Use single referenceImage if available, otherwise take first from referenceImages array
  const effectiveRefImage =
    input.referenceImage || input.referenceImages?.[0] || undefined
  const refKey = effectiveRefImage
    ? generateStorageKey('IMAGE', dbUser.id)
    : undefined

  try {
    // Fetch reference image and generated image in parallel
    const [refData, genData] = await Promise.all([
      effectiveRefImage
        ? fetchAsBuffer(effectiveRefImage)
        : Promise.resolve(null),
      fetchAsBuffer(generatedAsset.imageUrl),
    ])

    // Upload both to R2 in parallel
    const [referenceImageUrl, permanentUrl] = await Promise.all([
      refData && refKey
        ? uploadToR2({
            data: refData.buffer,
            key: refKey,
            mimeType: refData.mimeType,
          })
        : Promise.resolve(undefined),
      uploadToR2({
        data: genData.buffer,
        key: storageKey,
        mimeType: genData.mimeType,
      }),
    ])
    const mimeType = genData.mimeType

    const generation = await createGeneration({
      url: permanentUrl,
      storageKey,
      mimeType,
      width: generatedAsset.width,
      height: generatedAsset.height,
      referenceImageUrl,
      prompt: input.prompt,
      model: executionRoute.modelId,
      provider,
      requestCount: executionRoute.creditCost,
      isFreeGeneration: executionRoute.isFreeGeneration,
      userId: dbUser.id,
      characterCardIds: input.characterCardIds,
      projectId: input.projectId,
      snapshot: JSON.parse(
        JSON.stringify({
          compiledPrompt: input.prompt,
          modelId: executionRoute.modelId,
          aspectRatio: input.aspectRatio,
          advancedParams: input.advancedParams,
          referenceImages: input.referenceImages,
          apiKeyId: input.apiKeyId,
          projectId: input.projectId,
          isFreeGeneration: executionRoute.isFreeGeneration,
          creditCost: executionRoute.creditCost,
          seed: input.advancedParams?.seed,
        }),
      ),
      seed:
        input.advancedParams?.seed != null
          ? BigInt(input.advancedParams.seed)
          : undefined,
    })

    await Promise.all([
      attachUsageEntryToGeneration(usageEntry.id, generation.id),
      completeGenerationJob(generationJob.id, {
        generationId: generation.id,
        requestCount: executionRoute.creditCost,
      }),
    ])

    return generation
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist generation'

    await failGenerationJob(generationJob.id, {
      requestCount: executionRoute.creditCost,
      errorMessage: message,
    })

    throw error
  }
}
