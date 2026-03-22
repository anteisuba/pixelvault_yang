import 'server-only'

import { API_USAGE } from '@/constants/config'
import { getModelById, getModelTimeout } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import type { GenerateVideoRequest, GenerationRecord } from '@/types'
import { createGeneration } from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { generateStorageKey, streamUploadToR2 } from '@/services/storage/r2'
import {
  attachUsageEntryToGeneration,
  completeGenerationJob,
  createApiUsageEntry,
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { getUserByClerkId } from '@/services/user.service'
import {
  GenerateImageServiceError,
  recordFailedUsage,
  resolveGenerationRoute,
} from '@/services/generate-image.service'

export async function generateVideoForUser(
  clerkId: string,
  input: GenerateVideoRequest,
): Promise<GenerationRecord> {
  const dbUser = await getUserByClerkId(clerkId)

  if (!dbUser) {
    throw new GenerateImageServiceError('USER_NOT_FOUND', 'User not found', 404)
  }

  const executionRoute = await resolveGenerationRoute(dbUser.id, input)
  const provider = getProviderLabel(executionRoute.providerConfig)
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter?.generateVideo) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      `Video generation is not supported for this provider`,
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
  const timeoutMs = getModelTimeout(input.modelId)

  let videoResult: Awaited<ReturnType<typeof providerAdapter.generateVideo>>

  try {
    videoResult = await providerAdapter.generateVideo({
      prompt: input.prompt,
      modelId: executionRoute.modelId,
      aspectRatio: input.aspectRatio,
      providerConfig: executionRoute.providerConfig,
      apiKey: executionRoute.apiKey,
      duration: input.duration,
      referenceImage: input.referenceImage,
      timeoutMs,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Video generation failed'

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
    requestCount: videoResult.requestCount,
    inputImageCount: input.referenceImage ? 1 : 0,
    outputImageCount: 0,
    width: videoResult.width,
    height: videoResult.height,
    durationMs: Date.now() - providerCallStartedAt,
    wasSuccessful: true,
  })

  const storageKey = generateStorageKey('VIDEO')

  try {
    const { publicUrl } = await streamUploadToR2({
      sourceUrl: videoResult.videoUrl,
      key: storageKey,
      mimeType: 'video/mp4',
    })

    const generation = await createGeneration({
      url: publicUrl,
      storageKey,
      mimeType: 'video/mp4',
      width: videoResult.width,
      height: videoResult.height,
      duration: videoResult.duration,
      prompt: input.prompt,
      model: executionRoute.modelId,
      provider,
      requestCount: videoResult.requestCount,
      outputType: 'VIDEO',
      userId: dbUser.id,
    })

    await Promise.all([
      attachUsageEntryToGeneration(usageEntry.id, generation.id),
      completeGenerationJob(generationJob.id, {
        generationId: generation.id,
        requestCount: videoResult.requestCount,
      }),
    ])

    return generation
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist video'

    await failGenerationJob(generationJob.id, {
      requestCount: videoResult.requestCount,
      errorMessage: message,
    })

    throw error
  }
}
