import 'server-only'

import { z } from 'zod'

import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import type { ExecutionCallbackPayload } from '@/types'
import {
  ExecutionCallbackErrorDataSchema,
  ExecutionCallbackResultDataSchema,
} from '@/types'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { ApiRequestError, GenerationValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
  withGenerationObservability,
} from '@/lib/generation-observability'
import { createGeneration } from '@/services/generation.service'
import { buildRecipeSnapshotForUser } from '@/services/prompts/recipe.service'
import { enqueueImagePreviewDerivatives } from '@/services/image/image-preview-derivative.service'
import {
  createVideoPosterAsset,
  generateStorageKey,
  streamUploadToR2,
} from '@/services/storage/r2'
import {
  completeGenerationJob,
  createApiUsageEntry,
  failGenerationJob,
} from '@/services/usage.service'

const GENERATION_JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const

const TERMINAL_GENERATION_JOB_STATUSES = ['COMPLETED', 'FAILED'] as const

export type ExecutionCallbackJobStatus =
  (typeof GENERATION_JOB_STATUSES)[number]

export type ExecutionCallbackAction =
  | 'logged'
  | 'completed'
  | 'failed'
  | 'ignored-terminal'
  | 'ignored-concurrent'
  | 'not-found'

export interface CallbackResult {
  runId: string
  jobStatus: ExecutionCallbackJobStatus
  action: ExecutionCallbackAction
}

function isTerminalGenerationJobStatus(
  status: ExecutionCallbackJobStatus,
): boolean {
  return TERMINAL_GENERATION_JOB_STATUSES.some(
    (terminalStatus) => terminalStatus === status,
  )
}

function toExecutionCallbackJobStatus(
  status: string,
): ExecutionCallbackJobStatus {
  const parsedStatus = GENERATION_JOB_STATUSES.find((item) => item === status)

  if (!parsedStatus) {
    throw new ApiRequestError(
      'EXECUTION_RUN_STATUS_INVALID',
      500,
      'errors.common.unexpected',
      'Execution run has an invalid job status.',
    )
  }

  return parsedStatus
}

const WorkerJobMetadataSchema = ExecutionCallbackResultDataSchema.pick({
  providerMetadata: true,
})
  .partial()
  .extend({
    outputType: z.enum(['VIDEO', 'AUDIO', 'MODEL_3D', 'IMAGE']).optional(),
    referenceImageUrl: z.string().url().optional(),
    referenceImages: z.array(z.string().url()).optional(),
    characterCardIds: z.array(z.string().min(1)).optional(),
    projectId: z.string().min(1).optional(),
    isFreeGeneration: z.boolean().optional(),
    audioFormat: z.string().min(1).optional(),
    // IMAGE async metadata — mirrors ImageQueueMetadata in submit-image.service
    aspectRatio: z.string().min(1).optional(),
    creditCost: z.number().int().positive().optional(),
    apiKeyId: z.string().min(1).optional(),
    originalModelId: z.string().min(1).optional(),
    fallbackUsed: z.boolean().optional(),
    advancedParams: z.unknown().optional(),
    recipeUsage: z.unknown().optional(),
    runGroupId: z.string().min(1).optional(),
    runGroupType: z.enum(['single', 'compare', 'variant']).optional(),
    runGroupIndex: z.number().int().min(0).optional(),
    multiViewBatchId: z.string().min(1).optional(),
    multiViewAngle: z.enum(['back', 'left', 'right']).optional(),
    sourceGenerationId: z.string().min(1).optional(),
    studioSnapshot: z
      .object({
        freePrompt: z.string().optional(),
        characterCardId: z.string().optional(),
        backgroundCardId: z.string().optional(),
        styleCardId: z.string().optional(),
      })
      .optional(),
    /**
     * Hyper3D Rodin mesh-first: true on the first-pass mesh-only Generation.
     * Mirrored from the job's queue meta — see `submitWorker3DGeneration` in
     * generate-3d.service.ts. The UI uses it to surface "Continue with
     * textures" / "Keep as final" affordances on the resulting Generation.
     */
    rodinMeshFirst: z.boolean().optional(),
    /**
     * Hyper3D Rodin mesh-first: lineage pointer from a textured continuation
     * back to its mesh-only parent Generation. Lets the gallery hide the
     * mesh-only preview once its textured continuation lands.
     */
    parentGenerationId: z.string().min(1).optional(),
  })

