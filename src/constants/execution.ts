import { AI_ADAPTER_TYPES } from './providers'

export const EXECUTION_OUTBOX = {
  LEASE_MS: 60_000,
} as const

export const EXECUTION_SWEEPER = {
  /**
   * RUNNING jobs whose `startedAt` is older than this are treated as orphaned
   * (worker process crashed without ever calling back). Set far above the
   * worker timeout (10 min) and the longest normal long-video run so in-flight
   * work is never reaped. Reaping uses a `status: RUNNING` CAS, so a late
   * callback that finalizes first is left untouched.
   */
  STALE_JOB_THRESHOLD_MS: 60 * 60 * 1000,
} as const

export const EXECUTION_INTERNAL = {
  SIGNATURE_HEADER: 'X-Execution-Signature',
  SIGNATURE_ALGORITHM: 'sha256',
  SIGNATURE_HEX_LENGTH: 64,
  CALLBACK_PATH: '/api/internal/execution/callback',
  RESOLVE_KEY_PATH: '/api/internal/execution/resolve-key',
  LONG_VIDEO_ADVANCE_PATH: '/api/internal/execution/long-video/advance',
  FAL_WEBHOOK_PATH: '/api/internal/fal/webhook',
} as const

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
  LONG_VIDEO_PIPELINE_PATH: '/workflows/long-video-pipeline',
  HYPER3D_RODIN_PATH: '/workflows/hyper3d-rodin',
  HUNYUAN3D_PATH: '/workflows/hunyuan3d',
  IMAGE_QUEUE_PATH: '/workflows/image-queue',
  DEFAULT_POLL_INTERVAL_MS: 3_000,
  DEFAULT_MAX_ATTEMPTS: 200,
  DEFAULT_TIMEOUT_MS: 600_000,
} as const

export const EXECUTION_WORKFLOW_IDS = {
  CINEMATIC_SHORT_VIDEO: 'CINEMATIC_SHORT_VIDEO',
  FAL_QUEUE: 'FAL_QUEUE',
  LONG_VIDEO_PIPELINE: 'LONG_VIDEO_PIPELINE',
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
  AI_ADAPTER_TYPES.FAL,
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.REPLICATE,
  AI_ADAPTER_TYPES.NOVELAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
  AI_ADAPTER_TYPES.HUGGINGFACE,
]
