import 'server-only'
import sharp from 'sharp'

import {
  EXECUTION_INTERNAL,
  EXECUTION_WORKER,
  EXECUTION_WORKFLOW_IDS,
} from '@/constants/execution'
import { WORKER_VIDEO_PROVIDER_IDS } from '@/constants/worker-video-providers'
import {
  AI_MODELS,
  getExecutionModelId,
  getModelById,
} from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import type {
  GenerateVideoRequest,
  GenerationRecord,
  WorkerRunContext,
  VideoStatusResponseData,
  VideoSubmitResponseData,
} from '@/types'
import {
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import { failGenerationJob } from '@/services/usage.service'
import { buildVideoRecipeDraft } from '@/services/generation-recipe.service'
import {
  createWorkerGenerationJob,
  dispatchWorkerRunDurably,
} from '@/services/worker-dispatch-outbox.service'
import { buildGenerationFailureResponseFields } from '@/services/generation-failure-response.service'
import {
  getImageInputCount,
  parseWorkerJobMetadata,
} from '@/services/execution-callback.service'
import { ensureUser } from '@/services/user.service'
import { withCharacterVideoReferences } from '@/features/cards/server'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
  type ResolvedGenerationRoute,
} from '@/services/image/generate-image.service'
import {
  buildInternalUrl,
  isExecutionWorkerDispatchConfigured,
} from '@/services/execution-worker.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { getVideoOutputSize } from '@/lib/video-utils'
import { validatePrompt } from '@/services/kernel/prompt-guard'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
} from '@/lib/generation-observability'
import { validateVideoGenerationInput } from '@/services/video-generation-validation.service'
import { reconcileActiveGenerationJob } from '@/services/execution-sweeper.service'

/**
 * 能派给执行 Worker 的视频服务商：名单在共享契约 `worker-video-providers.ts`，
 * Worker 的提交 / 轮询驱动表按同一份穷举，两边不会再对不上。
 */
// 赋值这一步就是编译期检查：名单里每一家都得是真实存在的 adapter 类型。
const WORKER_VIDEO_ADAPTER_IDS: readonly `${AI_ADAPTER_TYPES}`[] =
  WORKER_VIDEO_PROVIDER_IDS
const WORKER_CAPABLE_VIDEO_ADAPTERS: ReadonlySet<string> = new Set(
  WORKER_VIDEO_ADAPTER_IDS,
)

function canSubmitVideoViaExecutionWorker(route: {
  adapterType: string
  resolvedApiKeyId?: string | null
  isFreeGeneration?: boolean
}): boolean {
  return (
    isExecutionWorkerDispatchConfigured() &&
    WORKER_CAPABLE_VIDEO_ADAPTERS.has(route.adapterType) &&
    (Boolean(route.resolvedApiKeyId) || route.isFreeGeneration === true)
  )
}

// ─── Submit video to fal.ai queue ────────────────────────────────

export async function submitVideoGeneration(
  clerkId: string,
  input: GenerateVideoRequest,
): Promise<VideoSubmitResponseData> {
  const dbUser = await ensureUser(clerkId)

  return submitVideoGenerationForUserId(dbUser.id, input)
}

