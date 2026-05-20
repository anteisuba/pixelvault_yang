import 'server-only'

import { API_USAGE, FREE_TIER } from '@/constants/config'
import { getModelById } from '@/constants/models'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
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
import { enqueueImagePreviewDerivatives } from '@/services/image-preview-derivative.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { buildRecipeSnapshotForUser } from '@/services/recipe.service'
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
import { getCivitaiTokenByInternalUserId } from '@/services/civitai-token.service'
import { ensureUser } from '@/services/user.service'
import { getSystemApiKey, getSystemCivitaiToken } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { validatePrompt } from '@/lib/prompt-guard'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
  withGenerationObservability,
} from '@/lib/generation-observability'

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

  // Civitai's download endpoint now 401s without auth, even for public
  // models. Resolution order:
  //   1. User's stored token — preferred so per-account rate limits and
  //      download history stay with the user.
  //   2. Platform-level CIVITAI_API_TOKEN env var — zero-config fallback
  //      so new users can pull Civitai LoRAs without setting up their own
  //      token first.
  //   3. null — adapters fall back to the original URL (will surface a
  //      clear 401 from Replicate rather than silently mis-loading).
  const civitaiToken =
    (await getCivitaiTokenByInternalUserId(userId)) ?? getSystemCivitaiToken()

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
            civitaiToken,
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
            if (
              error instanceof ProviderError &&
              error.message.includes('LoRA model file could not be loaded')
            ) {
              return false
            }
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

// ─── Stage C-pre: Reference upload (can run in parallel with provider) ──

/**
 * Resolve a generation's effective reference image into a public R2 URL.
 *
 *   - Already-owned R2 URL → return verbatim.
 *   - data: URL → decode base64, upload to a fresh R2 key.
 *   - External http(s) URL → stream-pipe fetch into R2 multipart upload.
 *   - No reference image → return undefined.
 *
 * Exposed (rather than inlined into `persistGeneratedImage`) so callers
 * can fire it in parallel with `callProviderWithFallback`. The provider
 * call typically dominates wall-clock; running the ref upload alongside
 * it hides the upload latency entirely. See image-perf optimisation #2.
 */
