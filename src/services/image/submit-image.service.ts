import 'server-only'

import {
  EXECUTION_INTERNAL,
  EXECUTION_WORKER,
  EXECUTION_WORKFLOW_IDS,
  WORKER_MIGRATED_IMAGE_ADAPTERS,
} from '@/constants/execution'
import { IMAGE_GENERATION } from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type {
  GenerateRequest,
  GenerationRecord,
  ImageStatusResponseData,
  ImageSubmitResponseData,
  MultiViewGeneratedAngle,
  WorkerRunContext,
} from '@/types'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { GenerationStageTimer } from '@/lib/generation-observability'
import {
  buildInternalUrl,
  dispatchImageWorkerRun,
  isExecutionWorkerDispatchConfigured,
} from '@/services/execution-worker.service'
import {
  GenerateImageServiceError,
  resolveImageRouteAndValidate,
  uploadReferenceImagesIfNeeded,
  type GenerateImageDeps,
} from '@/services/image/generate-image.service'
import { getGenerationByIdForUser } from '@/services/generation.service'
import {
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import { generateStorageKey } from '@/services/storage/r2'

/**
 * Worker job metadata persisted on `GenerationJob.externalRequestId` at submit
 * time and read back by the execution callback to finalize the generation.
 * Mirrors the IMAGE fields of `WorkerJobMetadataSchema` in
 * `execution-callback.service`; keep the two in sync.
 */
export interface ImageQueueMetadata {
  outputType: 'IMAGE'
  isFreeGeneration?: boolean
  creditCost: number
  aspectRatio: string
  referenceImageUrl?: string
  referenceImages?: string[]
  characterCardIds?: string[]
  projectId?: string
  apiKeyId?: string
  /** Model the user originally requested — survives a provider fallback. */
  originalModelId: string
  recipeUsage?: GenerateRequest['recipeUsage']
  advancedParams?: GenerateRequest['advancedParams']
  /** Set to true once a fallback re-dispatch has happened (caps it at one). */
  fallbackUsed?: boolean
  workflowInstanceId?: string
  runGroupId?: string
  runGroupType?: 'single' | 'compare' | 'variant'
  runGroupIndex?: number
  multiViewBatchId?: string
  multiViewAngle?: MultiViewGeneratedAngle
  sourceGenerationId?: string
  studioSnapshot?: {
    freePrompt?: string
    characterCardId?: string
    backgroundCardId?: string
    styleCardId?: string
  }
}

/**
 * Submit an image generation to the execution worker. Next.js owns control
 * plane work only: validation, route/key selection, job creation, and signed
 * dispatch. Provider execution must not fall back to the Next.js server.
 */
export async function submitImageGeneration(
  clerkId: string,
  input: GenerateRequest,
  deps: GenerateImageDeps = {},
  queueMetadataInput: Pick<
    ImageQueueMetadata,
    | 'runGroupId'
    | 'runGroupType'
    | 'runGroupIndex'
    | 'multiViewBatchId'
    | 'multiViewAngle'
    | 'sourceGenerationId'
    | 'studioSnapshot'
  > = {},
): Promise<ImageSubmitResponseData> {
  const createGenerationJobFn = deps.createGenerationJob ?? createGenerationJob

  const { dbUser, route, provider } = await resolveImageRouteAndValidate(
    clerkId,
    input,
    deps,
  )

  if (!isExecutionWorkerDispatchConfigured()) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Execution worker is required for image generation',
      503,
    )
  }

  if (!WORKER_MIGRATED_IMAGE_ADAPTERS.includes(route.adapterType)) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This image provider has not been migrated to the execution worker yet',
      501,
    )
  }

  const apiKeyId = route.resolvedApiKeyId ?? input.apiKeyId
  const useSystemKey =
    route.isFreeGeneration === true && !route.resolvedApiKeyId
  if (!apiKeyId && !useSystemKey) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'Execution worker runs require a saved API key or platform key',
      400,
    )
  }

  // Upload the reference image to R2 up front so the worker receives a stable
  // URL (it cannot resolve data: URLs or short-lived client blobs itself).
  const timer = new GenerationStageTimer({
    outputType: 'IMAGE',
    modelId: route.modelId,
  })
  const referenceImages = await uploadReferenceImagesIfNeeded({
    userId: dbUser.id,
    input,
    timer,
  })
  const referenceImageUrl = referenceImages[0]
  const outputStorageKey = generateStorageKey('IMAGE', dbUser.id)

  const metadata: ImageQueueMetadata = {
    outputType: 'IMAGE',
    isFreeGeneration: route.isFreeGeneration,
    creditCost: route.creditCost,
    aspectRatio: input.aspectRatio,
    referenceImageUrl,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    characterCardIds: input.characterCardIds,
    projectId: input.projectId,
    apiKeyId: apiKeyId ?? undefined,
    originalModelId: input.modelId,
    recipeUsage: input.recipeUsage,
    advancedParams: input.advancedParams,
    runGroupId: queueMetadataInput.runGroupId,
    runGroupType: queueMetadataInput.runGroupType,
    runGroupIndex: queueMetadataInput.runGroupIndex,
    multiViewBatchId: queueMetadataInput.multiViewBatchId,
    multiViewAngle: queueMetadataInput.multiViewAngle,
    sourceGenerationId: queueMetadataInput.sourceGenerationId,
    studioSnapshot: queueMetadataInput.studioSnapshot,
  }

  const job = await createGenerationJobFn({
    userId: dbUser.id,
    adapterType: route.adapterType,
    provider,
    modelId: route.modelId,
    prompt: input.prompt,
    externalRequestId: JSON.stringify(metadata),
  })

  const runContext: WorkerRunContext = {
    runId: job.id,
    workflowId: EXECUTION_WORKFLOW_IDS.IMAGE_QUEUE,
    outputType: 'IMAGE',
    providerId: route.adapterType,
    apiKeyId: apiKeyId ?? undefined,
    useSystemKey: useSystemKey || undefined,
    callbackUrl: buildInternalUrl(EXECUTION_INTERNAL.CALLBACK_PATH),
    resolveKeyUrl: buildInternalUrl(EXECUTION_INTERNAL.RESOLVE_KEY_PATH),
    timeoutMs: EXECUTION_WORKER.DEFAULT_TIMEOUT_MS,
    maxAttempts:
      route.adapterType === AI_ADAPTER_TYPES.FAL ||
      route.adapterType === AI_ADAPTER_TYPES.REPLICATE
        ? EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS
        : 1,
    pollIntervalMs: EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS,
    providerInput: {
      prompt: input.prompt,
      modelId: route.modelId,
      externalModelId: getExecutionModelId(route.modelId),
      aspectRatio: input.aspectRatio,
      referenceImage: referenceImageUrl,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      advancedParams: input.advancedParams,
      outputStorageKey,
    },
  }

  try {
    const dispatchResult = await dispatchImageWorkerRun(runContext)

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        externalRequestId: JSON.stringify({
          ...metadata,
          workflowInstanceId: dispatchResult.workflowInstanceId,
        }),
      },
    })

    logger.info('Image generation dispatched to execution worker', {
      jobId: job.id,
      workflowInstanceId: dispatchResult.workflowInstanceId,
      model: route.modelId,
      routeKind: route.isFreeGeneration ? 'free-tier' : 'user-key',
    })

    return { jobId: job.id, requestId: dispatchResult.workflowInstanceId }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to dispatch image worker'
    await failGenerationJob(job.id, { errorMessage: message })
    throw error
  }
}

