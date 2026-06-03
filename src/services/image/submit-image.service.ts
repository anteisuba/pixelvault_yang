import 'server-only'

import {
  EXECUTION_INTERNAL,
  EXECUTION_WORKER,
  EXECUTION_WORKFLOW_IDS,
  WORKER_MIGRATED_IMAGE_ADAPTERS,
} from '@/constants/execution'
import type {
  GenerateRequest,
  GenerationRecord,
  ImageStatusResponseData,
  ImageSubmitResponseData,
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
  generateImageForUser,
  resolveImageRouteAndValidate,
  uploadReferenceImageIfNeeded,
  type GenerateImageDeps,
} from '@/services/image/generate-image.service'
import { getGenerationByIdForUser } from '@/services/generation.service'
import {
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'

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
}

/**
 * Submit an image generation. When the resolved provider is migrated to the
 * execution worker (and dispatch is configured) the job runs async: create a
 * RUNNING job, dispatch to the worker, return a jobId for the client to poll.
 * Otherwise fall back to synchronous `generateImageForUser` (local dev, or a
 * provider whose worker handler hasn't shipped yet).
 */
export async function submitImageGeneration(
  clerkId: string,
  input: GenerateRequest,
  deps: GenerateImageDeps = {},
): Promise<ImageSubmitResponseData | { generation: GenerationRecord }> {
  const createGenerationJobFn = deps.createGenerationJob ?? createGenerationJob

  const { dbUser, route, provider } = await resolveImageRouteAndValidate(
    clerkId,
    input,
    deps,
  )

  // First batch: the OpenAI worker handler only does text-to-image. Route
  // reference-image (image-to-image) requests to the synchronous path until the
  // worker grows an image-to-image branch — otherwise the worker would silently
  // ignore the reference and return a plain text-to-image result.
  const hasReferenceImage = Boolean(
    input.referenceImage || input.referenceImages?.length,
  )
  const canDispatch =
    isExecutionWorkerDispatchConfigured() &&
    WORKER_MIGRATED_IMAGE_ADAPTERS.includes(route.adapterType) &&
    !hasReferenceImage

  if (!canDispatch) {
    const generation = await generateImageForUser(clerkId, input, deps)
    return { generation }
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
  const referenceImageUrl = await uploadReferenceImageIfNeeded({
    userId: dbUser.id,
    input,
    timer,
  })

  const metadata: ImageQueueMetadata = {
    outputType: 'IMAGE',
    isFreeGeneration: route.isFreeGeneration,
    creditCost: route.creditCost,
    aspectRatio: input.aspectRatio,
    referenceImageUrl,
    characterCardIds: input.characterCardIds,
    projectId: input.projectId,
    apiKeyId: apiKeyId ?? undefined,
    originalModelId: input.modelId,
    recipeUsage: input.recipeUsage,
    advancedParams: input.advancedParams,
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
    // Image providers are synchronous HTTP — the worker awaits the response
    // directly rather than polling a provider-side queue.
    maxAttempts: 1,
    pollIntervalMs: EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS,
    providerInput: {
      prompt: input.prompt,
      modelId: route.modelId,
      externalModelId: route.modelId,
      aspectRatio: input.aspectRatio,
      referenceImage: referenceImageUrl ?? input.referenceImage,
      referenceImages: input.referenceImages,
      advancedParams: input.advancedParams,
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
    select: { id: true, userId: true, status: true, generationId: true },
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
    return { jobId: job.id, status: 'FAILED' }
  }

  return { jobId: job.id, status: 'IN_PROGRESS' }
}
