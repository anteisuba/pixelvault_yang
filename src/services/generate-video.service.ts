import 'server-only'

import { createHmac } from 'node:crypto'

import { EXECUTION_INTERNAL, EXECUTION_WORKER } from '@/constants/execution'
import { IMAGE_SIZES } from '@/constants/config'
import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import { WORKFLOW_IDS } from '@/constants/workflows'
import type {
  GenerateVideoRequest,
  GenerationRecord,
  WorkerDispatchResult,
  WorkerRunContext,
  VideoStatusResponseData,
  VideoSubmitResponseData,
} from '@/types'
import { WorkerDispatchResultSchema } from '@/types'
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

function getInternalCallbackSecret(): string {
  const secret = process.env.INTERNAL_CALLBACK_SECRET

  if (!secret) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Internal callback secret is not configured',
      500,
    )
  }

  return secret
}

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

function getWorkerBaseUrl(): string {
  const workerBaseUrl = process.env.EXECUTION_WORKER_BASE_URL

  if (!workerBaseUrl) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Execution worker URL is not configured',
      500,
    )
  }

  return workerBaseUrl.replace(/\/$/, '')
}

function signBody(body: string): string {
  return createHmac(
    EXECUTION_INTERNAL.SIGNATURE_ALGORITHM,
    getInternalCallbackSecret(),
  )
    .update(body, 'utf8')
    .digest('hex')
}

async function dispatchWorkerRun(
  runContext: WorkerRunContext,
): Promise<WorkerDispatchResult> {
  const body = JSON.stringify(runContext)
  const response = await fetch(
    `${getWorkerBaseUrl()}${EXECUTION_WORKER.CINEMATIC_SHORT_VIDEO_PATH}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [EXECUTION_INTERNAL.SIGNATURE_HEADER]: signBody(body),
      },
      body,
    },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      `Execution worker dispatch failed (${response.status}): ${errorBody.slice(0, 200)}`,
      502,
    )
  }

  const payload: unknown = await response.json()
  return WorkerDispatchResultSchema.parse(payload)
}

function isCinematicShortVideoWorkerRequest(
  input: GenerateVideoRequest,
  adapterType: string,
): boolean {
  return (
    input.workflowId === WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO &&
    adapterType === AI_ADAPTER_TYPES.FAL &&
    Boolean(input.apiKeyId)
  )
}

function buildInternalUrl(path: string): string {
  return new URL(path, getAppBaseUrl()).toString()
}

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

  if (
    isCinematicShortVideoWorkerRequest(input, executionRoute.adapterType) &&
    modelConfig
  ) {
    return submitCinematicShortVideoWorkerRun({
      input,
      userId: dbUser.id,
      adapterType: executionRoute.adapterType,
      provider,
      modelConfig,
    })
  }

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

async function submitCinematicShortVideoWorkerRun(params: {
  input: GenerateVideoRequest
  userId: string
  adapterType: string
  provider: string
  modelConfig: NonNullable<ReturnType<typeof getModelById>>
}): Promise<VideoSubmitResponseData> {
  const { input, userId, adapterType, provider, modelConfig } = params

  if (!input.apiKeyId) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'Cinematic Short Video worker runs require a saved API key',
      400,
    )
  }

  let referenceImageUrl: string | undefined
  if (input.referenceImage) {
    const refKey = generateStorageKey('IMAGE', userId)
    const { buffer: refBuffer, mimeType: refMimeType } = await fetchAsBuffer(
      input.referenceImage,
    )
    referenceImageUrl = await uploadToR2({
      data: refBuffer,
      key: refKey,
      mimeType: refMimeType,
    })
  }

  const { width, height } =
    IMAGE_SIZES[input.aspectRatio] ?? IMAGE_SIZES['16:9']
  const metadata = {
    workerManaged: true,
    workflowId: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    referenceImageUrl,
    characterCardIds: input.characterCardIds,
  }

  const generationJob = await createGenerationJob({
    userId,
    adapterType,
    provider,
    modelId: input.modelId,
    prompt: input.prompt,
    externalRequestId: JSON.stringify(metadata),
  })

  const runContext: WorkerRunContext = {
    runId: generationJob.id,
    workflowId: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    providerId: adapterType,
    apiKeyId: input.apiKeyId,
    callbackUrl: buildInternalUrl(EXECUTION_INTERNAL.CALLBACK_PATH),
    resolveKeyUrl: buildInternalUrl(EXECUTION_INTERNAL.RESOLVE_KEY_PATH),
    timeoutMs: modelConfig.timeoutMs ?? EXECUTION_WORKER.DEFAULT_TIMEOUT_MS,
    maxAttempts: EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS,
    pollIntervalMs: EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS,
    providerInput: {
      prompt: input.prompt,
      modelId: input.modelId,
      externalModelId: getExecutionModelId(input.modelId),
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
    const dispatchResult = await dispatchWorkerRun(runContext)

    await db.generationJob.update({
      where: { id: generationJob.id },
      data: {
        externalRequestId: JSON.stringify({
          ...metadata,
          workflowInstanceId: dispatchResult.workflowInstanceId,
        }),
      },
    })

    logger.info('Cinematic Short Video dispatched to execution worker', {
      jobId: generationJob.id,
      workflowInstanceId: dispatchResult.workflowInstanceId,
    })

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
