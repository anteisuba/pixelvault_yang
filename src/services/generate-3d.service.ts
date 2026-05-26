import 'server-only'

import { z } from 'zod'

import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import {
  EXECUTION_INTERNAL,
  EXECUTION_WORKER,
  EXECUTION_WORKFLOW_IDS,
} from '@/constants/execution'
import {
  MODEL_3D_GENERATE_TYPE,
  MODEL_3D_JOB_STAGE,
  MODEL_3D_JOB_STAGES,
  MODEL_3D_MESH_FIRST_PREVIEW_MODEL_IDS,
  MODEL_3D_PREVIEW_MODE,
  MODEL_3D_WORKER_STALE_MS,
  type Model3DJobStage,
} from '@/constants/model-3d-generation'
import type {
  Cancel3DRequest,
  Continue3DRequest,
  Generate3DRequest,
  GenerationRecord,
  Model3DStatusResponseData,
  Model3DSubmitResponseData,
  RetryMesh3DRequest,
  WorkerModel3DRunContext,
} from '@/types'
import { Model3DMultiViewImagesSchema } from '@/types'
import { createGeneration } from '@/services/generation.service'
import {
  inspect3DSourceImageQuality,
  prepare3DSourceImage,
} from '@/services/image-3d-prep.service'
import { getProviderAdapter } from '@/services/providers/registry'
import {
  ProviderError,
  type ProviderModel3DInput,
  type ProviderModel3DQueueStatusResult,
  type ProviderModel3DResult,
  type ProviderQueueSubmitResult,
} from '@/services/providers/types'
import {
  generateStorageKey,
  streamUploadToR2,
  uploadBufferedHttpToR2,
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
  dispatchHyper3DRodinWorkerRun,
  dispatchHunyuan3DWorkerRun,
} from '@/services/execution-worker.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
  withGenerationObservability,
} from '@/lib/generation-observability'

const Model3DQueueHandleSchema = z.object({
  requestId: z.string().min(1),
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
})

const Model3DCompletedQueueHandleSchema = Model3DQueueHandleSchema.extend({
  modelUrl: z.string().url().optional(),
  contentType: z.string().optional(),
  fileSize: z.number().optional(),
})

const Model3DProviderResultSchema = z.object({
  modelUrl: z.string().url(),
  contentType: z.string().optional(),
  fileSize: z.number().optional(),
  requestCount: z.number(),
})

const Model3DSourceQualityMetaSchema = z.object({
  width: z.number(),
  height: z.number(),
  blockingIssues: z.array(z.string()),
})

const Model3DQueueMetaSchema = z
  .object({
    requestId: z.string().min(1).optional(),
    statusUrl: z.string().url().optional(),
    responseUrl: z.string().url().optional(),
    mode: z
      .enum([MODEL_3D_PREVIEW_MODE.NONE, MODEL_3D_PREVIEW_MODE.MESH_FIRST])
      .optional(),
    stage: z.enum(MODEL_3D_JOB_STAGES).optional(),
    mesh: Model3DCompletedQueueHandleSchema.optional(),
    final: Model3DQueueHandleSchema.optional(),
    finalResult: Model3DProviderResultSchema.optional(),
    // Optional for Rodin text-to-3D where there's no source image at all.
    sourceImageUrl: z.string().url().optional(),
    preparedImageUrl: z.string().url().optional(),
    sourceGenerationId: z.string().optional(),
    projectId: z.string().optional(),
    prompt: z.string().optional(),
    apiKeyId: z.string().nullable().optional(),
    multiViewImages: Model3DMultiViewImagesSchema.optional(),
    sourceQuality: Model3DSourceQualityMetaSchema.optional(),
    options: z
      .object({
        enablePbr: z.boolean().optional(),
        faceCount: z.number().int().optional(),
        seed: z.number().int().optional(),
      })
      .optional(),
    /**
     * PR3-α: when true the mesh-first chain pauses at MESH_READY instead of
     * auto-submitting Stage 2. Cleared on cancel; left intact across retries.
     */
    staged: z.boolean().optional(),
    /**
     * Set on jobs dispatched to a Cloudflare Worker workflow (Hyper3D Rodin /
     * Hunyuan3D). The Worker owns polling and R2 upload; status checks read DB
     * state only.
     */
    workerDispatched: z.boolean().optional(),
    /**
     * Discriminator for `execution-callback.service.ts` so MODEL_3D callbacks
     * skip the VIDEO/AUDIO R2 upload path. Always 'MODEL_3D' for jobs created
     * by this service — `serializeQueueMeta` injects it automatically.
     */
    outputType: z.literal('MODEL_3D').optional(),
    /**
     * Hyper3D Rodin Gen-2.5 mesh-first: marks this job as the mesh-only
     * first pass (material was forced to 'None'). Surfaces a "Continue with
     * textures" affordance in the UI and is mirrored onto the resulting
     * Generation's `snapshot`. Distinct from Hunyuan3D's MESH_FIRST flow.
     */
    rodinMeshFirst: z.boolean().optional(),
    /**
     * Hyper3D Rodin Gen-2.5 mesh-first: when this job is the textured
     * continuation, the id of the mesh-only Generation it descends from.
     * Mirrored onto the Generation's `snapshot` for gallery linkage.
     */
    parentGenerationId: z.string().min(1).optional(),
  })
  .passthrough()

type Model3DQueueHandle = z.infer<typeof Model3DQueueHandleSchema>
type Model3DQueueMeta = z.infer<typeof Model3DQueueMetaSchema>
type Model3DQueueSubmitter = (
  input: ProviderModel3DInput,
) => Promise<ProviderQueueSubmitResult>
type Model3DQueueStatusChecker = (input: {
  statusUrl: string
  responseUrl: string
  apiKey: string
}) => Promise<ProviderModel3DQueueStatusResult>
type GenerationExecutionRoute = Awaited<
  ReturnType<typeof resolveGenerationRoute>
>

const finalizing3DJobs = new Set<string>()
const MODEL_3D_FINALIZATION_STALE_MS = 15 * 60 * 1000

/**
 * PR3-α: marker written to GenerationJob.errorMessage when the user cancels
 * a staged job. The status check uses it to surface `cancelled: true` to the
 * client (suppressing the error toast). Repurposes the existing text column
 * instead of adding a CANCELLED value to the GenerationJobStatus enum (which
 * would require a Prisma migration).
 */
const CANCELLED_BY_USER_MARKER = 'CANCELLED_BY_USER'

/**
 * PR2-B3: in-memory upload progress per job. Best-effort — readable when the
 * status poll hits the same worker that's running the R2 upload. On a cold
 * start or a different Fluid Compute instance the entry won't be visible and
 * the client UI degrades from "X / Y MB" to indeterminate, but the upload
 * itself still completes correctly.
 */
const finalUploadProgress = new Map<string, { loaded: number; total: number }>()
const MESH_FIRST_PREVIEW_MODEL_IDS = new Set<string>(
  MODEL_3D_MESH_FIRST_PREVIEW_MODEL_IDS,
)