function parseWorkerJobMetadata(value: string | null) {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value)
    const result = WorkerJobMetadataSchema.safeParse(parsed)
    return result.success ? result.data : {}
  } catch {
    return {}
  }
}

function getImageInputCount(metadata: {
  referenceImageUrl?: string
  referenceImages?: string[]
}): number {
  return (
    metadata.referenceImages?.length ?? (metadata.referenceImageUrl ? 1 : 0)
  )
}

function getDefaultMimeType(outputType: 'VIDEO' | 'AUDIO'): string {
  return outputType === 'AUDIO' ? 'audio/wav' : 'video/mp4'
}

function inferAudioFormat(mimeType: string, configuredFormat?: string): string {
  if (configuredFormat) return configuredFormat

  const normalized = mimeType.toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('opus')) return 'opus'
  return 'mp3'
}

function parseResultData(payload: ExecutionCallbackPayload) {
  const result = ExecutionCallbackResultDataSchema.safeParse(payload.data)

  if (!result.success) {
    throw new GenerationValidationError(
      result.error.issues.map((issue) => ({
        field: String(issue.path?.join('.') ?? ''),
        message: issue.message,
      })),
    )
  }

  return result.data
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function buildProviderFailureJson(params: {
  job: {
    provider: string
    modelId: string
    adapterType: string
  }
  error: string
  errorCode?: string
  providerMetadata?: Record<string, unknown>
}): Prisma.InputJsonValue {
  return toPrismaJson({
    provider: params.job.provider,
    modelId: params.job.modelId,
    adapterType: params.job.adapterType,
    error: params.error,
    errorCode: params.errorCode,
    providerMetadata: params.providerMetadata,
  })
}

export async function handleExecutionCallback(
  payload: ExecutionCallbackPayload,
): Promise<CallbackResult> {
  const job = await db.generationJob.findUnique({
    where: { id: payload.runId },
    select: {
      id: true,
      userId: true,
      status: true,
      adapterType: true,
      provider: true,
      modelId: true,
      prompt: true,
      externalRequestId: true,
      createdAt: true,
    },
  })

  if (!job) {
    logger.warn('Execution callback run not found', {
      runId: payload.runId,
      kind: payload.kind,
    })

    throw new ApiRequestError(
      'EXECUTION_RUN_NOT_FOUND',
      404,
      'errors.execution.runNotFound',
      'Execution run not found.',
    )
  }

  const jobStatus = toExecutionCallbackJobStatus(job.status)

  if (isTerminalGenerationJobStatus(jobStatus)) {
    logger.info('Execution callback ignored for terminal run', {
      runId: job.id,
      kind: payload.kind,
      jobStatus,
    })

    return {
      runId: job.id,
      jobStatus,
      action: 'ignored-terminal',
    }
  }

  switch (payload.kind) {
    case 'ping':
      logger.info('Execution callback ping logged', {
        runId: job.id,
        jobStatus,
        ts: payload.ts,
      })
      break
    case 'status':
      logger.info('Execution callback status logged', {
        runId: job.id,
        jobStatus,
        ts: payload.ts,
      })
      break
    case 'result':
      return finalizeExecutionResult(payload, job, jobStatus)
  }

  return {
    runId: job.id,
    jobStatus,
    action: 'logged',
  }
}

class ConcurrentCallbackError extends Error {
  constructor(readonly runId: string) {
    super(`Concurrent execution callback for already-finalized run ${runId}`)
    this.name = 'ConcurrentCallbackError'
  }
}

/**
 * CAS guard used inside finalize transactions. Atomically flips the job
 * RUNNING → COMPLETED; a concurrent duplicate `result` callback that loses the
 * race sees count === 0 and must abort, preventing a double Generation + double
 * ApiUsageLedger (neither row has a unique constraint to catch the duplicate).
 */
async function claimRunningJobForFinalize(
  tx: Pick<typeof db, 'generationJob'>,
  jobId: string,
): Promise<boolean> {
  const claim = await tx.generationJob.updateMany({
    where: { id: jobId, status: 'RUNNING' },
    data: { status: 'COMPLETED' },
  })
  return claim.count === 1
}

async function finalizeExecutionResult(
  payload: ExecutionCallbackPayload,
  job: {
    id: string
    userId: string
    status: string
    adapterType: string
    provider: string
    modelId: string
    prompt: string | null
    externalRequestId: string | null
    createdAt: Date
  },
  jobStatus: ExecutionCallbackJobStatus,
): Promise<CallbackResult> {
  const errorResult = ExecutionCallbackErrorDataSchema.safeParse(payload.data)

  if (errorResult.success) {
    await failGenerationJob(job.id, {
      requestCount: errorResult.data.requestCount,
      errorMessage: errorResult.data.error,
      errorCode: errorResult.data.errorCode,
      providerFailure: buildProviderFailureJson({
        job,
        error: errorResult.data.error,
        errorCode: errorResult.data.errorCode,
        providerMetadata: errorResult.data.providerMetadata,
      }),
    })

    logger.error('Execution callback result reported provider failure', {
      runId: job.id,
      previousJobStatus: jobStatus,
      failureKind: 'provider',
      error: errorResult.data.error,
      errorCode: errorResult.data.errorCode,
      requestCount: errorResult.data.requestCount,
      providerMetadata: errorResult.data.providerMetadata,
    })

    return {
      runId: job.id,
      jobStatus: 'FAILED',
      action: 'failed',
    }
  }

  const resultData = parseResultData(payload)
  const metadata = parseWorkerJobMetadata(job.externalRequestId)
  const outputType = metadata.outputType ?? 'VIDEO'

  if (outputType === 'MODEL_3D') {
    return finalizeModel3DResult(payload, resultData, job, metadata)
  }

  if (outputType === 'IMAGE') {
    return finalizeImageResult(payload, resultData, job, metadata)
  }

  try {
    const timer = new GenerationStageTimer({
      outputType,
      jobId: job.id,
      modelId: job.modelId,
      adapterType: job.adapterType,
      provider: job.provider,
    })
    timer.setDuration(
      GENERATION_STAGE.PROVIDER_WAIT_POLL,
      Date.now() - job.createdAt.getTime(),
    )
    const mimeType = resultData.mimeType ?? getDefaultMimeType(outputType)
    const workerUploadedKey =
      outputType === 'AUDIO'
        ? resultData.audioR2Key
        : outputType === 'VIDEO'
          ? resultData.videoR2Key
          : undefined
    const storageKey =
      workerUploadedKey ??
      generateStorageKey(
        outputType,
        job.userId,
        outputType === 'AUDIO'
          ? inferAudioFormat(mimeType, metadata.audioFormat)
          : undefined,
      )

    async function tryCreateVideoPosterAsset() {
      if (outputType !== 'VIDEO') return undefined
      if (!resultData.thumbnailUrl) {
        timer.addNote('video_poster_unavailable')
        return undefined
      }

      try {
        return await createVideoPosterAsset({
          sourceUrl: resultData.thumbnailUrl,
          sourceStorageKey: storageKey,
          fetchHeaders: resultData.fetchHeaders,
        })
      } catch (error) {
        logger.warn('Execution video poster derivative creation failed', {
          runId: job.id,
          storageKey,
          thumbnailUrl: resultData.thumbnailUrl,
          error: error instanceof Error ? error.message : String(error),
        })
        timer.addNote('video_poster_generation_failed')
        return undefined
      }
    }

    const uploadResult = workerUploadedKey
      ? { publicUrl: resultData.artifactUrl }
      : await timer.measure(GENERATION_STAGE.R2_UPLOAD, () =>
          streamUploadToR2({
            sourceUrl: resultData.artifactUrl,
            key: storageKey,
            mimeType,
            fetchHeaders: resultData.fetchHeaders,
          }),
        )
    timer.addNote(
      workerUploadedKey
        ? 'result_uploaded_by_worker'
        : 'result_download_streamed_with_r2_upload',
    )
    const posterAsset =
      outputType === 'VIDEO'
        ? await timer.measure(
            GENERATION_STAGE.THUMBNAIL_GENERATION,
            tryCreateVideoPosterAsset,
          )
        : undefined

    const generation = await timer.measure(GENERATION_STAGE.DB_FINALIZE, () =>
      db.$transaction(async (tx) => {
        if (!(await claimRunningJobForFinalize(tx, job.id))) {
          throw new ConcurrentCallbackError(job.id)
        }
        const createdGeneration = await createGeneration(
          {
            url: uploadResult.publicUrl,
            storageKey,
            mimeType,
            thumbnailUrl: posterAsset?.thumbnailUrl,
            thumbnailStorageKey: posterAsset?.thumbnailStorageKey,
            width: outputType === 'VIDEO' ? (resultData.width ?? 0) : 0,
            height: outputType === 'VIDEO' ? (resultData.height ?? 0) : 0,
            duration: resultData.duration,
            referenceImageUrl:
              outputType === 'VIDEO' ? metadata.referenceImageUrl : undefined,
            prompt: job.prompt ?? '',
            model: job.modelId,
            provider: job.provider,
            requestCount: resultData.requestCount ?? 1,
            seed: resultData.seed != null ? BigInt(resultData.seed) : undefined,
            outputType,
            userId: job.userId,
            characterCardIds:
              outputType === 'VIDEO' ? metadata.characterCardIds : undefined,
            projectId: metadata.projectId,
            isFreeGeneration: metadata.isFreeGeneration,
            snapshot: withGenerationObservability(
              {
                executionCallback: {
                  runId: payload.runId,
                  ts: payload.ts,
                  artifactUrl: resultData.artifactUrl,
                  thumbnailUrl: resultData.thumbnailUrl,
                  providerMetadata: resultData.providerMetadata,
                  cost: resultData.cost,
                },
              },
              timer,
            ),
          },
          tx,
        )

        await completeGenerationJob(
          job.id,
          {
            generationId: createdGeneration.id,
            requestCount: resultData.requestCount ?? 1,
          },
          tx,
        )

        await createApiUsageEntry(
          {
            userId: job.userId,
            generationId: createdGeneration.id,
            generationJobId: job.id,
            adapterType: job.adapterType,
            provider: job.provider,
            modelId: job.modelId,
            requestCount: resultData.requestCount ?? 1,
            inputImageCount:
              outputType === 'VIDEO' && metadata.referenceImageUrl ? 1 : 0,
            outputImageCount: 0,
            width: outputType === 'VIDEO' ? resultData.width : undefined,
            height: outputType === 'VIDEO' ? resultData.height : undefined,
            durationMs: Date.now() - job.createdAt.getTime(),
            wasSuccessful: true,
          },
          tx,
        )

        return createdGeneration
      }),
    )

    logger.info('Execution callback result finalized', {
      runId: job.id,
      generationId: generation.id,
    })
    timer.setContext({ generationId: generation.id })
    timer.log({ runId: job.id })

    return {
      runId: job.id,
      jobStatus: 'COMPLETED',
      action: 'completed',
    }
  } catch (error) {
    if (error instanceof ConcurrentCallbackError) {
      logger.info('Concurrent execution callback ignored (already finalized)', {
        runId: job.id,
      })
      return {
        runId: job.id,
        jobStatus: 'COMPLETED',
        action: 'ignored-concurrent',
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Execution result finalization failed'

    await failGenerationJob(job.id, {
      requestCount: resultData.requestCount,
      errorMessage: message,
      errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
      providerFailure: buildProviderFailureJson({
        job,
        error: message,
        errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
        providerMetadata: resultData.providerMetadata,
      }),
    })

    logger.error('Execution callback result finalization failed', {
      runId: job.id,
      previousJobStatus: jobStatus,
      failureKind: 'finalization',
      error: message,
    })

    return {
      runId: job.id,
      jobStatus: 'FAILED',
      action: 'failed',
    }
  }
}

async function finalizeModel3DResult(
  payload: ExecutionCallbackPayload,
  resultData: ReturnType<typeof parseResultData>,
  job: {
    id: string
    userId: string
    status: string
    adapterType: string
    provider: string
    modelId: string
    prompt: string | null
    externalRequestId: string | null
    createdAt: Date
  },
  metadata: ReturnType<typeof parseWorkerJobMetadata>,
): Promise<CallbackResult> {
  if (!resultData.glbR2Key) {
    const message = 'MODEL_3D callback missing glbR2Key'
    await failGenerationJob(job.id, {
      errorMessage: message,
      errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
      providerFailure: buildProviderFailureJson({
        job,
        error: message,
        errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
        providerMetadata: resultData.providerMetadata,
      }),
    })
    logger.error(
      'Execution callback MODEL_3D finalization failed: missing glbR2Key',
      {
        runId: job.id,
        failureKind: 'finalization',
        error: message,
      },
    )
    return { runId: job.id, jobStatus: 'FAILED', action: 'failed' }
  }

  const timer = new GenerationStageTimer({
    outputType: 'MODEL_3D',
    jobId: job.id,
    modelId: job.modelId,
    adapterType: job.adapterType,
    provider: job.provider,
  })
  timer.setDuration(
    GENERATION_STAGE.PROVIDER_WAIT_POLL,
    Date.now() - job.createdAt.getTime(),
  )

  try {
    const generation = await timer.measure(GENERATION_STAGE.DB_FINALIZE, () =>
      db.$transaction(async (tx) => {
        if (!(await claimRunningJobForFinalize(tx, job.id))) {
          throw new ConcurrentCallbackError(job.id)
        }
        const createdGeneration = await createGeneration(
          {
            url: resultData.artifactUrl,
            storageKey: resultData.glbR2Key!,
            mimeType: 'model/gltf-binary',
            modelUrl: resultData.artifactUrl,
            modelStorageKey: resultData.glbR2Key,
            width: 0,
            height: 0,
            referenceImageUrl: metadata.referenceImageUrl,
            prompt: job.prompt ?? '',
            model: job.modelId,
            provider: job.provider,
            requestCount: resultData.requestCount ?? 1,
            outputType: 'MODEL_3D',
            userId: job.userId,
            projectId: metadata.projectId,
            isFreeGeneration: metadata.isFreeGeneration,
            snapshot: withGenerationObservability(
              {
                executionCallback: {
                  runId: payload.runId,
                  ts: payload.ts,
                  artifactUrl: resultData.artifactUrl,
                  providerMetadata: resultData.providerMetadata,
                  cost: resultData.cost,
                },
                // Rodin mesh-first lineage. `rodinMeshFirst=true` marks this
                // Generation as a mesh-only preview that the UI can offer to
                // continue with textures or keep as final. `parentGenerationId`
                // links a textured continuation back to its mesh-only parent.
                ...(metadata.rodinMeshFirst && { rodinMeshFirst: true }),
                ...(metadata.parentGenerationId && {
                  parentGenerationId: metadata.parentGenerationId,
                }),
              },
              timer,
            ),
          },
          tx,
        )

        await completeGenerationJob(
          job.id,
          {
            generationId: createdGeneration.id,
            requestCount: resultData.requestCount ?? 1,
          },
          tx,
        )

        await createApiUsageEntry(
          {
            userId: job.userId,
            generationId: createdGeneration.id,
            generationJobId: job.id,
            adapterType: job.adapterType,
            provider: job.provider,
            modelId: job.modelId,
            requestCount: resultData.requestCount ?? 1,
            inputImageCount: metadata.referenceImageUrl ? 1 : 0,
            outputImageCount: 0,
            durationMs: Date.now() - job.createdAt.getTime(),
            wasSuccessful: true,
          },
          tx,
        )

        return createdGeneration
      }),
    )

    logger.info('Execution callback MODEL_3D result finalized', {
      runId: job.id,
      generationId: generation.id,
      ...(metadata.rodinMeshFirst && { rodinMeshFirst: true }),
      ...(metadata.parentGenerationId && {
        parentGenerationId: metadata.parentGenerationId,
      }),
    })
    timer.setContext({ generationId: generation.id })
    timer.log({ runId: job.id })

    return { runId: job.id, jobStatus: 'COMPLETED', action: 'completed' }
  } catch (error) {
    if (error instanceof ConcurrentCallbackError) {
      logger.info('Concurrent execution callback ignored (already finalized)', {
        runId: job.id,
      })
      return {
        runId: job.id,
        jobStatus: 'COMPLETED',
        action: 'ignored-concurrent',
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : 'MODEL_3D result finalization failed'

    await failGenerationJob(job.id, {
      requestCount: resultData.requestCount,
      errorMessage: message,
      errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
      providerFailure: buildProviderFailureJson({
        job,
        error: message,
        errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
        providerMetadata: resultData.providerMetadata,
      }),
    })

    logger.error('Execution callback MODEL_3D result finalization failed', {
      runId: job.id,
      failureKind: 'finalization',
      error: message,
    })

    return { runId: job.id, jobStatus: 'FAILED', action: 'failed' }
  }
}

async function finalizeImageResult(
  payload: ExecutionCallbackPayload,
  resultData: ReturnType<typeof parseResultData>,
  job: {
    id: string
    userId: string
    status: string
    adapterType: string
    provider: string
    modelId: string
    prompt: string | null
    externalRequestId: string | null
    createdAt: Date
  },
  metadata: ReturnType<typeof parseWorkerJobMetadata>,
): Promise<CallbackResult> {
  const timer = new GenerationStageTimer({
    outputType: 'IMAGE',
    jobId: job.id,
    modelId: job.modelId,
    adapterType: job.adapterType,
    provider: job.provider,
  })
  timer.setDuration(
    GENERATION_STAGE.PROVIDER_WAIT_POLL,
    Date.now() - job.createdAt.getTime(),
  )

  const mimeType = resultData.mimeType ?? 'image/png'
  const workerUploadedKey = resultData.imageR2Key
  const storageKey =
    workerUploadedKey ?? generateStorageKey('IMAGE', job.userId)
  const requestCount = resultData.requestCount ?? metadata.creditCost ?? 1
  const seedValue = (metadata.advancedParams as { seed?: number } | undefined)
    ?.seed

  try {
    const uploadResult = workerUploadedKey
      ? { publicUrl: resultData.artifactUrl }
      : await timer.measure(GENERATION_STAGE.R2_UPLOAD, () =>
          streamUploadToR2({
            sourceUrl: resultData.artifactUrl,
            key: storageKey,
            mimeType,
            fetchHeaders: resultData.fetchHeaders,
          }),
        )
    timer.addNote(
      workerUploadedKey
        ? 'image_result_uploaded_by_worker'
        : 'image_result_download_streamed_with_r2_upload',
    )

    const recipeSnapshot = metadata.recipeUsage
      ? await buildRecipeSnapshotForUser(
          job.userId,
          metadata.recipeUsage as Parameters<
            typeof buildRecipeSnapshotForUser
          >[1],
        )
      : undefined

    const generation = await timer.measure(GENERATION_STAGE.DB_FINALIZE, () =>
      db.$transaction(async (tx) => {
        if (!(await claimRunningJobForFinalize(tx, job.id))) {
          throw new ConcurrentCallbackError(job.id)
        }
        const createdGeneration = await createGeneration(
          {
            url: uploadResult.publicUrl,
            storageKey,
            mimeType,
            width: resultData.width ?? 0,
            height: resultData.height ?? 0,
            referenceImageUrl: metadata.referenceImageUrl,
            prompt: job.prompt ?? '',
            model: job.modelId,
            provider: job.provider,
            requestCount,
            isFreeGeneration: metadata.isFreeGeneration,
            outputType: 'IMAGE',
            userId: job.userId,
            characterCardIds: metadata.characterCardIds,
            projectId: metadata.projectId,
            recipeSnapshot,
            seed: seedValue != null ? BigInt(seedValue) : undefined,
            runGroupId: metadata.runGroupId,
            runGroupType: metadata.runGroupType,
            runGroupIndex: metadata.runGroupIndex,
            snapshot: withGenerationObservability(
              {
                ...metadata.studioSnapshot,
                compiledPrompt: job.prompt ?? '',
                modelId: job.modelId,
                aspectRatio: metadata.aspectRatio,
                advancedParams: metadata.advancedParams,
                referenceImages: metadata.referenceImages,
                isFreeGeneration: metadata.isFreeGeneration,
                creditCost: metadata.creditCost,
                seed: seedValue,
                apiKeyId: metadata.apiKeyId,
                multiViewBatchId: metadata.multiViewBatchId,
                multiViewAngle: metadata.multiViewAngle,
                sourceGenerationId: metadata.sourceGenerationId,
                executionCallback: {
                  runId: payload.runId,
                  ts: payload.ts,
                  artifactUrl: resultData.artifactUrl,
                  providerMetadata: resultData.providerMetadata,
                  cost: resultData.cost,
                },
              },
              timer,
            ),
          },
          tx,
        )

        await completeGenerationJob(
          job.id,
          { generationId: createdGeneration.id, requestCount },
          tx,
        )

        await createApiUsageEntry(
          {
            userId: job.userId,
            generationId: createdGeneration.id,
            generationJobId: job.id,
            adapterType: job.adapterType,
            provider: job.provider,
            modelId: job.modelId,
            requestCount,
            inputImageCount: getImageInputCount(metadata),
            outputImageCount: 1,
            width: resultData.width,
            height: resultData.height,
            durationMs: Date.now() - job.createdAt.getTime(),
            wasSuccessful: true,
          },
          tx,
        )

        return createdGeneration
      }),
    )

    // Thumbnail/preview derivatives run sharp in the outbox worker — best
    // effort, never block finalization.
    await enqueueImagePreviewDerivatives({
      generationJobId: job.id,
      generationId: generation.id,
      sourceUrl: uploadResult.publicUrl,
      sourceStorageKey: storageKey,
    }).catch((error: unknown) => {
      logger.warn('Image preview derivative enqueue failed (callback)', {
        runId: job.id,
        error: error instanceof Error ? error.message : String(error),
      })
    })

    logger.info('Execution callback IMAGE result finalized', {
      runId: job.id,
      generationId: generation.id,
    })
    timer.setContext({ generationId: generation.id })
    timer.log({ runId: job.id })

    return { runId: job.id, jobStatus: 'COMPLETED', action: 'completed' }
  } catch (error) {
    if (error instanceof ConcurrentCallbackError) {
      logger.info('Concurrent execution callback ignored (already finalized)', {
        runId: job.id,
      })
      return {
        runId: job.id,
        jobStatus: 'COMPLETED',
        action: 'ignored-concurrent',
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : 'IMAGE result finalization failed'

    await failGenerationJob(job.id, {
      requestCount: resultData.requestCount,
      errorMessage: message,
      errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
      providerFailure: buildProviderFailureJson({
        job,
        error: message,
        errorCode: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
        providerMetadata: resultData.providerMetadata,
      }),
    })

    logger.error('Execution callback IMAGE result finalization failed', {
      runId: job.id,
      failureKind: 'finalization',
      error: message,
    })

    return { runId: job.id, jobStatus: 'FAILED', action: 'failed' }
  }
}
