import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/** Default on-canvas size for role-less pure images (px). NodeResizer grows from here. */
export const NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE = 320

export const NODE_STUDIO_CANVAS = {
  defaultViewport: {
    x: 0,
    y: 0,
    zoom: 0.8,
  },
  background: {
    // Wider spacing so the grid reads as a navigation field, not noise.
    gap: 44,
    size: 1.5,
    // v2 制片桌（references/pages/node-canvas.md §2.1）：暖炭点阵。
    // S1 首落 #26231e 对比仅 1.19:1 几乎不可见，owner 目验后加深（~1.6:1）。
    color: '#403a2f',
  },
  defaultZoomPercent: 80,
  // D3 Figma 级平移：中键(1)+右键(2) 拖拽平移画板；左键留给选择/框选。
  panOnDragButtons: [1, 2],
  // 空格 + 左键拖 = 临时平移（对齐 Figma）。
  panActivationKeyCode: 'Space',
} as const

export const NODE_STUDIO_CANVAS_APPEARANCE_FITS = ['cover', 'contain'] as const

/**
 * Project-level canvas wallpaper defaults. The hook intentionally leaves the
 * persisted `canvasAppearance` field undefined for untouched projects; UI
 * consumers resolve that absence against this constant instead.
 */
export const NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT = {
  backgroundColor: '#14120F',
  image: undefined,
} as const

/**
 * Canvas surface presets: pure white/black for contrast checks, then warm
 * charcoal family + a few distinct tints. Custom color picker remains available.
 */
export const NODE_STUDIO_CANVAS_APPEARANCE_PRESETS = [
  '#FFFFFF',
  '#000000',
  '#14120F',
  '#F4F4F3',
  '#191612',
  '#1A1A1C',
  '#11181A',
  '#171A16',
  '#1D1715',
] as const

export const NODE_STUDIO_REACT_FLOW_PRO_OPTIONS = {
  hideAttribution: true,
} as const

export const NODE_STUDIO_PLACEHOLDER_TOAST = {
  durationMs: 1600,
  position: 'bottom-right',
} as const

export const NODE_STUDIO_ADD_MENU = {
  viewportPaddingPx: 16,
  minAvailableHeightPx: 240,
} as const

export const NODE_STUDIO_BOTTOM_DOCK = {
  canvasInsetPx: 16,
} as const

export const NODE_STUDIO_TOOL_MODE_IDS = {
  pointer: 'pointer',
  hand: 'hand',
  connect: 'connect',
  cut: 'cut',
} as const

export const NODE_STUDIO_TOOL_MODES = [
  NODE_STUDIO_TOOL_MODE_IDS.pointer,
  NODE_STUDIO_TOOL_MODE_IDS.hand,
] as const

/**
 * `connect` and `cut` remain valid migration values for persisted sessions,
 * but are intentionally absent from the visible toolbar while relationships
 * are expressed through ingest and ingredient chips instead of drawn edges.
 */
export type NodeStudioToolMode =
  (typeof NODE_STUDIO_TOOL_MODE_IDS)[keyof typeof NODE_STUDIO_TOOL_MODE_IDS]

export const NODE_STUDIO_WORKFLOW_STORAGE = {
  keyPrefix: 'pixelvault.nodeStudio.v3',
  // Old key with no per-user scoping. Wiped once on hook mount so a
  // previous account's local state can't leak into a new sign-in on the
  // same browser. See [[fix-node-workflow-account-isolation]] in commit msg.
  legacyGlobalKey: 'pixelvault.nodeStudio.v3',
  debounceMs: 400,
  version: 3,
  legacyVersion: 1,
  legacyVersionV2: 2,
} as const

export const NODE_STUDIO_IMAGE_EDIT_HANDOFF = {
  toolId: 'image-edit',
  queryKeys: {
    tool: 'canvasTool',
    sourceUrl: 'sourceUrl',
    generationId: 'generationId',
    width: 'width',
    height: 'height',
    editTask: 'editTask',
  },
  maxSourceUrlLength: 4000,
  maxEditTaskLength: 80,
} as const