export async function submitVideoGenerationForUserId(
  userId: string,
  request: GenerateVideoRequest,
): Promise<VideoSubmitResponseData> {
  // 卡片总线的视频出口：@ 了角色的镜头，把她勾的图追加进参考图（按本人校验、按端点封顶）。
  const input = await withCharacterVideoReferences(userId, request)
  const timer = new GenerationStageTimer({
    outputType: 'VIDEO',
    modelId: input.modelId,
  })

  const { executionRoute, provider, modelConfig } = await timer.measure(
    GENERATION_STAGE.AUTH_ROUTE_RESOLVE,
    async () => {
      // 长度只认模型自己声明的上限（厂商硬上限）；没声明就不拦（owner 2026-09-27）。
      const promptCheck = validatePrompt(
        input.prompt,
        getModelById(input.modelId)?.maxPromptChars ?? null,
      )
      if (!promptCheck.valid) {
        throw new GenerateImageServiceError(
          'PROVIDER_ERROR',
          promptCheck.reason ?? 'Invalid prompt',
          400,
        )
      }

      validateVideoGenerationInput({
        modelId: input.modelId,
        aspectRatio: input.aspectRatio,
        duration: input.duration,
        referenceImage: input.referenceImage ?? input.referenceImages?.[0],
        referenceImages: input.referenceImages,
        audioUrls: input.audioUrls,
        videoUrls: input.videoUrls,
        resolution: input.resolution,
      })

      const resolvedRoute = await resolveGenerationRoute(userId, input)
      const resolvedProvider = getProviderLabel(resolvedRoute.providerConfig)

      return {
        executionRoute: resolvedRoute,
        provider: resolvedProvider,
        modelConfig:
          resolvedRoute.modelConfig ?? getModelById(resolvedRoute.modelId),
      }
    },
  )

  timer.setContext({
    modelId: executionRoute.modelId,
    adapterType: executionRoute.adapterType,
    provider,
    routeKind: executionRoute.isFreeGeneration ? 'free-tier' : 'user-key',
  })

  if (modelConfig && canSubmitVideoViaExecutionWorker(executionRoute)) {
    return submitFalVideoWorkerRun({
      input,
      userId,
      adapterType: executionRoute.adapterType,
      provider,
      routeModelId: executionRoute.modelId,
      apiKeyId: executionRoute.resolvedApiKeyId ?? input.apiKeyId,
      useSystemKey:
        executionRoute.isFreeGeneration === true &&
        !executionRoute.resolvedApiKeyId,
      isFreeGeneration: executionRoute.isFreeGeneration,
      // resolvedApiKeyId 非空 = 调用方自带 key(BYOK)，平台没掏钱。
      isPlatformFunded: !executionRoute.resolvedApiKeyId,
      modelConfig,
      externalModelId: executionRoute.externalModelId,
      timer,
    })
  }

  throw new GenerateImageServiceError(
    'UNSUPPORTED_MODEL',
    'This video provider has not been migrated to the execution worker yet',
    501,
  )
}

