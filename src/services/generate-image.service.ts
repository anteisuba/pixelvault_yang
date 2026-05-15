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
import { createGeneration } from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
import {
  ProviderError,
  type ProviderGenerationResult,
} from '@/services/providers/types'
import {
  fetchAsBuffer,
  generateStorageKey,
  isOwnedStorageUrl,
  uploadFromHttpToR2,
  uploadToR2,
} from '@/services/storage/r2'
import {
  attachUsageEntryToGeneration,
  atomicReserveFreeTierSlot,
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
  resolvedApiKeyId?: string | null
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

function hasServiceErrorCode(
  error: unknown,
  code: GenerateImageServiceErrorCode,
): error is Error & { code: GenerateImageServiceErrorCode } {
  if (!(error instanceof Error)) return false

  const errorCode = (error as Error & { code?: unknown }).code
  return errorCode === code
}

export async function resolveGenerationRoute(
  userId: string,
  { modelId, apiKeyId }: Pick<GenerateRequest, 'modelId' | 'apiKeyId'>,
): Promise<ResolvedGenerationRoute> {
  const builtInModel = getModelById(modelId)

  if (builtInModel && !builtInModel.available) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model is no longer available for new generations',
      400,
    )
  }

  if (apiKeyId) {
    const selectedApiKey = await getApiKeyValueById(apiKeyId, userId)

    if (!selectedApiKey) {
      logger.warn('[resolveGenerationRoute] API key not found or inactive', {
        apiKeyId,
        userId,
      })
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        'Selected API key is unavailable',
        400,
      )
    }

    // Validate adapter compatibility: the key's adapter must match the
    // model's adapter. Provider keys (Replicate, fal, etc.) are universal
    // within their adapter type — they work for any model on that platform.
    const expectedAdapter = builtInModel?.adapterType
    logger.info('[resolveGenerationRoute] Route resolution', {
      apiKeyId,
      keyAdapterType: selectedApiKey.adapterType,
      keyModelId: selectedApiKey.modelId,
      requestedModelId: modelId,
      expectedAdapter: expectedAdapter ?? 'N/A (custom model)',
    })
    if (expectedAdapter && selectedApiKey.adapterType !== expectedAdapter) {
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        `API key adapter (${selectedApiKey.adapterType}) does not match model adapter (${expectedAdapter})`,
        400,
      )
    }

    return {
      modelId,
      adapterType: selectedApiKey.adapterType,
      providerConfig: selectedApiKey.providerConfig,
      apiKey: selectedApiKey.keyValue,
      resolvedApiKeyId: selectedApiKey.id,
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

    logger.info('[resolveGenerationRoute] Auto route resolution', {
      apiKeyId: autoKey.id,
      keyAdapterType: autoKey.adapterType,
      keyModelId: autoKey.modelId,
      requestedModelId: modelId,
      effectiveModelId,
    })

    return {
      modelId: effectiveModelId,
      adapterType: autoKey.adapterType,
      providerConfig: autoKey.providerConfig,
      apiKey: autoKey.keyValue,
      resolvedApiKeyId: autoKey.id,
      creditCost: builtInModel.cost,
    }
  }

  // Free tier: use platform API key for eligible models
  if (FREE_TIER.ENABLED && builtInModel.freeTier) {
    try {
      await atomicReserveFreeTierSlot(userId)
    } catch (error) {
      if (hasServiceErrorCode(error, 'FREE_LIMIT_EXCEEDED')) {
        throw new GenerateImageServiceError(
          'FREE_LIMIT_EXCEEDED',
          error.message,
          429,
        )
      }

      throw error
    }

    const platformKey = getSystemApiKey(builtInModel.adapterType)
    if (!platformKey) {
      throw new GenerateImageServiceError(
        'PLATFORM_KEY_MISSING',
        'Free tier is temporarily unavailable. Please bind your own API key.',
        503,
      )
    }

    logger.info(
      '[resolveGenerationRoute] Platform free-tier route resolution',
      {
        adapterType: builtInModel.adapterType,
        requestedModelId: modelId,
      },
    )

    return {
      modelId,
      adapterType: builtInModel.adapterType,
      providerConfig: builtInModel.providerConfig,
      apiKey: platformKey,
      resolvedApiKeyId: null,
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

// ─── Stage B: Call Provider with resilience + fallback ──────────

async function callProviderWithFallback(params: {
  clerkId: string
  input: GenerateRequest
  route: ResolvedGenerationRoute
  userId: string
  provider: string
  generationJobId: string
}): Promise<
  | { fallbackUsed: false; asset: ProviderGenerationResult; durationMs: number }
  | { fallbackUsed: true; generation: GenerationRecord }
> {
  const { clerkId, input, route, userId, provider, generationJobId } = params
  const providerAdapter = getProviderAdapter(route.adapterType)!
  const breaker = getCircuitBreaker(route.adapterType)
  const startedAt = Date.now()

  try {
    const asset = await breaker.call(() =>
      withRetry(
        () =>
          providerAdapter.generateImage({
            prompt: input.prompt,
            modelId: route.modelId,
            aspectRatio: input.aspectRatio,
            providerConfig: route.providerConfig,
            apiKey: route.apiKey,
            referenceImage: input.referenceImage,
            referenceImages: input.referenceImages,
            advancedParams: input.advancedParams,
          }),
        {
          maxAttempts: 2,
          baseDelayMs: 1500,
          label: `${route.adapterType}.generateImage`,
          // Default retry policy treats every 5xx the same. For 503
          // ("UNAVAILABLE" / "high demand") the upstream provider is
          // explicitly telling us the spike is minutes long — a 1.5s
          // wait won't clear it and just doubles the user's wait
          // before the eventual failure. Provider-side 504 timeouts also
          // often mean a job was already accepted upstream, so retrying can
          // duplicate cost and still exceed the route deadline.
          isRetryable: (error: unknown) => {
            const status = (error as { status?: number })?.status
            if (error instanceof ProviderError && status === 504) return false
            if (status === 503) return false
            if (typeof status === 'number') {
              return status >= 500 || status === 429
            }
            if (error instanceof Error) {
              const msg = error.message.toLowerCase()
              return (
                msg.includes('timeout') ||
                msg.includes('econnreset') ||
                msg.includes('econnrefused') ||
                msg.includes('fetch failed') ||
                msg.includes('network') ||
                msg.includes('socket hang up')
              )
            }
            return false
          },
        },
      ),
    )

    logger.info('Image generated successfully', {
      adapter: route.adapterType,
      modelId: route.modelId,
      generationJobId,
      durationMs: Date.now() - startedAt,
    })

    return {
      fallbackUsed: false as const,
      asset,
      durationMs: Date.now() - startedAt,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Image generation failed'

    await recordFailedUsage({
      userId,
      generationJobId,
      adapterType: route.adapterType,
      provider,
      modelId: route.modelId,
      creditCost: route.creditCost,
      durationMs: Date.now() - startedAt,
      referenceImage: input.referenceImage,
      errorMessage: message,
    })

    if (error instanceof GenerateImageServiceError) {
      throw error
    }

    // Attempt provider fallback only for platform-key/free-tier generation.
    // User-owned keys, including auto-selected keys, must stay on the selected
    // provider so we do not silently spend a different provider account.
    const isTransient =
      (error instanceof ProviderError && error.status >= 500) ||
      (error instanceof Error &&
        /timeout|econnreset|fetch failed/i.test(error.message))

    if (isTransient && route.isFreeGeneration) {
      const fallbackModelId = PROVIDER_FALLBACK_MAP[route.modelId]
      if (fallbackModelId) {
        logger.warn('Primary provider failed, attempting fallback', {
          failedModel: route.modelId,
          fallbackModel: fallbackModelId,
          generationJobId,
          routeKind: 'free-tier',
          error: message,
        })
        try {
          const generation = await generateImageForUser(clerkId, {
            ...input,
            modelId: fallbackModelId,
          })
          return { fallbackUsed: true as const, generation }
        } catch (fallbackError) {
          logger.error('Fallback provider also failed', {
            fallbackModel: fallbackModelId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          })
        }
      }
    }

    const status = error instanceof ProviderError ? error.status : 502
    const code =
      error instanceof ProviderError && error.status === 403
        ? 'NOVELAI_TIER_LIMIT'
        : 'PROVIDER_ERROR'
    throw new GenerateImageServiceError(code, message, status)
  }
}

// ─── Stage C: Persist generated image to R2 + DB ────────────────

async function persistGeneratedImage(params: {
  userId: string
  input: GenerateRequest
  route: ResolvedGenerationRoute
  provider: string
  generationJobId: string
  asset: ProviderGenerationResult
  durationMs: number
}): Promise<GenerationRecord> {
  const { userId, input, route, provider, generationJobId, asset, durationMs } =
    params

  const usageEntry = await createApiUsageEntry({
    userId,
    generationJobId,
    adapterType: route.adapterType,
    provider,
    modelId: route.modelId,
    requestCount: route.creditCost,
    inputImageCount: input.referenceImage
      ? 1
      : (input.referenceImages?.length ?? 0),
    outputImageCount: 1,
    width: asset.width,
    height: asset.height,
    durationMs,
    wasSuccessful: true,
  })

  const storageKey = generateStorageKey('IMAGE', userId)
  const effectiveRefImage =
    input.referenceImage || input.referenceImages?.[0] || undefined

  try {
    // Reference image persistence:
    //   - Already a URL inside our R2 bucket → reuse it verbatim. The DB never
    //     stored a separate storage-key for reference images and deletion
    //     never cleaned them up, so the prior "always re-upload to a fresh
    //     key" path was just silently orphaning duplicate copies of the same
    //     bytes. Reusing the source URL saves a fetch + upload (~0.5–2s)
    //     without changing observable behaviour.
    //   - data: URL → buffer path (base64 decoded in-process).
    //   - External HTTP URL → fetch + stream pipe to R2.
    const refImagePromise: Promise<string | undefined> = (async () => {
      if (!effectiveRefImage) return undefined
      if (isOwnedStorageUrl(effectiveRefImage)) return effectiveRefImage

      const refKey = generateStorageKey('IMAGE', userId)
      if (effectiveRefImage.startsWith('data:')) {
        const refData = await fetchAsBuffer(effectiveRefImage)
        return uploadToR2({
          data: refData.buffer,
          key: refKey,
          mimeType: refData.mimeType,
        })
      }
      const { publicUrl } = await uploadFromHttpToR2({
        sourceUrl: effectiveRefImage,
        key: refKey,
      })
      return publicUrl
    })()

    // Main generated image:
    //   - HTTP URL (fal / replicate / HuggingFace) → fetch + stream pipe to
    //     R2 (no full-image buffer in lambda memory between download and
    //     upload).
    //   - data: URL (Gemini / OpenAI base64) → buffer path (we already have
    //     the bytes in-process from the base64 decode).
    const genImagePromise: Promise<{ url: string; mimeType: string }> =
      (async () => {
        if (asset.imageUrl.startsWith('data:')) {
          const genData = await fetchAsBuffer(asset.imageUrl)
          const url = await uploadToR2({
            data: genData.buffer,
            key: storageKey,
            mimeType: genData.mimeType,
          })
          return { url, mimeType: genData.mimeType }
        }
        const { publicUrl, mimeType: mt } = await uploadFromHttpToR2({
          sourceUrl: asset.imageUrl,
          key: storageKey,
        })
        return { url: publicUrl, mimeType: mt }
      })()

    const [referenceImageUrl, gen] = await Promise.all([
      refImagePromise,
      genImagePromise,
    ])
    const permanentUrl = gen.url
    const mimeType = gen.mimeType

    const generation = await createGeneration({
      url: permanentUrl,
      storageKey,
      mimeType,
      width: asset.width,
      height: asset.height,
      referenceImageUrl,
      prompt: input.prompt,
      model: route.modelId,
      provider,
      requestCount: route.creditCost,
      isFreeGeneration: route.isFreeGeneration,
      userId,
      characterCardIds: input.characterCardIds,
      projectId: input.projectId,
      snapshot: JSON.parse(
        JSON.stringify({
          compiledPrompt: input.prompt,
          modelId: route.modelId,
          aspectRatio: input.aspectRatio,
          advancedParams: input.advancedParams,
          referenceImages: input.referenceImages,
          apiKeyId: input.apiKeyId,
          projectId: input.projectId,
          isFreeGeneration: route.isFreeGeneration,
          creditCost: route.creditCost,
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
      completeGenerationJob(generationJobId, {
        generationId: generation.id,
        requestCount: route.creditCost,
      }),
    ])

    return generation
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist generation'

    await failGenerationJob(generationJobId, {
      requestCount: route.creditCost,
      errorMessage: message,
    })

    throw error
  }
}

// ─── Orchestrator ───────────────────────────────────────────────

/**
 * Optional injection seams for the orchestrator. Callers (tests, alternate
 * worker entry points, future cohort/A-B branches) can override individual
 * collaborators without `vi.mock`-ing the whole module. Production keeps the
 * existing behaviour because every field falls back to the real
 * implementation imported at the top of this file.
 */
export interface GenerateImageDeps {
  ensureUser?: typeof ensureUser
  validatePrompt?: typeof validatePrompt
  resolveGenerationRoute?: typeof resolveGenerationRoute
  getModelById?: typeof getModelById
  createGenerationJob?: typeof createGenerationJob
  getProviderAdapter?: typeof getProviderAdapter
}

export async function generateImageForUser(
  clerkId: string,
  input: GenerateRequest,
  deps: GenerateImageDeps = {},
): Promise<GenerationRecord> {
  const ensureUserFn = deps.ensureUser ?? ensureUser
  const validatePromptFn = deps.validatePrompt ?? validatePrompt
  const resolveRouteFn = deps.resolveGenerationRoute ?? resolveGenerationRoute
  const getModelByIdFn = deps.getModelById ?? getModelById
  const createGenerationJobFn = deps.createGenerationJob ?? createGenerationJob
  const getProviderAdapterFn = deps.getProviderAdapter ?? getProviderAdapter

  const dbUser = await ensureUserFn(clerkId)

  const promptCheck = validatePromptFn(input.prompt)
  if (!promptCheck.valid) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      promptCheck.reason ?? 'Invalid prompt',
      400,
    )
  }

  const route = await resolveRouteFn(dbUser.id, input)

  const builtInModel = getModelByIdFn(input.modelId)
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

  const provider = getProviderLabel(route.providerConfig)
  const providerAdapter = getProviderAdapterFn(route.adapterType)
  if (!providerAdapter) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      `Unsupported model: ${route.modelId}`,
      400,
    )
  }

  const job = await createGenerationJobFn({
    userId: dbUser.id,
    adapterType: route.adapterType,
    provider,
    modelId: route.modelId,
  })

  logger.info('Image generation provider call started', {
    adapter: route.adapterType,
    modelId: route.modelId,
    generationJobId: job.id,
    routeKind: route.isFreeGeneration ? 'free-tier' : 'user-key',
  })

  const result = await callProviderWithFallback({
    clerkId,
    input,
    route,
    userId: dbUser.id,
    provider,
    generationJobId: job.id,
  })

  // Fallback already ran the full pipeline via recursive generateImageForUser
  if (result.fallbackUsed) return result.generation

  return persistGeneratedImage({
    userId: dbUser.id,
    input,
    route,
    provider,
    generationJobId: job.id,
    asset: result.asset,
    durationMs: result.durationMs,
  })
}
