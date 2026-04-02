import 'server-only'

import { VIDEO_GENERATION } from '@/constants/config'
import { getModelById } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import type {
  LongVideoRequest,
  LongVideoSubmitResponseData,
  PipelineClipRecord,
  PipelineStatusRecord,
  GenerationRecord,
} from '@/types'
import { createGeneration } from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { ProviderError } from '@/services/providers/types'
import {
  generateStorageKey,
  streamUploadToR2,
  uploadToR2,
  fetchAsBuffer,
} from '@/services/storage/r2'
import {
  createApiUsageEntry,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/generate-image.service'
import { db } from '@/lib/db'
import { isVideoResolution } from '@/constants/video-options'
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

  const providerAdapter = getProviderAdapter(executionRoute.adapterType)
  if (!providerAdapter?.submitVideoToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'Video generation is not supported for this provider',
      400,
    )
  }

  // Calculate clip count
  const firstClipDuration = Math.min(
    VIDEO_GENERATION.MAX_DURATION,
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

  // Submit first clip
  let queueResult: Awaited<
    ReturnType<NonNullable<typeof providerAdapter.submitVideoToQueue>>
  >
  try {
    queueResult = await providerAdapter.submitVideoToQueue({
      prompt: input.prompt,
      modelId: executionRoute.modelId,
      aspectRatio: input.aspectRatio,
      providerConfig: executionRoute.providerConfig,
      apiKey: executionRoute.apiKey,
      duration: firstClipDuration,
      referenceImage: input.referenceImage,
      negativePrompt: input.negativePrompt,
      resolution: input.resolution,
      i2vModelId: modelConfig.i2vModelId,
      videoDefaults: modelConfig.videoDefaults,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : 'Video generation failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

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
      apiKeyId: input.apiKeyId,
      clips: {
        create: Array.from({ length: totalClips }, (_, i) => ({
          clipIndex: i,
          status: i === 0 ? ('QUEUED' as const) : ('PENDING' as const),
          externalRequestId:
            i === 0
              ? JSON.stringify({
                  requestId: queueResult.requestId,
                  statusUrl: queueResult.statusUrl,
                  responseUrl: queueResult.responseUrl,
                })
              : undefined,
          startedAt: i === 0 ? new Date() : undefined,
        })),
      },
    },
  })

  return {
    pipelineId: pipeline.id,
    totalClips,
    estimatedDurationSec: input.targetDuration,
  }
}

