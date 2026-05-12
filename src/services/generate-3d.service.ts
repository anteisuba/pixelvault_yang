import 'server-only'

import { getModelById } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import type {
  Generate3DRequest,
  GenerationRecord,
  Model3DStatusResponseData,
  Model3DSubmitResponseData,
} from '@/types'
import { createGeneration } from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { ProviderError } from '@/services/providers/types'
import { generateStorageKey, streamUploadToR2 } from '@/services/storage/r2'
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

// ─── Submit 3D generation to fal.ai queue ────────────────────────

export async function submit3DGeneration(
  clerkId: string,
  input: Generate3DRequest,
): Promise<Model3DSubmitResponseData> {
  const dbUser = await ensureUser(clerkId)

  return submit3DGenerationForUserId(dbUser.id, input)
}

export async function submit3DGenerationForUserId(
  userId: string,
  input: Generate3DRequest,
): Promise<Model3DSubmitResponseData> {
  const executionRoute = await resolveGenerationRoute(userId, {
    modelId: input.modelId,
    apiKeyId: input.apiKeyId,
  })
  const provider = getProviderLabel(executionRoute.providerConfig)
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter?.submitModel3DToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      '3D generation is not supported for this provider',
      400,
    )
  }

  const breaker = getCircuitBreaker(executionRoute.adapterType)

  let queueResult: Awaited<
    ReturnType<NonNullable<typeof providerAdapter.submitModel3DToQueue>>
  >
  try {
    queueResult = await breaker.call(() =>
      withRetry(
        () =>
          providerAdapter.submitModel3DToQueue!({
            imageUrl: input.imageUrl,
            modelId: executionRoute.modelId,
            providerConfig: executionRoute.providerConfig,
            apiKey: executionRoute.apiKey,
            texturedMesh: input.texturedMesh,
            octreeResolution: input.octreeResolution,
            removeBackground: input.removeBackground,
            seed: input.seed,
          }),
        {
          maxAttempts: 2,
          baseDelayMs: 2000,
          label: `${executionRoute.adapterType}.submitModel3D`,
        },
      ),
    )

    logger.info('3D submitted to queue', {
      adapter: executionRoute.adapterType,
      modelId: executionRoute.modelId,
      requestId: queueResult.requestId,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : '3D generation failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  const generationJob = await createGenerationJob({
    userId,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: executionRoute.modelId,
  })

  const queueMeta = JSON.stringify({
    requestId: queueResult.requestId,
    statusUrl: queueResult.statusUrl,
    responseUrl: queueResult.responseUrl,
    sourceImageUrl: input.imageUrl,
    sourceGenerationId: input.sourceGenerationId,
    projectId: input.projectId,
    prompt: input.prompt ?? '',
  })

  await db.generationJob.update({
    where: { id: generationJob.id },
    data: {
      externalRequestId: queueMeta,
      prompt: input.prompt ?? '',
    },
  })

  return {
    jobId: generationJob.id,
    requestId: queueResult.requestId,
  }
}

// ─── Check 3D generation status ─────────────────────────────────

export async function check3DGenerationStatus(
  clerkId: string,
  jobId: string,
): Promise<Model3DStatusResponseData> {
  const dbUser = await ensureUser(clerkId)

  return check3DGenerationStatusForUserId(dbUser.id, jobId)
}

export async function check3DGenerationStatusForUserId(
  userId: string,
  jobId: string,
): Promise<Model3DStatusResponseData> {
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true },
  })

  if (!job || job.userId !== userId) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      '3D generation job not found',
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

  let queueMeta: {
    requestId: string
    statusUrl: string
    responseUrl: string
    sourceImageUrl: string
    sourceGenerationId?: string
    projectId?: string
    prompt: string
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

  const executionRoute = await resolveGenerationRoute(userId, {
    modelId: job.modelId,
  })
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter?.checkModel3DQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      '3D status check is not supported for this provider',
      400,
    )
  }

  let queueStatus: Awaited<
    ReturnType<NonNullable<typeof providerAdapter.checkModel3DQueueStatus>>
  >
  try {
    queueStatus = await providerAdapter.checkModel3DQueueStatus({
      statusUrl: queueMeta.statusUrl,
      responseUrl: queueMeta.responseUrl,
      apiKey: executionRoute.apiKey,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : '3D status check failed'
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
      errorMessage: '3D generation failed on provider side',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  if (!queueStatus.result) {
    await failGenerationJob(job.id, {
      errorMessage: 'Provider returned completed but no result',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  // Optimistic-lock: claim this job for finalization (mirrors video flow)
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
        jobId: job.id,
        status: 'COMPLETED',
        generation: mapGenerationToRecord(freshJob.generation),
      }
    }

    return { jobId: job.id, status: 'IN_PROGRESS' }
  }

  const provider = getProviderLabel(executionRoute.providerConfig)
  const result = queueStatus.result
  const modelConfig = getModelById(job.modelId)

  const usageEntry = await createApiUsageEntry({
    userId,
    generationJobId: job.id,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: job.modelId,
    requestCount: result.requestCount,
    inputImageCount: 1,
    outputImageCount: 0,
    width: 0,
    height: 0,
    durationMs: Date.now() - job.createdAt.getTime(),
    wasSuccessful: true,
  })

  const modelStorageKey = generateStorageKey('MODEL_3D', userId)

  try {
    const { publicUrl: glbPublicUrl } = await streamUploadToR2({
      sourceUrl: result.modelUrl,
      key: modelStorageKey,
      mimeType: result.contentType ?? 'model/gltf-binary',
    })

    // url / storageKey are required on the Generation row; for 3D we leave
    // them pointing at the GLB until a poster is uploaded by the client
    // <ModelViewer> via PATCH /api/generations/:id/poster (M3 work).
    const generation = await createGeneration({
      url: glbPublicUrl,
      storageKey: modelStorageKey,
      mimeType: result.contentType ?? 'model/gltf-binary',
      width: 0,
      height: 0,
      modelUrl: glbPublicUrl,
      modelStorageKey,
      referenceImageUrl: queueMeta.sourceImageUrl,
      prompt: queueMeta.prompt,
      model: job.modelId,
      provider,
      requestCount: result.requestCount,
      outputType: 'MODEL_3D',
      userId,
      projectId: queueMeta.projectId,
      isFreeGeneration: modelConfig?.freeTier === true,
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
      generation: mapGenerationToRecord(generation),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist 3D model'

    await failGenerationJob(job.id, {
      requestCount: result.requestCount,
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
  modelUrl?: string | null
  modelStorageKey?: string | null
  referenceImageUrl?: string | null
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
    modelUrl: gen.modelUrl,
    modelStorageKey: gen.modelStorageKey,
    referenceImageUrl: gen.referenceImageUrl,
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
