export const NODE_TYPE_IDS = {
  composer: 'composer',
  agent: 'agent',
  characterImage: 'characterImage',
} as const

export const NODE_TYPES = [
  NODE_TYPE_IDS.composer,
  NODE_TYPE_IDS.agent,
  NODE_TYPE_IDS.characterImage,
] as const

export type NodeWorkflowNodeType = (typeof NODE_TYPES)[number]

export const NODE_STATUS_IDS = {
  idle: 'idle',
  queued: 'queued',
  ready: 'ready',
  running: 'running',
  done: 'done',
  failed: 'failed',
  stale: 'stale',
  disabled: 'disabled',
} as const

export const NODE_STATUSES = [
  NODE_STATUS_IDS.idle,
  NODE_STATUS_IDS.queued,
  NODE_STATUS_IDS.ready,
  NODE_STATUS_IDS.running,
  NODE_STATUS_IDS.done,
  NODE_STATUS_IDS.failed,
  NODE_STATUS_IDS.stale,
  NODE_STATUS_IDS.disabled,
] as const

export type NodeWorkflowStatus = (typeof NODE_STATUSES)[number]

export const NODE_GENERATION_STATUS_IDS = {
  idle: 'idle',
  pending: 'pending',
  success: 'success',
  error: 'error',
} as const

export const NODE_GENERATION_STATUSES = [
  NODE_GENERATION_STATUS_IDS.idle,
  NODE_GENERATION_STATUS_IDS.pending,
  NODE_GENERATION_STATUS_IDS.success,
  NODE_GENERATION_STATUS_IDS.error,
] as const

export type NodeWorkflowGenerationStatus =
  (typeof NODE_GENERATION_STATUSES)[number]
