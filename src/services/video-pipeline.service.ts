import 'server-only'

import { randomUUID } from 'node:crypto'

import {
  EXECUTION_INTERNAL,
  EXECUTION_WORKER,
  EXECUTION_WORKFLOW_IDS,
} from '@/constants/execution'
import { IMAGE_SIZES, VIDEO_GENERATION } from '@/constants/config'
import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import type {
  LongVideoPipelineAdvanceRequest,
  LongVideoRequest,
  LongVideoSubmitResponseData,
  PipelineClipRecord,
  PipelineStatusRecord,
  GenerationRecord,
} from '@/types'
import { createGeneration } from '@/services/generation.service'
import {
  generateStorageKey,
  uploadToR2,
  fetchAsBuffer,
} from '@/services/storage/r2'
import { createApiUsageEntry } from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/image/generate-image.service'
import {
  buildInternalUrl,
  dispatchLongVideoPipelineWorkerRun,
} from '@/services/execution-worker.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { validateVideoGenerationInput } from '@/services/video-generation-validation.service'

// ─── Create Long Video Pipeline ─────────────────────────────────

export async function createLongVideoPipeline(
  clerkId: string,
  input: LongVideoRequest,
): Promise<LongVideoSubmitResponseData> {
  const dbUser = await ensureUser(clerkId)

  const modelConfig = getModelById(input.modelId)
  if (!modelConfig?.videoExtension) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model does not support long video generation',
      400,
    )
  }

  const extensionConfig = modelConfig.videoExtension
  if (input.targetDuration > extensionConfig.maxTotalDuration) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      `Maximum duration for this model is ${extensionConfig.maxTotalDuration}s`,
      400,
    )
  }

  const executionRoute = await resolveGenerationRoute(dbUser.id, {
    modelId: input.modelId,
    apiKeyId: input.apiKeyId,
  })

  if (executionRoute.adapterType !== AI_ADAPTER_TYPES.FAL) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This long-video provider has not been migrated to the execution worker yet',
      501,
    )
  }

  const apiKeyId = executionRoute.resolvedApiKeyId ?? input.apiKeyId
  const useSystemKey =
    executionRoute.isFreeGeneration === true && !executionRoute.resolvedApiKeyId
  if (!apiKeyId && !useSystemKey) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'Execution worker runs require a saved API key or platform key',
      400,
    )
  }

  // Calculate clip count
  const firstClipDuration = Math.min(
    VIDEO_GENERATION.LONG_VIDEO_FIRST_CLIP_MAX_DURATION,
    input.targetDuration,
  )
  const remainingDuration = input.targetDuration - firstClipDuration
  const extensionClips =
    remainingDuration > 0
      ? Math.ceil(remainingDuration / extensionConfig.extensionClipDuration)
      : 0
  const totalClips = 1 + extensionClips

  validateVideoGenerationInput({
    modelId: input.modelId,
    aspectRatio: input.aspectRatio,
    duration: firstClipDuration,
    referenceImage: input.referenceImage,
    resolution: input.resolution,
  })

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

  const outputStorageKeys = Array.from({ length: totalClips }, () =>
    generateStorageKey('VIDEO', dbUser.id),
  )

  // Create pipeline + clips in a transaction
  const pipeline = await db.videoPipeline.create({
    data: {
      userId: dbUser.id,
      status: 'RUNNING',
      prompt: input.prompt,
      modelId: executionRoute.modelId,
      adapterType: executionRoute.adapterType,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      negativePrompt: input.negativePrompt,
      extensionMethod: extensionConfig.extensionMethod,
      targetDurationSec: input.targetDuration,
      totalClips,
      characterCardIds: input.characterCardIds ?? [],
      referenceImageUrl,
      apiKeyId: apiKeyId ?? null,
      clips: {
        create: Array.from({ length: totalClips }, (_, i) => ({
          clipIndex: i,
          status: 'PENDING' as const,
        })),
      },
    },
  })

  await dispatchLongVideoPipelineWorkflow({
    pipelineId: pipeline.id,
    totalClips,
    providerId: executionRoute.adapterType,
    apiKeyId,
    useSystemKey,
    routeModelId: executionRoute.modelId,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    firstClipDuration,
    extensionClipDuration: extensionConfig.extensionClipDuration,
    extensionMethod: extensionConfig.extensionMethod,
    extendEndpointId: extensionConfig.extendEndpointId,
    referenceImageUrl,
    negativePrompt: input.negativePrompt,
    resolution: input.resolution,
    i2vModelId: modelConfig.i2vModelId,
    videoDefaults: modelConfig.videoDefaults
      ? { ...modelConfig.videoDefaults }
      : undefined,
    providerBaseUrl: modelConfig.providerConfig.baseUrl,
    outputStorageKeys,
  })

  return {
    pipelineId: pipeline.id,
    totalClips,
    estimatedDurationSec: input.targetDuration,
  }
}