export function getNodeStudioWorkflowStorageKey(clerkId: string): string {
  return `${NODE_STUDIO_WORKFLOW_STORAGE.keyPrefix}.${clerkId}`
}

export const NODE_STUDIO_PROJECTS = {
  idMaxLength: 160,
  nameMaxLength: 80,
  timestampMaxLength: 80,
  fallbackName: 'Node Studio Project',
} as const

export const NODE_STUDIO_AGENT_MODE_IDS = {
  storyBreakdown: 'storyBreakdown',
  seedancePrompt: 'seedancePrompt',
} as const

export const NODE_STUDIO_AGENT_MODES = [
  NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown,
  NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt,
] as const

export const NODE_STUDIO_ASSISTANT_MESSAGE_ROLES = [
  'user',
  'assistant',
] as const

export const NODE_STUDIO_ASSISTANT_LIMITS = {
  maxMessages: 16,
  maxMessageLength: 4000,
  maxNodes: 32,
  maxNodeLabelLength: 160,
  maxNodeSummaryLength: 900,
  maxSelectedNodes: 12,
  maxReferences: 8,
  maxOutputTokens: 900,
  // Research turns return analysis + suggestions + prompt seeds + sources, so
  // they need a larger budget than a normal canvas reply.
  maxResearchOutputTokens: 2000,
} as const

export const NODE_STUDIO_ASSISTANT = {
  gatewayModelId: 'openai/gpt-5.5',
  fallbackModelLabel: 'Workspace BYOK route',
} as const

export const NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS = {
  auto: 'node-studio-assistant:auto',
  keyPrefix: 'node-studio-assistant:key',
  setupPrefix: 'node-studio-assistant:setup',
} as const

export const NODE_STUDIO_ASSISTANT_ROUTE_MODELS = [
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_5,
    label: 'OpenAI GPT-5.5',
  },
  {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH,
    label: 'Gemini 3.5 Flash',
  },
  {
    // The canvas assistant is text-only today (it sends node context + chat,
    // never images), so the DashScope route uses the text flagship Qwen3 Max
    // rather than the VL model. Swap to qwen3-vl-plus here when the assistant
    // gains an image-reverse turn that needs vision.
    adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
    modelId: LLM_TEXT_MODEL_IDS.QWEN3_MAX,
    label: 'Qwen3 Max',
  },
  {
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    label: 'DeepSeek V4 Pro',
  },
] as const

export const NODE_STUDIO_DOCK = {
  focusZoom: 0.95,
  focusDurationMs: 420,
} as const

/**
 * Cast 卡匣（references/pages/node-canvas.md §6.2）：mirrors the identity
 * nodes (character/background/voice/videoReference) already on the ReactFlow
 * canvas as a second, dock-level presentation. Horizontal inset/avoidance
 * reuses `NODE_STUDIO_BOTTOM_DOCK` (same "clear the assistant dock" math as
 * the toolbar); this only holds the dock's own layout constants.
 *
 * S5d ①「卡匣回横匣」: reverted from the S5b/S5c popover-flyout form back to
 * S5a's always-visible horizontal strip (owner-flagged regression — the
 * flyout hid the dock behind an extra click). The flyout-era fields
 * (`flyoutGridColumns` / `flyoutMaxHeightPx`) are retired; the strip fields
 * below replace them.
 */
