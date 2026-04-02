import 'server-only'

import { getModelById } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import type {
  GenerateVideoRequest,
  GenerationRecord,
  VideoStatusResponseData,
  VideoSubmitResponseData,
} from '@/types'
import { createGeneration } from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { ProviderError } from '@/services/providers/types'
import {
  fetchAsBuffer,
  generateStorageKey,
  streamUploadToR2,
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
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/generate-image.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { validatePrompt } from '@/lib/prompt-guard'
import { validateVideoGenerationInput } from '@/services/video-generation-validation.service'

// ─── Submit video to fal.ai queue ────────────────────────────────

export async function submitVideoGeneration(
  clerkId: string,
  input: GenerateVideoRequest,
): Promise<VideoSubmitResponseData> {
  const dbUser = await ensureUser(clerkId)

  // Validate prompt
  const promptCheck = validatePrompt(input.prompt)
  if (!promptCheck.valid) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      promptCheck.reason ?? 'Invalid prompt',
      400,
    )
  }

  validateVideoGenerationInput({
    modelId: input.modelId,
    aspectRatio: input.aspectRatio,
    duration: input.duration,
    referenceImage: input.referenceImage,
    resolution: input.resolution,
  })

  const executionRoute = await resolveGenerationRoute(dbUser.id, input)
  const provider = getProviderLabel(executionRoute.providerConfig)
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter?.submitVideoToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'Video generation is not supported for this provider',
      400,
    )
  }

  const modelConfig = getModelById(executionRoute.modelId)
  const breaker = getCircuitBreaker(executionRoute.adapterType)

  let queueResult: Awaited<
    ReturnType<NonNullable<typeof providerAdapter.submitVideoToQueue>>
  >
  try {
    queueResult = await breaker.call(() =>
      withRetry(
        () =>
          providerAdapter.submitVideoToQueue!({
            prompt: input.prompt,
            modelId: executionRoute.modelId,
            aspectRatio: input.aspectRatio,
            providerConfig: executionRoute.providerConfig,
            apiKey: executionRoute.apiKey,
            duration: input.duration,
            referenceImage: input.referenceImage,
            negativePrompt: input.negativePrompt,
            resolution: input.resolution,
            i2vModelId: modelConfig?.i2vModelId,
            videoDefaults: modelConfig?.videoDefaults,
          }),
        {
          maxAttempts: 2,
          baseDelayMs: 2000,
          label: `${executionRoute.adapterType}.submitVideo`,
        },
      ),
    )

    logger.info('Video submitted to queue', {
      adapter: executionRoute.adapterType,
      modelId: executionRoute.modelId,
      requestId: queueResult.requestId,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : 'Video generation failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

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

  const generationJob = await createGenerationJob({
    userId: dbUser.id,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: executionRoute.modelId,
  })

  // Store queue metadata as JSON for later polling
  const queueMeta = JSON.stringify({
    requestId: queueResult.requestId,
    statusUrl: queueResult.statusUrl,
    responseUrl: queueResult.responseUrl,
    referenceImageUrl,
    characterCardIds: input.characterCardIds,
  })

  await db.generationJob.update({
    where: { id: generationJob.id },
    data: { externalRequestId: queueMeta, prompt: input.prompt },
  })

  return {
    jobId: generationJob.id,
    requestId: queueResult.requestId,
  }
}

// ─── Check video generation status ──────────────────────────────

export async function checkVideoGenerationStatus(
  clerkId: string,
  jobId: string,
): Promise<VideoStatusResponseData> {
  const dbUser = await ensureUser(clerkId)

  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true },
  })

  if (!job || job.userId !== dbUser.id) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video generation job not found',
      404,
    )
  }

  // Already completed — return cached result
  if (job.status === 'COMPLETED' && job.generation) {
    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation: mapGenerationToRecord(job.generation),
    }
  }

  // Already failed
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

  // Parse stored queue metadata
  let queueMeta: {
    requestId: string
    statusUrl: string
    responseUrl: string
    referenceImageUrl?: string
    characterCardIds?: string[]
  }
  try {
    queueMeta = JSON.parse(job.externalRequestId)
  } catch {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid queue metadata',
      400,
    )
  }

  const executionRoute = await resolveGenerationRoute(dbUser.id, {
    modelId: job.modelId,
  })
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter?.checkVideoQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'Video status check is not supported for this provider',
      400,
    )
  }

  let queueStatus: Awaited<
    ReturnType<NonNullable<typeof providerAdapter.checkVideoQueueStatus>>
  >
  try {
    queueStatus = await providerAdapter.checkVideoQueueStatus({
      statusUrl: queueMeta.statusUrl,
      responseUrl: queueMeta.responseUrl,
      apiKey: executionRoute.apiKey,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : 'Video status check failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  if (
    queueStatus.status === 'IN_QUEUE' ||
    queueStatus.status === 'IN_PROGRESS'
  ) {
    return { jobId: job.id, status: queueStatus.status }
  }

  if (queueStatus.status === 'FAILED') {
    await failGenerationJob(job.id, {
      errorMessage: 'Video generation failed on provider side',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  // COMPLETED — finalize (upload to R2, create generation record)
  if (!queueStatus.result) {
    await failGenerationJob(job.id, {
      errorMessage: 'Provider returned completed but no result',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  // Optimistic lock: atomically claim this job for finalization
  // updateMany with status filter ensures only one request wins the race
  const claimed = await db.generationJob.updateMany({
    where: { id: jobId, status: 'RUNNING' },
    data: { status: 'QUEUED' }, // Reuse QUEUED as "finalizing" marker
  })

  if (claimed.count === 0) {
    // Another request already claimed it — return cached or wait
    const freshJob = await db.generationJob.findUnique({
      where: { id: jobId },
      include: { generation: true },
    })

    if (freshJob?.status === 'COMPLETED' && freshJob.generation) {
      return {
        jobId: job.id,
        status: 'COMPLETED',
        generation: mapGenerationToRecord(freshJob.generation),
      }
    }

    // Still being finalized by another request
    return { jobId: job.id, status: 'IN_PROGRESS' }
  }

  const provider = getProviderLabel(executionRoute.providerConfig)
  const videoResult = queueStatus.result

  const usageEntry = await createApiUsageEntry({
    userId: dbUser.id,
    generationJobId: job.id,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: job.modelId,
    requestCount: videoResult.requestCount,
    inputImageCount: 0,
    outputImageCount: 0,
    width: videoResult.width,
    height: videoResult.height,
    durationMs: Date.now() - job.createdAt.getTime(),
    wasSuccessful: true,
  })

  const storageKey = generateStorageKey('VIDEO', dbUser.id)

  try {
    const { publicUrl } = await streamUploadToR2({
      sourceUrl: videoResult.videoUrl,
      key: storageKey,
      mimeType: 'video/mp4',
      fetchHeaders: videoResult.fetchHeaders,
    })

    const generation = await createGeneration({
      url: publicUrl,
      storageKey,
      mimeType: 'video/mp4',
      width: videoResult.width,
      height: videoResult.height,
      duration: videoResult.duration,
      referenceImageUrl: queueMeta.referenceImageUrl,
      prompt: job.prompt ?? '',
      model: job.modelId,
      provider,
      requestCount: videoResult.requestCount,
      outputType: 'VIDEO',
      userId: dbUser.id,
      characterCardIds: queueMeta.characterCardIds,
    })

    await Promise.all([
      attachUsageEntryToGeneration(usageEntry.id, generation.id),
      completeGenerationJob(job.id, {
        generationId: generation.id,
        requestCount: videoResult.requestCount,
      }),
    ])

    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation: mapGenerationToRecord(generation),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist video'

    await failGenerationJob(job.id, {
      requestCount: videoResult.requestCount,
      errorMessage: message,
    })

    throw error
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

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