async function uploadReferenceImageIfNeeded(params: {
  userId: string
  input: GenerateRequest
  timer: GenerationStageTimer
}): Promise<string | undefined> {
  const { userId, input, timer } = params
  const effectiveRefImage =
    input.referenceImage || input.referenceImages?.[0] || undefined

  if (!effectiveRefImage) return undefined
  if (isOwnedStorageUrl(effectiveRefImage)) return effectiveRefImage

  const refKey = generateStorageKey('IMAGE', userId)
  if (effectiveRefImage.startsWith('data:')) {
    return timer.measure(GENERATION_STAGE.REFERENCE_UPLOAD, async () => {
      const refData = await fetchAsBuffer(effectiveRefImage)
      return uploadToR2({
        data: refData.buffer,
        key: refKey,
        mimeType: refData.mimeType,
      })
    })
  }
  const { publicUrl } = await timer.measure(
    GENERATION_STAGE.REFERENCE_UPLOAD,
    () =>
      uploadFromHttpToR2({
        sourceUrl: effectiveRefImage,
        key: refKey,
      }),
  )
  timer.addNote('reference_upload_streams_download_and_r2_upload')
  return publicUrl
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
  timer: GenerationStageTimer
  /**
   * Pre-resolved reference URL from a parallel upload started before the
   * provider call. If undefined, this function will upload inline (slower
   * — only used by paths that don't pre-warm).
   */
  preResolvedReferenceUrl?: Promise<string | undefined>
}): Promise<GenerationRecord> {
  const {
    userId,
    input,
    route,
    provider,
    generationJobId,
    asset,
    durationMs,
    timer,
    preResolvedReferenceUrl,
  } = params

  const storageKey = generateStorageKey('IMAGE', userId)

  try {
    const refImagePromise: Promise<string | undefined> =
      preResolvedReferenceUrl ??
      uploadReferenceImageIfNeeded({ userId, input, timer })

    // Main generated image:
    //   - HTTP URL (fal / replicate / HuggingFace) → fetch + stream pipe to
    //     R2 (no full-image buffer in lambda memory between download and
    //     upload).
    //   - data: URL (Gemini / OpenAI base64) → buffer path (we already have
    //     the bytes in-process from the base64 decode).
    const genImagePromise: Promise<{
      url: string
      mimeType: string
    }> = (async () => {
      const genData = await timer.measure(
        GENERATION_STAGE.RESULT_DOWNLOAD,
        () => fetchAsBuffer(asset.imageUrl),
      )
      const url = await timer.measure(GENERATION_STAGE.R2_UPLOAD, () =>
        uploadToR2({
          data: genData.buffer,
          key: storageKey,
          mimeType: genData.mimeType,
        }),
      )
      return { url, mimeType: genData.mimeType }
    })()

    const [referenceImageUrl, gen] = await Promise.all([
      refImagePromise,
      genImagePromise,
    ])
    const permanentUrl = gen.url
    const mimeType = gen.mimeType

    const generation = await timer.measure(
      GENERATION_STAGE.DB_FINALIZE,
      async () => {
        // Stage 1: independent prerequisites. The usage entry and recipe
        // snapshot only depend on `input` + `userId`, not on each other —
        // run them in parallel to cut one DB round-trip out of the path.
        const [usageEntry, recipeSnapshot] = await Promise.all([
          createApiUsageEntry({
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
            durationMs: timer.elapsedMs(),
            wasSuccessful: true,
          }),
          input.recipeUsage
            ? buildRecipeSnapshotForUser(userId, input.recipeUsage)
            : Promise.resolve(undefined),
        ])

        timer.addNote('thumbnail_generation_deferred')

        // Stage 2: the actual generation row. Has to wait for the recipe
        // snapshot so the JSONB column is populated atomically.
        const createdGeneration = await createGeneration({
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
          snapshot: withGenerationObservability(
            {
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
            },
            timer,
          ),
          recipeSnapshot,
          seed:
            input.advancedParams?.seed != null
              ? BigInt(input.advancedParams.seed)
              : undefined,
        })

        // Stage 3: three independent finalize writes — link the usage
        // row, mark the job complete, enqueue the preview-derivative
        // worker. All keyed off the new generation id; none of them
        // depend on the others. The enqueue is best-effort: failures
        // are logged but never bubbled up (it was already wrapped in
        // try/catch before the parallelization).
        const enqueuePromise = enqueueImagePreviewDerivatives({
          generationJobId,
          generationId: createdGeneration.id,
          sourceUrl: permanentUrl,
          sourceStorageKey: storageKey,
        }).then(
          () => timer.addNote('thumbnail_generation_enqueued'),
          (error: unknown) => {
            logger.warn('Image preview derivative enqueue failed', {
              generationJobId,
              generationId: createdGeneration.id,
              storageKey,
              error: error instanceof Error ? error.message : String(error),
            })
            timer.addNote('thumbnail_generation_enqueue_failed')
          },
        )

        await Promise.all([
          attachUsageEntryToGeneration(usageEntry.id, createdGeneration.id),
          completeGenerationJob(generationJobId, {
            generationId: createdGeneration.id,
            requestCount: route.creditCost,
          }),
          enqueuePromise,
        ])

        return createdGeneration
      },
    )

    timer.setContext({ generationId: generation.id })
    timer.log({ providerDurationMs: durationMs })

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

  const timer = new GenerationStageTimer({
    outputType: 'IMAGE',
    modelId: input.modelId,
  })

  const { dbUser, route, provider } = await timer.measure(
    GENERATION_STAGE.AUTH_ROUTE_RESOLVE,
    async () => {
      const ensuredUser = await ensureUserFn(clerkId)

      const promptCheck = validatePromptFn(input.prompt)
      if (!promptCheck.valid) {
        throw new GenerateImageServiceError(
          'PROVIDER_ERROR',
          promptCheck.reason ?? 'Invalid prompt',
          400,
        )
      }

      const resolvedRoute = await resolveRouteFn(ensuredUser.id, input)

      const builtInModel = getModelByIdFn(input.modelId)
      const hasReferenceImage =
        Boolean(input.referenceImage) ||
        (input.referenceImages?.length ?? 0) > 0
      if (builtInModel?.requiresReferenceImage) {
        if (!hasReferenceImage) {
          throw new GenerateImageServiceError(
            'VALIDATION_ERROR',
            'This model requires at least one reference image',
            400,
          )
        }
      }
      if (
        hasReferenceImage &&
        getMaxReferenceImages(resolvedRoute.adapterType, input.modelId) === 0
      ) {
        throw new GenerateImageServiceError(
          'VALIDATION_ERROR',
          'The selected model does not support reference images',
          400,
        )
      }

      const resolvedProvider = getProviderLabel(resolvedRoute.providerConfig)
      const providerAdapter = getProviderAdapterFn(resolvedRoute.adapterType)
      if (!providerAdapter) {
        throw new GenerateImageServiceError(
          'UNSUPPORTED_MODEL',
          `Unsupported model: ${resolvedRoute.modelId}`,
          400,
        )
      }

      return {
        dbUser: ensuredUser,
        route: resolvedRoute,
        provider: resolvedProvider,
      }
    },
  )

  timer.setContext({
    modelId: route.modelId,
    adapterType: route.adapterType,
    provider,
    routeKind: route.isFreeGeneration ? 'free-tier' : 'user-key',
  })

  const job = await timer.measure(GENERATION_STAGE.JOB_CREATE, () =>
    createGenerationJobFn({
      userId: dbUser.id,
      adapterType: route.adapterType,
      provider,
      modelId: route.modelId,
    }),
  )
  timer.setContext({ jobId: job.id })

  logger.info('Image generation provider call started', {
    adapter: route.adapterType,
    modelId: route.modelId,
    generationJobId: job.id,
    routeKind: route.isFreeGeneration ? 'free-tier' : 'user-key',
  })

  // image-perf #2: start the reference-image R2 upload before we hand
  // control to the provider. Provider latency dominates (~3–60s); the
  // ref upload is ~100–800ms; running them concurrently hides the
  // upload behind the provider call. We hold an unawaited promise here
  // and resolve it inside `persistGeneratedImage`.
  // `.catch` neutralises the unhandledRejection if the provider throws
  // first — `persistGeneratedImage` re-throws the real error when it
  // awaits the promise itself.
  const refImageUrlPromise = uploadReferenceImageIfNeeded({
    userId: dbUser.id,
    input,
    timer,
  })
  refImageUrlPromise.catch(() => {
    /* swallowed here; awaited inside persistGeneratedImage */
  })

  const result = await timer.measure(GENERATION_STAGE.PROVIDER_SUBMIT, () =>
    callProviderWithFallback({
      clerkId,
      input,
      route,
      userId: dbUser.id,
      provider,
      generationJobId: job.id,
    }),
  )

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
    timer,
    preResolvedReferenceUrl: refImageUrlPromise,
  })
}
