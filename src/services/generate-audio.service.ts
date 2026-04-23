import 'server-only'

import { getProviderLabel } from '@/constants/providers'
import type {
  AudioStatusResponseData,
  AudioSubmitResponseData,
  GenerateAudioRequest,
  GenerationRecord,
} from '@/types'
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
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'

interface AudioQueueMetadata {
  requestId: string
  statusUrl: string
  responseUrl: string
  apiKeyId?: string | null
}

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
 * Returns a server-owned job ID plus provider request ID for status polling.
 */
export async function submitAudioGeneration(
  clerkId: string,
  request: GenerateAudioRequest,
): Promise<AudioSubmitResponseData> {
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
  let result: Awaited<
    ReturnType<NonNullable<typeof adapter.submitAudioToQueue>>
  >
  try {
    result = await breaker.call(() =>
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
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : 'Audio generation failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  const job = await createGenerationJob({
    userId,
    adapterType: route.adapterType,
    provider: providerLabel,
    modelId: request.modelId,
  })

  const queueMeta: AudioQueueMetadata = {
    requestId: result.requestId,
    statusUrl: result.statusUrl,
    responseUrl: result.responseUrl,
    apiKeyId: request.apiKeyId ?? null,
  }

  await db.generationJob.update({
    where: { id: job.id },
    data: {
      externalRequestId: JSON.stringify(queueMeta),
      prompt: request.prompt,
    },
  })

  logger.info('Audio generation submitted to queue', {
    jobId: job.id,
    requestId: result.requestId,
    model: request.modelId,
  })

  return {
    jobId: job.id,
    requestId: result.requestId,
  }
}

/**
 * Check the status of an async audio generation job.
 * When completed, downloads audio, uploads to R2, and creates generation record.
 */
export async function checkAudioGenerationStatus(
  clerkId: string,
  jobId: string,
): Promise<AudioStatusResponseData> {
  const dbUser = await ensureUser(clerkId)
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true },
  })

  if (!job || job.userId !== dbUser.id) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Audio generation job not found',
      404,
    )
  }

  if (job.status === 'COMPLETED' && job.generation) {
    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation: mapGenerationToRecord(job.generation),
    }
  }

  if (job.status === 'FAILED') {
    return { jobId: job.id, status: 'FAILED' }
  }

  if (!job.externalRequestId) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has no external request ID',
      400,
    )
  }

  let queueMeta: AudioQueueMetadata
  try {
    queueMeta = JSON.parse(job.externalRequestId) as AudioQueueMetadata
  } catch {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid queue metadata',
      400,
    )
  }

  const executionRoute = await resolveGenerationRoute(dbUser.id, {
    modelId: job.modelId,
    apiKeyId: queueMeta.apiKeyId ?? undefined,
  })

  const adapter = getProviderAdapter(executionRoute.adapterType)
  if (!adapter.checkAudioQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This adapter does not support audio queue status checks',
      400,
    )
  }

  let pollResult: Awaited<
    ReturnType<NonNullable<typeof adapter.checkAudioQueueStatus>>
  >
  try {
    pollResult = await adapter.checkAudioQueueStatus({
      statusUrl: queueMeta.statusUrl,
      responseUrl: queueMeta.responseUrl,
      apiKey: executionRoute.apiKey,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : 'Audio status check failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  if (pollResult.status === 'IN_QUEUE' || pollResult.status === 'IN_PROGRESS') {
    return { jobId: job.id, status: pollResult.status }
  }

  if (pollResult.status === 'FAILED') {
    await failGenerationJob(job.id, {
      errorMessage: 'Audio generation failed on provider side',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  if (!pollResult.result) {
    await failGenerationJob(job.id, {
      errorMessage: 'Provider returned completed but no result',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  const claimed = await db.generationJob.updateMany({
    where: { id: jobId, status: 'RUNNING' },
    data: { status: 'QUEUED' },
  })

  if (claimed.count === 0) {
    const freshJob = await db.generationJob.findUnique({
      where: { id: jobId },
      include: { generation: true },
    })

    if (freshJob?.status === 'COMPLETED' && freshJob.generation) {
      return {
        jobId: freshJob.id,
        status: 'COMPLETED',
        generation: mapGenerationToRecord(freshJob.generation),
      }
    }

    if (freshJob?.status === 'FAILED') {
      return { jobId: freshJob.id, status: 'FAILED' }
    }

    return { jobId: job.id, status: 'IN_PROGRESS' }
  }

  const result = pollResult.result
  const providerLabel = getProviderLabel(executionRoute.providerConfig)

  const usageEntry = await createApiUsageEntry({
    userId: dbUser.id,
    generationJobId: job.id,
    adapterType: executionRoute.adapterType,
    provider: providerLabel,
    modelId: job.modelId,
    requestCount: result.requestCount,
    inputImageCount: 0,
    outputImageCount: 0,
    durationMs: Date.now() - job.createdAt.getTime(),
    wasSuccessful: true,
  })

  try {
    const { buffer, mimeType } = await fetchAsBuffer(result.audioUrl)
    const storageKey = generateStorageKey('AUDIO', dbUser.id, result.format)
    const permanentUrl = await uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType,
    })

    const generation = await createGeneration({
      userId: dbUser.id,
      outputType: 'AUDIO',
      url: permanentUrl,
      storageKey,
      mimeType,
      width: 0,
      height: 0,
      duration: result.duration,
      prompt: job.prompt ?? '',
      model: job.modelId,
      provider: providerLabel,
      requestCount: result.requestCount,
    })

    await Promise.all([
      attachUsageEntryToGeneration(usageEntry.id, generation.id),
      completeGenerationJob(job.id, {
        generationId: generation.id,
        requestCount: result.requestCount,
      }),
    ])

    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist audio'

    await failGenerationJob(job.id, {
      requestCount: result.requestCount,
      errorMessage: message,
    })

    throw error
  }
}

function mapGenerationToRecord(gen: {
  id: string
  createdAt: Date
  outputType: string
  status: string
  url: string
  storageKey: string
  mimeType: string
  width: number
  height: number
  duration?: number | null
  prompt: string
  negativePrompt?: string | null
  model: string
  provider: string
  requestCount: number
  isPublic: boolean
  isPromptPublic: boolean
  userId?: string | null
}): GenerationRecord {
  return {
    id: gen.id,
    createdAt: gen.createdAt,
    outputType: gen.outputType as GenerationRecord['outputType'],
    status: gen.status as GenerationRecord['status'],
    url: gen.url,
    storageKey: gen.storageKey,
    mimeType: gen.mimeType,
    width: gen.width,
    height: gen.height,
    duration: gen.duration,
    prompt: gen.prompt,
    negativePrompt: gen.negativePrompt,
    model: gen.model,
    provider: gen.provider,
    requestCount: gen.requestCount,
    isPublic: gen.isPublic,
    isPromptPublic: gen.isPromptPublic,
    userId: gen.userId,
  }
}
