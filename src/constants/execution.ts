import { AI_ADAPTER_TYPES } from './providers'
import { WORKER_IMAGE_PROVIDER_IDS } from './worker-image-providers'

export const EXECUTION_OUTBOX = {
  LEASE_MS: 60_000,
} as const

/**
 * 派发 outbox（o-worker 第 6 步「派发只走一条路」）：建任务时同一事务里记下一行，
 * 派发不知道送没送到时，由状态轮询 / 每日 sweep 补发。Worker 按任务 id 幂等建
 * Workflow 实例，补发不会重复跑、不会重复扣费。现行做法见 docs/references/backend.md「派发 outbox」。
 */
export const WORKER_DISPATCH_OUTBOX = {
  /** 一次派发（含 dispatch 内部那 2 次重试）最多试几轮，之后判「执行服务连不上」。 */
  MAX_DELIVERY_ATTEMPTS: 5,
  /** 两轮补发之间至少隔多久；状态轮询每 2–3 秒一次，不能每次都去敲 Worker。 */
  REDELIVERY_DELAY_MS: 20_000,
  /**
   * 建了任务、还没写完派发参数（参考图上传、底模准备）就没下文的，过这么久判失败。
   * 远大于出图路由的 maxDuration，正常在途的不会被误判。
   */
  PREPARE_TIMEOUT_MS: 10 * 60 * 1000,
  /** 每次 sweep 最多补发多少条。 */
  SWEEP_LIMIT: 50,
} as const

export const EXECUTION_SWEEPER = {
  /**
   * RUNNING jobs whose `startedAt` is older than this are treated as orphaned
   * (worker process crashed without ever calling back). Set far above the
   * worker timeout (10 min) and the longest normal workflow run so in-flight
   * work is never reaped. Reaping uses a `status: RUNNING` CAS, so a late
   * callback that finalizes first is left untouched.
   */
  STALE_JOB_THRESHOLD_MS: 60 * 60 * 1000,
  /**
   * 「先搜再画」来源在任务行上暂放多久算没人取（发起者关了页面）。正常情况
   * 前端下一次轮询就取走清掉；过了这个时间由每日 sweep 清。
   */
  SEARCH_GROUNDING_HANDOFF_MS: 10 * 60 * 1000,
  /** 每次 sweep 最多清多少条没人取的来源。 */
  SEARCH_GROUNDING_SWEEP_LIMIT: 500,
} as const

/**
 * 按账号排队（出图）：同一个账号同时最多几张在出，其余在 Worker 里排队等位。
 * 哪家报了并发锁 / 429 就改那一格（2026-10-23 owner 定的初值）。不在表里的
 * adapter 不排队。整条链路见 docs/references/backend.md「按账号排队」。
 */
export const IMAGE_ACCOUNT_CONCURRENCY: Partial<Record<string, number>> = {
  [AI_ADAPTER_TYPES.NOVELAI]: 1,
  [AI_ADAPTER_TYPES.FAL]: 2,
  [AI_ADAPTER_TYPES.OPENAI]: 2,
  [AI_ADAPTER_TYPES.GEMINI]: 2,
  [AI_ADAPTER_TYPES.VOLCENGINE]: 4,
  [AI_ADAPTER_TYPES.BYTEPLUS]: 4,
  [AI_ADAPTER_TYPES.REPLICATE]: 4,
  [AI_ADAPTER_TYPES.PIXAI]: 1,
  [AI_ADAPTER_TYPES.RUNNER]: 1,
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 1,
}

export const EXECUTION_SLOT = {
  /** 排上号的任务多久没出完就不再算占位（Worker 死了没回调的兜底；最长正常一单约 10 分钟）。 */
  HOLDER_TTL_MS: 20 * 60 * 1000,
  /** 排队的任务多久没来问就当已经走了（Worker 每几秒问一次）。 */
  WAITER_HEARTBEAT_MS: 60 * 1000,
} as const

export const EXECUTION_INTERNAL = {
  SIGNATURE_VERSION: 'v1',
  SIGNATURE_HEADER: 'X-Execution-Signature',
  VERSION_HEADER: 'X-Execution-Signature-Version',
  TIMESTAMP_HEADER: 'X-Execution-Timestamp',
  NONCE_HEADER: 'X-Execution-Nonce',
  SIGNATURE_ALGORITHM: 'sha256',
  SIGNATURE_HEX_LENGTH: 64,
  MAX_CLOCK_SKEW_MS: 5 * 60 * 1000,
  NONCE_TTL_SECONDS: 10 * 60,
  CALLBACK_PATH: '/api/internal/execution/callback',
  RESOLVE_KEY_PATH: '/api/internal/execution/resolve-key',
  SLOT_PATH: '/api/internal/execution/slot',
  FAL_WEBHOOK_PATH: '/api/internal/fal/webhook',
} as const

