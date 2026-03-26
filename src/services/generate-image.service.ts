import 'server-only'

import { API_USAGE, FREE_TIER } from '@/constants/config'
import { getModelById } from '@/constants/models'
import {
  getDefaultProviderConfig,
  getProviderLabel,
  type AI_ADAPTER_TYPES,
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
import type { ProviderGenerationResult } from '@/services/providers/types'
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

export interface ResolvedGenerationRoute {
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  isFreeGeneration?: boolean
}

type GenerateImageServiceErrorCode =
  | 'CUSTOM_MODEL_REQUIRES_ROUTE'
  | 'FREE_LIMIT_EXCEEDED'
  | 'INVALID_JOB'
  | 'INVALID_ROUTE_SELECTION'
  | 'JOB_NOT_FOUND'
  | 'MISSING_API_KEY'
  | 'PLATFORM_KEY_MISSING'
  | 'PROVIDER_ERROR'
  | 'UNSUPPORTED_MODEL'
  | 'USER_NOT_FOUND'

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
    return {
      modelId,
      adapterType: autoKey.adapterType,
      providerConfig: autoKey.providerConfig,
      apiKey: autoKey.keyValue,
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
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      inputImageCount: params.referenceImage ? 1 : 0,
      outputImageCount: 0,
      durationMs: params.durationMs,
      wasSuccessful: false,
      errorMessage: params.errorMessage,
    }),
    failGenerationJob(params.generationJobId, {
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      errorMessage: params.errorMessage,
    }),
  ])
}

export async function generateImageForUser(
  clerkId: string,
  input: GenerateRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)

  const executionRoute = await resolveGenerationRoute(dbUser.id, input)
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

  try {
    generatedAsset = await providerAdapter.generateImage({
      prompt: input.prompt,
      modelId: executionRoute.modelId,
      aspectRatio: input.aspectRatio,
      providerConfig: executionRoute.providerConfig,
      apiKey: executionRoute.apiKey,
      referenceImage: input.referenceImage,
      advancedParams: input.advancedParams,
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
      durationMs: Date.now() - providerCallStartedAt,
      referenceImage: input.referenceImage,
      errorMessage: message,
    })

    // Wrap raw provider errors so API routes can return proper status codes
    if (error instanceof GenerateImageServiceError) {
      throw error
    }
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, 502)
  }

  const usageEntry = await createApiUsageEntry({
    userId: dbUser.id,
    generationJobId: generationJob.id,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: executionRoute.modelId,
    requestCount: generatedAsset.requestCount,
    inputImageCount: input.referenceImage ? 1 : 0,
    outputImageCount: 1,
    width: generatedAsset.width,
    height: generatedAsset.height,
    durationMs: Date.now() - providerCallStartedAt,
    wasSuccessful: true,
  })

  const storageKey = generateStorageKey('IMAGE', dbUser.id)

  try {
    // Upload reference image to R2 if provided
    let referenceImageUrl: string | undefined
    if (input.referenceImage) {
      const refKey = generateStorageKey('IMAGE', dbUser.id)
      const { buffer: refBuffer, mimeType: refMimeType } = await fetchAsBuffer(
        input.referenceImage,
      )
      referenceImageUrl = await uploadToR2({
        data: refBuffer,
        key: refKey,
        mimeType: refMimeType,
      })
    }

    const { buffer, mimeType } = await fetchAsBuffer(generatedAsset.imageUrl)
    const permanentUrl = await uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType,
    })

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
      requestCount: generatedAsset.requestCount,
      isFreeGeneration: executionRoute.isFreeGeneration,
      userId: dbUser.id,
    })

    await Promise.all([
      attachUsageEntryToGeneration(usageEntry.id, generation.id),
      completeGenerationJob(generationJob.id, {
        generationId: generation.id,
        requestCount: generatedAsset.requestCount,
      }),
    ])

    return generation
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist generation'

    await failGenerationJob(generationJob.id, {
      requestCount: generatedAsset.requestCount,
      errorMessage: message,
    })

    throw error
  }
}
