import 'server-only'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { AI_MODELS, getModelById } from '@/constants/models'
import { MODEL_3D_MULTIVIEW_MODEL_IDS } from '@/constants/model-3d-generation'
import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_NEGATIVE,
  MULTI_VIEW_PROMPTS,
} from '@/constants/three-d-ready-prompt'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'
import {
  checkImageGenerationStatus,
  submitImageGeneration,
} from '@/services/image/submit-image.service'
import { ensureUser } from '@/services/user.service'
import type {
  MultiViewGeneratedAngle,
  MultiViewGenerateRequest,
  MultiViewGenerateResponseData,
  GenerationRecord,
  MultiViewImageRecord,
  MultiViewJobRecord,
  MultiViewJobStatusRecord,
  MultiViewStatusRequest,
  MultiViewStatusResponseData,
} from '@/types'

const MultiViewJobMetadataSchema = z.object({
  outputType: z.literal('IMAGE').optional(),
  multiViewBatchId: z.string().min(1),
  multiViewAngle: z.enum(['back', 'left', 'right']),
})

type MultiViewJobMetadata = z.infer<typeof MultiViewJobMetadataSchema>

function resolveMultiViewModelId(modelId?: string): string {
  const resolved = modelId ?? AI_MODELS.FLUX_KONTEXT_MAX
  const isSupported = MODEL_3D_MULTIVIEW_MODEL_IDS.some(
    (candidate) => candidate === resolved,
  )

  if (!isSupported) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'Selected model is not supported for multi-view image generation',
      400,
    )
  }

  return resolved
}

function getProviderLabel(modelId: string): string {
  const model = getModelById(modelId)
  return model?.providerConfig.label ?? model?.adapterType ?? 'unknown'
}

function parseMultiViewJobMetadata(
  value: string | null,
): MultiViewJobMetadata | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as unknown
    const result = MultiViewJobMetadataSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function toStatusRecordStatus(
  status: string,
  hasGeneration: boolean,
): MultiViewJobStatusRecord['status'] {
  if (status === 'FAILED') return 'FAILED'
  if (status === 'QUEUED') return 'IN_QUEUE'
  if (status === 'COMPLETED' && hasGeneration) return 'COMPLETED'
  return 'IN_PROGRESS'
}

function toViewRecord(
  angle: MultiViewGeneratedAngle,
  generation: GenerationRecord,
): MultiViewImageRecord {
  return {
    id: generation.id,
    view: angle,
    url: generation.url,
    width: generation.width,
    height: generation.height,
    prompt: generation.prompt,
    model: generation.model,
    provider: generation.provider,
  }
}

function getBatchStatus(
  jobs: MultiViewJobStatusRecord[],
): MultiViewStatusResponseData['status'] {
  const completedCount = jobs.filter((job) => job.status === 'COMPLETED').length
  const terminalCount = jobs.filter(
    (job) => job.status === 'COMPLETED' || job.status === 'FAILED',
  ).length

  if (terminalCount < jobs.length) return 'IN_PROGRESS'
  return completedCount > 0 ? 'COMPLETED' : 'FAILED'
}

export async function generateMultiView(
  clerkId: string,
  input: MultiViewGenerateRequest,
): Promise<MultiViewGenerateResponseData> {
  await ensureUser(clerkId)

  const modelId = resolveMultiViewModelId(input.modelId)
  const batchId = randomUUID()
  const provider = getProviderLabel(modelId)

  const submitted = await Promise.allSettled(
    GENERATED_VIEW_ANGLES.map(async (angle): Promise<MultiViewJobRecord> => {
      const prompt = MULTI_VIEW_PROMPTS[angle]
      const result = await submitImageGeneration(
        clerkId,
        {
          prompt,
          modelId,
          apiKeyId: input.apiKeyId,
          aspectRatio: '1:1',
          referenceImages: [input.imageUrl],
          advancedParams: {
            negativePrompt: MULTI_VIEW_NEGATIVE,
          },
          projectId: input.projectId,
        },
        {},
        {
          multiViewBatchId: batchId,
          multiViewAngle: angle,
          sourceGenerationId: input.sourceGenerationId,
        },
      )

      return {
        jobId: result.jobId,
        requestId: result.requestId,
        view: angle,
        prompt,
        model: modelId,
        provider,
      }
    }),
  )

  const jobs = submitted.flatMap((result, index): MultiViewJobRecord[] => {
    if (result.status === 'fulfilled') return [result.value]

    logger.warn('Multi-view image angle dispatch failed', {
      batchId,
      angle: GENERATED_VIEW_ANGLES[index],
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    })
    return []
  })

  if (jobs.length === 0) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Multi-view image generation dispatch failed',
      502,
    )
  }

  return { batchId, jobs }
}

export async function checkMultiViewGenerationStatus(
  clerkId: string,
  input: MultiViewStatusRequest,
): Promise<MultiViewStatusResponseData> {
  const dbUser = await ensureUser(clerkId)
  const requestedJobIds = Array.from(new Set(input.jobIds))

  const jobs = await db.generationJob.findMany({
    where: { id: { in: requestedJobIds } },
    select: {
      id: true,
      userId: true,
      status: true,
      generationId: true,
      modelId: true,
      provider: true,
      prompt: true,
      errorMessage: true,
      externalRequestId: true,
    },
  })
  const jobsById = new Map(jobs.map((job) => [job.id, job]))

  const orderedJobs = requestedJobIds.map((jobId) => jobsById.get(jobId))
  const hasInvalidJob = orderedJobs.some((job) => {
    if (!job || job.userId !== dbUser.id) return true
    const metadata = parseMultiViewJobMetadata(job.externalRequestId)
    return (
      !metadata ||
      metadata.multiViewBatchId !== input.batchId ||
      metadata.outputType !== 'IMAGE'
    )
  })

  if (hasInvalidJob) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Multi-view generation job not found',
      404,
    )
  }

  const statusResults = await Promise.all(
    orderedJobs.map(async (job) => {
      if (!job) {
        throw new GenerateImageServiceError(
          'JOB_NOT_FOUND',
          'Multi-view generation job not found',
          404,
        )
      }

      const metadata = parseMultiViewJobMetadata(job.externalRequestId)
      if (!metadata) {
        throw new GenerateImageServiceError(
          'JOB_NOT_FOUND',
          'Multi-view generation job not found',
          404,
        )
      }

      const imageStatus =
        job.status === 'COMPLETED' && job.generationId
          ? await checkImageGenerationStatus(clerkId, job.id)
          : null
      const generation =
        imageStatus?.status === 'COMPLETED' ? imageStatus.generation : null
      const status = toStatusRecordStatus(job.status, generation !== null)
      const record: MultiViewJobStatusRecord = {
        jobId: job.id,
        view: metadata.multiViewAngle,
        prompt: job.prompt ?? MULTI_VIEW_PROMPTS[metadata.multiViewAngle],
        model: job.modelId,
        provider: job.provider,
        status,
        generationId: generation?.id,
        error: job.errorMessage ?? undefined,
      }

      return {
        record,
        view: generation
          ? toViewRecord(metadata.multiViewAngle, generation)
          : null,
      }
    }),
  )

  const statusJobs = statusResults.map((result) => result.record)
  return {
    batchId: input.batchId,
    status: getBatchStatus(statusJobs),
    views: statusResults.flatMap((result) =>
      result.view ? [result.view] : [],
    ),
    jobs: statusJobs,
  }
}
