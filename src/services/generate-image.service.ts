import 'server-only'

import { API_USAGE } from '@/constants/config'
import { getModelById } from '@/constants/models'
import {
  getAdapterEnvFallback,
  getDefaultProviderConfig,
  getProviderLabel,
  type AI_ADAPTER_TYPES,
  type ProviderConfig,
} from '@/constants/providers'
import type { GenerateRequest, GenerationRecord } from '@/types'
import { getApiKeyValueById } from '@/services/apiKey.service'
import { createGeneration } from '@/services/generation.service'
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
import { getUserByClerkId } from '@/services/user.service'

interface ResolvedGenerationRoute {
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
}

type GenerateImageServiceErrorCode =
  | 'CUSTOM_MODEL_REQUIRES_ROUTE'
  | 'INVALID_ROUTE_SELECTION'
  | 'MISSING_API_KEY'
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

async function resolveGenerationRoute(
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

  const envFallbackName = getAdapterEnvFallback(builtInModel.adapterType)
  const apiKey = process.env[envFallbackName] ?? null

  if (!apiKey) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'No API key is available for the selected model',
      400,
    )
  }

  return {
    modelId: builtInModel.id,
    adapterType: builtInModel.adapterType,
    providerConfig:
      builtInModel.providerConfig ??
      getDefaultProviderConfig(builtInModel.adapterType),
    apiKey,
  }
}

async function recordFailedUsage(params: {
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
  const dbUser = await getUserByClerkId(clerkId)

  if (!dbUser) {
    throw new GenerateImageServiceError('USER_NOT_FOUND', 'User not found', 404)
  }

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

    throw error
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

  const storageKey = generateStorageKey('IMAGE')

  try {
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
      prompt: input.prompt,
      model: executionRoute.modelId,
      provider,
      requestCount: generatedAsset.requestCount,
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