// ─── Check Pipeline Status ──────────────────────────────────────

export async function checkPipelineStatus(
  clerkId: string,
  pipelineId: string,
): Promise<PipelineStatusRecord> {
  const dbUser = await ensureUser(clerkId)

  const pipeline = await db.videoPipeline.findUnique({
    where: { id: pipelineId },
    include: {
      clips: { orderBy: { clipIndex: 'asc' } },
      generation: true,
    },
  })

  if (!pipeline || pipeline.userId !== dbUser.id) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video pipeline not found',
      404,
    )
  }

  return mapPipelineToRecord(pipeline)
}

// ─── Worker-Driven Pipeline Advancement ────────────────────────

export async function advanceLongVideoPipelineFromWorker(
  pipelineId: string,
): Promise<PipelineStatusRecord> {
  const pipeline = await db.videoPipeline.findUnique({
    where: { id: pipelineId },
    include: {
      clips: { orderBy: { clipIndex: 'asc' } },
      generation: true,
    },
  })

  if (!pipeline) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video pipeline not found',
      404,
    )
  }

  return mapPipelineToRecord(pipeline)
}

export async function applyLongVideoPipelineWorkerUpdate(
  input: LongVideoPipelineAdvanceRequest,
): Promise<PipelineStatusRecord> {
  const pipeline = await db.videoPipeline.findUnique({
    where: { id: input.pipelineId },
    include: {
      clips: { orderBy: { clipIndex: 'asc' } },
      generation: true,
    },
  })

  if (!pipeline) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video pipeline not found',
      404,
    )
  }

  if (input.action === 'fail') {
    return failLongVideoPipelineFromWorker(
      input.pipelineId,
      input.error ?? 'Long-video execution worker failed',
    )
  }

  if (
    pipeline.status === 'COMPLETED' ||
    pipeline.status === 'FAILED' ||
    pipeline.status === 'CANCELLED'
  ) {
    return mapPipelineToRecord(pipeline)
  }

  if (input.action === 'advance') {
    return mapPipelineToRecord(pipeline)
  }

  if (input.action === 'finalize') {
    return finalizePipeline(pipeline, pipeline.userId)
  }

  const clip = getPipelineClipByIndex(pipeline, input.clipIndex)

  if (input.action === 'clip-queued') {
    return updateWorkerQueuedClip(input, clip)
  }

  if (input.action === 'clip-running') {
    return updateWorkerRunningClip(input, clip)
  }

  return updateWorkerCompletedClip(input, pipeline, clip)
}

function getPipelineClipByIndex(
  pipeline: {
    clips: Array<{
      id: string
      clipIndex: number
      status: string
      startedAt: Date | null
    }>
  },
  clipIndex: number | undefined,
) {
  if (clipIndex === undefined) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Worker update is missing clip index',
      400,
    )
  }

  const clip = pipeline.clips.find((item) => item.clipIndex === clipIndex)
  if (!clip) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video pipeline clip not found',
      404,
    )
  }

  return clip
}

function requireWorkerString(
  value: string | undefined,
  fieldName: string,
): string {
  if (value) return value

  throw new GenerateImageServiceError(
    'INVALID_JOB',
    `Worker update is missing ${fieldName}`,
    400,
  )
}

