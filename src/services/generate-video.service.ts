import 'server-only'

import {
  EXECUTION_INTERNAL,
  EXECUTION_WORKER,
  EXECUTION_WORKFLOW_IDS,
} from '@/constants/execution'
import { IMAGE_SIZES } from '@/constants/config'
import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import type {
  GenerateVideoRequest,
  GenerationRecord,
  WorkerRunContext,
  VideoStatusResponseData,
  VideoSubmitResponseData,
} from '@/types'
import { createGeneration } from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { ProviderError } from '@/services/providers/types'
import {
  createVideoPosterAsset,
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
import {
  buildInternalUrl,
  dispatchWorkerRun,
} from '@/services/execution-worker.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { validatePrompt } from '@/lib/prompt-guard'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
  withGenerationObservability,
} from '@/lib/generation-observability'
import { validateVideoGenerationInput } from '@/services/video-generation-validation.service'

function canSubmitVideoViaExecutionWorker(route: {
  adapterType: string
  resolvedApiKeyId?: string | null
  isFreeGeneration?: boolean
}): boolean {
  return (
    route.adapterType === AI_ADAPTER_TYPES.FAL &&
    (Boolean(route.resolvedApiKeyId) || route.isFreeGeneration === true)
  )
}

// ─── Submit video to fal.ai queue ────────────────────────────────

export async function submitVideoGeneration(
  clerkId: string,
  input: GenerateVideoRequest,
): Promise<VideoSubmitResponseData> {
  const dbUser = await ensureUser(clerkId)

  return submitVideoGenerationForUserId(dbUser.id, input)
}