export const NODE_STUDIO_CAST_DOCK = {
  /** Card grid columns worth of horizontal breathing room before a section's
   *  row scrolls — used only as a doc-comment budget check, not read at
   *  runtime (§6.2 "一屏可见 6-8 张"). */
  targetVisibleCards: 8,
  /** Deterministic "static tilt" (§6.2 静置微倾): a card's rotation is picked
   *  from this list by hashing its (stable) node id — same card always gets
   *  the same angle across re-renders, never `Math.random()`. */
  tiltClasses: ['-rotate-2', '-rotate-1', 'rotate-1', 'rotate-2'] as const,
  /** Left inset reserving the minimap's horizontal footprint so the strip
   *  never covers it (chrome 实测 2026-07-10：不留位时整块盖住 minimap)。
   *  = minimap md:!left-6 (24px) + !w-48 (192px) + 16px gap. The minimap and
   *  the dock share the same render condition (nodes.length > 0), so the
   *  clearance is unconditional. */
  minimapClearancePx: 232,
  /** S5d ①: fixed card width (Tailwind standard scale, not an arbitrary
   *  value — Hard Rule 5) for a card inside the strip's horizontal-scroll
   *  flex row. `CastCard` itself renders `w-full` (S5c's grid-column-driven
   *  sizing, task packet says "CastCard 组件与徽章不动"), so the strip wraps
   *  every card in a fixed-width flex item instead of touching CastCard. */
  barCardWidthClass: 'w-24',
  /** Fixed width for a section's leading label tile (icon + name + count),
   *  same scale family as `barCardWidthClass` so the label reads as its own
   *  "card" in the horizontal flow. */
  barSectionLabelWidthClass: 'w-16',
  /** Bottom offset (px) clearing the toolbar row (`bottom-3` + ~44px tall
   *  pill + gap) so the expanded strip floats just above it instead of
   *  overlapping (§6.2 "工具条上方"). */
  barBottomOffsetPx: 68,
  /** 【紧急修复】折叠把手定位 (owner 2026-07-10 实测反馈②): the COLLAPSED
   *  pill anchors at the SAME bottom offset as the toolbar row (Tailwind
   *  `bottom-3` = 12px, mirrored here as a number since the pill is
   *  positioned via inline style, not a static class) instead of
   *  `barBottomOffsetPx` — sitting that much higher put it over arbitrary
   *  canvas node content instead of reading as "part of the bottom chrome."
   */
  collapsedBottomOffsetPx: 12,
} as const

/**
 * 吞噬拒绝原因（B1-5 原因气泡）。类型不合走连线合法性矩阵；已含该卡 = 目标已有
 * 同源边；参考位已满 = 契约上限命中（可得上限才带 n/m，见 use-cast-ingest.ts）。
 */
export const NODE_STUDIO_INGEST_REJECT_REASON_IDS = {
  typeMismatch: 'typeMismatch',
  duplicate: 'duplicate',
  capacityFull: 'capacityFull',
} as const

export type NodeStudioIngestRejectReason =
  (typeof NODE_STUDIO_INGEST_REJECT_REASON_IDS)[keyof typeof NODE_STUDIO_INGEST_REJECT_REASON_IDS]

/** B2 快投模式（§6.3 增强三件套②）。 */
export const NODE_STUDIO_INGEST_QUICK_THROW = {
  /** 触屏长按等效阈值 — 桌面用 hover 浮出投放钮，不用此值。 */
  longPressMs: 420,
} as const

/**
 * S5f B 磁吸（§6.3 增强三件套①）+ 折叠把手热区（B4）。§6.3 只说"指针阈值
 * 半径内最近目标张口满档"，未给数值——两档都按 44px 触达纪律的整数邻域取
 * （96 ≈ 两指宽，64 ≈ 一次触达半径），owner 手感不合适可只调这里。
 */
export const NODE_STUDIO_INGEST_MAGNET = {
  /** 指针到目标卡矩形边缘的吸附距离（px）：半径内最近合法目标张口满档，
   *  松手视同落在该目标上（磁吸不只是视觉，也放宽落点精度）。 */
  snapRadiusPx: 96,
  /** 折叠把手热区（B4）：拖拽中的实体距折叠把手矩形此距离内 → 横匣临时
   *  展开；松手/取消后回折叠态。 */
  handleHotZonePx: 64,
} as const

/**
 * 分类清单（§6.0 业务模型 v3.1，S5d 修正③）：预设 + 自定义。第一批 5 个
 * （identity/pose/style/composition/background）是 pre-S5d 的既有枚举值，向后
 * 兼容保留原样；后 5 个 + `custom` 是本片新增（enum 扩值，旧存档 parse 不炸）。
 * `custom` 与 `NodeWorkflowReferenceAssetSchema.customLabel` /
 * `NodeWorkflowNodeDataSchema.imageCategoryLabel` 配对使用——role/imageCategory
 * 存 `'custom'`，实际展示文本存在对应的 *Label 字段里。
 */
