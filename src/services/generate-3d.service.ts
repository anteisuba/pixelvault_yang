import 'server-only'

import { z } from 'zod'

import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import {
  EXECUTION_INTERNAL,
  EXECUTION_WORKER,
  EXECUTION_WORKFLOW_IDS,
} from '@/constants/execution'
import {
  MODEL_3D_JOB_STAGE,
  MODEL_3D_JOB_STAGES,
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
import {
  inspect3DSourceImageQuality,
  prepare3DSourceImage,
} from '@/services/image/image-3d-prep.service'
import {
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { buildGenerationFailureResponseFields } from '@/services/generation-failure-response.service'
import { notifyWorkerCancelBestEffort } from '@/services/generation-cancel.service'
import { ensureUser } from '@/services/user.service'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/image/generate-image.service'
import {
  buildInternalUrl,
  dispatchHyper3DRodinWorkerRun,
  dispatchHunyuan3DWorkerRun,
  ExecutionWorkerDispatchError,
} from '@/services/execution-worker.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

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

type Model3DQueueMeta = z.infer<typeof Model3DQueueMetaSchema>
type GenerationExecutionRoute = Awaited<
  ReturnType<typeof resolveGenerationRoute>
>

const finalizing3DJobs = new Set<string>()

/**
 * PR2-B3: in-memory upload progress per job. Best-effort — readable when the
 * status poll hits the same worker that's running the R2 upload. On a cold
 * start or a different Fluid Compute instance the entry won't be visible and
 * the client UI degrades from "X / Y MB" to indeterminate, but the upload
 * itself still completes correctly.
 */
const finalUploadProgress = new Map<string, { loaded: number; total: number }>()

interface Model3DStatusJob {
  id: string
  userId: string
  status: string
  modelId: string
  createdAt: Date
  errorMessage?: string | null
  errorCode?: string | null
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

  // Every catalog 3D model resolves to one of the two adapters above (see
  // MODEL_3D_OPTIONS in constants/models/model-3d.ts) — no adapter
  // implements a 3D submission method anymore; fal.adapter.ts's inline
  // submitModel3DToQueue was retired once the Worker took over dispatch for
  // both FAL and Hyper3D Rodin. Reaching here means a 3D model was
  // configured with a third, unsupported adapter.
  throw new GenerateImageServiceError(
    'UNSUPPORTED_MODEL',
    '3D generation is not supported for this provider',
    400,
  )
}

// ─── Check 3D generation status ─────────────────────────────────

/**
 * 3D's queue metadata (`Model3DQueueMetaSchema`) names its source image
 * `sourceImageUrl`, not `referenceImageUrl`/`referenceImages` like the
 * IMAGE/VIDEO/AUDIO metadata schema — so it needs its own presence check
 * rather than the shared `getImageInputCount`, which would always read 0 for
 * a 3D job (silently disabling reference-image error classification for it,
 * even on a genuine "your source image is invalid" failure). Deliberately
 * lenient (never throws): a malformed or absent value just means "no image".
 */
function has3DSourceImage(externalRequestId: string | null): boolean {
  if (!externalRequestId) return false
  try {
    const parsed: unknown = JSON.parse(externalRequestId)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      Boolean((parsed as Record<string, unknown>).sourceImageUrl)
    )
  } catch {
    return false
  }
}

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
      ...buildGenerationFailureResponseFields({
        ...job,
        hasReferenceImage: has3DSourceImage(job.externalRequestId),
      }),
    }
  }

  if (job.status === 'CANCELLED') {
    return { jobId: job.id, status: 'CANCELLED' }
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
      const errorMessage =
        'Worker job timed out without callback (exceeded stale threshold)'
      await failGenerationJob(job.id, {
        errorMessage,
        errorCode: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
      })
      logger.warn('3D worker job marked FAILED by stale sweeper', {
        jobId: job.id,
        userId,
        ageMs: Date.now() - job.updatedAt.getTime(),
      })
      return {
        jobId: job.id,
        status: 'FAILED',
        error: errorMessage,
        errorCode: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
      }
    }

    return {
      jobId: job.id,
      status: job.status === 'RUNNING' ? 'IN_PROGRESS' : 'IN_QUEUE',
    }
  }

  // Legacy inline-dispatched job (created before fal.ai 3D queue submission
  // moved behind the Cloudflare Worker — see submitWorker3DGeneration).
  // fal.adapter.ts no longer implements checkModel3DQueueStatus / the
  // mesh-first submitModel3DToQueue continuation, and submit3DGeneration-
  // ForUserId can no longer create a job that lands here (it always either
  // dispatches to the Worker or throws UNSUPPORTED_MODEL before a job
  // exists). Any pre-Worker job that was still RUNNING has long since been
  // reaped FAILED by the execution sweeper cron (STALE_JOB_THRESHOLD_MS,
  // see execution-sweeper.service.ts) — this branch is unreachable in
  // practice and only guards against a corrupt/foreign externalRequestId.
  throw new GenerateImageServiceError(
    'UNSUPPORTED_MODEL',
    '3D status check is not supported for this provider',
    400,
  )
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
  // loadStagedJob 404s on a missing/foreign job and 400s on anything not
  // parked at MESH_READY. No job can reach MESH_READY anymore — that stage
  // was only ever written by the retired fal.ai inline mesh-first flow (see
  // submit3DGenerationForUserId) — so this always throws for real data;
  // kept so a missing/foreign job still reports 404 instead of a blanket 400.
  await loadStagedJob({
    userId,
    jobId: input.jobId,
    expectedStages: [MODEL_3D_JOB_STAGE.MESH_READY],
  })

  // Unreachable in practice (see above), kept as an explicit contract: no
  // adapter has implemented a 3D submission method since fal.adapter.ts's
  // inline submitModel3DToQueue was retired.
  throw new GenerateImageServiceError(
    'UNSUPPORTED_MODEL',
    '3D generation is not supported for this provider',
    400,
  )
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
  // See continue3DGenerationForUserId: no job can reach MESH_READY anymore,
  // so this always throws for real data. Kept so a missing/foreign job still
  // reports 404 instead of a blanket 400.
  await loadStagedJob({
    userId,
    jobId: input.jobId,
    expectedStages: [MODEL_3D_JOB_STAGE.MESH_READY],
  })

  throw new GenerateImageServiceError(
    'UNSUPPORTED_MODEL',
    '3D generation is not supported for this provider',
    400,
  )
}