function requireWorkerNumber(
  value: number | undefined,
  fieldName: string,
): number {
  if (value !== undefined) return value

  throw new GenerateImageServiceError(
    'INVALID_JOB',
    `Worker update is missing ${fieldName}`,
    400,
  )
}

async function fetchPipelineStatus(pipelineId: string) {
  return mapPipelineToRecord(
    await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
    }),
  )
}

async function updateWorkerQueuedClip(
  input: LongVideoPipelineAdvanceRequest,
  clip: { id: string; status: string },
): Promise<PipelineStatusRecord> {
  if (clip.status === 'COMPLETED') {
    return fetchPipelineStatus(input.pipelineId)
  }

  const requestId = requireWorkerString(input.requestId, 'requestId')
  const statusUrl = requireWorkerString(input.statusUrl, 'statusUrl')
  const responseUrl = requireWorkerString(input.responseUrl, 'responseUrl')

  await db.videoPipelineClip.update({
    where: { id: clip.id },
    data: {
      status: 'QUEUED',
      errorMessage: null,
      externalRequestId: JSON.stringify({
        requestId,
        statusUrl,
        responseUrl,
        providerMetadata: input.providerMetadata,
      }),
      inputVideoUrl: input.inputVideoUrl,
      inputFrameUrl: input.inputFrameUrl,
      startedAt: new Date(),
      completedAt: null,
    },
  })

  await db.videoPipeline.update({
    where: { id: input.pipelineId },
    data: { status: 'RUNNING', errorMessage: null },
  })

  return fetchPipelineStatus(input.pipelineId)
}

async function updateWorkerRunningClip(
  input: LongVideoPipelineAdvanceRequest,
  clip: { id: string; status: string },
): Promise<PipelineStatusRecord> {
  if (clip.status === 'COMPLETED') {
    return fetchPipelineStatus(input.pipelineId)
  }

  await db.videoPipelineClip.update({
    where: { id: clip.id },
    data: { status: 'RUNNING' },
  })

  return fetchPipelineStatus(input.pipelineId)
}

async function updateWorkerCompletedClip(
  input: LongVideoPipelineAdvanceRequest,
  pipeline: {
    id: string
    userId: string
    modelId: string
    adapterType: string
    totalClips: number
    clips: Array<{
      id: string
      clipIndex: number
      status: string
      startedAt: Date | null
      durationSec: number | null
    }>
    generation: GenerationDbRow | null
  },
  clip: { id: string; status: string; startedAt: Date | null },
): Promise<PipelineStatusRecord> {
  if (clip.status === 'COMPLETED') {
    return fetchPipelineStatus(input.pipelineId)
  }

  const videoUrl = requireWorkerString(input.videoUrl, 'videoUrl')
  const storageKey = requireWorkerString(input.storageKey, 'storageKey')
  const durationSec = requireWorkerNumber(input.durationSec, 'durationSec')
  const modelForProvider = getModelById(pipeline.modelId)
  const provider = modelForProvider
    ? getProviderLabel(modelForProvider.providerConfig)
    : pipeline.adapterType

  await createApiUsageEntry({
    userId: pipeline.userId,
    adapterType: pipeline.adapterType,
    provider,
    modelId: pipeline.modelId,
    requestCount: input.requestCount,
    inputImageCount: 0,
    outputImageCount: 0,
    width: input.width,
    height: input.height,
    durationMs: Date.now() - (clip.startedAt?.getTime() ?? Date.now()),
    wasSuccessful: true,
  })

  await db.videoPipelineClip.update({
    where: { id: clip.id },
    data: {
      status: 'COMPLETED',
      videoUrl,
      storageKey,
      lastFrameUrl: input.lastFrameUrl,
      durationSec,
      errorMessage: null,
      completedAt: new Date(),
    },
  })

  const updatedPipeline = await db.videoPipeline.findUniqueOrThrow({
    where: { id: input.pipelineId },
    include: {
      clips: { orderBy: { clipIndex: 'asc' } },
      generation: true,
    },
  })
  const completedClips = updatedPipeline.clips.filter(
    (item) => item.status === 'COMPLETED',
  )
  const currentDurationSec = completedClips.reduce(
    (total, item) => total + (item.durationSec ?? 0),
    0,
  )

  await db.videoPipeline.update({
    where: { id: input.pipelineId },
    data: {
      completedClips: completedClips.length,
      currentDurationSec,
    },
  })

  const refreshedPipeline = await db.videoPipeline.findUniqueOrThrow({
    where: { id: input.pipelineId },
    include: {
      clips: { orderBy: { clipIndex: 'asc' } },
      generation: true,
    },
  })

  if (completedClips.length >= pipeline.totalClips) {
    return finalizePipeline(refreshedPipeline, pipeline.userId)
  }

  return mapPipelineToRecord(refreshedPipeline)
}