interface Model3DStatusJob {
  id: string
  userId: string
  status: string
  modelId: string
  createdAt: Date
  /**
   * PR3-α: when status is FAILED and errorMessage matches CANCELLED_BY_USER
   * marker, we surface `cancelled: true` instead of an error toast. No Prisma
   * schema change — repurposes the existing nullable text column.
   */
  errorMessage?: string | null
  generation?: {
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
  } | null
}

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

  // Dispatch Hyper3D Rodin and all FAL-based MODEL_3D jobs to the Cloudflare
  // Worker. The Worker owns queue polling, R2 upload, and the callback.
  if (
    executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN ||
    executionRoute.adapterType === AI_ADAPTER_TYPES.FAL
  ) {
    return submitWorker3DGeneration({ userId, input, executionRoute, provider })
  }

  // ─── Legacy inline path ───────────────────────────────────────────────
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter?.submitModel3DToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      '3D generation is not supported for this provider',
      400,
    )
  }

  // Text-to-3D is only supported via the Worker path (Rodin). Any caller
  // reaching the legacy inline path without a source image is a programmer
  // error — guard so the rest of the function can treat imageUrl as defined.
  if (!input.imageUrl) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'Source image URL is required for this 3D model.',
      400,
    )
  }
  const inputImageUrl = input.imageUrl

  let sourceQualityReport: Awaited<
    ReturnType<typeof inspect3DSourceImageQuality>
  >
  try {
    sourceQualityReport = await inspect3DSourceImageQuality(input.imageUrl, {
      userId,
    })
  } catch (error) {
    logger.warn('3D source quality inspection failed', {
      imageUrl: input.imageUrl,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'Source image is not accessible or is not a valid raster image.',
      422,
    )
  }

  if (sourceQualityReport.blockingIssues.length > 0) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      build3DSourceQualityMessage(sourceQualityReport),
      422,
    )
  }

  // Source-image prep. Default on; user-disabled (prep3D === false) sends
  // the raw image straight in. Failures inside `prepare3DSourceImage`
  // already fall back to the original URL, so this never blocks.
  const preparedImageUrl =
    input.prep3D === false
      ? input.imageUrl
      : await prepare3DSourceImage({
          imageUrl: input.imageUrl,
          userId,
          falApiKey: executionRoute.apiKey,
        })

  const useMeshFirstPreview = shouldUseMeshFirstPreview(
    input,
    executionRoute.modelId,
  )
  const queueInput = buildProvider3DInput({
    input,
    imageUrl: preparedImageUrl,
    modelId: executionRoute.modelId,
    providerConfig: executionRoute.providerConfig,
    apiKey: executionRoute.apiKey,
    overrides: useMeshFirstPreview
      ? {
          enablePbr: false,
          generateType: MODEL_3D_GENERATE_TYPE.GEOMETRY,
        }
      : undefined,
  })

  let queueResult: ProviderQueueSubmitResult
  try {
    queueResult = await submit3DQueueWithRetry({
      adapterType: executionRoute.adapterType,
      submit: providerAdapter.submitModel3DToQueue,
      input: queueInput,
    })

    logger.info('3D submitted to queue', {
      adapter: executionRoute.adapterType,
      modelId: executionRoute.modelId,
      requestId: queueResult.requestId,
      stage: useMeshFirstPreview
        ? MODEL_3D_JOB_STAGE.MESH_RUNNING
        : MODEL_3D_JOB_STAGE.SINGLE_RUNNING,
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

  // PR3-α: `staged` only takes effect when we're already on the mesh-first
  // chain (single-shot runs have nothing to stage). Persisting it on the
  // meta lets the status poller pause at MESH_READY after Stage 1.
  const stagedFlag = useMeshFirstPreview && input.staged === true
  const queueMeta = serializeQueueMeta({
    ...(useMeshFirstPreview
      ? {
          mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
          stage: MODEL_3D_JOB_STAGE.MESH_RUNNING,
          mesh: queueResult,
          preparedImageUrl,
          options: {
            enablePbr: input.enablePbr,
            faceCount: input.faceCount,
            seed: input.seed,
          },
          staged: stagedFlag,
        }
      : {
          mode: MODEL_3D_PREVIEW_MODE.NONE,
          stage: MODEL_3D_JOB_STAGE.SINGLE_RUNNING,
          requestId: queueResult.requestId,
          statusUrl: queueResult.statusUrl,
          responseUrl: queueResult.responseUrl,
        }),
    sourceImageUrl: input.imageUrl,
    sourceGenerationId: input.sourceGenerationId,
    projectId: input.projectId,
    prompt: input.prompt ?? '',
    apiKeyId: executionRoute.resolvedApiKeyId,
    multiViewImages: input.multiViewImages,
    sourceQuality: sourceQualityReport,
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
    return {
      jobId: job.id,
      status: 'FAILED',
      ...(job.errorMessage === CANCELLED_BY_USER_MARKER && { cancelled: true }),
    }
  }

  if (!job.externalRequestId) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has no external request ID',
      400,
    )
  }

  const queueMeta = parseQueueMeta(job.externalRequestId)

  // Worker-dispatched jobs: the Worker owns polling and R2 upload.
  // The callback service advances job.status; just reflect the DB state.
  if (queueMeta.workerDispatched) {
    // Stale-job sweeper: if the worker crashed before it could send the
    // failure callback (or the callback itself failed), the job sits at
    // RUNNING forever and the UI polls indefinitely. Mark it FAILED on read
    // once we've waited well past any plausible worker runtime.
    if (
      job.status === 'RUNNING' &&
      Date.now() - job.updatedAt.getTime() > MODEL_3D_WORKER_STALE_MS
    ) {
      await failGenerationJob(job.id, {
        errorMessage:
          'Worker job timed out without callback (exceeded stale threshold)',
      })
      logger.warn('3D worker job marked FAILED by stale sweeper', {
        jobId: job.id,
        userId,
        ageMs: Date.now() - job.updatedAt.getTime(),
      })
      return { jobId: job.id, status: 'FAILED' }
    }

    return {
      jobId: job.id,
      status: job.status === 'RUNNING' ? 'IN_PROGRESS' : 'IN_QUEUE',
    }
  }

  const executionRoute = await resolveGenerationRoute(userId, {
    modelId: job.modelId,
    apiKeyId: queueMeta.apiKeyId ?? undefined,
  })
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (queueMeta.finalResult) {
    scheduleCompleted3DFinalization({
      userId,
      job,
      queueMeta,
      executionRoute,
      result: queueMeta.finalResult,
    })
    return buildFinalizing3DResponse(job.id, queueMeta)
  }

  if (!providerAdapter?.checkModel3DQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      '3D status check is not supported for this provider',
      400,
    )
  }

  if (queueMeta.mode === MODEL_3D_PREVIEW_MODE.MESH_FIRST) {
    if (!providerAdapter.submitModel3DToQueue) {
      throw new GenerateImageServiceError(
        'UNSUPPORTED_MODEL',
        '3D generation is not supported for this provider',
        400,
      )
    }

    return checkMeshFirst3DGenerationStatus({
      userId,
      job,
      queueMeta,
      apiKey: executionRoute.apiKey,
      executionRoute,
      checkModel3DQueueStatus: providerAdapter.checkModel3DQueueStatus,
      submitModel3DToQueue: providerAdapter.submitModel3DToQueue,
    })
  }

  const queueHandle = getSingleQueueHandle(queueMeta)
  const queueStatus = await check3DQueueStatusOrThrow({
    jobId: job.id,
    modelId: job.modelId,
    apiKey: executionRoute.apiKey,
    handle: queueHandle,
    checkModel3DQueueStatus: providerAdapter.checkModel3DQueueStatus,
  })

  if (queueStatus === 'TRANSIENT') {
    return { jobId: job.id, status: 'IN_PROGRESS' }
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

  const finalizingMeta = await storeCompleted3DProviderResult({
    job,
    queueMeta,
    result: queueStatus.result,
  })

  scheduleCompleted3DFinalization({
    userId,
    job,
    queueMeta: finalizingMeta,
    executionRoute,
    result: queueStatus.result,
  })

  return buildFinalizing3DResponse(job.id, finalizingMeta)
}

// ─── PR3-α: Staged-generation actions ───────────────────────────

/**
 * Stage 2 trigger — user has reviewed the geometry preview and wants to
 * proceed to texture generation. Submits a Normal-mode fal call against the
 * same source image. Errors if the job isn't waiting at MESH_READY.
 */
export async function continue3DGeneration(
  clerkId: string,
  input: Continue3DRequest,
): Promise<Model3DStatusResponseData> {
  const dbUser = await ensureUser(clerkId)
  return continue3DGenerationForUserId(dbUser.id, input)
}

export async function continue3DGenerationForUserId(
  userId: string,
  input: Continue3DRequest,
): Promise<Model3DStatusResponseData> {
  const { job, queueMeta } = await loadStagedJob({
    userId,
    jobId: input.jobId,
    expectedStages: [MODEL_3D_JOB_STAGE.MESH_READY],
  })

  const executionRoute = await resolveGenerationRoute(userId, {
    modelId: job.modelId,
    apiKeyId: queueMeta.apiKeyId ?? undefined,
  })
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)
  if (!providerAdapter?.submitModel3DToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      '3D generation is not supported for this provider',
      400,
    )
  }

  // Seed override only when the caller passes one; otherwise inherit from
  // Stage 1 so the Hunyuan output stays deterministic relative to the mesh
  // the user just approved.
  const effectiveQueueMeta: Model3DQueueMeta =
    input.seed != null
      ? {
          ...queueMeta,
          options: { ...(queueMeta.options ?? {}), seed: input.seed },
        }
      : queueMeta

  let finalQueue: ProviderQueueSubmitResult
  try {
    finalQueue = await submitFinalTextured3DQueue({
      queueMeta: effectiveQueueMeta,
      executionRoute,
      submitModel3DToQueue: providerAdapter.submitModel3DToQueue,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to submit textured 3D generation'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  const updatedMeta: Model3DQueueMeta = {
    ...effectiveQueueMeta,
    stage: MODEL_3D_JOB_STAGE.TEXTURE_RUNNING,
    final: finalQueue,
  }

  await db.generationJob.update({
    where: { id: job.id },
    data: {
      status: 'RUNNING',
      externalRequestId: serializeQueueMeta(updatedMeta),
    },
  })

  return {
    jobId: job.id,
    status: 'IN_PROGRESS',
    stage: 'texture',
    previewModelUrl: updatedMeta.mesh?.modelUrl,
  }
}

/**
 * Re-submit Stage 1 (Geometry) for the same job — used by the diagnosis
 * dock's "换种子重跑" / "调侧视图重跑" / "提高面数重跑" actions. Cheap
 * (~$0.225 / ~150s) compared to redoing the full Normal pipeline.
 */
export async function retryMesh3DGeneration(
  clerkId: string,
  input: RetryMesh3DRequest,
): Promise<Model3DStatusResponseData> {
  const dbUser = await ensureUser(clerkId)
  return retryMesh3DGenerationForUserId(dbUser.id, input)
}

export async function retryMesh3DGenerationForUserId(
  userId: string,
  input: RetryMesh3DRequest,
): Promise<Model3DStatusResponseData> {
  const { job, queueMeta } = await loadStagedJob({
    userId,
    jobId: input.jobId,
    expectedStages: [MODEL_3D_JOB_STAGE.MESH_READY],
  })

  const executionRoute = await resolveGenerationRoute(userId, {
    modelId: job.modelId,
    apiKeyId: queueMeta.apiKeyId ?? undefined,
  })
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)
  if (!providerAdapter?.submitModel3DToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      '3D generation is not supported for this provider',
      400,
    )
  }

  const effectiveOptions = {
    enablePbr: queueMeta.options?.enablePbr,
    faceCount: input.faceCount ?? queueMeta.options?.faceCount,
    seed: input.seed ?? queueMeta.options?.seed,
  }
  const effectiveMultiView = input.multiViewImages ?? queueMeta.multiViewImages

  let queueResult: ProviderQueueSubmitResult
  try {
    queueResult = await submit3DQueueWithRetry({
      adapterType: executionRoute.adapterType,
      submit: providerAdapter.submitModel3DToQueue,
      input: {
        // Hunyuan inline path only runs for image-to-3D — text-to-3D is
        // Rodin-only and dispatches to the Worker path.
        imageUrl: (queueMeta.preparedImageUrl ?? queueMeta.sourceImageUrl)!,
        modelId: executionRoute.modelId,
        providerConfig: executionRoute.providerConfig,
        apiKey: executionRoute.apiKey,
        multiViewImages: effectiveMultiView,
        enablePbr: false,
        faceCount: effectiveOptions.faceCount,
        generateType: MODEL_3D_GENERATE_TYPE.GEOMETRY,
        seed: effectiveOptions.seed,
      },
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : '3D mesh retry failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  // Drop the previous mesh URL — it's no longer the active geometry. The
  // submit returns just queue handles (no modelUrl yet); MESH_RUNNING poll
  // will fill it in on completion.
  const updatedMeta: Model3DQueueMeta = {
    ...queueMeta,
    stage: MODEL_3D_JOB_STAGE.MESH_RUNNING,
    mesh: queueResult,
    multiViewImages: effectiveMultiView,
    options: effectiveOptions,
  }

  await db.generationJob.update({
    where: { id: job.id },
    data: {
      status: 'RUNNING',
      externalRequestId: serializeQueueMeta(updatedMeta),
    },
  })

  return { jobId: job.id, status: 'IN_PROGRESS', stage: 'mesh' }
}

/**
 * Abort an in-flight 3D job. Allowed in any non-terminal state; idempotent on
 * already-FAILED jobs. Writes a sentinel into errorMessage so the status
 * check can surface `cancelled: true` (skipping the error toast on the
 * client) without requiring a new GenerationJobStatus enum value.
 */
export async function cancel3DGeneration(
  clerkId: string,
  input: Cancel3DRequest,
): Promise<Model3DStatusResponseData> {
  const dbUser = await ensureUser(clerkId)
  return cancel3DGenerationForUserId(dbUser.id, input)
}

export async function cancel3DGenerationForUserId(
  userId: string,
  input: Cancel3DRequest,
): Promise<Model3DStatusResponseData> {
  const job = await db.generationJob.findUnique({
    where: { id: input.jobId },
  })
  if (!job || job.userId !== userId) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      '3D generation job not found',
      404,
    )
  }
  if (job.status === 'COMPLETED') {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job already completed — cannot cancel',
      400,
    )
  }
  if (job.status !== 'FAILED') {
    await failGenerationJob(job.id, {
      errorMessage: CANCELLED_BY_USER_MARKER,
    })
  }

  finalUploadProgress.delete(job.id)
  finalizing3DJobs.delete(job.id)

  return { jobId: job.id, status: 'FAILED', cancelled: true }
}