export const NODE_STUDIO_REFERENCE_ROLES = [
  'identity',
  'pose',
  'style',
  'composition',
  'background',
  'faceCloseup',
  'costume',
  'prop',
  'frameStart',
  'frameEnd',
  'custom',
] as const

export const NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID = 'custom' as const

/**
 * 关键帧分类（原 frame role 退役后的替代信号，§6.1 食物链注释 + frame 兼容迁移）
 * — `isKeyframeNode`（node-workflow-graph.ts）在旧 `role==='frame'` 之外，额外
 * 认这两个分类值为"这张图是关键帧"，不发明新字段名、不改连线矩阵。
 */
export const NODE_STUDIO_KEYFRAME_REFERENCE_ROLES = [
  'frameStart',
  'frameEnd',
] as const

/**
 * 分类 → 模型可读中文标签（buildShotReferenceLegend 图例注入，§6.0"让视频 API
 * 理解素材用途"）。与 `NODE_STUDIO_SHOT_REFERENCE_LEGEND.kindLabel` /
 * `NODE_STUDIO_VIDEO_REFERENCE_LEGEND.kindLabel` 同惯例：model-facing 固定中文
 * 文案，不走 i18n（i18n 版標籤在 `characterImage.reference.roles.*`，给 UI 选
 * 择器用，两套字符串服务不同读者）。`custom` 没有固定文案——调用方改用
 * asset.customLabel / node.data.imageCategoryLabel 本身。
 */
export const NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS: Record<
  Exclude<
    (typeof NODE_STUDIO_REFERENCE_ROLES)[number],
    typeof NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
  >,
  string
> = {
  identity: '角色参考',
  pose: '姿势',
  style: '风格',
  composition: '构图',
  background: '背景场景',
  faceCloseup: '面部特写',
  costume: '服装造型',
  prop: '道具',
  frameStart: '关键帧首',
  frameEnd: '关键帧尾',
}

export const NODE_STUDIO_REFERENCE_SOURCE_IDS = {
  upload: 'upload',
  asset: 'asset',
  paste: 'paste',
  /** S5c 三.5: the reference was fused in from a loose canvas image node
   *  (§三.3 散图→角色卡). `sourceId` on this entry carries that node's id
   *  (reusing the existing "id within the source's own namespace" contract —
   *  no separate sourceNodeId field needed) so 拆出 can un-hide it exactly. */
  canvas: 'canvas',
} as const

export const NODE_STUDIO_REFERENCE_SOURCES = [
  NODE_STUDIO_REFERENCE_SOURCE_IDS.upload,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.paste,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas,
] as const

export const NODE_STUDIO_IMAGE_INPUT = {
  accept: 'image/*',
  mimePrefix: 'image/',
  pastedFileName: 'pasted-image.png',
} as const

export const NODE_STUDIO_AUDIO_INPUT = {
  accept: 'audio/*,.mp3,.wav,.webm,.ogg,.mp4,.m4a,.flac',
  mimePrefix: 'audio/',
  fileExtensions: ['.mp3', '.wav', '.webm', '.ogg', '.mp4', '.m4a', '.flac'],
  /** MIME assumed for a generated audio clip picked from the asset library. */
  assetMimeType: 'audio/mpeg',
} as const

export const NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS = {
  manual: 'manual',
  fishAudio: 'fishAudio',
  referenceAudio: 'referenceAudio',
} as const

export const NODE_STUDIO_VOICE_PROFILE_SOURCES = [
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
] as const

