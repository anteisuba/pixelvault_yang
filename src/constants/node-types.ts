export const NODE_TYPE_IDS = {
  composer: 'composer',
  agent: 'agent',
  shotText: 'shotText',
  shot: 'shot',
  characterImage: 'characterImage',
  backgroundImage: 'backgroundImage',
  frameImage: 'frameImage',
  /**
   * Unified image node (node-consolidation step 2 / option B). Its
   * `data.role` (character / background / shot / frame) carries the intent
   * that the legacy per-role types (characterImage / backgroundImage /
   * frameImage / shot) used to encode at the type level. The legacy types
   * are kept in the enum for backward-compatible parse of saved projects;
   * a data-level migration folds them into `image` + role on load.
   */
  image: 'image',
  voice: 'voice',
  seedance: 'seedance',
  videoReference: 'videoReference',
  videoMerge: 'videoMerge',
} as const

export const NODE_TYPES = [
  NODE_TYPE_IDS.composer,
  NODE_TYPE_IDS.agent,
  NODE_TYPE_IDS.shotText,
  NODE_TYPE_IDS.shot,
  NODE_TYPE_IDS.characterImage,
  NODE_TYPE_IDS.backgroundImage,
  NODE_TYPE_IDS.frameImage,
  NODE_TYPE_IDS.image,
  NODE_TYPE_IDS.voice,
  NODE_TYPE_IDS.seedance,
  NODE_TYPE_IDS.videoReference,
  NODE_TYPE_IDS.videoMerge,
] as const

export type NodeWorkflowNodeType = (typeof NODE_TYPES)[number]

export const NODE_TEXT_NODE_TYPES = [NODE_TYPE_IDS.shotText] as const

export const NODE_IMAGE_MODEL_NODE_TYPES = [
  NODE_TYPE_IDS.characterImage,
  NODE_TYPE_IDS.shot,
  NODE_TYPE_IDS.backgroundImage,
  NODE_TYPE_IDS.frameImage,
  NODE_TYPE_IDS.image,
] as const

/**
 * Roles for the unified `image` node (node-consolidation step 2 / option B).
 * Each role maps 1:1 onto a legacy per-role image type and drives the node's
 * default field set, empty-state copy, accent, and seedance-harvest treatment
 * (character/background/shot → visual reference, frame → keyframe).
 *
 * `closeup` (cast-redesign §9 B, V2-4) is a face-detail sub-reference of a
 * character: it wires INTO a character node (`closeup → character`, the same
 * 1-hop pattern as `voice → character`), NOT directly into a video, and rides
 * image_urls when the character is harvested. It reuses the character family
 * for presentation (see NODE_IMAGE_ROLE_TO_LEGACY_TYPE) but is NOT offered as a
 * top-level canvas role — it's spawned from a character's identity group.
 */
export const NODE_IMAGE_ROLE_IDS = {
  character: 'character',
  background: 'background',
  shot: 'shot',
  frame: 'frame',
  closeup: 'closeup',
} as const

export const NODE_IMAGE_ROLES = [
  NODE_IMAGE_ROLE_IDS.character,
  NODE_IMAGE_ROLE_IDS.background,
  NODE_IMAGE_ROLE_IDS.shot,
  NODE_IMAGE_ROLE_IDS.frame,
  NODE_IMAGE_ROLE_IDS.closeup,
] as const

export type NodeImageRole = (typeof NODE_IMAGE_ROLES)[number]

/**
 * Each image role maps 1:1 onto the legacy per-role type it replaced. Used for
 * PRESENTATION (badge / accent / i18n label / detail body / inspector / card
 * render) so a unified image node reuses all the existing per-type UI unchanged
 * — see `resolveNodePresentationType` and `ImageNode`.
 */
export const NODE_IMAGE_ROLE_TO_LEGACY_TYPE: Record<
  NodeImageRole,
  NodeWorkflowNodeType
> = {
  [NODE_IMAGE_ROLE_IDS.character]: NODE_TYPE_IDS.characterImage,
  [NODE_IMAGE_ROLE_IDS.background]: NODE_TYPE_IDS.backgroundImage,
  [NODE_IMAGE_ROLE_IDS.shot]: NODE_TYPE_IDS.shot,
  [NODE_IMAGE_ROLE_IDS.frame]: NODE_TYPE_IDS.frameImage,
  // closeup is a character-family face detail → reuses the character card /
  // badge / accent / inspector (its name field is characterName like a
  // character). Its distinct behavior (1-hop into character, not a direct video
  // reference) lives in the graph/harvest layer, not presentation.
  [NODE_IMAGE_ROLE_IDS.closeup]: NODE_TYPE_IDS.characterImage,
}

export const NODE_VIDEO_MODEL_NODE_TYPES = [NODE_TYPE_IDS.seedance] as const

/**
 * Upload-only reference video nodes — they don't have a model selection and
 * never generate; they only hold an uploaded clip that feeds the downstream
 * Seedance Reference endpoint's video_urls.
 */