async function submitFalVideoWorkerRun(params: {
  input: GenerateVideoRequest
  userId: string
  adapterType: string
  provider: string
  routeModelId: string
  apiKeyId?: string | null
  useSystemKey: boolean
  isFreeGeneration?: boolean
  isPlatformFunded: boolean
  modelConfig: NonNullable<ResolvedGenerationRoute['modelConfig']>
  externalModelId?: string
  timer: GenerationStageTimer
}): Promise<VideoSubmitResponseData> {
  const {
    input,
    userId,
    adapterType,
    provider,
    routeModelId,
    apiKeyId,
    useSystemKey,
    isFreeGeneration,
    isPlatformFunded,
    modelConfig,
    externalModelId,
    timer,
  } = params

  if (!apiKeyId && !useSystemKey) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'Execution worker runs require a saved API key or platform key',
      400,
    )
  }

  // Multi-reference models (Veo 3.1) supply `referenceImages`; for everything
  // else we just upload the singular `referenceImage`. Parallel uploads keep
  // multi-image latency under the slowest single image, not their sum.
  const sourceRefs: string[] =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : input.referenceImage
        ? [input.referenceImage]
        : []
  let firstFrameAspectRatio: string | undefined
  const uploadedRefUrls: string[] =
    sourceRefs.length > 0
      ? await timer.measure(GENERATION_STAGE.REFERENCE_UPLOAD, () =>
          Promise.all(
            sourceRefs.map(async (ref, index) => {
              const refKey = generateStorageKey('IMAGE', userId)
              const { buffer: refBuffer, mimeType: refMimeType } =
                await fetchAsBuffer(ref)
              if (
                index === 0 &&
                modelConfig.id === AI_MODELS.MINIMAX_H3_MAX_TURBO
              ) {
                const { autoOrient } = await sharp(refBuffer).metadata()
                firstFrameAspectRatio = `${autoOrient.width}:${autoOrient.height}`
              }
              return uploadToR2({
                data: refBuffer,
                key: refKey,
                mimeType: refMimeType,
              })
            }),
          ),
        )
      : []
  const referenceImageUrl: string | undefined = uploadedRefUrls[0]

  const { width, height } = getVideoOutputSize(
    firstFrameAspectRatio ?? input.aspectRatio,
    modelConfig.videoKind === 'edit'
      ? (modelConfig.videoDefaults?.resolution ?? input.resolution)
      : (input.resolution ?? modelConfig.videoDefaults?.resolution),
  )
  const outputStorageKey = generateStorageKey('VIDEO', userId)
  const metadata = {
    workerManaged: true,
    outputType: 'VIDEO',
    workflowId: input.workflowId,
    executionWorkflowId: EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
    referenceImageUrl,
    characterCardIds: input.characterCardIds,
    characterLookIds: input.characterLookIds,
    isFreeGeneration,
    /**
     * 助手给这一枪起的名（切片 Y）。⭐ 只能搭这趟队列元数据走：视频生成是异步的，
     * 请求这一跳只建 job，产物名要等几十秒后的回调（`execution-callback.service`）
     * 才写得进 snapshot。⚠ 缺席 = 没人给名字，摘要照旧从提示词里摘一段。
     */
    displayLabel: input.displayLabel,
    /** 生成配方草稿（p-auto-recipe）：回调落库时补上服务商回传的种子，写进 Generation.recipe。 */
    recipe: buildVideoRecipeDraft({
      modelId: routeModelId,
      prompt: input.prompt,
      workflowId: input.workflowId,
      negativePrompt: input.negativePrompt,
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      resolution: input.resolution,
      seed: input.seed,
      generateAudio: input.generateAudio,
      referenceImages: uploadedRefUrls,
      videoUrls: input.videoUrls,
      audioUrls: input.audioUrls,
      characterCardIds: input.characterCardIds,
    }),
  }

  const generationJob = await timer.measure(GENERATION_STAGE.JOB_CREATE, () =>
    createWorkerGenerationJob({
      userId,
      adapterType,
      provider,
      modelId: routeModelId,
      prompt: input.prompt,
      externalRequestId: JSON.stringify(metadata),
      isPlatformFunded,
      conversationId: input.conversationId,
    }),
  )
  timer.setContext({ jobId: generationJob.id })

  const runContext: WorkerRunContext = {
    runId: generationJob.id,
    workflowId: EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
    outputType: 'VIDEO',
    providerId: adapterType,
    apiKeyId: apiKeyId ?? undefined,
    useSystemKey: useSystemKey || undefined,
    callbackUrl: buildInternalUrl(EXECUTION_INTERNAL.CALLBACK_PATH),
    resolveKeyUrl: buildInternalUrl(EXECUTION_INTERNAL.RESOLVE_KEY_PATH),
    timeoutMs: modelConfig.timeoutMs ?? EXECUTION_WORKER.DEFAULT_TIMEOUT_MS,
    maxAttempts: EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS,
    pollIntervalMs: EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS,
    providerInput: {
      prompt: input.prompt,
      modelId: routeModelId,
      externalModelId: externalModelId ?? getExecutionModelId(routeModelId),
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      referenceImage: referenceImageUrl,
      referenceImages: uploadedRefUrls.length > 1 ? uploadedRefUrls : undefined,
      audioUrls:
        input.audioUrls && input.audioUrls.length > 0
          ? input.audioUrls
          : undefined,
      audioBindings:
        input.audioBindings && input.audioBindings.length > 0
          ? input.audioBindings
          : undefined,
      videoUrls:
        input.videoUrls && input.videoUrls.length > 0
          ? input.videoUrls
          : undefined,
      negativePrompt: input.negativePrompt,
      generateAudio: input.generateAudio,
      seed: input.seed,
      resolution: input.resolution,
      i2vModelId: modelConfig.i2vModelId,
      videoDefaults: modelConfig.videoDefaults,
      providerBaseUrl: modelConfig.providerConfig.baseUrl,
      outputStorageKey,
      width,
      height,
    },
  }

  try {
    const dispatch = await timer.measure(GENERATION_STAGE.WORKER_DISPATCH, () =>
      dispatchWorkerRunDurably(runContext),
    )
    if (!dispatch.delivered) {
      // 送没送到不知道：任务照常交回，状态轮询会从 outbox 补发（Worker 按 job.id 去重）。
      timer.log({ workflowInstanceId: generationJob.id })
      return { jobId: generationJob.id, requestId: generationJob.id }
    }

    try {
      await timer.measure(GENERATION_STAGE.DB_FINALIZE, () =>
        db.generationJob.update({
          where: { id: generationJob.id },
          data: {
            externalRequestId: JSON.stringify({
              ...metadata,
              workflowInstanceId: dispatch.workflowInstanceId,
            }),
          },
        }),
      )
    } catch (error) {
      logger.warn(
        'Video workflow accepted but workflow metadata persistence failed',
        {
          jobId: generationJob.id,
          workflowInstanceId: dispatch.workflowInstanceId,
          error: error instanceof Error ? error.message : String(error),
        },
      )
    }

    logger.info('FAL video dispatched to execution worker', {
      jobId: generationJob.id,
      workflowInstanceId: dispatch.workflowInstanceId,
    })
    timer.log({ workflowInstanceId: dispatch.workflowInstanceId })

    return {
      jobId: generationJob.id,
      requestId: dispatch.workflowInstanceId,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to dispatch execution worker'

    await failGenerationJob(generationJob.id, {
      errorMessage: message,
    })

    throw error
  }
}

