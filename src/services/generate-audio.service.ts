import 'server-only'

import { z } from 'zod'

import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import {
  AI_ADAPTER_TYPES,
  getProviderLabel,
  type ProviderConfig,
} from '@/constants/providers'
import type {
  AudioStatusResponseData,
  AudioSubmitResponseData,
  GenerateAudioRequest,
  GenerationRecord,
} from '@/types'
import { getProviderAdapter } from '@/services/providers/registry'
import { ProviderError } from '@/services/providers/types'
import {
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import {
  completeGenerationJob,
  createApiUsageEntry,
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { createGeneration } from '@/services/generation.service'
import {
  resolveGenerationRoute,
  GenerateImageServiceError,
} from '@/services/generate-image.service'
import {
  annotateExecutionOutbox,
  completeExecutionOutbox,
  createExecutionOutbox,
  failExecutionOutbox,
  failExpiredExecutionOutbox,
  tryClaimExecutionOutbox,
} from '@/services/execution-outbox.service'
import { getApiKeyValueById } from '@/services/apiKey.service'
import { ensureUser } from '@/services/user.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { getSystemApiKey } from '@/lib/platform-keys'

const AI_ADAPTER_TYPE_VALUES = Object.values(AI_ADAPTER_TYPES) as [
  AI_ADAPTER_TYPES,
  ...AI_ADAPTER_TYPES[],
]

const AudioRouteIdentitySchema = z.object({
  modelId: z.string().min(1),
  adapterType: z.enum(AI_ADAPTER_TYPE_VALUES),
  provider: z.string().min(1),
  providerConfig: z
    .object({
      label: z.string().min(1),
      baseUrl: z.string().url(),
    })
    .optional(),
  apiKeyId: z.string().min(1).nullable().optional(),
  isFreeGeneration: z.boolean().optional(),
})

type AudioRouteIdentity = z.infer<typeof AudioRouteIdentitySchema>

const AudioQueueRequestSchema = z.object({
  requestId: z.string().min(1),
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
})

type AudioQueueRequest = z.infer<typeof AudioQueueRequestSchema>

const AudioQueueMetadataSchema = z.object({
  requestId: z.string().min(1).optional(),
  statusUrl: z.string().url().optional(),
  responseUrl: z.string().url().optional(),
  route: AudioRouteIdentitySchema,
})

type AudioQueueMetadata = z.infer<typeof AudioQueueMetadataSchema>

const AudioSubmitOutboxPayloadSchema = z.object({
  prompt: z.string().min(1),
  voiceId: z.string().min(1).max(200).optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  format: z.string().min(1).optional(),
  sampleRate: z.number().int().min(8000).max(48000).optional(),
})

type AudioSubmitOutboxPayload = z.infer<typeof AudioSubmitOutboxPayloadSchema>

interface AudioExecutionOutboxState {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  payload: unknown
  result: unknown
  leaseExpiresAt: Date | null
  lastError: string | null
}

interface AudioJobState {
  id: string
  userId: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  modelId: string
  adapterType: string
  provider: string
  prompt: string | null
  externalRequestId: string | null
  createdAt: Date
  generation: {
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
  } | null
  executionOutbox: AudioExecutionOutboxState | null
}

type ReadyAudioQueueMetadata = AudioQueueMetadata & AudioQueueRequest

/**
 * Generate audio synchronously (Fish Audio — returns audio bytes immediately).
 * Flow: validate → resolve route → call adapter.generateAudio() → upload R2 → create record.
 */
export async function generateAudioForUser(
  clerkId: string,
  request: GenerateAudioRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)
  const userId = dbUser.id

  const route = await resolveGenerationRoute(userId, {
    modelId: request.modelId,
    apiKeyId: request.apiKeyId,
  })

  const adapter = getProviderAdapter(route.adapterType)
  if (!adapter.generateAudio) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model does not support audio generation',
      400,
    )
  }

  const providerLabel = getProviderLabel(route.providerConfig)

  const job = await createGenerationJob({
    userId,
    adapterType: route.adapterType,
    provider: providerLabel,
    modelId: route.modelId,
  })

  try {
    const breaker = getCircuitBreaker(route.adapterType)
    const result = await breaker.call(() =>
      withRetry(
        () =>
          adapter.generateAudio!({
            prompt: request.prompt,
            modelId: route.modelId,
            providerConfig: route.providerConfig,
            apiKey: route.apiKey,
            voiceId: request.voiceId,
            speed: request.speed,
            format: request.format,
            sampleRate: request.sampleRate,
          }),
        { maxAttempts: 3, label: `${providerLabel}/audio` },
      ),
    )

    // Upload audio to R2
    const { buffer, mimeType } = await fetchAsBuffer(result.audioUrl)
    const storageKey = generateStorageKey('AUDIO', userId, result.format)
    const permanentUrl = await uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType,
    })

    // Create generation record
    const generation = await createGeneration({
      userId,
      outputType: 'AUDIO',
      url: permanentUrl,
      storageKey,
      mimeType,
      width: 0,
      height: 0,
      duration: result.duration,
      prompt: request.prompt,
      model: route.modelId,
      provider: providerLabel,
      requestCount: result.requestCount,
      isFreeGeneration: route.isFreeGeneration,
    })

    // Track usage
    await completeGenerationJob(job.id, {
      generationId: generation.id,
      requestCount: result.requestCount,
    })
    try {
      await createApiUsageEntry({
        userId,
        generationId: generation.id,
        generationJobId: job.id,
        adapterType: route.adapterType,
        provider: providerLabel,
        modelId: route.modelId,
        requestCount: result.requestCount,
        wasSuccessful: true,
      })
    } catch (error) {
      logger.error('Audio usage ledger write failed after sync completion', {
        generationId: generation.id,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    logger.info('Audio generation completed', {
      generationId: generation.id,
      model: route.modelId,
      duration: result.duration,
    })

    return generation
  } catch (error) {
    await failGenerationJob(job.id, {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })

    if (error instanceof ProviderError) {
      throw new GenerateImageServiceError(
        'PROVIDER_ERROR',
        error.message,
        error.status,
      )
    }
    throw error
  }
}

/**
 * Submit async audio generation (FAL F5-TTS — queue-based).
 * Persists a server-owned job + execution outbox and returns the durable job ID.
 */
export async function submitAudioGeneration(
  clerkId: string,
  request: GenerateAudioRequest,
): Promise<AudioSubmitResponseData> {
  const dbUser = await ensureUser(clerkId)
  const userId = dbUser.id
  const route = await resolveGenerationRoute(userId, {
    modelId: request.modelId,
    apiKeyId: request.apiKeyId,
  })

  const adapter = getProviderAdapter(route.adapterType)
  if (!adapter.submitAudioToQueue) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model does not support async audio generation',
      400,
    )
  }

  const providerLabel = getProviderLabel(route.providerConfig)
  const routeIdentity = buildAudioRouteIdentity(route, providerLabel)
  const outboxPayload = buildAudioSubmitOutboxPayload(request)

  const job = await db.$transaction(async (tx) => {
    const createdJob = await createGenerationJob(
      {
        userId,
        adapterType: route.adapterType,
        provider: providerLabel,
        modelId: route.modelId,
        prompt: request.prompt,
        externalRequestId: serializeAudioQueueMetadata({
          route: routeIdentity,
        }),
      },
      tx,
    )

    await createExecutionOutbox(
      {
        generationJobId: createdJob.id,
        kind: EXECUTION_OUTBOX_KINDS.AUDIO_QUEUE_SUBMIT,
        payload: outboxPayload,
      },
      tx,
    )

    return createdJob
  })

  logger.info('Audio generation enqueued in execution outbox', {
    jobId: job.id,
    model: route.modelId,
  })

  return {
    jobId: job.id,
  }
}

