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
import { getProviderAdapter } from '@/services/providers/registry'
import {
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import {
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { buildGenerationFailureResponseFields } from '@/services/generation-failure-response.service'
import { ensureUser } from '@/services/user.service'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/image/generate-image.service'
import {
  buildInternalUrl,
  dispatchWorkerRun,
  isExecutionWorkerDispatchConfigured,
} from '@/services/execution-worker.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { validatePrompt } from '@/services/kernel/prompt-guard'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
} from '@/lib/generation-observability'
import { validateVideoGenerationInput } from '@/services/video-generation-validation.service'

function canSubmitVideoViaExecutionWorker(route: {
  adapterType: string
  resolvedApiKeyId?: string | null
  isFreeGeneration?: boolean
}): boolean {
  return (
    isExecutionWorkerDispatchConfigured() &&
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

  const { executionRoute, provider, modelConfig } = await timer.measure(
    GENERATION_STAGE.AUTH_ROUTE_RESOLVE,
    async () => {
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
        referenceImage: input.referenceImage ?? input.referenceImages?.[0],
        referenceImages: input.referenceImages,
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
        modelConfig: getModelById(resolvedRoute.modelId),
      }
    },
  )

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

  throw new GenerateImageServiceError(
    'UNSUPPORTED_MODEL',
    'This video provider has not been migrated to the execution worker yet',
    501,
  )
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

  // Multi-reference models (Veo 3.1) supply `referenceImages`; for everything
  // else we just upload the singular `referenceImage`. Parallel uploads keep
  // multi-image latency under the slowest single image, not their sum.
  const sourceRefs: string[] =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : input.referenceImage
        ? [input.referenceImage]
        : []
  const uploadedRefUrls: string[] =
    sourceRefs.length > 0
      ? await timer.measure(GENERATION_STAGE.REFERENCE_UPLOAD, () =>
          Promise.all(
            sourceRefs.map(async (ref) => {
              const refKey = generateStorageKey('IMAGE', userId)
              const { buffer: refBuffer, mimeType: refMimeType } =
                await fetchAsBuffer(ref)
              return uploadToR2({
                data: refBuffer,
                key: refKey,
                mimeType: refMimeType,
              })
            }),
          ),
        )
      : []
  const referenceImageUrl: string | undefined = uploadedRefUrls[0]

  const { width, height } =
    IMAGE_SIZES[input.aspectRatio] ?? IMAGE_SIZES['16:9']
  const outputStorageKey = generateStorageKey('VIDEO', userId)
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
      referenceImages: uploadedRefUrls.length > 1 ? uploadedRefUrls : undefined,
      audioUrls:
        input.audioUrls && input.audioUrls.length > 0
          ? input.audioUrls
          : undefined,
      audioBindings:
        input.audioBindings && input.audioBindings.length > 0
          ? input.audioBindings
          : undefined,
      videoUrls:
        input.videoUrls && input.videoUrls.length > 0
          ? input.videoUrls
          : undefined,
      negativePrompt: input.negativePrompt,
      resolution: input.resolution,
      i2vModelId: modelConfig.i2vModelId,
      videoDefaults: modelConfig.videoDefaults,
      providerBaseUrl: modelConfig.providerConfig.baseUrl,
      outputStorageKey,
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
    return {
      jobId: job.id,
      status: 'FAILED',
      ...buildGenerationFailureResponseFields(job),
    }
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
    workerManaged?: boolean
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

  await failGenerationJob(job.id, {
    errorMessage:
      'Legacy inline video jobs are no longer supported; video execution must run on the execution worker',
  })
  return {
    jobId: job.id,
    status: 'FAILED',
    error:
      'Legacy inline video jobs are no longer supported; video execution must run on the execution worker',
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