/**
 * Shared loader for the continue / retry-mesh paths. Validates ownership +
 * that the job is parked in one of the expected staged-mode states. Throws a
 * typed service error so the API route can return a clean 400/404.
 */
async function loadStagedJob(params: {
  userId: string
  jobId: string
  expectedStages: ReadonlyArray<Model3DJobStage>
}): Promise<{ job: Model3DStatusJob; queueMeta: Model3DQueueMeta }> {
  const job = await db.generationJob.findUnique({
    where: { id: params.jobId },
  })
  if (!job || job.userId !== params.userId) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      '3D generation job not found',
      404,
    )
  }
  if (job.status !== 'RUNNING' || !job.externalRequestId) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job is not in a staged-pending state',
      400,
    )
  }
  const queueMeta = parseQueueMeta(job.externalRequestId)
  if (!queueMeta.stage || !params.expectedStages.includes(queueMeta.stage)) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      `Job stage ${queueMeta.stage ?? 'unknown'} does not allow this action`,
      400,
    )
  }
  return { job, queueMeta }
}

// ─── Helpers ─────────────────────────────────────────────────────

function shouldUseMeshFirstPreview(
  input: Generate3DRequest,
  modelId: string,
): boolean {
  return (
    input.previewMode === MODEL_3D_PREVIEW_MODE.MESH_FIRST &&
    MESH_FIRST_PREVIEW_MODEL_IDS.has(modelId)
  )
}