/**
 * Check the status of an async audio generation job.
 * When queue metadata is not ready yet, this will opportunistically claim/dispatch
 * the submit outbox before polling provider status.
 */
export async function checkAudioGenerationStatus(
  clerkId: string,
  jobId: string,
): Promise<AudioStatusResponseData> {
  const dbUser = await ensureUser(clerkId)
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true, executionOutbox: true },
  })

  if (!job || job.userId !== dbUser.id) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Audio generation job not found',
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
    return { jobId: job.id, status: 'FAILED' }
  }

  if (!job.externalRequestId) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has no external request ID',
      400,
    )
  }

  const baseQueueMeta = parseAudioQueueMetadata(job.externalRequestId)
  const queueMeta = await getReadyAudioQueueMetadata(
    toAudioJobState(job),
    baseQueueMeta,
  )

  if (!queueMeta) {
    const freshJob = await db.generationJob.findUnique({
      where: { id: jobId },
      include: { generation: true },
    })

    if (freshJob?.status === 'FAILED') {
      return { jobId: job.id, status: 'FAILED' }
    }

    return { jobId: job.id, status: 'IN_QUEUE' }
  }

  const executionRoute = await resolveStoredAudioRoute(
    dbUser.id,
    queueMeta.route,
  )
  const adapter = getProviderAdapter(executionRoute.adapterType)
  if (!adapter.checkAudioQueueStatus) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This adapter does not support audio queue status checks',
      400,
    )
  }

  let pollResult: Awaited<
    ReturnType<NonNullable<typeof adapter.checkAudioQueueStatus>>
  >
  try {
    pollResult = await adapter.checkAudioQueueStatus({
      statusUrl: queueMeta.statusUrl,
      responseUrl: queueMeta.responseUrl,
      apiKey: executionRoute.apiKey,
    })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) throw error
    const message =
      error instanceof Error ? error.message : 'Audio status check failed'
    const status = error instanceof ProviderError ? error.status : 502
    throw new GenerateImageServiceError('PROVIDER_ERROR', message, status)
  }

  if (pollResult.status === 'IN_QUEUE' || pollResult.status === 'IN_PROGRESS') {
    return { jobId: job.id, status: pollResult.status }
  }

  if (pollResult.status === 'FAILED') {
    await failGenerationJob(job.id, {
      errorMessage: 'Audio generation failed on provider side',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  if (!pollResult.result) {
    await failGenerationJob(job.id, {
      errorMessage: 'Provider returned completed but no result',
    })
    return { jobId: job.id, status: 'FAILED' }
  }

  const claimed = await db.generationJob.updateMany({
    where: { id: jobId, status: 'RUNNING' },
    data: { status: 'QUEUED' },
  })

  if (claimed.count === 0) {
    const freshJob = await db.generationJob.findUnique({
      where: { id: jobId },
      include: { generation: true },
    })

    if (freshJob?.status === 'COMPLETED' && freshJob.generation) {
      return {
        jobId: freshJob.id,
        status: 'COMPLETED',
        generation: mapGenerationToRecord(freshJob.generation),
      }
    }

    if (freshJob?.status === 'FAILED') {
      return { jobId: freshJob.id, status: 'FAILED' }
    }

    return { jobId: job.id, status: 'IN_PROGRESS' }
  }

  const result = pollResult.result
  const providerLabel = executionRoute.provider

  try {
    const { buffer, mimeType } = await fetchAsBuffer(result.audioUrl)
    const storageKey = generateStorageKey('AUDIO', dbUser.id, result.format)
    const permanentUrl = await uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType,
    })

    const generation = await db.$transaction(async (tx) => {
      const persistedGeneration = await createGeneration(
        {
          userId: dbUser.id,
          outputType: 'AUDIO',
          url: permanentUrl,
          storageKey,
          mimeType,
          width: 0,
          height: 0,
          duration: result.duration,
          prompt: job.prompt ?? '',
          model: job.modelId,
          provider: providerLabel,
          requestCount: result.requestCount,
          isFreeGeneration: executionRoute.isFreeGeneration,
        },
        tx,
      )

      await completeGenerationJob(
        job.id,
        {
          generationId: persistedGeneration.id,
          requestCount: result.requestCount,
        },
        tx,
      )

      await createApiUsageEntry(
        {
          userId: dbUser.id,
          generationId: persistedGeneration.id,
          generationJobId: job.id,
          adapterType: executionRoute.adapterType,
          provider: providerLabel,
          modelId: job.modelId,
          requestCount: result.requestCount,
          inputImageCount: 0,
          outputImageCount: 0,
          durationMs: Date.now() - job.createdAt.getTime(),
          wasSuccessful: true,
        },
        tx,
      )

      return persistedGeneration
    })

    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist audio'

    await failGenerationJob(job.id, {
      requestCount: result.requestCount,
      errorMessage: message,
    })

    throw error
  }
}