// ─── Retry Failed Clip ──────────────────────────────────────────

export async function retryPipelineClip(
  clerkId: string,
  pipelineId: string,
  clipIndex: number,
): Promise<PipelineStatusRecord> {
  const dbUser = await ensureUser(clerkId)

  const pipeline = await db.videoPipeline.findUnique({
    where: { id: pipelineId },
    include: { clips: { orderBy: { clipIndex: 'asc' } } },
  })

  if (!pipeline || pipeline.userId !== dbUser.id) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video pipeline not found',
      404,
    )
  }

  const clip = pipeline.clips.find((c) => c.clipIndex === clipIndex)
  if (!clip || clip.status !== 'FAILED') {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Only failed clips can be retried',
      400,
    )
  }

  const executionRoute = await resolveGenerationRoute(dbUser.id, {
    modelId: pipeline.modelId,
    apiKeyId: pipeline.apiKeyId ?? undefined,
  })

  if (executionRoute.adapterType !== AI_ADAPTER_TYPES.FAL) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This long-video provider has not been migrated to the execution worker yet',
      501,
    )
  }

  const apiKeyId = executionRoute.resolvedApiKeyId ?? pipeline.apiKeyId
  const useSystemKey =
    executionRoute.isFreeGeneration === true && !executionRoute.resolvedApiKeyId
  if (!apiKeyId && !useSystemKey) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'Execution worker runs require a saved API key or platform key',
      400,
    )
  }

  const modelConfig = getModelById(pipeline.modelId)
  const extensionConfig = modelConfig?.videoExtension
  if (!modelConfig || !extensionConfig) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model does not support long video generation',
      400,
    )
  }

  const previousClip =
    clipIndex > 0
      ? pipeline.clips.find((item) => item.clipIndex === clipIndex - 1)
      : undefined
  if (clipIndex > 0 && (!previousClip || previousClip.status !== 'COMPLETED')) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Previous clip must be completed before retrying',
      400,
    )
  }

  await db.videoPipelineClip.updateMany({
    where: {
      pipelineId,
      clipIndex: { gte: clipIndex },
    },
    data: {
      status: 'PENDING',
      errorMessage: null,
      externalRequestId: null,
      videoUrl: null,
      storageKey: null,
      lastFrameUrl: null,
      durationSec: null,
      inputVideoUrl: null,
      inputFrameUrl: null,
      startedAt: null,
      completedAt: null,
    },
  })

  const completedBeforeRetry = pipeline.clips.filter(
    (item) => item.clipIndex < clipIndex && item.status === 'COMPLETED',
  )
  const currentDurationSec = completedBeforeRetry.reduce(
    (total, item) => total + (item.durationSec ?? 0),
    0,
  )

  // Reset pipeline status to RUNNING
  await db.videoPipeline.update({
    where: { id: pipelineId },
    data: {
      status: 'RUNNING',
      errorMessage: null,
      completedClips: completedBeforeRetry.length,
      currentDurationSec,
    },
  })

  await dispatchLongVideoPipelineWorkflow({
    pipelineId,
    totalClips: pipeline.totalClips,
    runId: `${pipelineId}-retry-${randomUUID()}`,
    providerId: executionRoute.adapterType,
    apiKeyId,
    useSystemKey,
    routeModelId: executionRoute.modelId,
    prompt: pipeline.prompt,
    aspectRatio: pipeline.aspectRatio,
    firstClipDuration: Math.min(
      VIDEO_GENERATION.LONG_VIDEO_FIRST_CLIP_MAX_DURATION,
      pipeline.targetDurationSec,
    ),
    extensionClipDuration: extensionConfig.extensionClipDuration,
    extensionMethod: extensionConfig.extensionMethod,
    extendEndpointId: extensionConfig.extendEndpointId,
    referenceImageUrl: pipeline.referenceImageUrl ?? undefined,
    negativePrompt: pipeline.negativePrompt ?? undefined,
    resolution: pipeline.resolution ?? undefined,
    i2vModelId: modelConfig.i2vModelId,
    videoDefaults: modelConfig.videoDefaults
      ? { ...modelConfig.videoDefaults }
      : undefined,
    providerBaseUrl: modelConfig.providerConfig.baseUrl,
    outputStorageKeys: Array.from(
      { length: pipeline.totalClips },
      (_, index) =>
        index < clipIndex
          ? (pipeline.clips.find((item) => item.clipIndex === index)
              ?.storageKey ?? generateStorageKey('VIDEO', dbUser.id))
          : generateStorageKey('VIDEO', dbUser.id),
    ),
    startClipIndex: clipIndex,
    initialVideoUrl: previousClip?.videoUrl ?? undefined,
    initialFrameUrl: previousClip?.lastFrameUrl ?? undefined,
  })

  return mapPipelineToRecord(
    await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
    }),
  )
}

