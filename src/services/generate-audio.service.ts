import 'server-only'

import { getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
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
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'

/**
 * Generate audio synchronously (Fish Audio — returns audio bytes immediately).
 * Flow: validate → resolve route → call adapter.generateAudio() → upload R2 → create record.
 */
export async function generateAudioForUser(
  clerkId: string,
  request: GenerateAudioRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)
  const userId = dbUser.id

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
            sampleRate: request.sampleRate,
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
      generationJobId: job.id,
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
 *
 * TODO: This function's job lifecycle is incomplete.
 * It should follow the video service pattern:
 *   1. Call submitAudioToQueue first
 *   2. On success: createGenerationJob + store {statusUrl, responseUrl, apiKeyId} in externalRequestId
 *   3. Return {jobId, requestId}
 * Prerequisite: fal.adapter.ts must implement submitAudioToQueue + checkAudioQueueStatus.
 * Also update GenerateAudioResponse type (add jobId) and AudioStatusResponseData (add jobId).
 * Security note: once job-based, /api/generate-audio/status should accept only jobId (no apiKey from client).
 */
export async function submitAudioGeneration(
  clerkId: string,
  request: GenerateAudioRequest,
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const dbUser = await ensureUser(clerkId)
  const userId = dbUser.id
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
 *
 * TODO: This function needs a complete redesign once submitAudioGeneration is job-based:
 *   - Accept (clerkId: string, jobId: string) instead of raw queue params
 *   - Re-resolve API key server-side via resolveGenerationRoute (never accept apiKey from client)
 *   - Add optimistic lock (see generate-video.service.ts:277) to prevent duplicate finalization
 *   - Add cached-return for already-COMPLETED/FAILED jobs (see generate-video.service.ts:182)
 *   - Handle empty audioUrl on COMPLETED (currently would crash at fetchAsBuffer)
 * Key drift note: store apiKeyId (not keyValue) in externalRequestId so re-resolve always uses correct key.
 */
export async function checkAudioGenerationStatus(
  clerkId: string,
  statusUrl: string,
  responseUrl: string,
  adapterType: string,
  apiKey: string,
  modelId: string,
): Promise<{ status: string; generation?: GenerationRecord }> {
  const dbUser = await ensureUser(clerkId)
  const userId = dbUser.id
  const adapter = getProviderAdapter(adapterType as AI_ADAPTER_TYPES)
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
