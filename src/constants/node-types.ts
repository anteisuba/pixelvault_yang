export const NODE_TYPE_IDS = {
  /**
   * ⛔ 已退役的旧 planner（composer / agent），**但这两个 enum 值绝不能删**。
   *
   * 它们的渲染组件已于 2026-08-02 删除（用户早就看不到它们了：
   * `node-workflow-migrate-planner.ts` 在两条水化路径上都会先把这类节点剥掉）。
   * 组件没了以后这两个键看起来会很像孤儿 —— 这条注释就是拦住下一个人顺手删它们的。
   *
   * 删了会发生什么：`NodeWorkflowStateSchema.nodes` 是 `z.array(...)` **没有
   * 逐项 `.catch()`**（同文件其它字段有，这里故意没有），任何一个还存着
   * composer/agent 节点的存量项目会整份 parse 失败 →
   * `node-workflow.service.ts` 的 `validateState` 把它兜成 `EMPTY_STATE` →
   * 用户打开项目看到空画布，**静默无报错**，下一次防抖写入就把空状态持久化。
   * 不可恢复。而这类节点至今仍躺在 DB 里 —— 迁移是读路径垫片，没有一次性回填。
   *
   * 同理 `node-workflow-migrate-planner.ts` 也不能删：删了这些节点会重新进入
   * 渲染列表，而 `NODE_COMPONENTS` 里已经没有对应组件了。
   */
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

/**
 * 一段**自由文本**该落这个节点的哪个字段 —— 只对「字段集里没有 `prompt`」的类型
 * 有意义，今天只有 `shotText` 一个（它的四栏是 scene / action / camera /
 * composition，没有 prompt）。
 *
 * ── 为什么需要这张表（台账 K-1，2026-08-29 真机）──────────────────────
 * 助手的 `add_node.prompt` / `set_prompt` 一律写 `data.prompt`，而 `shotText`
 * 节点的读侧（详情面板渲染、`buildNodeWorkflowPrompt`、下游视频的
 * `harvestUpstreamShotTextPrompt`）读的是那四栏。真机后果：助手写的四段镜头文本
 * （401 / 288 / 302 / 270 字符）**全部作废**，节点只显示「还没有镜头文本」，
 * 既不报错也看不出内容写错了地方 —— 静默且看起来像「助手没写」。
 *
 * 落点选 `action` 不是随手挑的：ScriptDoc 投影里 `action ← shot.summary`
 * （见 `lib/node-workflow-script-doc.ts` 的 `SHOT_TEXT_FIELD_TO_SCRIPT_DOC`），
 * 也就是说 `action` 就是这个节点「这一镜发生了什么」的正文字段。
 *
 * `null` = **这个类型真的没有自由文本字段**，写哪儿都是黑洞。调用方拿到 null 要
 * 明说「这个节点没有提示词字段」而不是随便找个字段塞进去 —— 音色节点就是这一档
 * （它的五栏全是音色配置，正文台词住在下游视频节点上）。这条不变量的测试第一次
 * 跑就抓到了它：`voice` 与 `shotText` 同病，助手往音色节点写 prompt 同样静默丢失。
 *
 * ⚠ 不变量由 `node-types.test.ts` 钉着：**字段集里没有 `prompt` 的类型，这里必须
 * 有一条**（哪怕是显式的 `null`）。加新节点类型时忘了登记会红，不会再静默丢内容。
 */
export const NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE: Partial<
  Record<NodeWorkflowNodeType, NodeWorkflowFieldId | null>
> = {
  [NODE_TYPE_IDS.shotText]: NODE_WORKFLOW_FIELD_IDS.action,
  [NODE_TYPE_IDS.voice]: null,
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

/**
 * 审核态（包 4 / §4.2 Q3-Q4）—— 与 `status`（缺必填/就绪/生成中/失败）和
 * `generationStatus`（这一次调用成没成）**并列的第三条轴**，不是它们的子集：
 * 一个节点完全可以同时是 `approved` 和 `running`（用户点了「重做」重跑一次）。
 * 挤进任何一条既有轴都会丢掉其中一个语义。
 *
 * 粒度是**一张图**而不是一个节点（owner 2026-07-31 拍板）：一个节点往下游贡献
 * 的图可能来自自身 `mediaUrl`，也可能来自 `referenceAssets` 里被 ★/onStage 选
 * 中的若干条。键控用 URL —— 见 `lib/node-media-review.ts` 顶部对「为什么是 URL
 * 而不是 asset 下标」的说明。
 */
export const NODE_REVIEW_STATE_IDS = {
  /** 已出但没人看过。AI 生成成功时的落点。 */
  awaitingReview: 'awaiting_review',
  /** 人看过并放行。**唯一**能进下游 `image_urls` 的态。 */
  approved: 'approved',
  /** 人看过并打回。保留着，可与新版对比，但不进下游。 */
  rejected: 'rejected',
} as const

export const NODE_REVIEW_STATES = [
  NODE_REVIEW_STATE_IDS.awaitingReview,
  NODE_REVIEW_STATE_IDS.approved,
  NODE_REVIEW_STATE_IDS.rejected,
] as const

export type NodeReviewState = (typeof NODE_REVIEW_STATES)[number]

/**
 * 谁发起了这一次生成（包 6 ①-bis，owner 2026-08-01 拍板）。
 *
 * 审核门只管**助手替你做的决定** —— 你自己在画布上点的生成，你已经在场、已经做
 * 过一次决定，再拦一道是仪式。所以「进不进待审队列」由这条轴决定，而不是由「有
 * 没有生成成功」决定。
 *
 * ⚠ 必须**显式传**，不许从「dock 开着吗」「有没有 pending op」这类环境状态反推：
 * 助手关掉之后重跑同一个节点，间接推断就会判错。
 */
export const NODE_GENERATION_SOURCE_IDS = {
  /** 用户亲手发起（卡上的生成按钮、编辑框发送）。**不进**待审队列。 */
  user: 'user',
  /** 助手 op 发起，含审阅里「打回 → 改词再来」那一轮（⑥）。**进**待审队列。 */
  assistant: 'assistant',
} as const

export const NODE_GENERATION_SOURCES = [
  NODE_GENERATION_SOURCE_IDS.user,
  NODE_GENERATION_SOURCE_IDS.assistant,
] as const

export type NodeGenerationSource = (typeof NODE_GENERATION_SOURCES)[number]

export const NODE_GENERATION_STATUSES = [
  NODE_GENERATION_STATUS_IDS.idle,
  NODE_GENERATION_STATUS_IDS.pending,
  NODE_GENERATION_STATUS_IDS.success,
  NODE_GENERATION_STATUS_IDS.error,
] as const

export type NodeWorkflowGenerationStatus =
  (typeof NODE_GENERATION_STATUSES)[number]
