export const NODE_TYPE_IDS = {
  composer: 'composer',
  agent: 'agent',
  shotText: 'shotText',
  shot: 'shot',
  characterImage: 'characterImage',
  backgroundImage: 'backgroundImage',
  frameImage: 'frameImage',
  voice: 'voice',
  seedance: 'seedance',
} as const

export const NODE_TYPES = [
  NODE_TYPE_IDS.composer,
  NODE_TYPE_IDS.agent,
  NODE_TYPE_IDS.shotText,
  NODE_TYPE_IDS.shot,
  NODE_TYPE_IDS.characterImage,
  NODE_TYPE_IDS.backgroundImage,
  NODE_TYPE_IDS.frameImage,
  NODE_TYPE_IDS.voice,
  NODE_TYPE_IDS.seedance,
] as const

export type NodeWorkflowNodeType = (typeof NODE_TYPES)[number]

export const NODE_TEXT_NODE_TYPES = [NODE_TYPE_IDS.shotText] as const

export const NODE_IMAGE_MODEL_NODE_TYPES = [
  NODE_TYPE_IDS.characterImage,
  NODE_TYPE_IDS.shot,
  NODE_TYPE_IDS.backgroundImage,
  NODE_TYPE_IDS.frameImage,
] as const

export const NODE_VIDEO_MODEL_NODE_TYPES = [NODE_TYPE_IDS.seedance] as const

export const NODE_AUDIO_MODEL_NODE_TYPES = [NODE_TYPE_IDS.voice] as const

export const NODE_MEDIA_KIND_IDS = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
} as const

export const NODE_MEDIA_KINDS = [
  NODE_MEDIA_KIND_IDS.text,
  NODE_MEDIA_KIND_IDS.image,
  NODE_MEDIA_KIND_IDS.video,
  NODE_MEDIA_KIND_IDS.audio,
] as const

export type NodeWorkflowMediaKind = (typeof NODE_MEDIA_KINDS)[number]

export const NODE_WORKFLOW_FIELD_IDS = {
  prompt: 'prompt',
  scene: 'scene',
  action: 'action',
  camera: 'camera',
  composition: 'composition',
  location: 'location',
  mood: 'mood',
  lighting: 'lighting',
  frameIntent: 'frameIntent',
  dialogue: 'dialogue',
  voiceStyle: 'voiceStyle',
  voiceEmotion: 'voiceEmotion',
  motion: 'motion',
  duration: 'duration',
} as const

export const NODE_WORKFLOW_FIELDS = [
  NODE_WORKFLOW_FIELD_IDS.prompt,
  NODE_WORKFLOW_FIELD_IDS.scene,
  NODE_WORKFLOW_FIELD_IDS.action,
  NODE_WORKFLOW_FIELD_IDS.camera,
  NODE_WORKFLOW_FIELD_IDS.composition,
  NODE_WORKFLOW_FIELD_IDS.location,
  NODE_WORKFLOW_FIELD_IDS.mood,
  NODE_WORKFLOW_FIELD_IDS.lighting,
  NODE_WORKFLOW_FIELD_IDS.frameIntent,
  NODE_WORKFLOW_FIELD_IDS.dialogue,
  NODE_WORKFLOW_FIELD_IDS.voiceStyle,
  NODE_WORKFLOW_FIELD_IDS.voiceEmotion,
  NODE_WORKFLOW_FIELD_IDS.motion,
  NODE_WORKFLOW_FIELD_IDS.duration,
] as const

export type NodeWorkflowFieldId = (typeof NODE_WORKFLOW_FIELDS)[number]

export const NODE_WORKFLOW_FIELDS_BY_NODE_TYPE: Partial<
  Record<NodeWorkflowNodeType, readonly NodeWorkflowFieldId[]>
> = {
  [NODE_TYPE_IDS.shotText]: [
    NODE_WORKFLOW_FIELD_IDS.scene,
    NODE_WORKFLOW_FIELD_IDS.action,
    NODE_WORKFLOW_FIELD_IDS.camera,
    NODE_WORKFLOW_FIELD_IDS.composition,
  ],
  [NODE_TYPE_IDS.shot]: [
    NODE_WORKFLOW_FIELD_IDS.prompt,
    NODE_WORKFLOW_FIELD_IDS.camera,
    NODE_WORKFLOW_FIELD_IDS.composition,
    NODE_WORKFLOW_FIELD_IDS.action,
  ],
  [NODE_TYPE_IDS.backgroundImage]: [
    NODE_WORKFLOW_FIELD_IDS.location,
    NODE_WORKFLOW_FIELD_IDS.mood,
    NODE_WORKFLOW_FIELD_IDS.lighting,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ],
  [NODE_TYPE_IDS.frameImage]: [
    NODE_WORKFLOW_FIELD_IDS.frameIntent,
    NODE_WORKFLOW_FIELD_IDS.composition,
    NODE_WORKFLOW_FIELD_IDS.camera,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ],
  [NODE_TYPE_IDS.voice]: [
    NODE_WORKFLOW_FIELD_IDS.dialogue,
    NODE_WORKFLOW_FIELD_IDS.voiceStyle,
    NODE_WORKFLOW_FIELD_IDS.voiceEmotion,
  ],
  [NODE_TYPE_IDS.seedance]: [
    NODE_WORKFLOW_FIELD_IDS.motion,
    NODE_WORKFLOW_FIELD_IDS.camera,
    NODE_WORKFLOW_FIELD_IDS.duration,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ],
} as const

export const NODE_MEDIA_KIND_BY_NODE_TYPE = {
  [NODE_TYPE_IDS.composer]: undefined,
  [NODE_TYPE_IDS.agent]: undefined,
  [NODE_TYPE_IDS.shotText]: NODE_MEDIA_KIND_IDS.text,
  [NODE_TYPE_IDS.shot]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.characterImage]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.backgroundImage]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.frameImage]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.voice]: NODE_MEDIA_KIND_IDS.audio,
  [NODE_TYPE_IDS.seedance]: NODE_MEDIA_KIND_IDS.video,
} as const satisfies Record<
  NodeWorkflowNodeType,
  NodeWorkflowMediaKind | undefined
>

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
