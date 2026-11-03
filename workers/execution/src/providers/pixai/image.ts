import {
  PIXAI_ASPECT_RATIOS,
  PIXAI_BATCH_SIZE,
  PIXAI_CREATE_IMAGE_PATH,
  PIXAI_MAX_WAITING_TASKS,
  PIXAI_POLL_INTERVAL_MS,
  PIXAI_SIZES,
  PIXAI_TASK_PATH,
  PIXAI_TSUBAKI_MODES,
} from '../../../../../src/constants/pixai'
import type {
  ExecutionEnv,
  WorkerImageGenerationResult,
  WorkerImageRunContext,
} from '../../index'
import {
  isRecord,
  readNumberField,
  readPositiveNumberField,
  readStringField,
} from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  downloadAndUploadImageArtifactToKey,
  getImageReferenceInputs,
  getStandardImageDimensions,
  getWorkerImageOutputKey,
  readAdvancedRecord,
} from '../../lib/image-io'

export const PIXAI_API_BASE_URL = 'https://api.pixai.art'

export function isPixAiAspectRatio(value: string): boolean {
  return (PIXAI_ASPECT_RATIOS as readonly string[]).includes(value)
}

/** 白名单取值：在表里就原样返回，否则 undefined（= 这个字段不发）。 */
export function pickAllowed(
  value: string | null | undefined,
  allowed: readonly string[],
): string | undefined {
  return value && allowed.includes(value) ? value : undefined
}

/**
 * PixAI 文生图：`POST /v2/image/create` 建任务 → `GET /v1/task/{id}` 轮询 →
 * 把结果图**立刻**落 R2。
 *
 * ⚠ 最后那一步不是可选的：官方原文「Generated images are not permanently
 * retained — download them as soon as the task completes.」所以⛔ 绝不能把
 * PixAI 的 `mediaUrls` 当作产物地址存下来，那是一条会过期的链接。
 *
 * ⚠ 这条线路**只有文生图**：不收参考图 / img2img / 编辑 / 视频。挂了图还硬发
 * 会得到一张与参考图毫无关系的图（静默失效），所以这里直接拒。
 * https://platform.pixai.art/en/docs/api-v2/image/createImage
 */