/**
 * Hostnames that resolve back to the machine running the app. The execution
 * worker reaches the app over plain HTTP on these — see
 * `assertReachableInternalUrl` in `execution-worker.service.ts`.
 *
 * `URL.hostname` keeps the brackets on IPv6 literals, so both spellings of the
 * loopback address are listed.
 */
export const LOOPBACK_HOSTNAMES: readonly string[] = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]

export const FAL_WEBHOOK = {
  SIGNATURE_HEADER: 'x-fal-signature-ed25519',
  JWKS_URL: 'https://rest.fal.ai/.well-known/jwks.json',
  /** Cached keys are refreshed after this interval */
  JWKS_CACHE_TTL_MS: 5 * 60 * 1000,
  RUN_ID_PARAM: 'runId',
} as const

export const EXECUTION_WORKER = {
  CINEMATIC_SHORT_VIDEO_PATH: '/workflows/cinematic-short-video',
  FAL_QUEUE_PATH: '/workflows/fal-queue',
  HYPER3D_RODIN_PATH: '/workflows/hyper3d-rodin',
  HUNYUAN3D_PATH: '/workflows/hunyuan3d',
  IMAGE_QUEUE_PATH: '/workflows/image-queue',
  /** Best-effort cancel: app → worker, to terminate a running workflow instance / provider job. */
  CANCEL_PATH: '/cancel',
  /** Short timeout for the best-effort cancel notify — the DB-side cancel has already succeeded by the time this fires. */
  CANCEL_TIMEOUT_MS: 5_000,
  /** 助手 LLM 调用日志：app → worker，写进 Workers Logs（留 7 天）。 */
  LLM_CALL_LOG_PATH: '/logs/llm-call',
  LLM_CALL_LOG_TIMEOUT_MS: 5_000,
  /** 一格字符串最长多少（worker 那边 `LLM_CALL_LOG_MAX_STRING`，超了整条不收）。 */
  LLM_CALL_LOG_MAX_STRING: 120,
  /** 认图（PixAI Tagger）：app → worker → Modal `/tag`，同步等结果。 */
  TAG_IMAGE_PATH: '/tag-image',
  /** 出图后的小图：app → worker（Cloudflare Images）→ R2。见 workers/execution/src/lib/image-derivatives.ts。 */
  IMAGE_DERIVATIVES_PATH: '/image-derivatives',
  /** 一张 20 MB 以内的图缩两种尺寸，正常 1–3 s；冷路径留够余量。 */
  IMAGE_DERIVATIVES_TIMEOUT_MS: 30_000,
  DEFAULT_POLL_INTERVAL_MS: 3_000,
  DEFAULT_MAX_ATTEMPTS: 200,
  DEFAULT_TIMEOUT_MS: 600_000,
  /**
   * Worker 回执只等 `workflow.create`（CPU 1–4ms），但 Cloudflare 那一步偶尔要 4–10s+。
   * 10-23 线上实测：10s 超时把还没建成的请求掐掉，两次都没建出实例。放到 25s，两次最多 ~50s，
   * 仍在调用方路由的 maxDuration（≥60s）之内。
   */
  DISPATCH_TIMEOUT_MS: 25_000,
  DISPATCH_MAX_ATTEMPTS: 2,
  DISPATCH_RETRY_DELAY_MS: 250,
} as const

export const EXECUTION_WORKFLOW_IDS = {
  CINEMATIC_SHORT_VIDEO: 'CINEMATIC_SHORT_VIDEO',
  FAL_QUEUE: 'FAL_QUEUE',
  HYPER3D_RODIN: 'HYPER3D_RODIN',
  HUNYUAN3D: 'HUNYUAN3D',
  IMAGE_QUEUE: 'IMAGE_QUEUE',
} as const

export const EXECUTION_OUTBOX_KINDS = {
  AUDIO_QUEUE_SUBMIT: 'AUDIO_QUEUE_SUBMIT',
  /** 图 / 视频 / 音频 / 3D 派发给执行 Worker。 */
  WORKER_DISPATCH: 'WORKER_DISPATCH',
  IMAGE_PREVIEW_DERIVATIVES: 'IMAGE_PREVIEW_DERIVATIVES',
} as const

export type ExecutionOutboxKind =
  (typeof EXECUTION_OUTBOX_KINDS)[keyof typeof EXECUTION_OUTBOX_KINDS]

/**
 * 图片服务商里 Worker 已有驱动、可以异步派发的那些。名单本身在
 * `worker-image-providers.ts`（和 Worker 共用一份）；不在名单里的直接报错，⛔ 不悄悄回退同步。
 */
// 赋值这一步就是编译期检查：共享名单里每一家都得是真实存在的 adapter 类型。
const WORKER_IMAGE_ADAPTER_IDS: readonly `${AI_ADAPTER_TYPES}`[] =
  WORKER_IMAGE_PROVIDER_IDS

export const WORKER_MIGRATED_IMAGE_ADAPTERS =
  WORKER_IMAGE_ADAPTER_IDS as readonly AI_ADAPTER_TYPES[]