export const NODE_STUDIO_VOICE_PROFILE = {
  providerDefault: 'Fish Audio',
  idPreviewLength: 48,
  maxAudioNameLength: 160,
  /**
   * Sample text used by the Voice Inspector's "Generate reference audio"
   * button. Length aims at ~12-15s when spoken at natural pace — within fal
   * Seedance reference-to-video's 15s audio cap.
   */
  referenceSampleText:
    '你好，这是一段用于声音克隆的参考音频。我们正在测试音色的克隆效果，请保持自然的语调和清晰的发音。',
  referenceSampleName: 'voice-clone-sample.mp3',
} as const

/**
 * Voice-node emotion presets for the detail panel's 情绪 chip row (b3 draft).
 * The selected id is stored as a code on `voiceEmotion`; `none` clears it.
 * Metadata only for now — the voice TTS path speaks the dialogue line and does
 * not yet consume emotion as a structured parameter.
 */
export const NODE_STUDIO_VOICE_EMOTION_IDS = {
  none: 'none',
  calm: 'calm',
  angry: 'angry',
  sad: 'sad',
  surprised: 'surprised',
} as const

export const NODE_STUDIO_VOICE_EMOTIONS = [
  NODE_STUDIO_VOICE_EMOTION_IDS.none,
  NODE_STUDIO_VOICE_EMOTION_IDS.calm,
  NODE_STUDIO_VOICE_EMOTION_IDS.angry,
  NODE_STUDIO_VOICE_EMOTION_IDS.sad,
  NODE_STUDIO_VOICE_EMOTION_IDS.surprised,
] as const

export type NodeStudioVoiceEmotion = (typeof NODE_STUDIO_VOICE_EMOTIONS)[number]

export const NODE_STUDIO_VIDEO_PROMPT = {
  maxItemLength: 220,
  maxPromptLength: 4000,
  maxVisualReferences: 4,
  sections: {
    visualReferences: 'Visual references',
    keyframes: 'Keyframes',
    shotText: 'Shot text',
    voiceProfiles: 'Voice profiles',
  },
} as const

export const NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS = {
  generated: 'generated',
  existing: 'existing',
} as const

/**
 * Per-clip duration cap enforced client-side before uploading a reference
 * video. fal Seedance reference-to-video accepts up to 3 clips with a
 * combined duration of ≤15s; we cap a single clip at 15s so one upload can
 * fill the full budget. Combined-duration validation happens server-side
 * once we know all connected video URLs.
 */
export const REFERENCE_VIDEO_MAX_DURATION_SECONDS = 15

export const NODE_STUDIO_IMAGE_OUTPUT_SOURCES = [
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
] as const