function buildProvider3DInput(params: {
  input: Generate3DRequest
  imageUrl: string
  modelId: string
  providerConfig: ProviderModel3DInput['providerConfig']
  apiKey: string
  overrides?: Partial<ProviderModel3DInput>
}): ProviderModel3DInput {
  const { input, overrides } = params

  return {
    imageUrl: params.imageUrl,
    modelId: params.modelId,
    providerConfig: params.providerConfig,
    apiKey: params.apiKey,
    texturedMesh: input.texturedMesh,
    octreeResolution: input.octreeResolution,
    multiViewImages: input.multiViewImages,
    enablePbr: input.enablePbr,
    faceCount: input.faceCount,
    generateType: input.generateType,
    polygonType: input.polygonType,
    trellisResolution: input.trellisResolution,
    trellisTextureSize: input.trellisTextureSize,
    trellisDecimationTarget: input.trellisDecimationTarget,
    trellisRemesh: input.trellisRemesh,
    trellisRemeshProject: input.trellisRemeshProject,
    trellisStructureSamplingSteps: input.trellisStructureSamplingSteps,
    trellisShapeSamplingSteps: input.trellisShapeSamplingSteps,
    trellisTextureSamplingSteps: input.trellisTextureSamplingSteps,
    removeBackground: input.removeBackground,
    seed: input.seed,
    ...overrides,
  }
}

async function submit3DQueueWithRetry(params: {
  adapterType: string
  submit: Model3DQueueSubmitter
  input: ProviderModel3DInput
}): Promise<ProviderQueueSubmitResult> {
  const breaker = getCircuitBreaker(params.adapterType)

  return breaker.call(() =>
    withRetry(() => params.submit(params.input), {
      maxAttempts: 2,
      baseDelayMs: 2000,
      label: `${params.adapterType}.submitModel3D`,
    }),
  )
}

// ─── Worker dispatch (Hyper3D Rodin + FAL MODEL_3D) ──────────────

async function submitWorker3DGeneration({
  userId,
  input,
  executionRoute,
  provider,
}: {
  userId: string
  input: Generate3DRequest
  executionRoute: GenerationExecutionRoute
  provider: string
}): Promise<Model3DSubmitResponseData> {
  // Rodin texture-only continuation: re-textures an existing mesh-only
  // Generation by POSTing to /api/v2/rodin_texture_only. We pull the GLB
  // URL and the original reference image off the parent Generation so the
  // caller doesn't have to round-trip them.
  const isRodinTextureOnly =
    executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN &&
    input.rodinTextureOnly === true

  // Rodin Gen-2.5 text-to-3D: prompt-only generation (no source image).
  // The /api/v2/rodin endpoint auto-detects text mode when no `images` are
  // attached — submitRodinJob already guards `imageUrl` before uploading.
  const isRodinTextToThreeD =
    executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN &&
    !input.imageUrl &&
    !!input.rodinPrompt?.trim()

  if (
    isRodinTextToThreeD &&
    (!input.rodinPrompt || !input.rodinPrompt.trim())
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'Text-to-3D mode requires a non-empty prompt.',
      400,
    )
  }

  let parentMeshUrl: string | undefined
  let effectiveSourceImageUrl = input.imageUrl

  if (isRodinTextureOnly) {
    if (!input.parentGenerationId) {
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        'rodinTextureOnly requires parentGenerationId pointing at the mesh-only Generation.',
        400,
      )
    }
    const parent = await db.generation.findUnique({
      where: { id: input.parentGenerationId },
      select: {
        id: true,
        userId: true,
        modelUrl: true,
        referenceImageUrl: true,
        outputType: true,
      },
    })
    if (!parent || parent.userId !== userId) {
      throw new GenerateImageServiceError(
        'JOB_NOT_FOUND',
        'Parent mesh Generation not found.',
        404,
      )
    }
    if (parent.outputType !== 'MODEL_3D' || !parent.modelUrl) {
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        'Parent Generation is not a 3D mesh or has no modelUrl.',
        400,
      )
    }
    parentMeshUrl = parent.modelUrl
    // Prefer the original reference image — that's what was paired with the
    // mesh during the first pass. Fall back to whatever the caller passed.
    effectiveSourceImageUrl = parent.referenceImageUrl ?? input.imageUrl
  }

  // Text-to-3D skips image-related steps entirely (no source image to check
  // or prep). The Worker will dispatch with no `images` field — Rodin auto-
  // selects text-to-3D mode when nothing is uploaded.
  let sourceQualityReport: Awaited<
    ReturnType<typeof inspect3DSourceImageQuality>
  > | null = null
  let preparedImageUrl: string | undefined

  if (isRodinTextToThreeD) {
    preparedImageUrl = undefined
  } else if (!effectiveSourceImageUrl) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'Source image URL is required for image-to-3D generation.',
      400,
    )
  } else {
    try {
      sourceQualityReport = await inspect3DSourceImageQuality(
        effectiveSourceImageUrl,
        { userId },
      )
    } catch (error) {
      logger.warn('3D source quality inspection failed', {
        imageUrl: effectiveSourceImageUrl,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        'Source image is not accessible or is not a valid raster image.',
        422,
      )
    }

    // Texture-only continuations re-use an already-validated mesh from the
    // parent — skip the LLM semantic check (mesh + reference were already
    // accepted on the mesh-first pass). Still surface raster-format failures
    // because the LLM check is inside inspect3DSourceImageQuality already.
    if (!isRodinTextureOnly && sourceQualityReport.blockingIssues.length > 0) {
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        build3DSourceQualityMessage(sourceQualityReport),
        422,
      )
    }

    // Texture-only also skips prep (upscale/whitepad) — the reference image
    // was already prepped before the mesh-only pass.
    preparedImageUrl = isRodinTextureOnly
      ? effectiveSourceImageUrl
      : input.prep3D === false
        ? effectiveSourceImageUrl
        : await prepare3DSourceImage({
            imageUrl: effectiveSourceImageUrl,
            userId,
            falApiKey: executionRoute.apiKey,
          })
  }

  const generationJob = await createGenerationJob({
    userId,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: executionRoute.modelId,
  })

  const modelConfig = getModelById(executionRoute.modelId)
  const workerContext = buildModel3DWorkerContext({
    runId: generationJob.id,
    userId,
    executionRoute,
    input,
    preparedImageUrl,
    modelConfig,
    rodinTextureOnly: isRodinTextureOnly,
    parentMeshUrl,
  })

  const dispatch =
    executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN
      ? dispatchHyper3DRodinWorkerRun
      : dispatchHunyuan3DWorkerRun

  try {
    await dispatch(workerContext)
  } catch (error) {
    await failGenerationJob(generationJob.id, {
      errorMessage:
        error instanceof Error ? error.message : 'Worker dispatch failed',
    })
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : '3D generation dispatch failed'
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, 502)
  }

  // Rodin mesh-first lineage: persisted on the job's queue meta so the
  // callback service can mirror it onto the resulting Generation's snapshot.
  // First-pass jobs carry `rodinMeshFirst=true`; textured continuations carry
  // `parentGenerationId` pointing at the mesh-only Generation.
  const isRodinMeshFirstJob =
    executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN &&
    input.rodinMeshFirst === true

  await db.generationJob.update({
    where: { id: generationJob.id },
    data: {
      externalRequestId: serializeQueueMeta({
        workerDispatched: true,
        sourceImageUrl: input.imageUrl,
        sourceGenerationId: input.sourceGenerationId,
        projectId: input.projectId,
        prompt: input.prompt ?? '',
        apiKeyId: executionRoute.resolvedApiKeyId,
        multiViewImages: input.multiViewImages,
        sourceQuality: sourceQualityReport ?? undefined,
        ...(isRodinMeshFirstJob && { rodinMeshFirst: true }),
        ...(input.parentGenerationId && {
          parentGenerationId: input.parentGenerationId,
        }),
      }),
      prompt: input.prompt ?? '',
    },
  })

  logger.info('3D dispatched to Worker', {
    adapter: executionRoute.adapterType,
    modelId: executionRoute.modelId,
    jobId: generationJob.id,
    ...(isRodinMeshFirstJob && { rodinMeshFirst: true }),
    ...(input.parentGenerationId && {
      parentGenerationId: input.parentGenerationId,
    }),
  })

  return { jobId: generationJob.id, requestId: generationJob.id }
}

