export const NODE_TYPE_IDS = {
  composer: 'composer',
  agent: 'agent',
} as const

export const NODE_TYPES = [NODE_TYPE_IDS.composer, NODE_TYPE_IDS.agent] as const

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