export const NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS = {
  choice: 'choice',
  ai: 'ai',
  existing: 'existing',
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_MODES = [
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
] as const

export const NODE_STUDIO_CHARACTER_IMAGE_REFERENCES = {
  maxItems: 3,
  defaultRole: 'identity',
  defaultWeight: 0.72,
  minWeight: 0,
  maxWeight: 1,
  weightStep: 0.05,
  uploadNote: 'Node Studio character reference',
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_OUTPUT = {
  maxSourceLabelLength: 160,
  uploadNote: 'Node Studio character output',
} as const

export const NODE_STUDIO_MEDIA_IMAGE_OUTPUT = {
  maxSourceLabelLength: 160,
  uploadNote: 'Node Studio image node output',
} as const

/**
 * Prompt legend prepended to a shot generation when upstream character /
 * background nodes are wired in. It maps each named reference image to its
 * subject so the image model binds the name used in the prompt ("让 yangyang…")
 * to the right reference picture. Model-facing text — kept in the project's
 * primary language (zh); names are user content injected at build time.
 */
export const NODE_STUDIO_SHOT_REFERENCE_LEGEND = {
  title: '参考图说明：',
  kindLabel: {
    character: '角色',
    background: '背景',
  },
} as const

/**
 * Prompt legend prepended to a VIDEO (Seedance) generation, mapping every SENT
 * reference slot — image_urls (角色 / 场景 / 镜头 / 特写), video_urls (视频), and
 * audio_urls (角色音色 / 旁白) — to its subject, so the model binds the `@名字`
 * tokens the composer inserted to the right slot (cast-redesign §7.2⑦ + §9 D,
 * incl. the closeup `@特写N` mapping). Structural + kind words are Chinese
 * (model-facing, like the shot legend); the per-slot NAME is either the user's
 * name or the SAME auto-name the composer's token uses (passed in from i18n so
 * `@特写1` in the prompt matches `特写1` in the legend byte-for-byte).
 *
 * V-1 (docs/plans/node-video-v1-token-translation.md): `imagePrefix` is
 * literal `@Image` — Seedance only resolves the positional `@Image1`/`@Image2`
 * token, not a Chinese label, and `node-video-prompt-translation.ts` now
 * rewrites the SAME `@ImageN` into the prompt body inline. This legend line
 * ("@Image1：角色「弗洛洛」") reinforces that binding with the kind, which the
 * inline body rewrite alone doesn't carry. `videoPrefix`/`audioPrefix` stay
 * Chinese — video_urls/audio_urls already resolve their own `@VideoN`/`@AudioN`
 * positional tokens via the fal builder's auto-inject fallback, untouched here.
 */
export const NODE_STUDIO_VIDEO_REFERENCE_LEGEND = {
  title: '参考素材说明（按名字对应到下列素材）：',
  imagePrefix: '@Image',
  videoPrefix: '视',
  audioPrefix: '音',
  kindLabel: {
    character: '角色',
    background: '场景',
    shot: '镜头',
    closeup: '特写',
    video: '视频',
  },
  characterVoiceSuffix: '的音色',
  narration: '旁白',
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_LORAS = {
  maxItems: 5,
  defaultScale: 1,
  minScale: 0.1,
  maxScale: 2,
  scaleStep: 0.05,
  customBaseFamily: 'custom',
} as const

export const NODE_STUDIO_NODE_PLACEMENT = {
  topbarAddPosition: {
    x: 96,
    y: 96,
  },
  menuOffset: {
    x: 16,
    y: 16,
  },
  // projectScriptDocToGraph anchors a recognisable left→right pipeline:
  // characters | shotText | voice | seedance | videoMerge. ScriptDoc has no
  // on-canvas node to anchor on, so positions are absolute from `origin`;
  // re-projection reuses existing node positions and never moves them.
  scriptDocSpawn: {
    origin: { x: 80, y: 120 },
    characterOffsetX: 0,
    shotTextOffsetX: 480,
    voiceOffsetX: 940,
    seedanceOffsetX: 1400,
    videoMergeOffsetX: 1860,
    shotRowOffsetY: 360,
    characterRowOffsetY: 260,
    voiceRowOffsetY: 150,
  },
  // §7.1 部门条 ＋添加位 autospawn: place the new reference node to the LEFT of
  // its target video node, stacked downward by how many upstream nodes the
  // target already has, so successive adds don't overlap.
  referenceSpawn: {
    offsetX: -420,
    rowOffsetY: 200,
  },
  // Image edits never replace their source. A single result lands to the
  // source's right; multi-output edits (for example decompose) fan out into a
  // compact grid so the entire batch remains one spatial/undo operation.
  derivedImage: {
    offsetX: 460,
    columnOffsetX: 440,
    rowOffsetY: 440,
    columns: 3,
  },
} as const

export const NODE_STUDIO_ID_PREFIXES = {
  node: 'node',
  edge: 'edge',
  project: 'project',
  message: 'message',
} as const

// §2.3 去黄：连线中性灰（--node-edge），preview/选中靠明度提亮（--node-edge-active）；
// glow 去霓虹（anti-slop），改 foreground 基的极淡中性光晕。
export const NODE_STUDIO_EDGE_VISUALS = {
  type: 'smoothstep',
  color: 'var(--node-edge)',
  previewColor: 'var(--node-edge-active)',
  glowFilter:
    'drop-shadow(0 0 4px color-mix(in oklab, var(--node-edge-active) 28%, transparent))',
  strokeWidth: 3,
  previewStrokeWidth: 3.5,
  interactionWidth: 28,
  markerSize: 20,
  markerStrokeWidth: 1.8,
  previewDash: '9 7',
  markerEndType: 'arrowclosed',
} as const
