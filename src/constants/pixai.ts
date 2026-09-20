/**
 * PixAI 的接入常量。官方文档 2026-09-20 核对：
 * https://platform.pixai.art/en/docs/api-v2/image/createImage
 * https://platform.pixai.art/en/docs/quick-start/first-api-call
 *
 * ⚠ 这条线路是 **beta**：没有 SLA，模型版本号随发布变。模型名单与版本号以
 * `IMAGE_MODEL_OPTIONS` 里的 `externalModelId` 为准，这里只放协议侧的数。
 */

/** `POST /v2/image/create` —— 建任务，回一个 task。 */
export const PIXAI_CREATE_IMAGE_PATH = '/v2/image/create'

/** `GET /v1/task/{id}` —— 轮询。⚠ 注意是 v1，与建任务的 v2 不同代。 */
export const PIXAI_TASK_PATH = '/v1/task'

/**
 * 轮询间隔。官方原文：「Poll no more frequently than once every 1.5 seconds.」
 * ⛔ 别调小 —— 这是文档写死的下限，不是我们自己挑的节奏。
 */
export const PIXAI_POLL_INTERVAL_MS = 1500

/**
 * 每个账号同时最多 10 个 `waiting` 任务（running 的不算）。超了建任务就会被拒，
 * 所以这是**账号级**的并发闸，不是我们这边能靠排队绕开的东西。
 */
export const PIXAI_MAX_WAITING_TASKS = 10

/** 任务状态机。`completed` 之外都不该去读 `outputs`。 */
export const PIXAI_TASK_STATUSES = [
  'waiting',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const
export type PixAiTaskStatus = (typeof PIXAI_TASK_STATUSES)[number]

/**
 * 官方 11 种比例。⚠ 本仓的 `aspectRatio` 词表（5 种）是它的**子集**，所以映射
 * 是逐字相等的 —— ⛔ 别为此另写一张换算表，那只会多一处会漂的真值。
 */
export const PIXAI_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '3:5',
  '5:3',
  '9:16',
  '16:9',
  '1:3',
  '3:1',
] as const

/**
 * `batchSize` 只收 1 或 4。⚠ 我们**只发 1**：worker 的图片结果契约是单张
 * （一个 `outputStorageKey`、一次回调），4 张要改的是那条契约而不是这里。
 * 多张仍由上层「一次多跑几枪」实现，与其它 provider 一致。
 */
export const PIXAI_BATCH_SIZES = [1, 4] as const
export const PIXAI_BATCH_SIZE = 1

/** 一次最多挂 5 个 LoRA（SDXL 档）。 */
export const PIXAI_MAX_LORAS = 5

/** 输出尺寸档，默认 `1k`。 */
export const PIXAI_SIZES = ['1k', '1.5k'] as const

/** DiT 旗舰 Tsubaki 专属的质量档（SDXL 两档不收 `mode`）。 */
export const PIXAI_TSUBAKI_MODES = ['lite', 'standard', 'pro', 'ultra'] as const