/**
 * Abort an in-flight 3D job. Allowed in any non-completed state; idempotent
 * on already-terminal jobs (no-op, just reflects current state back). CAS to
 * `CANCELLED` — see `generation-cancel.service.ts`'s
 * `cancelGenerationJobs`, which this mirrors for the single-job 3D route
 * (kept separate rather than delegated to, since this one takes `userId`
 * directly and `cancelGenerationJobs` resolves it from `clerkId`).
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

  if (job.status === 'QUEUED' || job.status === 'RUNNING') {
    const { count } = await db.generationJob.updateMany({
      where: { id: job.id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED' },
    })
    if (count > 0) {
      await notifyWorkerCancelBestEffort({
        id: job.id,
        provider: job.provider,
      })
    }
  }

  finalUploadProgress.delete(job.id)
  finalizing3DJobs.delete(job.id)

  return check3DGenerationStatusForUserId(userId, job.id)
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
    // resolvedApiKeyId 非空 = 调用方自带 key(BYOK)，平台没掏钱。
    isPlatformFunded: !executionRoute.resolvedApiKeyId,
  })

  const modelConfig =
    executionRoute.modelConfig ?? getModelById(executionRoute.modelId)
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

  // Persist callback-critical context before dispatch. Unlike the workflow id
  // (which is always the job id), these source/lineage fields cannot be
  // reconstructed if the worker accepts the run and the following DB write
  // fails.
  const isRodinMeshFirstJob =
    executionRoute.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN &&
    input.rodinMeshFirst === true

  try {
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

    await dispatch(workerContext)
  } catch (error) {
    if (
      error instanceof ExecutionWorkerDispatchError &&
      error.outcome === 'unknown'
    ) {
      logger.warn(
        '3D worker dispatch outcome is unknown; preserving active job for a late callback',
        {
          jobId: generationJob.id,
          error: error.message,
          upstreamStatus: error.upstreamStatus,
        },
      )
      throw error
    }

    await failGenerationJob(generationJob.id, {
      errorMessage:
        error instanceof Error ? error.message : 'Worker dispatch failed',
    })
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : '3D generation dispatch failed'
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, 502)
  }

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
  modelConfig: GenerationExecutionRoute['modelConfig']
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
      externalModelId:
        executionRoute.externalModelId ??
        getExecutionModelId(executionRoute.modelId),
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
