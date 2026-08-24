import 'server-only'

import { API_USAGE, FREE_TIER } from '@/constants/config'
import { getModelById, type ModelOption } from '@/constants/models'
import {
  getImageReferenceCapability,
  getReferenceCapabilityMax,
} from '@/constants/reference-image-capabilities'
import {
  AI_ADAPTER_TYPES,
  getProviderLabel,
  type ProviderConfig,
} from '@/constants/providers'
import type { GenerateRequest } from '@/types'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import { resolveRunnerCapableModelId } from '@/services/image/runner-capability-routing.service'
import { getProviderAdapter } from '@/services/providers/registry'
import {
  fetchAsBuffer,
  generateStorageKey,
  isOwnedStorageUrl,
  uploadFromHttpToR2,
  uploadToR2,
} from '@/services/storage/r2'
import {
  assertRunnerMonthlyLimitNotExceeded,
  atomicReserveFreeTierSlot,
  createGenerationJob,
  RunnerMonthlyLimitExceededError,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { validatePrompt } from '@/services/kernel/prompt-guard'
import { getResolvedModelOption } from '@/services/model-config.service'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
} from '@/lib/generation-observability'

export interface ResolvedGenerationRoute {
  modelId: string
  externalModelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  resolvedApiKeyId?: string | null
  isFreeGeneration?: boolean
  /** Credit cost for this generation (from model config, fallback 1) */
  creditCost: number
  /** DB-first catalog entry, including hardcoded capability fallbacks. */
  modelConfig?: ModelOption
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
  | 'REFERENCE_IMAGE_LIMIT_EXCEEDED'
  | 'RUNNER_MONTHLY_LIMIT_EXCEEDED'
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
  const builtInModel = await getResolvedModelOption(modelId)

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
      externalModelId: builtInModel?.externalModelId ?? modelId,
      adapterType: selectedApiKey.adapterType,
      providerConfig: selectedApiKey.providerConfig,
      apiKey: selectedApiKey.keyValue,
      resolvedApiKeyId: selectedApiKey.id,
      creditCost:
        builtInModel?.cost ?? API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      modelConfig: builtInModel,
    }
  }

  if (!builtInModel) {
    throw new GenerateImageServiceError(
      'CUSTOM_MODEL_REQUIRES_ROUTE',
      'Custom models require selecting an active API key',
      400,
    )
  }

  // Comfy Runner (RunPod) has no BYOK path — it's always the platform's own
  // RUNPOD_KEY, gated by a monthly budget cap instead of the daily free-tier
  // cap (different budget, different reset cadence). See
  // constants/config.ts RUNNER_MONTHLY_LIMIT and services/usage.service.ts.
  if (builtInModel.adapterType === AI_ADAPTER_TYPES.RUNNER) {
    try {
      await assertRunnerMonthlyLimitNotExceeded()
    } catch (error) {
      if (error instanceof RunnerMonthlyLimitExceededError) {
        throw new GenerateImageServiceError(
          'RUNNER_MONTHLY_LIMIT_EXCEEDED',
          error.message,
          429,
        )
      }
      throw error
    }

    const platformKey = getSystemApiKey(AI_ADAPTER_TYPES.RUNNER)
    if (!platformKey) {
      throw new GenerateImageServiceError(
        'PLATFORM_KEY_MISSING',
        'Comfy Runner is not configured yet (missing RUNPOD_KEY).',
        503,
      )
    }

    return {
      modelId,
      externalModelId: builtInModel.externalModelId,
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      providerConfig: builtInModel.providerConfig,
      apiKey: platformKey,
      resolvedApiKeyId: null,
      isFreeGeneration: false,
      creditCost: builtInModel.cost,
      modelConfig: builtInModel,
    }
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
      externalModelId:
        effectiveModelId === modelId
          ? builtInModel.externalModelId
          : effectiveModelId,
      adapterType: autoKey.adapterType,
      providerConfig: autoKey.providerConfig,
      apiKey: autoKey.keyValue,
      resolvedApiKeyId: autoKey.id,
      creditCost: builtInModel.cost,
      modelConfig: builtInModel,
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
      externalModelId: builtInModel.externalModelId,
      adapterType: builtInModel.adapterType,
      providerConfig: builtInModel.providerConfig,
      apiKey: platformKey,
      resolvedApiKeyId: null,
      isFreeGeneration: true,
      creditCost: builtInModel.cost,
      modelConfig: builtInModel,
    }
  }

  throw new GenerateImageServiceError(
    'MISSING_API_KEY',
    'Please bind your own API key for this model in the API Keys settings',
    400,
  )
}