export async function generatePixAiImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  if (getImageReferenceInputs(context).length > 0) {
    throw new Error(
      'PixAI is text-to-image only — it accepts no reference image, img2img or editing input.',
    )
  }

  const advancedParams = readAdvancedRecord(context)
  const baseUrl = context.providerInput.providerBaseUrl ?? PIXAI_API_BASE_URL
  const aspectRatio = context.providerInput.aspectRatio
  if (!isPixAiAspectRatio(aspectRatio)) {
    throw new Error(`PixAI does not support the aspect ratio ${aspectRatio}.`)
  }

  const negativePrompt = readStringField(advancedParams, 'negativePrompt')
  const seed = readNumberField(advancedParams, 'seed')
  const steps = readPositiveNumberField(advancedParams, 'steps')
  const cfgScale = readNumberField(advancedParams, 'guidanceScale')
  /**
   * `size` 与 `mode`。⚠ 都走白名单：客户端送来表外的值一律**不发**，⛔ 不原样
   * 透传（`mode` 在非 Tsubaki 上是 400，`size` 表外值同理）。
   * 「哪个型号有哪一档」由能力表与 `generate-image.service` 的值域校验判，
   * ⛔ 不在 worker 里再抄一份模型名单。
   */
  const size = pickAllowed(
    readStringField(advancedParams, 'pixaiSize'),
    PIXAI_SIZES,
  )
  const mode = pickAllowed(
    readStringField(advancedParams, 'pixaiMode'),
    PIXAI_TSUBAKI_MODES,
  )
  // `sampling` 只在 SDXL 档成立（Tsubaki 是 DiT）。能力表已经逐模型挡过一次，
  // 这里按「有值才发」处理，⛔ 不在 worker 里再抄一份模型名单。
  const sampling =
    steps != null || cfgScale != null
      ? {
          ...(steps != null ? { samplingSteps: steps } : {}),
          ...(cfgScale != null ? { cfgScale } : {}),
        }
      : undefined

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': JSON_CONTENT_TYPE,
  }

  const createResponse = await fetch(`${baseUrl}${PIXAI_CREATE_IMAGE_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      modelVersionId: context.providerInput.externalModelId,
      prompt: context.providerInput.prompt,
      ...(negativePrompt ? { negativePrompt } : {}),
      aspectRatio,
      batchSize: PIXAI_BATCH_SIZE,
      ...(size ? { size } : {}),
      ...(mode ? { mode } : {}),
      ...(seed != null && seed >= 0 ? { seed: Math.round(seed) } : {}),
      ...(sampling ? { sampling } : {}),
    }),
  })

  if (!createResponse.ok) {
    const errBody = await createResponse.text().catch(() => '')
    // 账号级并发闸：每个账号同时最多 10 个 waiting 任务（running 的不算）。
    // 这条错误说清楚等什么，⛔ 不要让它落进「API key 无效」那条兜底翻译里。
    if (createResponse.status === 429) {
      throw new Error(
        `PixAI queue is full: an account may have at most ${PIXAI_MAX_WAITING_TASKS} tasks waiting at once. Wait for the earlier runs to start, then try again.`,
      )
    }
    throw new Error(
      `PixAI task creation failed (${createResponse.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const created = (await createResponse.json()) as Record<string, unknown>
  const taskId = readStringField(created, 'id')
  if (!taskId) {
    throw new Error('PixAI task creation returned no task id.')
  }

  const deadline = Date.now() + Math.min(context.timeoutMs, 600_000)
  let task: Record<string, unknown> = created
  let status = readStringField(task, 'status') ?? 'waiting'

  while (status === 'waiting' || status === 'running') {
    if (Date.now() >= deadline) {
      throw new Error(
        `PixAI task ${taskId} did not finish in time (last status: ${status}).`,
      )
    }
    // 官方写死的下限：「Poll no more frequently than once every 1.5 seconds.」
    await new Promise((resolve) => setTimeout(resolve, PIXAI_POLL_INTERVAL_MS))
    const pollResponse = await fetch(`${baseUrl}${PIXAI_TASK_PATH}/${taskId}`, {
      method: 'GET',
      headers,
    })
    if (!pollResponse.ok) {
      const errBody = await pollResponse.text().catch(() => '')
      throw new Error(
        `PixAI task polling failed (${pollResponse.status}): ${errBody.slice(0, 200)}`,
      )
    }
    task = (await pollResponse.json()) as Record<string, unknown>
    status = readStringField(task, 'status') ?? status
  }

  if (status !== 'completed') {
    // 失败原因在 taskStatusMsgI18n.defaultMessage（官方 Get a task 字段说明）。
    const reason = isRecord(task.taskStatusMsgI18n)
      ? readStringField(task.taskStatusMsgI18n, 'defaultMessage')
      : null
    throw new Error(
      `PixAI task ${taskId} ended as ${status}${reason ? `: ${reason}` : ''}.`,
    )
  }

  const outputs = task.outputs as Record<string, unknown> | undefined
  const mediaUrls = Array.isArray(outputs?.mediaUrls)
    ? (outputs.mediaUrls as unknown[])
    : []
  const imageUrl = typeof mediaUrls[0] === 'string' ? mediaUrls[0] : null
  if (!imageUrl) {
    throw new Error(`PixAI task ${taskId} completed without an image URL.`)
  }

  const uploaded = await downloadAndUploadImageArtifactToKey(
    env,
    imageUrl,
    'image/png',
    getWorkerImageOutputKey(context),
  )

  // PixAI 的任务响应不报尺寸，所以用本仓通用的比例→像素表。⚠ 这是**元数据**，
  // 不是请求参数 —— 真正决定画幅的是上面那个 `aspectRatio`。
  return {
    ...uploaded,
    ...getStandardImageDimensions(aspectRatio),
    providerMetadata: {
      pixaiTaskId: taskId,
      // 官方：outputs.seed 是这次实际用的种子（十进制字符串），带回去记进配方。
      ...readPixAiSeed(outputs),
    },
  }
}

function readPixAiSeed(outputs: Record<string, unknown> | undefined): {
  seed?: number
} {
  const raw = outputs?.seed
  const seed = typeof raw === 'string' ? Number(raw) : raw
  return typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0
    ? { seed }
    : {}
}
