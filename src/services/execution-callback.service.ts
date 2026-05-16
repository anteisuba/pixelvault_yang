import 'server-only'

import { z } from 'zod'

import type { ExecutionCallbackPayload } from '@/types'
import {
  ExecutionCallbackErrorDataSchema,
  ExecutionCallbackResultDataSchema,
} from '@/types'
import { db } from '@/lib/db'
import { ApiRequestError, GenerationValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
  withGenerationObservability,
} from '@/lib/generation-observability'
import { createGeneration } from '@/services/generation.service'
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
    outputType: z.enum(['VIDEO', 'AUDIO']).optional(),
    referenceImageUrl: z.string().url().optional(),
    characterCardIds: z.array(z.string().min(1)).optional(),
    projectId: z.string().min(1).optional(),
    isFreeGeneration: z.boolean().optional(),
    audioFormat: z.string().min(1).optional(),
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
    })

    logger.error('Execution callback result reported provider failure', {
      runId: job.id,
      previousJobStatus: jobStatus,
    })

    return {
      runId: job.id,
      jobStatus: 'FAILED',
      action: 'failed',
    }
  }

  const resultData = parseResultData(payload)

  try {
    const metadata = parseWorkerJobMetadata(job.externalRequestId)
    const outputType = metadata.outputType ?? 'VIDEO'
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
    const storageKey = generateStorageKey(
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

    const uploadResult = await timer.measure(GENERATION_STAGE.R2_UPLOAD, () =>
      streamUploadToR2({
        sourceUrl: resultData.artifactUrl,
        key: storageKey,
        mimeType,
        fetchHeaders: resultData.fetchHeaders,
      }),
    )
    timer.addNote('result_download_streamed_with_r2_upload')
    const posterAsset =
      outputType === 'VIDEO'
        ? await timer.measure(
            GENERATION_STAGE.THUMBNAIL_GENERATION,
            tryCreateVideoPosterAsset,
          )
        : undefined

    const generation = await timer.measure(GENERATION_STAGE.DB_FINALIZE, () =>
      db.$transaction(async (tx) => {
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
    const message =
      error instanceof Error
        ? error.message
        : 'Execution result finalization failed'

    await failGenerationJob(job.id, {
      requestCount: resultData.requestCount,
      errorMessage: message,
    })

    logger.error('Execution callback result finalization failed', {
      runId: job.id,
      previousJobStatus: jobStatus,
      error: message,
    })

    return {
      runId: job.id,
      jobStatus: 'FAILED',
      action: 'failed',
    }
  }
}