// ─── Reference image upload ──────────────────────────────────────

async function uploadSingleReferenceImageIfNeeded(params: {
  userId: string
  referenceImage: string
  timer: GenerationStageTimer
}): Promise<string> {
  const { userId, referenceImage, timer } = params

  if (isOwnedStorageUrl(referenceImage)) return referenceImage

  const refKey = generateStorageKey('IMAGE', userId)
  if (referenceImage.startsWith('data:')) {
    return timer.measure(GENERATION_STAGE.REFERENCE_UPLOAD, async () => {
      const refData = await fetchAsBuffer(referenceImage)
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
        sourceUrl: referenceImage,
        key: refKey,
      }),
  )
  timer.addNote('reference_upload_streams_download_and_r2_upload')
  return publicUrl
}

export async function uploadReferenceImagesIfNeeded(params: {
  userId: string
  input: GenerateRequest
  timer: GenerationStageTimer
}): Promise<string[]> {
  const { userId, input, timer } = params
  const referenceImages =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : input.referenceImage
        ? [input.referenceImage]
        : []

  if (referenceImages.length === 0) return []

  return Promise.all(
    referenceImages.map((referenceImage) =>
      uploadSingleReferenceImageIfNeeded({
        userId,
        referenceImage,
        timer,
      }),
    ),
  )
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

/**
 * Auth + prompt validation + route resolution + reference-image capability
 * checks. Shared entry point ahead of the async `submitImageGeneration` path
 * (submit-image.service.ts) — kept separate from `resolveGenerationRoute` so
 * callers get identical gating, including the free-tier slot reservation
 * that happens inside `resolveGenerationRoute`.
 */
export async function resolveImageRouteAndValidate(
  clerkId: string,
  input: GenerateRequest,
  deps: GenerateImageDeps = {},
): Promise<{
  dbUser: Awaited<ReturnType<typeof ensureUser>>
  route: ResolvedGenerationRoute
  provider: string
}> {
  const ensureUserFn = deps.ensureUser ?? ensureUser
  const validatePromptFn = deps.validatePrompt ?? validatePrompt
  const resolveRouteFn = deps.resolveGenerationRoute ?? resolveGenerationRoute
  const getModelByIdFn = deps.getModelById ?? getModelById
  const getProviderAdapterFn = deps.getProviderAdapter ?? getProviderAdapter

  const ensuredUser = await ensureUserFn(clerkId)

  const promptCheck = validatePromptFn(input.prompt)
  if (!promptCheck.valid) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      promptCheck.reason ?? 'Invalid prompt',
      400,
    )
  }

  // Capability routing (HANDOFF §4.2): a hosted model that can't load the
  // attached LoRA (known via the runner allowlist) transparently upgrades to
  // its runner-backed counterpart instead of failing with the hosted
  // provider's raw "layer not supported" error. No-op unless both the
  // upgrade target exists and is flag-enabled.
  const effectiveModelId = resolveRunnerCapableModelId(
    input.modelId,
    input.advancedParams?.loras,
  )

  const resolvedRoute = await resolveRouteFn(ensuredUser.id, {
    ...input,
    modelId: effectiveModelId,
  })

  const builtInModel = getModelByIdFn(effectiveModelId)
  const refCount =
    input.referenceImages?.length ?? (input.referenceImage ? 1 : 0)
  const hasReferenceImage = refCount > 0
  if (builtInModel?.requiresReferenceImage && !hasReferenceImage) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'This model requires at least one reference image',
      400,
    )
  }
  // Defence-in-depth: front-end already caps reference count via the
  // capability layer, but a stale / malicious client could still POST an
  // over-cap array. Reject before reaching the provider so users get a
  // structured error rather than a 4xx from the upstream service.
  const refCap = getReferenceCapabilityMax(
    getImageReferenceCapability(resolvedRoute.adapterType, effectiveModelId),
  )
  if (hasReferenceImage && refCap === 0) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'The selected model does not support reference images',
      400,
    )
  }
  if (refCount > refCap) {
    throw new GenerateImageServiceError(
      'REFERENCE_IMAGE_LIMIT_EXCEEDED',
      `This model accepts at most ${refCap} reference ${refCap === 1 ? 'image' : 'images'} (got ${refCount}).`,
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
}