// ─── Cancel Pipeline ────────────────────────────────────────────

export async function cancelPipeline(
  clerkId: string,
  pipelineId: string,
): Promise<PipelineStatusRecord> {
  const dbUser = await ensureUser(clerkId)

  const pipeline = await db.videoPipeline.findUnique({
    where: { id: pipelineId },
  })

  if (!pipeline || pipeline.userId !== dbUser.id) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video pipeline not found',
      404,
    )
  }

  if (pipeline.status !== 'RUNNING' && pipeline.status !== 'PAUSED') {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Only running or paused pipelines can be cancelled',
      400,
    )
  }

  await db.videoPipeline.update({
    where: { id: pipelineId },
    data: { status: 'CANCELLED' },
  })

  // Mark any non-completed clips as FAILED
  await db.videoPipelineClip.updateMany({
    where: {
      pipelineId,
      status: { in: ['PENDING', 'QUEUED', 'RUNNING'] },
    },
    data: { status: 'FAILED', errorMessage: 'Pipeline cancelled' },
  })

  return mapPipelineToRecord(
    await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
    }),
  )
}

export async function failLongVideoPipelineFromWorker(
  pipelineId: string,
  errorMessage: string,
): Promise<PipelineStatusRecord> {
  const pipeline = await db.videoPipeline.findUnique({
    where: { id: pipelineId },
    include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
  })

  if (!pipeline) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video pipeline not found',
      404,
    )
  }

  if (
    pipeline.status === 'COMPLETED' ||
    pipeline.status === 'FAILED' ||
    pipeline.status === 'CANCELLED'
  ) {
    return mapPipelineToRecord(pipeline)
  }

  await db.videoPipeline.update({
    where: { id: pipelineId },
    data: { status: 'FAILED', errorMessage },
  })

  await db.videoPipelineClip.updateMany({
    where: {
      pipelineId,
      status: { in: ['PENDING', 'QUEUED', 'RUNNING'] },
    },
    data: { status: 'FAILED', errorMessage },
  })

  return mapPipelineToRecord(
    await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
    }),
  )
}

// ─── Private Helpers ────────────────────────────────────────────