function buildModel3DWorkerContext(params: {
  runId: string
  userId: string
  executionRoute: GenerationExecutionRoute
  input: Generate3DRequest
  /** Undefined for Rodin text-to-3D mode (no source image at all). */
  preparedImageUrl: string | undefined
  modelConfig: ReturnType<typeof getModelById>
  /** Pre-resolved by submitWorker3DGeneration when input.rodinTextureOnly. */
  rodinTextureOnly?: boolean
  parentMeshUrl?: string
}): WorkerModel3DRunContext {
  const {
    runId,
    userId,
    executionRoute,
    input,
    preparedImageUrl,
    modelConfig,
    rodinTextureOnly,
    parentMeshUrl,
  } = params

  // Rodin mesh-first first pass: force material='None' so the provider returns
  // an untextured mesh (faster + cheaper). The user's actual material choice
  // is replayed when they click "Continue with textures", which issues a new
  // independent submit with `rodinMeshFirst=false` + parentGenerationId set.
  const isRodinMeshFirst =
    executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN &&
    input.rodinMeshFirst === true
  const effectiveMaterial = isRodinMeshFirst ? 'None' : input.rodinMaterial

  return {
    runId,
    workflowId:
      executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN
        ? EXECUTION_WORKFLOW_IDS.HYPER3D_RODIN
        : EXECUTION_WORKFLOW_IDS.HUNYUAN3D,
    providerId: executionRoute.adapterType,
    userId,
    outputType: 'MODEL_3D',
    ...(executionRoute.resolvedApiKeyId
      ? { apiKeyId: executionRoute.resolvedApiKeyId }
      : { useSystemKey: true }),
    callbackUrl: buildInternalUrl(EXECUTION_INTERNAL.CALLBACK_PATH),
    resolveKeyUrl: buildInternalUrl(EXECUTION_INTERNAL.RESOLVE_KEY_PATH),
    timeoutMs: modelConfig?.timeoutMs ?? EXECUTION_WORKER.DEFAULT_TIMEOUT_MS,
    maxAttempts: EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS,
    pollIntervalMs: EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS,
    providerInput: {
      imageUrl: preparedImageUrl,
      modelId: executionRoute.modelId,
      externalModelId: getExecutionModelId(executionRoute.modelId),
      seed: input.seed != null && input.seed >= 0 ? input.seed : undefined,
      // Rodin-specific
      tier: input.rodinTier,
      meshMode: input.rodinMeshMode,
      quality: input.rodinQuality,
      textureMode: input.rodinTextureMode,
      material: effectiveMaterial,
      highPack: input.rodinHighPack,
      taPose: input.rodinTAPose,
      hdTexture: input.rodinHdTexture,
      textureDelight: input.rodinTextureDelight,
      qualityOverride: input.rodinQualityOverride,
      additionalImageUrls: input.rodinAdditionalImageUrls,
      bboxCondition: input.rodinBboxCondition
        ? [...input.rodinBboxCondition]
        : undefined,
      geometryInstructMode: input.rodinGeometryInstructMode,
      geometryFileFormat: input.rodinGeometryFileFormat,
      prompt: input.rodinPrompt,
      useOriginalAlpha: input.rodinUseOriginalAlpha,
      previewRender: input.rodinPreviewRender,
      isMicro: input.rodinIsMicro,
      // Rodin texture-only continuation: when true, the Worker routes to
      // /api/v2/rodin_texture_only with `parentMeshUrl` as the GLB to texture
      // and `imageUrl` as the texture reference. Geometry from the parent is
      // preserved verbatim (no regeneration).
      ...(rodinTextureOnly && { rodinTextureOnly: true }),
      ...(parentMeshUrl && { parentMeshUrl }),
      // FAL / Hunyuan3D + Trellis
      texturedMesh: input.texturedMesh,
      octreeResolution: input.octreeResolution,
      enablePbr: input.enablePbr,
      faceCount: input.faceCount,
      generateType: input.generateType,
      polygonType: input.polygonType,
      trellisResolution:
        input.trellisResolution != null
          ? String(input.trellisResolution)
          : undefined,
      trellisTextureSize:
        input.trellisTextureSize != null
          ? String(input.trellisTextureSize)
          : undefined,
      trellisDecimationTarget: input.trellisDecimationTarget,
      trellisRemesh: input.trellisRemesh,
      trellisRemeshProject: input.trellisRemeshProject,
      trellisStructureSamplingSteps: input.trellisStructureSamplingSteps,
      trellisShapeSamplingSteps: input.trellisShapeSamplingSteps,
      trellisTextureSamplingSteps: input.trellisTextureSamplingSteps,
      removeBackground: input.removeBackground,
    },
  }
}

