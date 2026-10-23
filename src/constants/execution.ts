import { AI_ADAPTER_TYPES } from './providers'

export const EXECUTION_OUTBOX = {
  LEASE_MS: 60_000,
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
  DEFAULT_POLL_INTERVAL_MS: 3_000,
  DEFAULT_MAX_ATTEMPTS: 200,
  DEFAULT_TIMEOUT_MS: 600_000,
  DISPATCH_TIMEOUT_MS: 10_000,
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
  IMAGE_PREVIEW_DERIVATIVES: 'IMAGE_PREVIEW_DERIVATIVES',
} as const

export type ExecutionOutboxKind =
  (typeof EXECUTION_OUTBOX_KINDS)[keyof typeof EXECUTION_OUTBOX_KINDS]

/**
 * Image adapters whose worker handler is live and may be dispatched async.
 * Adapters not listed fail loudly until their worker handlers ship.
 */
export const WORKER_MIGRATED_IMAGE_ADAPTERS: readonly AI_ADAPTER_TYPES[] = [
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.IDEOGRAM,
  AI_ADAPTER_TYPES.FAL,
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.REPLICATE,
  AI_ADAPTER_TYPES.NOVELAI,
  AI_ADAPTER_TYPES.PIXAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
  // BytePlus ModelArk = the same Ark image API on the international station;
  // the worker serves both from one branch, keyed on providerBaseUrl.
  AI_ADAPTER_TYPES.BYTEPLUS,
  AI_ADAPTER_TYPES.HUGGINGFACE,
  // Runner cold starts (minutes) make async-only mandatory — there is no sync
  // fallback path for RUNNER.
  AI_ADAPTER_TYPES.RUNNER,
]