async function dispatchLongVideoPipelineWorkflow(input: {
  pipelineId: string
  totalClips: number
  runId?: string
  providerId: string
  apiKeyId?: string | null
  useSystemKey: boolean
  routeModelId: string
  prompt: string
  aspectRatio: string
  firstClipDuration: number
  extensionClipDuration: number
  extensionMethod: 'native_extend' | 'last_frame_chain'
  extendEndpointId?: string
  referenceImageUrl?: string
  negativePrompt?: string
  resolution?: string
  i2vModelId?: string
  videoDefaults?: Record<string, unknown>
  providerBaseUrl?: string
  outputStorageKeys: string[]
  startClipIndex?: number
  initialVideoUrl?: string
  initialFrameUrl?: string
}) {
  try {
    const { width, height } =
      IMAGE_SIZES[input.aspectRatio as keyof typeof IMAGE_SIZES] ??
      IMAGE_SIZES['16:9']
    const result = await dispatchLongVideoPipelineWorkerRun({
      runId: input.runId ?? input.pipelineId,
      workflowId: EXECUTION_WORKFLOW_IDS.LONG_VIDEO_PIPELINE,
      pipelineId: input.pipelineId,
      advanceUrl: buildInternalUrl(EXECUTION_INTERNAL.LONG_VIDEO_ADVANCE_PATH),
      providerId: input.providerId,
      apiKeyId: input.apiKeyId ?? undefined,
      useSystemKey: input.useSystemKey || undefined,
      resolveKeyUrl: buildInternalUrl(EXECUTION_INTERNAL.RESOLVE_KEY_PATH),
      timeoutMs: EXECUTION_WORKER.DEFAULT_TIMEOUT_MS,
      maxAttempts: Math.max(
        EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS,
        input.totalClips * EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS,
      ),
      pollIntervalMs: EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS,
      startClipIndex: input.startClipIndex ?? 0,
      initialVideoUrl: input.initialVideoUrl,
      initialFrameUrl: input.initialFrameUrl,
      providerInput: {
        prompt: input.prompt,
        modelId: input.routeModelId,
        externalModelId: getExecutionModelId(input.routeModelId),
        aspectRatio: input.aspectRatio as
          | '1:1'
          | '16:9'
          | '9:16'
          | '4:3'
          | '3:4',
        firstClipDuration: input.firstClipDuration,
        extensionClipDuration: input.extensionClipDuration,
        totalClips: input.totalClips,
        extensionMethod: input.extensionMethod,
        extendEndpointId: input.extendEndpointId,
        referenceImage: input.referenceImageUrl,
        negativePrompt: input.negativePrompt,
        resolution: input.resolution,
        i2vModelId: input.i2vModelId,
        videoDefaults: input.videoDefaults,
        providerBaseUrl: input.providerBaseUrl,
        outputStorageKeys: input.outputStorageKeys,
        width,
        height,
      },
    })

    logger.info('Long-video pipeline dispatched to execution worker', {
      pipelineId: input.pipelineId,
      workflowInstanceId: result.workflowInstanceId,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to dispatch long-video execution worker'

    await db.videoPipeline.update({
      where: { id: input.pipelineId },
      data: { status: 'FAILED', errorMessage: message },
    })

    await db.videoPipelineClip.updateMany({
      where: {
        pipelineId: input.pipelineId,
        status: { in: ['PENDING', 'QUEUED', 'RUNNING'] },
      },
      data: { status: 'FAILED', errorMessage: message },
    })

    logger.error('Long-video execution worker dispatch failed', {
      pipelineId: input.pipelineId,
      error: message,
    })

    throw new GenerateImageServiceError('PROVIDER_ERROR', message, 502)
  }
}

async function finalizePipeline(
  pipeline: {
    id: string
    userId: string
    modelId: string
    adapterType: string
    prompt: string
    negativePrompt: string | null
    extensionMethod: string
    referenceImageUrl: string | null
    characterCardIds: string[]
    targetDurationSec: number
    currentDurationSec: number
    clips: Array<{
      clipIndex: number
      status: string
      videoUrl: string | null
      storageKey: string | null
      durationSec: number | null
    }>
    generation: GenerationDbRow | null
  },
  userId: string,
): Promise<PipelineStatusRecord> {
  // If already finalized, return cached
  if (pipeline.generation) {
    await db.videoPipeline.update({
      where: { id: pipeline.id },
      data: { status: 'COMPLETED' },
    })
    const updated = await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipeline.id },
      include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
    })
    return mapPipelineToRecord(updated)
  }

  const completedClips = pipeline.clips.filter(
    (c) => c.status === 'COMPLETED' && c.videoUrl,
  )
  if (completedClips.length === 0) {
    await db.videoPipeline.update({
      where: { id: pipeline.id },
      data: { status: 'FAILED', errorMessage: 'No completed clips' },
    })
    const updated = await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipeline.id },
      include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
    })
    return mapPipelineToRecord(updated)
  }

  // For native_extend, the last clip's video IS the full extended video
  // For last_frame_chain, we use the last clip for now (V1 — no concatenation)
  const lastClip = completedClips[completedClips.length - 1]
  const finalVideoUrl = lastClip.videoUrl!
  const finalStorageKey = lastClip.storageKey!
  const totalDuration = completedClips.reduce(
    (sum, c) => sum + (c.durationSec ?? 0),
    0,
  )

  const modelForProvider = getModelById(pipeline.modelId)
  const provider = modelForProvider
    ? getProviderLabel(modelForProvider.providerConfig)
    : pipeline.adapterType

  // Create a Generation record for the final video
  const generation = await createGeneration({
    url: finalVideoUrl,
    storageKey: finalStorageKey,
    mimeType: 'video/mp4',
    width: 1280, // Default, will be updated from actual video metadata
    height: 720,
    duration:
      pipeline.extensionMethod === 'native_extend'
        ? totalDuration
        : (lastClip.durationSec ?? totalDuration),
    referenceImageUrl: pipeline.referenceImageUrl ?? undefined,
    prompt: pipeline.prompt,
    negativePrompt: pipeline.negativePrompt ?? undefined,
    model: pipeline.modelId,
    provider,
    requestCount: completedClips.length,
    outputType: 'VIDEO',
    userId,
    characterCardIds:
      pipeline.characterCardIds.length > 0
        ? pipeline.characterCardIds
        : undefined,
  })

  await db.videoPipeline.update({
    where: { id: pipeline.id },
    data: {
      status: 'COMPLETED',
      finalVideoUrl,
      finalStorageKey,
      generationId: generation.id,
      currentDurationSec: totalDuration,
    },
  })

  const updated = await db.videoPipeline.findUniqueOrThrow({
    where: { id: pipeline.id },
    include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
  })
  return mapPipelineToRecord(updated)
}