// ─── Check video generation status ──────────────────────────────

export async function checkVideoGenerationStatus(
  clerkId: string,
  jobId: string,
): Promise<VideoStatusResponseData> {
  const dbUser = await ensureUser(clerkId)

  return checkVideoGenerationStatusForUserId(dbUser.id, jobId)
}

export async function checkVideoGenerationStatusForUserId(
  userId: string,
  jobId: string,
): Promise<VideoStatusResponseData> {
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true },
  })

  if (!job || job.userId !== userId) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Video generation job not found',
      404,
    )
  }

  const reconciled = await reconcileActiveGenerationJob(job)
  if (reconciled) {
    return { jobId: job.id, status: 'FAILED', ...reconciled }
  }

  // Already completed — return cached result
  if (job.status === 'COMPLETED' && job.generation) {
    return {
      jobId: job.id,
      status: 'COMPLETED',
      generation: mapGenerationToRecord(job.generation),
    }
  }

  // Already failed
  if (job.status === 'FAILED') {
    const metadata = parseWorkerJobMetadata(job.externalRequestId)
    return {
      jobId: job.id,
      status: 'FAILED',
      ...buildGenerationFailureResponseFields({
        ...job,
        hasReferenceImage: getImageInputCount(metadata) > 0,
      }),
    }
  }

  // User-cancelled (see generation-cancel.service.ts)
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

  // Parse stored queue metadata
  let queueMeta: {
    workerManaged?: boolean
  }
  try {
    queueMeta = JSON.parse(job.externalRequestId)
  } catch {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Job has invalid queue metadata',
      400,
    )
  }

  if (queueMeta.workerManaged) {
    return { jobId: job.id, status: 'IN_PROGRESS' }
  }

  await failGenerationJob(job.id, {
    errorMessage:
      'Legacy inline video jobs are no longer supported; video execution must run on the execution worker',
  })
  return {
    jobId: job.id,
    status: 'FAILED',
    error:
      'Legacy inline video jobs are no longer supported; video execution must run on the execution worker',
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function mapGenerationToRecord(gen: {
  id: string
  createdAt: Date
  outputType: string
  status: string
  url: string
  storageKey: string
  mimeType: string
  thumbnailUrl?: string | null
  thumbnailStorageKey?: string | null
  previewUrl?: string | null
  previewStorageKey?: string | null
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
  seed?: bigint | string | number | null
}): GenerationRecord {
  return {
    id: gen.id,
    createdAt: gen.createdAt,
    outputType: gen.outputType as GenerationRecord['outputType'],
    status: gen.status as GenerationRecord['status'],
    url: gen.url,
    storageKey: gen.storageKey,
    mimeType: gen.mimeType,
    thumbnailUrl: gen.thumbnailUrl,
    thumbnailStorageKey: gen.thumbnailStorageKey,
    previewUrl: gen.previewUrl,
    previewStorageKey: gen.previewStorageKey,
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
    // Generation.seed is a prisma BigInt — coerce to number for JSON-safe
    // serialization in the video status API (seed ≤ 2^31, Number is exact).
    // Without this, JSON.stringify throws "Do not know how to serialize a BigInt".
    seed: gen.seed != null ? Number(gen.seed) : null,
  }
}