/**
 * Poll an async image job. Push model: the worker finalizes via the execution
 * callback, so this only reads job state — no provider-side polling needed.
 */
export async function checkImageGenerationStatus(
  clerkId: string,
  jobId: string,
): Promise<ImageStatusResponseData> {
  const dbUser = await ensureUser(clerkId)
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      userId: true,
      status: true,
      generationId: true,
      errorMessage: true,
    },
  })

  if (!job || job.userId !== dbUser.id) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Image generation job not found',
      404,
    )
  }

  if (job.status === 'COMPLETED' && job.generationId) {
    const generation = await getGenerationByIdForUser(
      job.generationId,
      dbUser.id,
    )
    if (generation) {
      return { jobId: job.id, status: 'COMPLETED', generation }
    }
  }

  if (job.status === 'FAILED') {
    return {
      jobId: job.id,
      status: 'FAILED',
      ...(job.errorMessage ? { error: job.errorMessage } : {}),
    }
  }

  return { jobId: job.id, status: 'IN_PROGRESS' }
}

export async function waitForImageGenerationResult(
  clerkId: string,
  jobId: string,
  options: {
    maxAttempts?: number
    pollIntervalMs?: number
  } = {},
): Promise<GenerationRecord> {
  const maxAttempts = options.maxAttempts ?? IMAGE_GENERATION.MAX_POLL_ATTEMPTS
  const pollIntervalMs =
    options.pollIntervalMs ?? IMAGE_GENERATION.POLL_INTERVAL_MS

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await checkImageGenerationStatus(clerkId, jobId)

    if (status.status === 'COMPLETED') {
      return status.generation
    }

    if (status.status === 'FAILED') {
      throw new GenerateImageServiceError(
        'PROVIDER_ERROR',
        'Image generation failed',
        502,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new GenerateImageServiceError(
    'PROVIDER_ERROR',
    'Image generation timed out',
    504,
  )
}
