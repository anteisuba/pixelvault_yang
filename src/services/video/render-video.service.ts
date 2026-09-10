import 'server-only'

import { z } from 'zod'

import {
  EDIT_ASPECTS,
  EDIT_RESOLUTIONS,
  EDIT_TEXT_ANCHORS_TUPLE,
  EDIT_TEXT_FADE_MAX_SEC,
  EDIT_TEXT_MAX_LENGTH,
  EDIT_TEXT_TONES_TUPLE,
} from '@/constants/edit-desk'
import {
  RENDER_MAX_DURATION_SEC,
  RENDER_MAX_SEGMENTS,
  RENDER_PLAN_VERSION,
  RENDER_STEPS,
  RENDER_STEP_IDS,
  RENDER_WORKER,
  type RenderJobStatusId,
  type RenderStepId,
} from '@/constants/render-video'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { createInternalExecutionHeaders } from '@/lib/signature-verifiers/internal-execution'
import { createGeneration } from '@/services/generation.service'
import { getUserByClerkId } from '@/services/user.service'
import {
  completeGenerationJob,
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'

/**
 * 剪辑台渲染层的服务面（S9 · spec §6）。
 *
 * 三件事：**入队**（建 `GenerationJob` → 签名派发给 `render-video` worker）、
 * **查状态**、**取消**；外加 worker 回调时的**回写**。
 *
 * ⛔ 这一层不算时间线：`RenderPlan` 由浏览器用 `toRenderPlan()` 算好交上来，这里
 * 只 Zod 校验 + 入队。理由是那份算术要被单测逐条钉住，而服务层跑不了纯函数测试的
 * 那种密度。⚠ 但**校验不能省** —— 载荷来自浏览器，`RenderPlan` 是不可信输入。
 *
 * ⛔ 渲染一期**不扣积分**（owner 定）：成本 ≈ $0.007 / 2 分钟成片（CF Container
 * standard-3，调研 `video-edit-models.md` §1.3），量级上不值得为它做一套计费。
 * 护栏改用「时长上限 + 段数上限 + 每用户在飞任务数」——见下面三处。
 */

/* ─── Zod（与 `src/constants/render-video.ts` 的类型一一对应）──────────── */

/**
 * 素材地址。⚠ 必须是 http(s)：容器会真的去 fetch 它，`file://` / `gopher://`
 * 之类在容器里就是一次任意读。⛔ `z.string().url()` 单独不够 —— 它放行任何 scheme。
 */
const AssetUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine(
    (value) => value.startsWith('https://') || value.startsWith('http://'),
    { message: 'Asset URL must be http(s).' },
  )

const RenderVideoSegmentSchema = z.object({
  id: z.string().trim().min(1).max(160),
  src: AssetUrlSchema,
  in: z.number().min(0).max(36_000),
  out: z.number().min(0).max(36_000),
  speed: z.number().min(0.25).max(4),
  muted: z.boolean(),
  transitionOut: z.enum(['none', 'crossfade', 'black']),
  durationSec: z.number().min(0).max(RENDER_MAX_DURATION_SEC),
  sourceNodeId: z.string().trim().min(1).max(160),
  sourceVersionId: z.string().trim().min(1).max(160).optional(),
})

const RenderAudioSegmentSchema = z.object({
  id: z.string().trim().min(1).max(160),
  src: AssetUrlSchema,
  in: z.number().min(0).max(36_000),
  out: z.number().min(0).max(36_000),
  speed: z.number().min(0.25).max(4),
  gain: z.number().min(0).max(2),
  startSec: z.number().min(0).max(RENDER_MAX_DURATION_SEC),
  durationSec: z.number().min(0).max(RENDER_MAX_DURATION_SEC),
  sourceNodeId: z.string().trim().min(1).max(160),
})

/**
 * 一段字幕（S8d）。⚠ 与画面 / 声音段不同，它**没有 `src`** —— 内容就在载荷里，
 * 所以这里守的是长度与区间，⛔ 不必过 `AssetUrlSchema`。
 */
const RenderTextSegmentSchema = z.object({
  id: z.string().trim().min(1).max(160),
  text: z.string().min(1).max(EDIT_TEXT_MAX_LENGTH),
  startSec: z.number().min(0).max(RENDER_MAX_DURATION_SEC),
  durationSec: z.number().min(0).max(RENDER_MAX_DURATION_SEC),
  anchor: z.enum(EDIT_TEXT_ANCHORS_TUPLE),
  fontSizePx: z.number().int().min(1).max(2048),
  marginPx: z.number().int().min(0).max(2048),
  tone: z.enum(EDIT_TEXT_TONES_TUPLE),
  fadeSec: z.number().min(0).max(EDIT_TEXT_FADE_MAX_SEC),
})

export const RenderPlanSchema = z.object({
  version: z.literal(RENDER_PLAN_VERSION),
  name: z.string().trim().min(1).max(160),
  projectId: z.string().trim().min(1).max(160),
  output: z.object({
    aspect: z.enum(EDIT_ASPECTS),
    resolution: z.enum(EDIT_RESOLUTIONS),
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(7680),
    fps: z.number().int().min(1).max(60),
  }),
  video: z.array(RenderVideoSegmentSchema).min(1).max(RENDER_MAX_SEGMENTS),
  audio: z.array(RenderAudioSegmentSchema).max(RENDER_MAX_SEGMENTS),
  music: z.array(RenderAudioSegmentSchema).max(RENDER_MAX_SEGMENTS),
  /**
   * 字幕（S8d）。⚠ `.default([])`：S8d 之前的客户端发不出这一项，而一条**在飞**的
   * 断点续传会把当时那份载荷原样再交一次 —— 少了默认值它会在服务端被判成脏载荷。
   */
  texts: z.array(RenderTextSegmentSchema).max(RENDER_MAX_SEGMENTS).default([]),
  totalDurationSec: z.number().min(0.1).max(RENDER_MAX_DURATION_SEC),
})

export type RenderPlanInput = z.infer<typeof RenderPlanSchema>

export const RenderSubmitSchema = z.object({
  plan: RenderPlanSchema,
  /** 完成后要不要在画布上落一张成片卡（客户端做，服务端只回传这个意图）。 */
  toCanvas: z.boolean().default(true),
})

export type RenderSubmitInput = z.infer<typeof RenderSubmitSchema>

/** worker 回调的载荷。⚠ 与 `workers/render-video/src/index.ts` 的 `postCallback` 同源。 */
export const RenderCallbackSchema = z.object({
  runId: z.string().trim().min(1).max(160),
  jobId: z.string().trim().min(1).max(160),
  kind: z.enum(['status', 'result']),
  ts: z.string().optional(),
  step: z
    .enum(RENDER_STEPS as unknown as [RenderStepId, ...RenderStepId[]])
    .optional(),
  progress: z.number().min(0).max(1).optional(),
  status: z.literal('failed').optional(),
  error: z.string().max(2000).optional(),
  url: z.string().url().max(2048).optional(),
  storageKey: z.string().max(1024).optional(),
  thumbnailUrl: z.string().url().max(2048).optional(),
  thumbnailStorageKey: z.string().max(1024).optional(),
  mimeType: z.string().max(160).optional(),
  duration: z.number().min(0).max(RENDER_MAX_DURATION_SEC).optional(),
  width: z.number().int().min(16).max(7680).optional(),
  height: z.number().int().min(16).max(7680).optional(),
  outputType: z.literal('VIDEO').optional(),
})

export type RenderCallbackInput = z.infer<typeof RenderCallbackSchema>

/* ─── 出口形状 ─────────────────────────────────────────────────────────── */

export interface RenderJobView {
  readonly jobId: string
  readonly status: RenderJobStatusId
  /** 0..1。⚠ `undefined` = 还没有任何一步报过数（「不知道」不是 0）。 */
  readonly progress?: number
  readonly step?: RenderStepId
  readonly name: string
  readonly url?: string
  readonly thumbnailUrl?: string
  readonly durationSec?: number
  readonly generationId?: string
  readonly error?: string
}

/** 渲染任务在 `GenerationJob` 里的标记 —— ⛔ 别和真的模型生成混在一起统计。 */
export const RENDER_JOB_ADAPTER = 'render-video'
export const RENDER_JOB_PROVIDER = 'cloudflare'
export const RENDER_JOB_MODEL = 'ffmpeg-container'

/** 每用户同时在飞的渲染任务上限 —— 一期不扣积分，这就是那道闸。 */
export const RENDER_MAX_ACTIVE_JOBS_PER_USER = 2

function toStatus(status: string): RenderJobStatusId {
  switch (status) {
    case 'COMPLETED':
      return 'completed'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'RUNNING':
      return 'running'
    default:
      return 'queued'
  }
}

/**
 * 进度存在哪。
 *
 * ⚠ 借 `GenerationJob.providerJobId` 存 `<step>:<progress>` —— ⛔ 不为一条进度加
 * 一张表 / 一个字段（prisma 本片不动）。字段本来存的是「外部任务 id」，而渲染任务
 * 的外部 id 就是 jobId 自己，这一格空着。
 */
function encodeProgress(step: RenderStepId, progress: number): string {
  return `${step}:${progress}`
}

export function decodeProgress(value: string | null | undefined): {
  step?: RenderStepId
  progress?: number
} {
  if (!value) return {}
  const [step, progress] = value.split(':')
  const known = RENDER_STEPS.find((candidate) => candidate === step)
  const ratio = Number.parseFloat(progress ?? '')
  return {
    ...(known ? { step: known } : {}),
    ...(Number.isFinite(ratio) ? { progress: ratio } : {}),
  }
}

function workerBaseUrl(): string {
  const base = process.env.RENDER_WORKER_BASE_URL
  if (!base) {
    throw new ApiRequestError(
      'RENDER_WORKER_NOT_CONFIGURED',
      503,
      'errors.render.workerUnavailable',
      'RENDER_WORKER_BASE_URL is not set — the render worker is not deployed.',
    )
  }
  return base.replace(/\/$/, '')
}

function callbackSecret(): string {
  const secret = process.env.INTERNAL_CALLBACK_SECRET
  if (!secret) {
    throw new ApiRequestError(
      'RENDER_WORKER_NOT_CONFIGURED',
      503,
      'errors.render.workerUnavailable',
      'INTERNAL_CALLBACK_SECRET is not set.',
    )
  }
  return secret
}

/* ─── 入队 ─────────────────────────────────────────────────────────────── */

export async function submitRenderJob(
  clerkId: string,
  input: RenderSubmitInput,
): Promise<RenderJobView> {
  const user = await getUserByClerkId(clerkId)
  if (!user) {
    throw new ApiRequestError(
      'USER_NOT_FOUND',
      404,
      'errors.common.unexpected',
      'User not found.',
    )
  }

  const active = await db.generationJob.count({
    where: {
      userId: user.id,
      adapterType: RENDER_JOB_ADAPTER,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
  })
  if (active >= RENDER_MAX_ACTIVE_JOBS_PER_USER) {
    throw new ApiRequestError(
      'RENDER_TOO_MANY_ACTIVE',
      429,
      'errors.render.tooManyActive',
      'Too many renders already running.',
    )
  }

  const job = await createGenerationJob({
    userId: user.id,
    adapterType: RENDER_JOB_ADAPTER,
    provider: RENDER_JOB_PROVIDER,
    modelId: RENDER_JOB_MODEL,
    prompt: input.plan.name,
    externalRequestId: input.plan.name.slice(0, 160),
  })

  try {
    await dispatchRenderRun({
      runId: job.id,
      jobId: job.id,
      userId: user.id,
      plan: input.plan,
    })
  } catch (error) {
    // ⚠ 入队失败要**大声**：把 job 标 FAILED 再抛，否则它会永远挂在 QUEUED 上，
    // 用户看到的是「一直在渲」而不是「没渲成」。
    await failGenerationJob(job.id, {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCode: 'RENDER_DISPATCH_FAILED',
    }).catch(() => undefined)
    throw error
  }

  logger.info('render.submitted', {
    userId: user.id,
    jobId: job.id,
    segments: input.plan.video.length,
    durationSec: input.plan.totalDurationSec,
  })

  return {
    jobId: job.id,
    status: 'queued',
    name: input.plan.name,
  }
}

async function dispatchRenderRun(payload: {
  runId: string
  jobId: string
  userId: string
  plan: RenderPlanInput
}): Promise<void> {
  const url = `${workerBaseUrl()}${RENDER_WORKER.SUBMIT_PATH}`
  const body = JSON.stringify(payload)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createInternalExecutionHeaders({
          body,
          method: 'POST',
          url,
          secret: callbackSecret(),
        }),
      },
      body,
      signal: AbortSignal.timeout(RENDER_WORKER.DISPATCH_TIMEOUT_MS),
    })
  } catch (error) {
    throw new ApiRequestError(
      'RENDER_DISPATCH_FAILED',
      502,
      'errors.render.dispatchFailed',
      `Render worker unreachable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new ApiRequestError(
      'RENDER_DISPATCH_FAILED',
      502,
      'errors.render.dispatchFailed',
      `Render worker rejected the job (${response.status}): ${detail.slice(0, 200)}`,
    )
  }
}

/* ─── 查状态 ───────────────────────────────────────────────────────────── */

export async function getRenderJob(
  clerkId: string,
  jobId: string,
): Promise<RenderJobView | null> {
  const user = await getUserByClerkId(clerkId)
  if (!user) return null

  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { generation: true },
  })
  // ⚠ 归属校验在服务端：不是自己的任务一律当成「没有」，⛔ 不回 403（那等于确认
  // 这个 id 存在）。
  if (!job || job.userId !== user.id) return null

  const { step, progress } = decodeProgress(job.providerJobId)
  const generation = job.generation
  return {
    jobId: job.id,
    status: toStatus(job.status),
    name: job.prompt ?? '',
    ...(step ? { step } : {}),
    ...(progress !== undefined ? { progress } : {}),
    ...(generation?.url ? { url: generation.url } : {}),
    ...(generation?.thumbnailUrl
      ? { thumbnailUrl: generation.thumbnailUrl }
      : {}),
    ...(generation?.duration ? { durationSec: generation.duration } : {}),
    ...(generation?.id ? { generationId: generation.id } : {}),
    ...(job.errorMessage ? { error: job.errorMessage } : {}),
  }
}

/** 这个用户最近一条**没跑完**的渲染 —— 「上次导出未完成 · 继续 / 重来」读它。 */
export async function getLatestUnfinishedRenderJob(
  clerkId: string,
): Promise<RenderJobView | null> {
  const user = await getUserByClerkId(clerkId)
  if (!user) return null
  const job = await db.generationJob.findFirst({
    where: {
      userId: user.id,
      adapterType: RENDER_JOB_ADAPTER,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!job) return null
  return getRenderJob(clerkId, job.id)
}

/* ─── 取消 ─────────────────────────────────────────────────────────────── */

export async function cancelRenderJob(
  clerkId: string,
  jobId: string,
): Promise<RenderJobView | null> {
  const user = await getUserByClerkId(clerkId)
  if (!user) return null

  const job = await db.generationJob.findUnique({ where: { id: jobId } })
  if (!job || job.userId !== user.id) return null

  // 先落库再通知 worker：DB 是真理，worker 那一刀是 best-effort。
  const updated = await db.generationJob.updateMany({
    where: { id: jobId, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })

  if (updated.count > 0) {
    const url = `${workerBaseUrl()}${RENDER_WORKER.CANCEL_PATH}`
    const body = JSON.stringify({ jobId })
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createInternalExecutionHeaders({
          body,
          method: 'POST',
          url,
          secret: callbackSecret(),
        }),
      },
      body,
      signal: AbortSignal.timeout(RENDER_WORKER.DISPATCH_TIMEOUT_MS),
    }).catch((error: unknown) => {
      logger.warn('render.cancel.notify_failed', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return getRenderJob(clerkId, jobId)
}

/* ─── 回写 ─────────────────────────────────────────────────────────────── */

/**
 * worker 回调 → 落库。
 *
 * `status` 帧只更新进度；`result` 帧建 `Generation` 并把 job 收尾。
 * ⚠ 已经终态的 job 一律忽略：取消之后迟到的完成帧不能把它复活。
 */
export async function handleRenderCallback(
  payload: RenderCallbackInput,
): Promise<{ readonly jobId: string; readonly action: string }> {
  const job = await db.generationJob.findUnique({
    where: { id: payload.runId },
  })
  if (!job) return { jobId: payload.runId, action: 'not-found' }
  if (
    job.status === 'COMPLETED' ||
    job.status === 'FAILED' ||
    job.status === 'CANCELLED'
  ) {
    return { jobId: job.id, action: 'ignored-terminal' }
  }

  if (payload.kind === 'status') {
    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        startedAt: job.startedAt ?? new Date(),
        providerJobId: encodeProgress(
          payload.step ?? RENDER_STEP_IDS.download,
          payload.progress ?? 0,
        ),
      },
    })
    return { jobId: job.id, action: 'progress' }
  }

  if (payload.status === 'failed' || !payload.url || !payload.storageKey) {
    await failGenerationJob(job.id, {
      errorMessage: payload.error ?? 'Render failed without a result.',
      errorCode: 'RENDER_FAILED',
    })
    return { jobId: job.id, action: 'failed' }
  }

  const generation = await createGeneration({
    url: payload.url,
    storageKey: payload.storageKey,
    mimeType: payload.mimeType ?? 'video/mp4',
    ...(payload.thumbnailUrl ? { thumbnailUrl: payload.thumbnailUrl } : {}),
    ...(payload.thumbnailStorageKey
      ? { thumbnailStorageKey: payload.thumbnailStorageKey }
      : {}),
    width: payload.width ?? 0,
    height: payload.height ?? 0,
    ...(payload.duration ? { duration: payload.duration } : {}),
    prompt: job.prompt ?? '',
    model: RENDER_JOB_MODEL,
    provider: RENDER_JOB_PROVIDER,
    requestCount: 1,
    outputType: 'VIDEO',
    // ⚠ 渲染不花钱（自建容器），所以标 free —— ⛔ 不写成一次「平台掏钱的生成」，
    // 那会让成本报表把 $0.007 记成一次模型调用。
    isFreeGeneration: true,
    userId: job.userId,
    displayLabel: job.prompt ?? undefined,
    sourceSurface: 'EDIT',
  })

  await completeGenerationJob(job.id, {
    generationId: generation.id,
    requestCount: 1,
  })

  logger.info('render.completed', {
    jobId: job.id,
    generationId: generation.id,
  })
  return { jobId: job.id, action: 'completed' }
}