function buildAudioSubmitOutboxPayload(
  request: GenerateAudioRequest,
): AudioSubmitOutboxPayload {
  return AudioSubmitOutboxPayloadSchema.parse({
    prompt: request.prompt,
    voiceId: request.voiceId,
    speed: request.speed,
    format: request.format,
    sampleRate: request.sampleRate,
  })
}

function toAudioJobState(job: {
  id: string
  userId: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  modelId: string
  adapterType: string
  provider: string
  prompt: string | null
  externalRequestId: string | null
  createdAt: Date
  generation: AudioJobState['generation']
  executionOutbox: AudioExecutionOutboxState | null
}): AudioJobState {
  return {
    id: job.id,
    userId: job.userId,
    status: job.status,
    modelId: job.modelId,
    adapterType: job.adapterType,
    provider: job.provider,
    prompt: job.prompt,
    externalRequestId: job.externalRequestId,
    createdAt: job.createdAt,
    generation: job.generation,
    executionOutbox: job.executionOutbox,
  }
}

function parseAudioQueueMetadata(serialized: string): AudioQueueMetadata {
  let raw: unknown
  try {
    raw = JSON.parse(serialized)
  } catch {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid queue metadata',
      400,
    )
  }

  const parsed = AudioQueueMetadataSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid queue metadata',
      400,
    )
  }

  return parsed.data
}