// ─── Mapping Helpers ────────────────────────────────────────────

type GenerationDbRow = {
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
}

function mapPipelineToRecord(pipeline: {
  id: string
  status: string
  totalClips: number
  completedClips: number
  currentDurationSec: number
  targetDurationSec: number
  errorMessage: string | null
  clips: Array<{
    clipIndex: number
    status: string
    videoUrl: string | null
    durationSec: number | null
    errorMessage: string | null
  }>
  generation: GenerationDbRow | null
}): PipelineStatusRecord {
  return {
    pipelineId: pipeline.id,
    status: pipeline.status as PipelineStatusRecord['status'],
    totalClips: pipeline.totalClips,
    completedClips: pipeline.completedClips,
    currentDurationSec: pipeline.currentDurationSec,
    targetDurationSec: pipeline.targetDurationSec,
    errorMessage: pipeline.errorMessage,
    clips: pipeline.clips.map(
      (c): PipelineClipRecord => ({
        clipIndex: c.clipIndex,
        status: c.status as PipelineClipRecord['status'],
        videoUrl: c.videoUrl,
        durationSec: c.durationSec,
        errorMessage: c.errorMessage,
      }),
    ),
    generation: pipeline.generation
      ? {
          id: pipeline.generation.id,
          createdAt: pipeline.generation.createdAt,
          outputType: pipeline.generation
            .outputType as GenerationRecord['outputType'],
          status: pipeline.generation.status as GenerationRecord['status'],
          url: pipeline.generation.url,
          storageKey: pipeline.generation.storageKey,
          mimeType: pipeline.generation.mimeType,
          width: pipeline.generation.width,
          height: pipeline.generation.height,
          duration: pipeline.generation.duration,
          prompt: pipeline.generation.prompt,
          negativePrompt: pipeline.generation.negativePrompt,
          model: pipeline.generation.model,
          provider: pipeline.generation.provider,
          requestCount: pipeline.generation.requestCount,
          isPublic: pipeline.generation.isPublic,
          isPromptPublic: pipeline.generation.isPromptPublic,
          userId: pipeline.generation.userId,
        }
      : undefined,
  }
}
