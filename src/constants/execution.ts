export const EXECUTION_OUTBOX = {
  LEASE_MS: 60_000,
} as const

export const EXECUTION_INTERNAL = {
  SIGNATURE_HEADER: 'X-Execution-Signature',
  SIGNATURE_ALGORITHM: 'sha256',
  SIGNATURE_HEX_LENGTH: 64,
  CALLBACK_PATH: '/api/internal/execution/callback',
  RESOLVE_KEY_PATH: '/api/internal/execution/resolve-key',
} as const

export const EXECUTION_WORKER = {
  CINEMATIC_SHORT_VIDEO_PATH: '/workflows/cinematic-short-video',
  FAL_QUEUE_PATH: '/workflows/fal-queue',
  DEFAULT_POLL_INTERVAL_MS: 3_000,
  DEFAULT_MAX_ATTEMPTS: 200,
  DEFAULT_TIMEOUT_MS: 600_000,
} as const

export const EXECUTION_WORKFLOW_IDS = {
  CINEMATIC_SHORT_VIDEO: 'CINEMATIC_SHORT_VIDEO',
  FAL_QUEUE: 'FAL_QUEUE',
} as const

export const EXECUTION_OUTBOX_KINDS = {
  AUDIO_QUEUE_SUBMIT: 'AUDIO_QUEUE_SUBMIT',
  IMAGE_PREVIEW_DERIVATIVES: 'IMAGE_PREVIEW_DERIVATIVES',
} as const

export type ExecutionOutboxKind =
  (typeof EXECUTION_OUTBOX_KINDS)[keyof typeof EXECUTION_OUTBOX_KINDS]
