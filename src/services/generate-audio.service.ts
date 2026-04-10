import 'server-only'
// @ts-nocheck — WIP audio service, not yet production-ready

import { getModelById } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import type { GenerateAudioRequest, GenerationRecord } from '@/types'
import { getProviderAdapter } from '@/services/providers/registry'
import { ProviderError } from '@/services/providers/types'
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
import { createGeneration } from '@/services/generation.service'
import {
  resolveGenerationRoute,
  GenerateImageServiceError,
} from '@/services/generate-image.service'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'

/**
 * Generate audio synchronously (Fish Audio — returns audio bytes immediately).
 * Flow: validate → resolve route → call adapter.generateAudio() → upload R2 → create record.
 */
export async function generateAudioForUser(
  userId: string,
  request: GenerateAudioRequest,
): Promise<GenerationRecord> {
  const route = await resolveGenerationRoute(userId, {
    modelId: request.modelId,
    apiKeyId: request.apiKeyId,
  })

  const adapter = getProviderAdapter(route.adapterType)
  if (!adapter.generateAudio) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model does not support audio generation',
      400,
    )
  }

  const providerLabel = getProviderLabel(route.providerConfig)

  const job = await createGenerationJob({
    userId,
    adapterType: route.adapterType,
    provider: providerLabel,
    modelId: request.modelId,
  })

  try {
    const breaker = getCircuitBreaker(route.adapterType)
    const result = await breaker.call(() =>
      withRetry(
        () =>
          adapter.generateAudio!({
            prompt: request.prompt,
            modelId: route.modelId,
            providerConfig: route.providerConfig,
            apiKey: route.apiKey,
            voiceId: request.voiceId,
            speed: request.speed,
            format: request.format,
          }),
        { maxAttempts: 3, label: `${providerLabel}/audio` },
      ),
    )

    // Upload audio to R2
    const { buffer, mimeType } = await fetchAsBuffer(result.audioUrl)
    const storageKey = generateStorageKey('AUDIO', userId, result.format)
    const permanentUrl = await uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType,
    })

    // Create generation record
    const generation = await createGeneration({
      userId,
      outputType: 'AUDIO',
      url: permanentUrl,
      storageKey,
      mimeType,
      width: 0,
      height: 0,
      duration: result.duration,
      prompt: request.prompt,
      model: request.modelId,
      provider: providerLabel,
      requestCount: result.requestCount,
      isFreeGeneration: route.isFreeGeneration,
    })

    // Track usage
    await completeGenerationJob(job.id, {
      generationId: generation.id,
      requestCount: result.requestCount,
    })
    const usageEntry = await createApiUsageEntry({
      userId,
      generationId: generation.id,
      adapterType: route.adapterType,
      provider: providerLabel,
      modelId: request.modelId,
      requestCount: result.requestCount,
      wasSuccessful: true,
    })
    await attachUsageEntryToGeneration(usageEntry.id, generation.id)

    logger.info('Audio generation completed', {
      generationId: generation.id,
      model: request.modelId,
      duration: result.duration,
    })

    return generation
  } catch (error) {
    await failGenerationJob(job.id, {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })

    if (error instanceof ProviderError) {
      throw new GenerateImageServiceError(
        'PROVIDER_ERROR',
        error.message,
        error.status,
      )
    }
    throw error
  }
}

/**
 * Submit async audio generation (FAL F5-TTS — queue-based).
 * Returns a request ID for status polling.
 */
export async function submitAudioGeneration(
  userId: string,
  request: GenerateAudioRequest,
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const route = await resolveGenerationRoute(userId, {
    modelId: request.modelId,
    apiKeyId: request.apiKeyId,
  })

  const adapter = getProviderAdapter(route.adapterType)
  if (!adapter.submitAudioToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model does not support async audio generation',
      400,
    )
  }

  const providerLabel = getProviderLabel(route.providerConfig)
  const breaker = getCircuitBreaker(route.adapterType)
  const result = await breaker.call(() =>
    withRetry(
      () =>
        adapter.submitAudioToQueue!({
          prompt: request.prompt,
          modelId: route.modelId,
          providerConfig: route.providerConfig,
          apiKey: route.apiKey,
          voiceId: request.voiceId,
          speed: request.speed,
          format: request.format,
        }),
      { maxAttempts: 3, label: `${providerLabel}/audio-queue` },
    ),
  )

  logger.info('Audio generation submitted to queue', {
    requestId: result.requestId,
    model: request.modelId,
  })

  return result
}

/**
 * Check the status of an async audio generation job.
 * When completed, downloads audio, uploads to R2, and creates generation record.
 */
export async function checkAudioGenerationStatus(
  userId: string,
  statusUrl: string,
  responseUrl: string,
  adapterType: string,
  apiKey: string,
  modelId: string,
): Promise<{ status: string; generation?: GenerationRecord }> {
  const adapter = getProviderAdapter(adapterType as never)
  if (!adapter.checkAudioQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This adapter does not support audio queue status checks',
      400,
    )
  }

  const pollResult = await adapter.checkAudioQueueStatus({
    statusUrl,
    responseUrl,
    apiKey,
  })

  if (pollResult.status !== 'COMPLETED' || !pollResult.result) {
    return { status: pollResult.status }
  }

  const result = pollResult.result
  const model = getModelById(modelId)
  const providerLabel = getProviderLabel(
    model?.providerConfig ?? { label: 'Unknown', baseUrl: '' },
  )

  // Download and upload to R2
  const { buffer, mimeType } = await fetchAsBuffer(result.audioUrl)
  const storageKey = generateStorageKey('AUDIO', userId, result.format)
  const permanentUrl = await uploadToR2({
    data: buffer,
    key: storageKey,
    mimeType,
  })

  const generation = await createGeneration({
    userId,
    outputType: 'AUDIO',
    url: permanentUrl,
    storageKey,
    mimeType,
    width: 0,
    height: 0,
    duration: result.duration,
    prompt: '',
    model: modelId,
    provider: providerLabel,
    requestCount: result.requestCount,
  })

  const creditCost = model?.cost ?? 1
  const job = await createGenerationJob({
    userId,
    adapterType,
    provider: providerLabel,
    modelId,
  })
  await completeGenerationJob(job.id, {
    generationId: generation.id,
    requestCount: result.requestCount,
  })
  const usageEntry = await createApiUsageEntry({
    userId,
    generationId: generation.id,
    adapterType,
    provider: providerLabel,
    modelId,
    requestCount: result.requestCount,
    wasSuccessful: true,
  })
  await attachUsageEntryToGeneration(usageEntry.id, generation.id)

  return { status: 'COMPLETED', generation }
}