function parseAudioQueueRequest(value: unknown): AudioQueueRequest | null {
  const parsed = AudioQueueRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function buildAudioQueueMetadata(
  route: AudioRouteIdentity,
  queueRequest: AudioQueueRequest,
): ReadyAudioQueueMetadata {
  return {
    ...queueRequest,
    route,
  }
}

async function persistAudioQueueMetadata(
  jobId: string,
  queueMeta: ReadyAudioQueueMetadata,
): Promise<void> {
  await withRetry(
    () =>
      db.generationJob.update({
        where: { id: jobId },
        data: {
          externalRequestId: serializeAudioQueueMetadata(queueMeta),
        },
      }),
    {
      maxAttempts: 3,
      baseDelayMs: 250,
      label: 'audio.persistQueueMetadata',
      isRetryable: () => true,
    },
  )
}

async function repairAudioQueueMetadataFromOutbox(
  jobId: string,
  outboxId: string,
  queueMeta: ReadyAudioQueueMetadata,
): Promise<void> {
  try {
    await persistAudioQueueMetadata(jobId, queueMeta)
  } catch (error) {
    const message = `Audio queue metadata repair pending (requestId: ${queueMeta.requestId})`
    try {
      await annotateExecutionOutbox(outboxId, {
        result: queueMeta,
        lastError: message,
      })
    } catch (annotationError) {
      logger.error('Audio execution outbox annotation failed', {
        jobId,
        outboxId,
        requestId: queueMeta.requestId,
        error:
          annotationError instanceof Error
            ? annotationError.message
            : String(annotationError),
      })
    }
    logger.error('Audio queue metadata repair failed', {
      jobId,
      outboxId,
      requestId: queueMeta.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function dispatchAudioSubmitOutbox(
  job: AudioJobState,
  route: AudioRouteIdentity,
  outbox: AudioExecutionOutboxState,
): Promise<ReadyAudioQueueMetadata | null> {
  if (outbox.status === 'FAILED') {
    await failAudioJobIfPossible(
      job.id,
      outbox.lastError ?? 'Audio execution outbox failed',
    )
    return null
  }

  if (outbox.status === 'PROCESSING') {
    const leaseExpired =
      outbox.leaseExpiresAt != null &&
      outbox.leaseExpiresAt.getTime() < Date.now()

    if (!leaseExpired) {
      return null
    }

    const expiredMessage =
      'Audio execution lease expired before queue metadata was persisted'
    await failExpiredExecutionOutbox(outbox.id, expiredMessage)
    await failAudioJobIfPossible(job.id, expiredMessage)
    return null
  }

  if (outbox.status === 'COMPLETED') {
    const completedResult = parseAudioQueueRequest(outbox.result)
    if (!completedResult) {
      await failExecutionOutbox(outbox.id, {
        lastError: 'Audio execution outbox completed without queue metadata',
      })
      await failAudioJobIfPossible(
        job.id,
        'Audio execution outbox completed without queue metadata',
      )
      return null
    }

    const queueMeta = buildAudioQueueMetadata(route, completedResult)
    await repairAudioQueueMetadataFromOutbox(job.id, outbox.id, queueMeta)
    return queueMeta
  }

  const claimed = await tryClaimExecutionOutbox(outbox.id)
  if (!claimed) {
    return null
  }

  const payload = AudioSubmitOutboxPayloadSchema.safeParse(outbox.payload)
  if (!payload.success) {
    const message = 'Audio execution outbox payload is invalid'
    await failExecutionOutbox(outbox.id, { lastError: message })
    await failAudioJobIfPossible(job.id, message)
    return null
  }

  const executionRoute = await resolveStoredAudioRoute(job.userId, route)
  const providerConfig = executionRoute.providerConfig
  if (!providerConfig) {
    const message = 'Stored route provider configuration is unavailable'
    await failExecutionOutbox(outbox.id, { lastError: message })
    await failAudioJobIfPossible(job.id, message)
    return null
  }

  const adapter = getProviderAdapter(executionRoute.adapterType)
  if (!adapter.submitAudioToQueue) {
    const message = 'This model does not support async audio generation'
    await failExecutionOutbox(outbox.id, { lastError: message })
    await failAudioJobIfPossible(job.id, message)
    return null
  }

  const breaker = getCircuitBreaker(executionRoute.adapterType)
  let queueRequest: AudioQueueRequest

  try {
    const queueResult = await breaker.call(() =>
      withRetry(
        () =>
          adapter.submitAudioToQueue!({
            prompt: payload.data.prompt,
            modelId: executionRoute.modelId,
            providerConfig,
            apiKey: executionRoute.apiKey,
            voiceId: payload.data.voiceId,
            speed: payload.data.speed,
            format: payload.data.format,
            sampleRate: payload.data.sampleRate,
          }),
        {
          maxAttempts: 3,
          label: `${executionRoute.provider}/audio-queue`,
        },
      ),
    )

    queueRequest = AudioQueueRequestSchema.parse(queueResult)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Audio generation failed'
    await failExecutionOutbox(outbox.id, { lastError: message })
    await failAudioJobIfPossible(job.id, message)
    return null
  }

  await completeExecutionOutbox(outbox.id, {
    result: queueRequest,
  })

  const queueMeta = buildAudioQueueMetadata(route, queueRequest)
  await repairAudioQueueMetadataFromOutbox(job.id, outbox.id, queueMeta)

  logger.info('Audio generation submitted from execution outbox', {
    jobId: job.id,
    outboxId: outbox.id,
    requestId: queueRequest.requestId,
    model: job.modelId,
  })

  return queueMeta
}

async function getReadyAudioQueueMetadata(
  job: AudioJobState,
  queueMeta: AudioQueueMetadata,
): Promise<ReadyAudioQueueMetadata | null> {
  if (hasPersistedAudioQueueRequest(queueMeta)) {
    return queueMeta
  }

  if (!job.executionOutbox) {
    await failAudioJobIfPossible(
      job.id,
      'Audio queue request metadata is unavailable',
    )
    return null
  }

  return dispatchAudioSubmitOutbox(job, queueMeta.route, job.executionOutbox)
}

async function resolveStoredAudioRoute(
  userId: string,
  route: AudioRouteIdentity | undefined,
): Promise<{
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  provider: string
  providerConfig?: ProviderConfig
  apiKey: string
  isFreeGeneration: boolean
}> {
  if (!route) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has no stored route identity',
      400,
    )
  }

  if (route.isFreeGeneration) {
    const apiKey = getSystemApiKey(route.adapterType)
    if (!apiKey) {
      throw new GenerateImageServiceError(
        'PLATFORM_KEY_MISSING',
        'Stored route API key is unavailable',
        503,
      )
    }

    return {
      modelId: route.modelId,
      adapterType: route.adapterType,
      provider: route.provider,
      providerConfig: route.providerConfig,
      apiKey,
      isFreeGeneration: true,
    }
  }

  if (!route.apiKeyId) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Stored route API key is missing',
      400,
    )
  }

  const apiKeyRecord = await getApiKeyValueById(route.apiKeyId, userId)
  if (!apiKeyRecord || apiKeyRecord.adapterType !== route.adapterType) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Stored route API key is unavailable',
      400,
    )
  }

  return {
    modelId: route.modelId,
    adapterType: route.adapterType,
    provider: route.provider,
    providerConfig: route.providerConfig,
    apiKey: apiKeyRecord.keyValue,
    isFreeGeneration: false,
  }
}