function serializeQueueMeta(meta: Model3DQueueMeta): string {
  // Inject outputType so the callback service routes to the MODEL_3D branch
  // instead of the default VIDEO upload path.
  return JSON.stringify({ ...meta, outputType: 'MODEL_3D' as const })
}

function parseQueueMeta(value: string): Model3DQueueMeta {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid queue metadata',
      400,
    )
  }

  const result = Model3DQueueMetaSchema.safeParse(parsed)
  if (!result.success) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid queue metadata',
      400,
    )
  }

  return result.data
}

function getSingleQueueHandle(queueMeta: Model3DQueueMeta): Model3DQueueHandle {
  if (queueMeta.requestId && queueMeta.statusUrl && queueMeta.responseUrl) {
    return {
      requestId: queueMeta.requestId,
      statusUrl: queueMeta.statusUrl,
      responseUrl: queueMeta.responseUrl,
    }
  }

  throw new GenerateImageServiceError(
    'INVALID_JOB',
    'Job has invalid queue metadata',
    400,
  )
}

async function check3DQueueStatusOrThrow(params: {
  jobId: string
  modelId: string
  apiKey: string
  handle: Model3DQueueHandle
  checkModel3DQueueStatus: Model3DQueueStatusChecker
}): Promise<ProviderModel3DQueueStatusResult | 'TRANSIENT'> {
  try {
    return await params.checkModel3DQueueStatus({
      statusUrl: params.handle.statusUrl,
      responseUrl: params.handle.responseUrl,
      apiKey: params.apiKey,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    if (isTransient3DQueueStatusError(error)) {
      logger.warn('3D status check transient failure; keeping job active', {
        jobId: params.jobId,
        modelId: params.modelId,
        error: error instanceof Error ? error.message : String(error),
      })
      return 'TRANSIENT'
    }
    const message =
      error instanceof Error ? error.message : '3D status check failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }
}

async function checkMeshFirst3DGenerationStatus(params: {
  userId: string
  job: Model3DStatusJob
  queueMeta: Model3DQueueMeta
  apiKey: string
  executionRoute: GenerationExecutionRoute
  checkModel3DQueueStatus: Model3DQueueStatusChecker
  submitModel3DToQueue: Model3DQueueSubmitter
}): Promise<Model3DStatusResponseData> {
  const { job, queueMeta } = params

  // PR3-α: staged mode parked at MESH_READY between Stage 1 and Stage 2.
  // The job is RUNNING but burning no provider resources — return the mesh
  // URL so the client can render the grey-shaded GLB and surface the
  // continue / retry / cancel decision buttons. No fal call here.
  if (queueMeta.stage === MODEL_3D_JOB_STAGE.MESH_READY) {
    return buildMeshReady3DResponse(job.id, queueMeta)
  }

  if (queueMeta.stage === MODEL_3D_JOB_STAGE.MESH_RUNNING) {
    if (!queueMeta.mesh) {
      throw new GenerateImageServiceError(
        'INVALID_JOB',
        'Job has invalid mesh queue metadata',
        400,
      )
    }

    const meshStatus = await check3DQueueStatusOrThrow({
      jobId: job.id,
      modelId: job.modelId,
      apiKey: params.apiKey,
      handle: queueMeta.mesh,
      checkModel3DQueueStatus: params.checkModel3DQueueStatus,
    })

    if (meshStatus === 'TRANSIENT') {
      return { jobId: job.id, status: 'IN_PROGRESS', stage: 'mesh' }
    }
    if (
      meshStatus.status === 'IN_QUEUE' ||
      meshStatus.status === 'IN_PROGRESS'
    ) {
      return { jobId: job.id, status: meshStatus.status, stage: 'mesh' }
    }
    if (meshStatus.status === 'FAILED' || !meshStatus.result) {
      await failGenerationJob(job.id, {
        errorMessage: '3D geometry preview failed on provider side',
      })
      return { jobId: job.id, status: 'FAILED' }
    }

    // PR3-α: in staged mode we stop here and wait for the user. Persist the
    // mesh URL onto the meta + flip stage to MESH_READY; the next status
    // poll falls into the MESH_READY branch above. No Stage 2 submission,
    // no extra fal cost until the user clicks "继续上色".
    if (queueMeta.staged === true) {
      const stagedMeta: Model3DQueueMeta = {
        ...queueMeta,
        stage: MODEL_3D_JOB_STAGE.MESH_READY,
        mesh: {
          ...queueMeta.mesh,
          modelUrl: meshStatus.result.modelUrl,
          contentType: meshStatus.result.contentType,
          fileSize: meshStatus.result.fileSize,
        },
      }

      await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'RUNNING',
          externalRequestId: serializeQueueMeta(stagedMeta),
        },
      })

      return buildMeshReady3DResponse(job.id, stagedMeta)
    }

    const claimed = await claimRunningJob(job.id)
    if (!claimed) {
      return buildActiveMeshFirstResponse(job.id, queueMeta)
    }

    let finalQueue: ProviderQueueSubmitResult
    try {
      finalQueue = await submitFinalTextured3DQueue({
        queueMeta,
        executionRoute: params.executionRoute,
        submitModel3DToQueue: params.submitModel3DToQueue,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to submit textured 3D generation'
      await failGenerationJob(job.id, {
        errorMessage: message,
      })
      const status = error instanceof ProviderError ? error.status : 502
      throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
    }
    const updatedMeta: Model3DQueueMeta = {
      ...queueMeta,
      stage: MODEL_3D_JOB_STAGE.TEXTURE_RUNNING,
      mesh: {
        ...queueMeta.mesh,
        modelUrl: meshStatus.result.modelUrl,
        contentType: meshStatus.result.contentType,
        fileSize: meshStatus.result.fileSize,
      },
      final: finalQueue,
    }

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        externalRequestId: serializeQueueMeta(updatedMeta),
      },
    })

    return {
      jobId: job.id,
      status: 'IN_PROGRESS',
      stage: 'texture',
      previewModelUrl: meshStatus.result.modelUrl,
    }
  }

  if (
    queueMeta.stage !== MODEL_3D_JOB_STAGE.TEXTURE_RUNNING ||
    !queueMeta.final
  ) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid texture queue metadata',
      400,
    )
  }

  const finalStatus = await check3DQueueStatusOrThrow({
    jobId: job.id,
    modelId: job.modelId,
    apiKey: params.apiKey,
    handle: queueMeta.final,
    checkModel3DQueueStatus: params.checkModel3DQueueStatus,
  })
  const previewModelUrl = queueMeta.mesh?.modelUrl

  if (finalStatus === 'TRANSIENT') {
    return {
      jobId: job.id,
      status: 'IN_PROGRESS',
      stage: 'texture',
      previewModelUrl,
    }
  }
  if (
    finalStatus.status === 'IN_QUEUE' ||
    finalStatus.status === 'IN_PROGRESS'
  ) {
    return {
      jobId: job.id,
      status: finalStatus.status,
      stage: 'texture',
      previewModelUrl,
    }
  }
  if (finalStatus.status === 'FAILED' || !finalStatus.result) {
    await failGenerationJob(job.id, {
      errorMessage: '3D texture generation failed on provider side',
    })
    return { jobId: job.id, status: 'FAILED', previewModelUrl }
  }

  const finalizingMeta = await storeCompleted3DProviderResult({
    job,
    queueMeta,
    result: finalStatus.result,
  })

  scheduleCompleted3DFinalization({
    userId: params.userId,
    job,
    queueMeta: finalizingMeta,
    executionRoute: params.executionRoute,
    result: finalStatus.result,
  })

  return buildFinalizing3DResponse(job.id, finalizingMeta)
}

