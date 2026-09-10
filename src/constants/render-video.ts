/**
 * 剪辑台**渲染层**的常量与载荷形状（S9 · spec §6「渲染层」）。
 *
 * ── 为什么 `RenderPlan` 的类型住在 constants 而不是 types/ ────────────────
 * 这份形状同时被三边读：浏览器（导出对话框把它拼出来）、Next 服务端（Zod 校验后
 * 入队）、以及 `workers/render-video`（另一套构建，`import 'server-only'` 的文件
 * 它一行都读不了）。放进 `types/index.ts` 会把 Prisma / server-only 的传递依赖拖
 * 进 worker 构建；放进 `services/` 更不行（那一层整层 server-only）。所以纯类型
 * 与词表落在这里 —— 它本来就是「重复业务值」该待的地方（Hard Rule 1）。
 *
 * ⚠ 运行期校验（Zod）在 `src/services/video/render-video.service.ts`，与本文件
 * 一一对应；改这里的字段必须同时改那边的 schema，两边分家的表现是**浏览器发得出
 * 服务端收不下**的载荷。
 */

/** 载荷版本。worker 收到不认识的版本要**拒绝**而不是尽力而为。 */
export const RENDER_PLAN_VERSION = 1

/** 成片帧率。spec §6 定 25 —— ⚠ 规格化那一步把所有素材都拉到这个数。 */
export const RENDER_OUTPUT_FPS = 25

/**
 * 叠化时长。
 *
 * ⚠ 这个数**会扣总时长**：两段叠 0.5s，成片就短 0.5s。用户在时间线上看到的段长
 * 之和因此不等于成片时长，顶栏读数与导出结果的差就是所有叠化之和。
 * 黑场（`black`）不扣 —— 它是段内的淡入淡出，不是重叠。
 */
export const RENDER_CROSSFADE_SEC = 0.5

/** 黑场淡入淡出各占多久（段内，不扣时长）。 */
export const RENDER_BLACK_FADE_SEC = 0.35

/** 一段最短能短到多少还值得渲染 —— 比这更短的段在成片里连一帧都不满。 */
export const RENDER_MIN_SEGMENT_SEC = 0.1

/** 成片像素。⚠ 短边定档，长边由比例推 —— ⛔ 不为每个组合手写一张表。 */
export const RENDER_SHORT_SIDE_BY_RESOLUTION = {
  '720p': 720,
  '1080p': 1080,
  '4k': 2160,
} as const

/** 比例 → 长边 : 短边。`1:1` 两边一样。 */
export const RENDER_ASPECT_RATIO_PARTS = {
  '16:9': { long: 16, short: 9, portrait: false },
  '9:16': { long: 16, short: 9, portrait: true },
  '1:1': { long: 1, short: 1, portrait: false },
} as const

/** 编码档位。⚠ 与许可边界绑定，理由见 `workers/render-video/README.md`。 */
export const RENDER_VIDEO_CODEC = 'libopenh264'
export const RENDER_AUDIO_CODEC = 'aac'
export const RENDER_CONTAINER_EXT = 'mp4'
export const RENDER_POSTER_EXT = 'jpg'

/** R2 前缀（spec §6：`renders/<projectId>/<jobId>.mp4`）。 */
export const RENDER_R2_PREFIX = 'renders'

/** 渲染任务的四态。⚠ 与 `GenerationJob.status` 同形但**不是同一张表**的枚举。 */
export const RENDER_JOB_STATUS_IDS = {
  queued: 'queued',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
} as const

export type RenderJobStatusId =
  (typeof RENDER_JOB_STATUS_IDS)[keyof typeof RENDER_JOB_STATUS_IDS]

/**
 * 渲染的**步骤表** —— 进度按步骤报，不按百分比猜。
 *
 * ⚠ 顺序即执行顺序，进度 = 已完成步数 / 总步数，编码那一步再叠 ffmpeg `-progress`
 * 解析出来的段内百分比。⛔ 不做「假进度条」：一条 2 分钟的片子在编码那一步会停很久，
 * 一根匀速走的条会让用户以为卡死。
 */
export const RENDER_STEP_IDS = {
  download: 'download',
  normalize: 'normalize',
  compose: 'compose',
  encode: 'encode',
  poster: 'poster',
  upload: 'upload',
} as const

export type RenderStepId =
  (typeof RENDER_STEP_IDS)[keyof typeof RENDER_STEP_IDS]