export async function submitVideoGenerationForUserId(
  userId: string,
  input: GenerateVideoRequest,
): Promise<VideoSubmitResponseData> {
  const timer = new GenerationStageTimer({
    outputType: 'VIDEO',
    modelId: input.modelId,
  })

  const { executionRoute, provider, providerAdapter, modelConfig } =
    await timer.measure(GENERATION_STAGE.AUTH_ROUTE_RESOLVE, async () => {
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

      const resolvedRoute = await resolveGenerationRoute(userId, input)
      const resolvedProvider = getProviderLabel(resolvedRoute.providerConfig)
      const adapter = getProviderAdapter(resolvedRoute.adapterType)

      if (!adapter?.submitVideoToQueue) {
        throw new GenerateImageServiceError(
          'UNSUPPORTED_MODEL',
          'Video generation is not supported for this provider',
          400,
        )
      }

      return {
        executionRoute: resolvedRoute,
        provider: resolvedProvider,
        providerAdapter: adapter,
        modelConfig: getModelById(resolvedRoute.modelId),
      }
    })

  timer.setContext({
    modelId: executionRoute.modelId,
    adapterType: executionRoute.adapterType,
    provider,
    routeKind: executionRoute.isFreeGeneration ? 'free-tier' : 'user-key',
  })

  if (modelConfig && canSubmitVideoViaExecutionWorker(executionRoute)) {
    return submitFalVideoWorkerRun({
      input,
      userId,
      adapterType: executionRoute.adapterType,
      provider,
      routeModelId: executionRoute.modelId,
      apiKeyId: executionRoute.resolvedApiKeyId ?? input.apiKeyId,
      useSystemKey:
        executionRoute.isFreeGeneration === true &&
        !executionRoute.resolvedApiKeyId,
      isFreeGeneration: executionRoute.isFreeGeneration,
      modelConfig,
      timer,
    })
  }

  const breaker = getCircuitBreaker(executionRoute.adapterType)

  let queueResult: Awaited<
    ReturnType<NonNullable<typeof providerAdapter.submitVideoToQueue>>
  >
  try {
    queueResult = await timer.measure(GENERATION_STAGE.PROVIDER_SUBMIT, () =>
      breaker.call(() =>
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
    const sourceReferenceImage = input.referenceImage
    referenceImageUrl = await timer.measure(
      GENERATION_STAGE.REFERENCE_UPLOAD,
      async () => {
        const refKey = generateStorageKey('IMAGE', userId)
        const { buffer: refBuffer, mimeType: refMimeType } =
          await fetchAsBuffer(sourceReferenceImage)
        return uploadToR2({
          data: refBuffer,
          key: refKey,
          mimeType: refMimeType,
        })
      },
    )
  }

  const generationJob = await timer.measure(GENERATION_STAGE.JOB_CREATE, () =>
    createGenerationJob({
      userId,
      adapterType: executionRoute.adapterType,
      provider,
      modelId: executionRoute.modelId,
    }),
  )
  timer.setContext({ jobId: generationJob.id })

  // Store queue metadata as JSON for later polling
  const queueMeta = JSON.stringify({
    requestId: queueResult.requestId,
    statusUrl: queueResult.statusUrl,
    responseUrl: queueResult.responseUrl,
    referenceImageUrl,
    characterCardIds: input.characterCardIds,
  })

  await timer.measure(GENERATION_STAGE.DB_FINALIZE, () =>
    db.generationJob.update({
      where: { id: generationJob.id },
      data: { externalRequestId: queueMeta, prompt: input.prompt },
    }),
  )

  timer.log({ requestId: queueResult.requestId })

  return {
    jobId: generationJob.id,
    requestId: queueResult.requestId,
  }
}

async function submitFalVideoWorkerRun(params: {
  input: GenerateVideoRequest
  userId: string
  adapterType: string
  provider: string
  routeModelId: string
  apiKeyId?: string | null
  useSystemKey: boolean
  isFreeGeneration?: boolean
  modelConfig: NonNullable<ReturnType<typeof getModelById>>
  timer: GenerationStageTimer
}): Promise<VideoSubmitResponseData> {
  const {
    input,
    userId,
    adapterType,
    provider,
    routeModelId,
    apiKeyId,
    useSystemKey,
    isFreeGeneration,
    modelConfig,
    timer,
  } = params

  if (!apiKeyId && !useSystemKey) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'Execution worker runs require a saved API key or platform key',
      400,
    )
  }

  let referenceImageUrl: string | undefined
  if (input.referenceImage) {
    const sourceReferenceImage = input.referenceImage
    referenceImageUrl = await timer.measure(
      GENERATION_STAGE.REFERENCE_UPLOAD,
      async () => {
        const refKey = generateStorageKey('IMAGE', userId)
        const { buffer: refBuffer, mimeType: refMimeType } =
          await fetchAsBuffer(sourceReferenceImage)
        return uploadToR2({
          data: refBuffer,
          key: refKey,
          mimeType: refMimeType,
        })
      },
    )
  }

  const { width, height } =
    IMAGE_SIZES[input.aspectRatio] ?? IMAGE_SIZES['16:9']
  const metadata = {
    workerManaged: true,
    outputType: 'VIDEO',
    workflowId: input.workflowId,
    executionWorkflowId: EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
    referenceImageUrl,
    characterCardIds: input.characterCardIds,
    isFreeGeneration,
  }

  const generationJob = await timer.measure(GENERATION_STAGE.JOB_CREATE, () =>
    createGenerationJob({
      userId,
      adapterType,
      provider,
      modelId: routeModelId,
      prompt: input.prompt,
      externalRequestId: JSON.stringify(metadata),
    }),
  )
  timer.setContext({ jobId: generationJob.id })

  const runContext: WorkerRunContext = {
    runId: generationJob.id,
    workflowId: EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
    outputType: 'VIDEO',
    providerId: adapterType,
    apiKeyId: apiKeyId ?? undefined,
    useSystemKey: useSystemKey || undefined,
    callbackUrl: buildInternalUrl(EXECUTION_INTERNAL.CALLBACK_PATH),
    resolveKeyUrl: buildInternalUrl(EXECUTION_INTERNAL.RESOLVE_KEY_PATH),
    timeoutMs: modelConfig.timeoutMs ?? EXECUTION_WORKER.DEFAULT_TIMEOUT_MS,
    maxAttempts: EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS,
    pollIntervalMs: EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS,
    providerInput: {
      prompt: input.prompt,
      modelId: routeModelId,
      externalModelId: getExecutionModelId(routeModelId),
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      referenceImage: referenceImageUrl,
      negativePrompt: input.negativePrompt,
      resolution: input.resolution,
      i2vModelId: modelConfig.i2vModelId,
      videoDefaults: modelConfig.videoDefaults,
      providerBaseUrl: modelConfig.providerConfig.baseUrl,
      width,
      height,
    },
  }

  try {
    const dispatchResult = await timer.measure(
      GENERATION_STAGE.WORKER_DISPATCH,
      () => dispatchWorkerRun(runContext),
    )

    await timer.measure(GENERATION_STAGE.DB_FINALIZE, () =>
      db.generationJob.update({
        where: { id: generationJob.id },
        data: {
          externalRequestId: JSON.stringify({
            ...metadata,
            workflowInstanceId: dispatchResult.workflowInstanceId,
          }),
        },
      }),
    )

    logger.info('FAL video dispatched to execution worker', {
      jobId: generationJob.id,
      workflowInstanceId: dispatchResult.workflowInstanceId,
    })
    timer.log({ workflowInstanceId: dispatchResult.workflowInstanceId })

    return {
      jobId: generationJob.id,
      requestId: dispatchResult.workflowInstanceId,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to dispatch execution worker'

    await failGenerationJob(generationJob.id, {
      errorMessage: message,
    })

    throw error
  }
}

// ─── Check video generation status ──────────────────────────────

export async function checkVideoGenerationStatus(
  clerkId: string,
  jobId: string,
): Promise<VideoStatusResponseData> {
  const dbUser = await ensureUser(clerkId)

  return checkVideoGenerationStatusForUserId(dbUser.id, jobId)
}

export async function checkVideoGenerationStatusForUserId(
  userId: string,
  jobId: string,
): Promise<VideoStatusResponseData> {
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true },
  })

  if (!job || job.userId !== userId) {
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

  const timer = new GenerationStageTimer({
    outputType: 'VIDEO',
    jobId: job.id,
    modelId: job.modelId,
    adapterType: job.adapterType,
    provider: job.provider,
  })

  // Parse stored queue metadata
  let queueMeta: {
    requestId: string
    statusUrl: string
    responseUrl: string
    referenceImageUrl?: string
    characterCardIds?: string[]
    workerManaged?: boolean
    workflowInstanceId?: string
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

  if (queueMeta.workerManaged) {
    return { jobId: job.id, status: 'IN_PROGRESS' }
  }

  const executionRoute = await resolveGenerationRoute(userId, {
    modelId: job.modelId,
  })
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  const checkVideoQueueStatus = providerAdapter?.checkVideoQueueStatus
  if (!checkVideoQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'Video status check is not supported for this provider',
      400,
    )
  }

  let queueStatus: Awaited<ReturnType<typeof checkVideoQueueStatus>>
  try {
    queueStatus = await timer.measure(GENERATION_STAGE.PROVIDER_WAIT_POLL, () =>
      checkVideoQueueStatus({
        statusUrl: queueMeta.statusUrl,
        responseUrl: queueMeta.responseUrl,
        apiKey: executionRoute.apiKey,
      }),
    )
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
  timer.setDuration(
    GENERATION_STAGE.PROVIDER_WAIT_POLL,
    Date.now() - job.createdAt.getTime(),
  )

  const storageKey = generateStorageKey('VIDEO', userId)
  const checkedJobId = job.id

  async function tryCreateVideoPosterAsset() {
    if (!videoResult.thumbnailUrl) {
      timer.addNote('video_poster_unavailable')
      return undefined
    }

    try {
      return await createVideoPosterAsset({
        sourceUrl: videoResult.thumbnailUrl,
        sourceStorageKey: storageKey,
        fetchHeaders: videoResult.fetchHeaders,
      })
    } catch (error) {
      logger.warn('Video poster derivative creation failed', {
        jobId: checkedJobId,
        storageKey,
        thumbnailUrl: videoResult.thumbnailUrl,
        error: error instanceof Error ? error.message : String(error),
      })
      timer.addNote('video_poster_generation_failed')
      return undefined
    }
  }

  try {
    const { publicUrl } = await timer.measure(GENERATION_STAGE.R2_UPLOAD, () =>
      streamUploadToR2({
        sourceUrl: videoResult.videoUrl,
        key: storageKey,
        mimeType: 'video/mp4',
        fetchHeaders: videoResult.fetchHeaders,
      }),
    )
    timer.addNote('result_download_streamed_with_r2_upload')
    const posterAsset = await timer.measure(
      GENERATION_STAGE.THUMBNAIL_GENERATION,
      tryCreateVideoPosterAsset,
    )

    const generation = await timer.measure(
      GENERATION_STAGE.DB_FINALIZE,
      async () => {
        const usageEntry = await createApiUsageEntry({
          userId,
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

        const createdGeneration = await createGeneration({
          url: publicUrl,
          storageKey,
          mimeType: 'video/mp4',
          thumbnailUrl: posterAsset?.thumbnailUrl,
          thumbnailStorageKey: posterAsset?.thumbnailStorageKey,
          width: videoResult.width,
          height: videoResult.height,
          duration: videoResult.duration,
          referenceImageUrl: queueMeta.referenceImageUrl,
          prompt: job.prompt ?? '',
          model: job.modelId,
          provider,
          requestCount: videoResult.requestCount,
          outputType: 'VIDEO',
          userId,
          characterCardIds: queueMeta.characterCardIds,
          snapshot: withGenerationObservability(
            {
              requestId: queueMeta.requestId,
              referenceImageUrl: queueMeta.referenceImageUrl,
              providerThumbnailUrl: videoResult.thumbnailUrl,
            },
            timer,
          ),
        })

        await Promise.all([
          attachUsageEntryToGeneration(usageEntry.id, createdGeneration.id),
          completeGenerationJob(job.id, {
            generationId: createdGeneration.id,
            requestCount: videoResult.requestCount,
          }),
        ])

        return createdGeneration
      },
    )

    timer.setContext({ generationId: generation.id })
    timer.log({ requestId: queueMeta.requestId })

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
  thumbnailUrl?: string | null
  thumbnailStorageKey?: string | null
  previewUrl?: string | null
  previewStorageKey?: string | null
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
    thumbnailUrl: gen.thumbnailUrl,
    thumbnailStorageKey: gen.thumbnailStorageKey,
    previewUrl: gen.previewUrl,
    previewStorageKey: gen.previewStorageKey,
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