export const NODE_VIDEO_REFERENCE_NODE_TYPES = [
  NODE_TYPE_IDS.videoReference,
] as const

/**
 * Video aggregator nodes that take multiple upstream video clips and produce
 * a single merged clip via fal-ai/ffmpeg-api/merge-videos. Output is itself
 * a video URL, so `isVideoSourceNode` picks them up automatically and they
 * can recursively feed downstream Seedance Reference / further merge nodes.
 */
export const NODE_VIDEO_MERGE_NODE_TYPES = [NODE_TYPE_IDS.videoMerge] as const

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
  voiceName: 'voiceName',
  voiceProvider: 'voiceProvider',
  voiceId: 'voiceId',
  voiceStyle: 'voiceStyle',
  voiceEmotion: 'voiceEmotion',
  motion: 'motion',
  duration: 'duration',
  audioIntent: 'audioIntent',
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
  NODE_WORKFLOW_FIELD_IDS.voiceName,
  NODE_WORKFLOW_FIELD_IDS.voiceProvider,
  NODE_WORKFLOW_FIELD_IDS.voiceId,
  NODE_WORKFLOW_FIELD_IDS.voiceStyle,
  NODE_WORKFLOW_FIELD_IDS.voiceEmotion,
  NODE_WORKFLOW_FIELD_IDS.motion,
  NODE_WORKFLOW_FIELD_IDS.duration,
  NODE_WORKFLOW_FIELD_IDS.audioIntent,
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
    NODE_WORKFLOW_FIELD_IDS.voiceName,
    NODE_WORKFLOW_FIELD_IDS.voiceProvider,
    NODE_WORKFLOW_FIELD_IDS.voiceId,
    NODE_WORKFLOW_FIELD_IDS.voiceStyle,
    NODE_WORKFLOW_FIELD_IDS.voiceEmotion,
  ],
  [NODE_TYPE_IDS.seedance]: [
    NODE_WORKFLOW_FIELD_IDS.motion,
    NODE_WORKFLOW_FIELD_IDS.camera,
    NODE_WORKFLOW_FIELD_IDS.duration,
    NODE_WORKFLOW_FIELD_IDS.audioIntent,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ],
} as const

/**
 * Default field set for the unified `image` node, keyed by `data.role`. Mirrors
 * the legacy per-type field sets above so a migrated node shows the same
 * Inspector fields it had before consolidation. The node component resolves
 * fields via this map (by role) instead of `NODE_WORKFLOW_FIELDS_BY_NODE_TYPE`.
 */
export const NODE_WORKFLOW_FIELDS_BY_IMAGE_ROLE: Record<
  NodeImageRole,
  readonly NodeWorkflowFieldId[]
> = {
  [NODE_IMAGE_ROLE_IDS.character]: [NODE_WORKFLOW_FIELD_IDS.prompt],
  [NODE_IMAGE_ROLE_IDS.background]: [
    NODE_WORKFLOW_FIELD_IDS.location,
    NODE_WORKFLOW_FIELD_IDS.mood,
    NODE_WORKFLOW_FIELD_IDS.lighting,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ],
  [NODE_IMAGE_ROLE_IDS.shot]: [
    NODE_WORKFLOW_FIELD_IDS.prompt,
    NODE_WORKFLOW_FIELD_IDS.camera,
    NODE_WORKFLOW_FIELD_IDS.composition,
    NODE_WORKFLOW_FIELD_IDS.action,
  ],
  [NODE_IMAGE_ROLE_IDS.frame]: [
    NODE_WORKFLOW_FIELD_IDS.frameIntent,
    NODE_WORKFLOW_FIELD_IDS.composition,
    NODE_WORKFLOW_FIELD_IDS.camera,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ],
  // closeup mirrors the character field set — just a prompt describing the
  // face-detail; identity binding is structural (its edge into the character).
  [NODE_IMAGE_ROLE_IDS.closeup]: [NODE_WORKFLOW_FIELD_IDS.prompt],
} as const

export const NODE_MEDIA_KIND_BY_NODE_TYPE = {
  [NODE_TYPE_IDS.composer]: undefined,
  [NODE_TYPE_IDS.agent]: undefined,
  [NODE_TYPE_IDS.shotText]: NODE_MEDIA_KIND_IDS.text,
  [NODE_TYPE_IDS.shot]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.characterImage]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.backgroundImage]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.frameImage]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.image]: NODE_MEDIA_KIND_IDS.image,
  [NODE_TYPE_IDS.voice]: NODE_MEDIA_KIND_IDS.audio,
  [NODE_TYPE_IDS.seedance]: NODE_MEDIA_KIND_IDS.video,
  [NODE_TYPE_IDS.videoReference]: NODE_MEDIA_KIND_IDS.video,
  [NODE_TYPE_IDS.videoMerge]: NODE_MEDIA_KIND_IDS.video,
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