function buildAudioRouteIdentity(
  route: {
    modelId: string
    adapterType: AI_ADAPTER_TYPES
    providerConfig: ProviderConfig
    resolvedApiKeyId?: string | null
    isFreeGeneration?: boolean
  },
  provider: string,
): AudioRouteIdentity {
  return {
    modelId: route.modelId,
    adapterType: route.adapterType,
    provider,
    providerConfig: route.providerConfig,
    apiKeyId: route.resolvedApiKeyId ?? null,
    isFreeGeneration: route.isFreeGeneration ?? false,
  }
}

function serializeAudioQueueMetadata(queueMeta: AudioQueueMetadata): string {
  return JSON.stringify(queueMeta)
}

function hasPersistedAudioQueueRequest(
  queueMeta: AudioQueueMetadata,
): queueMeta is AudioQueueMetadata & {
  requestId: string
  statusUrl: string
  responseUrl: string
} {
  return (
    typeof queueMeta.requestId === 'string' &&
    queueMeta.requestId.length > 0 &&
    typeof queueMeta.statusUrl === 'string' &&
    queueMeta.statusUrl.length > 0 &&
    typeof queueMeta.responseUrl === 'string' &&
    queueMeta.responseUrl.length > 0
  )
}

async function failAudioJobIfPossible(
  jobId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await failGenerationJob(jobId, { errorMessage })
  } catch (error) {
    logger.error('Failed to persist audio job failure state', {
      jobId,
      errorMessage,
      error: error instanceof Error ? error.message : String(error),
    })
  }
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