// ─── Check Pipeline Status (poll-driven advancement) ────────────

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

  // Terminal states — return cached result
  if (
    pipeline.status === 'COMPLETED' ||
    pipeline.status === 'FAILED' ||
    pipeline.status === 'CANCELLED'
  ) {
    return mapPipelineToRecord(pipeline)
  }

  // Find the active clip (first non-COMPLETED clip)
  const activeClip = pipeline.clips.find((c) => c.status !== 'COMPLETED')
  if (!activeClip) {
    // All clips completed but pipeline not marked complete — finalize
    return await finalizePipeline(pipeline, dbUser.id)
  }

  // If the active clip hasn't been submitted yet (PENDING), it means
  // we haven't advanced to it yet — this shouldn't normally happen
  // because we advance in the completion handler below
  if (activeClip.status === 'PENDING') {
    return mapPipelineToRecord(pipeline)
  }

  // Check the active clip's status with the provider
  if (!activeClip.externalRequestId) {
    return mapPipelineToRecord(pipeline)
  }

  let queueMeta: { statusUrl: string; responseUrl: string }
  try {
    queueMeta = JSON.parse(activeClip.externalRequestId)
  } catch {
    await db.videoPipelineClip.update({
      where: { id: activeClip.id },
      data: { status: 'FAILED', errorMessage: 'Invalid queue metadata' },
    })
    await db.videoPipeline.update({
      where: { id: pipelineId },
      data: {
        status: 'FAILED',
        errorMessage: 'Clip has invalid queue metadata',
      },
    })
    return mapPipelineToRecord(
      await db.videoPipeline.findUniqueOrThrow({
        where: { id: pipelineId },
        include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
      }),
    )
  }

  const executionRoute = await resolveGenerationRoute(dbUser.id, {
    modelId: pipeline.modelId,
    apiKeyId: pipeline.apiKeyId ?? undefined,
  })
  const providerAdapter = getProviderAdapter(executionRoute.adapterType)

  if (!providerAdapter?.checkVideoQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'Video status check is not supported for this provider',
      400,
    )
  }

  let queueStatus: Awaited<
    ReturnType<NonNullable<typeof providerAdapter.checkVideoQueueStatus>>
  >
  try {
    queueStatus = await providerAdapter.checkVideoQueueStatus({
      statusUrl: queueMeta.statusUrl,
      responseUrl: queueMeta.responseUrl,
      apiKey: executionRoute.apiKey,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : 'Video status check failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  // Still running
  if (
    queueStatus.status === 'IN_QUEUE' ||
    queueStatus.status === 'IN_PROGRESS'
  ) {
    // Update clip status to RUNNING if it was QUEUED
    if (activeClip.status === 'QUEUED') {
      await db.videoPipelineClip.update({
        where: { id: activeClip.id },
        data: { status: 'RUNNING' },
      })
    }
    return mapPipelineToRecord(
      await db.videoPipeline.findUniqueOrThrow({
        where: { id: pipelineId },
        include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
      }),
    )
  }

  // Failed
  if (queueStatus.status === 'FAILED') {
    await db.videoPipelineClip.update({
      where: { id: activeClip.id },
      data: {
        status: 'FAILED',
        errorMessage: 'Video generation failed on provider side',
      },
    })
    await db.videoPipeline.update({
      where: { id: pipelineId },
      data: {
        status: 'FAILED',
        errorMessage: `Clip ${activeClip.clipIndex + 1} failed`,
      },
    })
    return mapPipelineToRecord(
      await db.videoPipeline.findUniqueOrThrow({
        where: { id: pipelineId },
        include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
      }),
    )
  }

  // COMPLETED — handle clip completion
  if (!queueStatus.result) {
    await db.videoPipelineClip.update({
      where: { id: activeClip.id },
      data: {
        status: 'FAILED',
        errorMessage: 'Provider returned completed but no result',
      },
    })
    await db.videoPipeline.update({
      where: { id: pipelineId },
      data: { status: 'FAILED', errorMessage: 'No result from provider' },
    })
    return mapPipelineToRecord(
      await db.videoPipeline.findUniqueOrThrow({
        where: { id: pipelineId },
        include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
      }),
    )
  }

  const videoResult = queueStatus.result
  const provider = getProviderLabel(executionRoute.providerConfig)

  // Upload completed clip to R2
  const clipStorageKey = generateStorageKey('VIDEO', dbUser.id)
  const { publicUrl: clipVideoUrl } = await streamUploadToR2({
    sourceUrl: videoResult.videoUrl,
    key: clipStorageKey,
    mimeType: 'video/mp4',
    fetchHeaders: videoResult.fetchHeaders,
  })

  // Create usage entry for this clip
  await createApiUsageEntry({
    userId: dbUser.id,
    adapterType: executionRoute.adapterType,
    provider,
    modelId: pipeline.modelId,
    requestCount: videoResult.requestCount,
    inputImageCount: 0,
    outputImageCount: 0,
    width: videoResult.width,
    height: videoResult.height,
    durationMs: Date.now() - (activeClip.startedAt?.getTime() ?? Date.now()),
    wasSuccessful: true,
  })

  // Update clip as completed
  const newCompletedClips = pipeline.completedClips + 1
  const newCurrentDuration = pipeline.currentDurationSec + videoResult.duration

  await db.videoPipelineClip.update({
    where: { id: activeClip.id },
    data: {
      status: 'COMPLETED',
      videoUrl: clipVideoUrl,
      storageKey: clipStorageKey,
      lastFrameUrl: videoResult.thumbnailUrl,
      durationSec: videoResult.duration,
      completedAt: new Date(),
    },
  })

  await db.videoPipeline.update({
    where: { id: pipelineId },
    data: {
      completedClips: newCompletedClips,
      currentDurationSec: newCurrentDuration,
    },
  })

  // Check if all clips are done
  if (newCompletedClips >= pipeline.totalClips) {
    const updatedPipeline = await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: {
        clips: { orderBy: { clipIndex: 'asc' } },
        generation: true,
      },
    })
    return await finalizePipeline(updatedPipeline, dbUser.id)
  }

  // Submit next clip
  const nextClipIndex = activeClip.clipIndex + 1
  const nextClip = pipeline.clips.find((c) => c.clipIndex === nextClipIndex)
  if (!nextClip) {
    // Shouldn't happen, but handle gracefully
    const updatedPipeline = await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: {
        clips: { orderBy: { clipIndex: 'asc' } },
        generation: true,
      },
    })
    return await finalizePipeline(updatedPipeline, dbUser.id)
  }

  await submitNextClip({
    pipeline,
    previousClipVideoUrl: clipVideoUrl,
    previousClipLastFrameUrl: videoResult.thumbnailUrl,
    nextClipId: nextClip.id,
    nextClipIndex,
    executionRoute,
  })

  // Return fresh pipeline state
  return mapPipelineToRecord(
    await db.videoPipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: { clips: { orderBy: { clipIndex: 'asc' } }, generation: true },
    }),
  )
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

  if (clipIndex === 0) {
    // Retry first clip as T2V/I2V
    const providerAdapter = getProviderAdapter(executionRoute.adapterType)
    if (!providerAdapter?.submitVideoToQueue) {
      throw new GenerateImageServiceError(
        'UNSUPPORTED_MODEL',
        'Video generation is not supported',
        400,
      )
    }

    const modelConfig = getModelById(pipeline.modelId)
    const firstClipDuration = Math.min(
      VIDEO_GENERATION.MAX_DURATION,
      pipeline.targetDurationSec,
    )
    const validatedResolution =
      pipeline.resolution && isVideoResolution(pipeline.resolution)
        ? pipeline.resolution
        : undefined

    const queueResult = await providerAdapter.submitVideoToQueue({
      prompt: pipeline.prompt,
      modelId: executionRoute.modelId,
      aspectRatio: pipeline.aspectRatio as Parameters<
        typeof providerAdapter.submitVideoToQueue
      >[0]['aspectRatio'],
      providerConfig: executionRoute.providerConfig,
      apiKey: executionRoute.apiKey,
      duration: firstClipDuration,
      referenceImage: pipeline.referenceImageUrl ?? undefined,
      negativePrompt: pipeline.negativePrompt ?? undefined,
      resolution: validatedResolution,
      i2vModelId: modelConfig?.i2vModelId,
      videoDefaults: modelConfig?.videoDefaults,
    })

    await db.videoPipelineClip.update({
      where: { id: clip.id },
      data: {
        status: 'QUEUED',
        errorMessage: null,
        externalRequestId: JSON.stringify({
          requestId: queueResult.requestId,
          statusUrl: queueResult.statusUrl,
          responseUrl: queueResult.responseUrl,
        }),
        startedAt: new Date(),
      },
    })
  } else {
    // Retry extension clip — need previous clip's data
    const previousClip = pipeline.clips.find(
      (c) => c.clipIndex === clipIndex - 1,
    )
    if (!previousClip || previousClip.status !== 'COMPLETED') {
      throw new GenerateImageServiceError(
        'INVALID_JOB',
        'Previous clip must be completed before retrying',
        400,
      )
    }

    await submitNextClip({
      pipeline,
      previousClipVideoUrl: previousClip.videoUrl ?? undefined,
      previousClipLastFrameUrl: previousClip.lastFrameUrl ?? undefined,
      nextClipId: clip.id,
      nextClipIndex: clipIndex,
      executionRoute,
    })
  }

  // Reset pipeline status to RUNNING
  await db.videoPipeline.update({
    where: { id: pipelineId },
    data: { status: 'RUNNING', errorMessage: null },
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

// ─── Private Helpers ────────────────────────────────────────────

interface SubmitNextClipParams {
  pipeline: {
    id: string
    modelId: string
    prompt: string
    aspectRatio: string
    negativePrompt: string | null
    resolution: string | null
    extensionMethod: string
    referenceImageUrl: string | null
  }
  previousClipVideoUrl?: string
  previousClipLastFrameUrl?: string
  nextClipId: string
  nextClipIndex: number
  executionRoute: Awaited<ReturnType<typeof resolveGenerationRoute>>
}

async function submitNextClip({
  pipeline,
  previousClipVideoUrl,
  previousClipLastFrameUrl,
  nextClipId,
  nextClipIndex,
  executionRoute,
}: SubmitNextClipParams) {
  const modelConfig = getModelById(pipeline.modelId)
  const extensionConfig = modelConfig?.videoExtension
  if (!extensionConfig) return

  const providerAdapter = getProviderAdapter(executionRoute.adapterType)
  if (!providerAdapter) return

  const validatedResolution =
    pipeline.resolution && isVideoResolution(pipeline.resolution)
      ? pipeline.resolution
      : undefined

  try {
    if (
      extensionConfig.extensionMethod === 'native_extend' &&
      extensionConfig.extendEndpointId &&
      providerAdapter.submitExtendVideoToQueue &&
      previousClipVideoUrl
    ) {
      // Native extend: pass video URL to extend endpoint
      const queueResult = await providerAdapter.submitExtendVideoToQueue({
        videoUrl: previousClipVideoUrl,
        prompt: pipeline.prompt,
        aspectRatio: pipeline.aspectRatio as Parameters<
          typeof providerAdapter.submitExtendVideoToQueue
        >[0]['aspectRatio'],
        providerConfig: executionRoute.providerConfig,
        apiKey: executionRoute.apiKey,
        extendEndpointId: extensionConfig.extendEndpointId,
        duration: extensionConfig.extensionClipDuration,
      })

      await db.videoPipelineClip.update({
        where: { id: nextClipId },
        data: {
          status: 'QUEUED',
          inputVideoUrl: previousClipVideoUrl,
          externalRequestId: JSON.stringify({
            requestId: queueResult.requestId,
            statusUrl: queueResult.statusUrl,
            responseUrl: queueResult.responseUrl,
          }),
          startedAt: new Date(),
        },
      })
    } else if (
      extensionConfig.extensionMethod === 'last_frame_chain' &&
      previousClipLastFrameUrl &&
      providerAdapter.submitVideoToQueue
    ) {
      // Last-frame chain: use last frame as I2V reference
      const queueResult = await providerAdapter.submitVideoToQueue({
        prompt: pipeline.prompt,
        modelId: executionRoute.modelId,
        aspectRatio: pipeline.aspectRatio as Parameters<
          typeof providerAdapter.submitVideoToQueue
        >[0]['aspectRatio'],
        providerConfig: executionRoute.providerConfig,
        apiKey: executionRoute.apiKey,
        duration: extensionConfig.extensionClipDuration,
        referenceImage: previousClipLastFrameUrl,
        negativePrompt: pipeline.negativePrompt ?? undefined,
        resolution: validatedResolution,
        i2vModelId: modelConfig?.i2vModelId,
        videoDefaults: modelConfig?.videoDefaults,
      })

      await db.videoPipelineClip.update({
        where: { id: nextClipId },
        data: {
          status: 'QUEUED',
          inputFrameUrl: previousClipLastFrameUrl,
          externalRequestId: JSON.stringify({
            requestId: queueResult.requestId,
            statusUrl: queueResult.statusUrl,
            responseUrl: queueResult.responseUrl,
          }),
          startedAt: new Date(),
        },
      })
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to submit next clip'
    await db.videoPipelineClip.update({
      where: { id: nextClipId },
      data: { status: 'FAILED', errorMessage: message },
    })
    await db.videoPipeline.update({
      where: { id: pipeline.id },
      data: {
        status: 'FAILED',
        errorMessage: `Failed to submit clip ${nextClipIndex + 1}: ${message}`,
      },
    })
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