async function submitFinalTextured3DQueue(params: {
  queueMeta: Model3DQueueMeta
  executionRoute: GenerationExecutionRoute
  submitModel3DToQueue: Model3DQueueSubmitter
}): Promise<ProviderQueueSubmitResult> {
  const { queueMeta, executionRoute } = params

  return submit3DQueueWithRetry({
    adapterType: executionRoute.adapterType,
    submit: params.submitModel3DToQueue,
    input: {
      // Hunyuan/TripoSR continue path is image-to-3D only — text-to-3D is
      // Rodin-only and dispatches to the Worker path.
      imageUrl: (queueMeta.preparedImageUrl ?? queueMeta.sourceImageUrl)!,
      modelId: executionRoute.modelId,
      providerConfig: executionRoute.providerConfig,
      apiKey: executionRoute.apiKey,
      multiViewImages: queueMeta.multiViewImages,
      enablePbr: queueMeta.options?.enablePbr ?? true,
      faceCount: queueMeta.options?.faceCount,
      generateType: MODEL_3D_GENERATE_TYPE.NORMAL,
      seed: queueMeta.options?.seed,
    },
  })
}

function buildActiveMeshFirstResponse(
  jobId: string,
  queueMeta: Model3DQueueMeta,
): Model3DStatusResponseData {
  if (queueMeta.mode !== MODEL_3D_PREVIEW_MODE.MESH_FIRST) {
    return { jobId, status: 'IN_PROGRESS' }
  }

  if (queueMeta.stage === MODEL_3D_JOB_STAGE.TEXTURE_RUNNING) {
    return {
      jobId,
      status: 'IN_PROGRESS',
      stage: 'texture',
      previewModelUrl: queueMeta.mesh?.modelUrl,
    }
  }

  return { jobId, status: 'IN_PROGRESS', stage: 'mesh' }
}

/**
 * PR3-α: status payload for a job sitting at MESH_READY waiting for the user
 * to decide. The job is RUNNING in the DB but burning no provider resources;
 * the next state transition is driven by /continue, /retry-mesh, or /cancel.
 */
function buildMeshReady3DResponse(
  jobId: string,
  queueMeta: Model3DQueueMeta,
): Model3DStatusResponseData {
  return {
    jobId,
    status: 'IN_PROGRESS',
    stage: 'mesh_ready',
    meshModelUrl: queueMeta.mesh?.modelUrl,
    previewModelUrl: queueMeta.mesh?.modelUrl,
  }
}

function buildFinalizing3DResponse(
  jobId: string,
  queueMeta: Model3DQueueMeta,
): Model3DStatusResponseData {
  const progress = finalUploadProgress.get(jobId)
  return {
    jobId,
    status: 'IN_PROGRESS',
    stage: 'uploading',
    previewModelUrl: queueMeta.mesh?.modelUrl,
    // PR2-B2: hand the fal temp GLB URL to the client so it can render the
    // finished mesh while R2 ingest finishes in the background. The hook
    // keeps the download button disabled until status flips to COMPLETED.
    ...(queueMeta.finalResult && {
      provisionalModelUrl: queueMeta.finalResult.modelUrl,
    }),
    // PR2-B3: live byte counter if this worker is the one running the
    // upload. Replaces "已等待 752s" with "已上传 64 / 120 MB".
    ...(progress && { uploadProgress: progress }),
  }
}

async function claimRunningJob(jobId: string): Promise<boolean> {
  const claimed = await db.generationJob.updateMany({
    where: { id: jobId, status: 'RUNNING' },
    data: { status: 'QUEUED' },
  })

  return claimed.count > 0
}

async function claimFinalizingJob(jobId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - MODEL_3D_FINALIZATION_STALE_MS)
  const claimed = await db.generationJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: 'QUEUED' },
        { status: 'RUNNING', updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: 'RUNNING' },
  })

  return claimed.count > 0
}

async function getCompletedGenerationIfClaimLost(
  jobId: string,
): Promise<GenerationRecord | null> {
  const freshJob = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true },
  })

  if (freshJob?.status === 'COMPLETED' && freshJob.generation) {
    return mapGenerationToRecord(freshJob.generation)
  }

  return null
}

async function storeCompleted3DProviderResult(params: {
  job: Model3DStatusJob
  queueMeta: Model3DQueueMeta
  result: ProviderModel3DResult
}): Promise<Model3DQueueMeta> {
  const updatedMeta: Model3DQueueMeta = {
    ...params.queueMeta,
    finalResult: params.result,
  }

  await db.generationJob.update({
    where: { id: params.job.id },
    data: {
      status: 'QUEUED',
      externalRequestId: serializeQueueMeta(updatedMeta),
    },
  })

  logger.info('3D final provider result stored', {
    jobId: params.job.id,
    modelId: params.job.modelId,
    modelUrl: params.result.modelUrl,
    fileSize: params.result.fileSize,
  })

  return updatedMeta
}