export const RENDER_STEPS: readonly RenderStepId[] = [
  RENDER_STEP_IDS.download,
  RENDER_STEP_IDS.normalize,
  RENDER_STEP_IDS.compose,
  RENDER_STEP_IDS.encode,
  RENDER_STEP_IDS.poster,
  RENDER_STEP_IDS.upload,
]

/** 前端轮询间隔。⚠ 与 `EXECUTION_WORKER.DEFAULT_POLL_INTERVAL_MS` 同量级。 */
export const RENDER_POLL_INTERVAL_MS = 3_000

/** 一条时间线最多能渲多少段（DoS 护栏，与 `EDIT_TRACK_MAX_CLIPS` 同源）。 */
export const RENDER_MAX_SEGMENTS = 200

/** 成片时长上限（秒）—— 容器磁盘与 Workflow 步预算的现实边界。 */
export const RENDER_MAX_DURATION_SEC = 900

/** 渲染层的 API 端点。⚠ `API_ENDPOINTS` 那张表不归本片改，端点落在这里。 */
export const RENDER_API_ENDPOINTS = {
  SUBMIT: '/api/studio/render',
} as const

export function renderJobEndpoint(jobId: string): string {
  return `${RENDER_API_ENDPOINTS.SUBMIT}/${encodeURIComponent(jobId)}`
}

export function renderCancelEndpoint(jobId: string): string {
  return `${renderJobEndpoint(jobId)}/cancel`
}

/** worker 的路由（与 `workers/render-video/src/index.ts` 同源）。 */
export const RENDER_WORKER = {
  SUBMIT_PATH: '/workflows/render-video',
  CANCEL_PATH: '/cancel',
  STATUS_PATH: '/status',
  DISPATCH_TIMEOUT_MS: 10_000,
} as const

/** 建计划时能出的错。⚠ 每一条都要在 UI 上说得出人话（i18n key 同名）。 */
export const RENDER_PLAN_ERROR_CODES = {
  emptyTimeline: 'emptyTimeline',
  missingSource: 'missingSource',
  emptyRange: 'emptyRange',
  zeroDuration: 'zeroDuration',
  tooManySegments: 'tooManySegments',
  tooLong: 'tooLong',
} as const

export type RenderPlanErrorCode =
  (typeof RENDER_PLAN_ERROR_CODES)[keyof typeof RENDER_PLAN_ERROR_CODES]

/* ─── 载荷形状 ─────────────────────────────────────────────────────────── */

export interface RenderOutputSpec {
  readonly aspect: string
  readonly resolution: string
  readonly width: number
  readonly height: number
  readonly fps: number
}

/**
 * 一段画面。
 *
 * ⚠ `in` / `out` 是**素材本地秒**（与 `EditClip` 同一套坐标），不是成片秒 ——
 * 变速之后两者不是一回事，混用的表现是「1.5× 的段裁歪了」。
 */
export interface RenderVideoSegment {
  readonly id: string
  readonly src: string
  readonly in: number
  readonly out: number
  readonly speed: number
  readonly muted: boolean
  /** 段尾转场（接下一段）。最后一段永远是 `none`。 */
  readonly transitionOut: 'none' | 'crossfade' | 'black'
  /** 成片时间轴上占多久 = `(out - in) / speed`（不含叠化扣减）。 */
  readonly durationSec: number
  /** 来源节点 —— 「导出到画布」连线回去要它。 */
  readonly sourceNodeId: string
  readonly sourceVersionId?: string
}

/** 一段声音（语音 / 配乐共用一种形状，差别只在混音权重）。 */
export interface RenderAudioSegment {
  readonly id: string
  readonly src: string
  readonly in: number
  readonly out: number
  readonly speed: number
  /** 线性增益（1 = 原样）。 */
  readonly gain: number
  /** 这一段在**成片时间轴**上什么时候开始。 */
  readonly startSec: number
  readonly durationSec: number
  readonly sourceNodeId: string
}

export interface RenderPlan {
  readonly version: typeof RENDER_PLAN_VERSION
  /** 成片名 → `Generation` 的 `displayLabel`。 */
  readonly name: string
  readonly projectId: string
  readonly output: RenderOutputSpec
  readonly video: readonly RenderVideoSegment[]
  readonly audio: readonly RenderAudioSegment[]
  readonly music: readonly RenderAudioSegment[]
  /** 成片总时长（**已扣**所有叠化重叠）。 */
  readonly totalDurationSec: number
}

/** 混音权重（`amix` 的 `weights`）：语音压过配乐。 */
export const RENDER_MIX_WEIGHTS = {
  /** 段自带的原声（未静音时）。 */
  clip: 1,
  voice: 1.4,
  music: 0.35,
} as const