function scheduleCompleted3DFinalization(params: {
  userId: string
  job: Model3DStatusJob
  queueMeta: Model3DQueueMeta
  executionRoute: GenerationExecutionRoute
  result: ProviderModel3DResult
}) {
  if (finalizing3DJobs.has(params.job.id)) return
  finalizing3DJobs.add(params.job.id)

  setTimeout(() => {
    void persistCompleted3DGeneration(params)
      .catch((error) => {
        logger.error('3D finalization failed', {
          jobId: params.job.id,
          modelId: params.job.modelId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        finalizing3DJobs.delete(params.job.id)
      })
  }, 0)
}

async function persistCompleted3DGeneration(params: {
  userId: string
  job: Model3DStatusJob
  queueMeta: Model3DQueueMeta
  executionRoute: GenerationExecutionRoute
  result: ProviderModel3DResult
}): Promise<Model3DStatusResponseData> {
  const { userId, job, queueMeta, executionRoute, result } = params

  const existingGeneration = await getCompletedGenerationIfClaimLost(job.id)
  if (existingGeneration) {
    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation: existingGeneration,
    }
  }

  const claimed = await claimFinalizingJob(job.id)
  if (!claimed) {
    const completedGeneration = await getCompletedGenerationIfClaimLost(job.id)
    if (completedGeneration) {
      return {
        jobId: job.id,
        status: 'COMPLETED',
        generation: completedGeneration,
      }
    }

    return buildFinalizing3DResponse(job.id, queueMeta)
  }

  const provider = getProviderLabel(executionRoute.providerConfig)
  const modelConfig = getModelById(job.modelId)
  const requestCount = executionRoute.creditCost ?? result.requestCount
  const inputImageCount = 1 + count3DMultiViewImages(queueMeta.multiViewImages)
  const timer = new GenerationStageTimer({
    outputType: 'MODEL_3D',
    jobId: job.id,
    modelId: job.modelId,
    adapterType: executionRoute.adapterType,
    provider,
    routeKind: modelConfig?.freeTier === true ? 'free-tier' : 'user-key',
  })
  timer.setDuration(
    GENERATION_STAGE.PROVIDER_WAIT_POLL,
    Date.now() - job.createdAt.getTime(),
  )

  const modelStorageKey = generateStorageKey('MODEL_3D', userId)

  try {
    logger.info('3D final R2 upload starting', {
      jobId: job.id,
      modelId: job.modelId,
      sourceUrl: result.modelUrl,
      fileSize: result.fileSize,
    })

    // PR2-B1: prefer streaming upload (pipelines fetch + R2 PUT instead of
    // buffering the full GLB in memory) — same path the video pipeline uses.
    // Fall back to the buffered implementation if streaming fails: some
    // provider CDNs terminate long-lived streamed downloads under R2
    // backpressure, and a 100MB+ buffered retry is still preferable to
    // surfacing a failure to the user.
    const mimeType = result.contentType ?? 'model/gltf-binary'
    const { publicUrl: glbPublicUrl } = await timer.measure(
      GENERATION_STAGE.R2_UPLOAD,
      async () => {
        try {
          const streamed = await streamUploadToR2({
            sourceUrl: result.modelUrl,
            key: modelStorageKey,
            mimeType,
            // PR2-B1: GLBs are ~50-250MB and bandwidth-bound. Bump concurrency
            // above the default of 1 so multiple 10MB parts upload in
            // parallel — the previous serial PUT loop was the main reason
            // streaming took as long as buffered.
            concurrency: 4,
            partSizeBytes: 10 * 1024 * 1024,
            onProgress: (loaded, total) => {
              finalUploadProgress.set(job.id, { loaded, total })
            },
          })
          timer.addNote('result_streamed_to_r2')
          return streamed
        } catch (streamError) {
          logger.warn('3D stream upload failed, falling back to buffered', {
            jobId: job.id,
            modelId: job.modelId,
            error:
              streamError instanceof Error
                ? streamError.message
                : String(streamError),
          })
          finalUploadProgress.delete(job.id)
          const buffered = await uploadBufferedHttpToR2({
            sourceUrl: result.modelUrl,
            key: modelStorageKey,
            mimeType,
            timeoutMs: 300_000,
          })
          timer.addNote('result_download_buffered_with_r2_upload')
          return buffered
        }
      },
    )
    finalUploadProgress.delete(job.id)

    logger.info('3D final R2 upload completed', {
      jobId: job.id,
      modelId: job.modelId,
      modelStorageKey,
    })

    const generationAfterUpload = await getCompletedGenerationIfClaimLost(
      job.id,
    )
    if (generationAfterUpload) {
      return {
        jobId: job.id,
        status: 'COMPLETED',
        generation: generationAfterUpload,
      }
    }

    const generation = await timer.measure(
      GENERATION_STAGE.DB_FINALIZE,
      async () => {
        const usageEntry = await createApiUsageEntry({
          userId,
          generationJobId: job.id,
          adapterType: executionRoute.adapterType,
          provider,
          modelId: job.modelId,
          requestCount,
          inputImageCount,
          outputImageCount: 0,
          width: 0,
          height: 0,
          durationMs: Date.now() - job.createdAt.getTime(),
          wasSuccessful: true,
        })

        const createdGeneration = await createGeneration({
          url: glbPublicUrl,
          storageKey: modelStorageKey,
          mimeType: result.contentType ?? 'model/gltf-binary',
          width: 0,
          height: 0,
          modelUrl: glbPublicUrl,
          modelStorageKey,
          referenceImageUrl: queueMeta.sourceImageUrl,
          prompt: queueMeta.prompt ?? '',
          model: job.modelId,
          provider,
          requestCount,
          outputType: 'MODEL_3D',
          userId,
          projectId: queueMeta.projectId,
          isFreeGeneration: modelConfig?.freeTier === true,
          snapshot: withGenerationObservability(
            {
              sourceImageUrl: queueMeta.sourceImageUrl,
              multiViewImages: queueMeta.multiViewImages ?? null,
              sourceQuality: queueMeta.sourceQuality ?? null,
              previewMode: queueMeta.mode ?? 'none',
              meshPreviewUrl: queueMeta.mesh?.modelUrl ?? null,
            },
            timer,
          ),
        })

        await Promise.all([
          attachUsageEntryToGeneration(usageEntry.id, createdGeneration.id),
          completeGenerationJob(job.id, {
            generationId: createdGeneration.id,
            requestCount,
          }),
        ])

        return createdGeneration
      },
    )

    timer.setContext({ generationId: generation.id })
    timer.log()

    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation: mapGenerationToRecord(generation),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist 3D model'

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: 'QUEUED',
        errorMessage: message,
      },
    })

    throw error
  }
}

function count3DMultiViewImages(
  images: Generate3DRequest['multiViewImages'] | undefined,
): number {
  if (!images) return 0
  return [
    images.backImageUrl,
    images.leftImageUrl,
    images.rightImageUrl,
    images.topImageUrl,
    images.bottomImageUrl,
    images.leftFrontImageUrl,
    images.rightFrontImageUrl,
  ].filter(Boolean).length
}

function build3DSourceQualityMessage(report: {
  width: number
  height: number
  blockingIssues: string[]
}): string {
  const issueMessages = report.blockingIssues.map((issue) => {
    if (issue === 'too_small') {
      return `source image is too small (${report.width}x${report.height}); use at least 512px on the short edge`
    }
    if (issue === 'extreme_aspect_ratio') {
      return `source image aspect ratio is too extreme (${report.width}x${report.height}); use a centered square or near-square image`
    }
    if (issue === 'multi_subject') {
      return 'source image appears to contain multiple main subjects; use one isolated subject'
    }
    if (issue === 'occluded_subject') {
      return 'source image subject appears occluded; use a clear full subject'
    }
    if (issue === 'cropped_subject') {
      return 'source image silhouette appears cropped; keep the full subject visible'
    }
    if (issue === 'strong_shadow') {
      return 'source image has strong shadows; use even lighting'
    }
    if (issue === 'busy_background') {
      return 'source image background appears cluttered; use a simple background'
    }
    return 'source image dimensions could not be read'
  })

  return `Source image is not suitable for 3D generation: ${issueMessages.join('; ')}.`
}

function isTransient3DQueueStatusError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const detail = error instanceof ProviderError ? error.detail : ''
  const lower = `${message} ${detail}`.toLowerCase()

  if (error instanceof ProviderError) {
    const isRetryableStatus = [408, 429, 500, 502, 503, 504].includes(
      error.status,
    )
    if (!isRetryableStatus) return false
    return (
      lower.includes('[3d-status-fetch-error]') ||
      lower.includes('[3d-status-http-') ||
      lower.includes('[3d-result-fetch-error]') ||
      lower.includes('[3d-result-read-error]') ||
      lower.includes('fetch failed') ||
      lower.includes('timeout') ||
      lower.includes('aborted') ||
      lower.includes('terminated')
    )
  }

  return (
    lower.includes('fetch failed') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('terminated')
  )
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
