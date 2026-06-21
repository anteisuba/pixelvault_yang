import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export const NODE_STUDIO_CANVAS = {
  defaultViewport: {
    x: 0,
    y: 0,
    zoom: 0.8,
  },
  background: {
    gap: 28,
    size: 1,
    // §2.2 去暖：点阵改中性（foreground rgb 232,230,222 低透），不再用暖象牙白。
    color: 'rgba(232,230,222,0.08)',
  },
  defaultZoomPercent: 80,
  // D3 Figma 级平移：中键(1)+右键(2) 拖拽平移画板；左键留给选择/框选。
  panOnDragButtons: [1, 2],
  // 空格 + 左键拖 = 临时平移（对齐 Figma）。
  panActivationKeyCode: 'Space',
} as const

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

export const NODE_STUDIO_TOOL_MODE_IDS = {
  pointer: 'pointer',
  hand: 'hand',
  connect: 'connect',
  cut: 'cut',
} as const

export const NODE_STUDIO_TOOL_MODES = [
  NODE_STUDIO_TOOL_MODE_IDS.pointer,
  NODE_STUDIO_TOOL_MODE_IDS.hand,
  NODE_STUDIO_TOOL_MODE_IDS.connect,
  NODE_STUDIO_TOOL_MODE_IDS.cut,
] as const

export type NodeStudioToolMode = (typeof NODE_STUDIO_TOOL_MODES)[number]

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
} as const

export const NODE_STUDIO_ASSISTANT = {
  gatewayModelId: 'openai/gpt-5.4',
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
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_4_MINI,
    label: 'OpenAI GPT-5.4 Mini',
  },
  {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH,
    label: 'Gemini 3.5 Flash',
  },
  {
    adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
    modelId: LLM_TEXT_MODEL_IDS.QWEN3_VL_PLUS,
    label: 'Qwen3 VL Plus',
  },
] as const

export const NODE_STUDIO_DOCK = {
  focusZoom: 0.95,
  focusDurationMs: 420,
} as const

export const NODE_STUDIO_DOCK_RESIZE = {
  /** Defaults match the previous fixed `lg:w-studio-right` (28rem) / `w-96` (24rem) sizing. */
  defaultWidthPx: 448,
  minWidthPx: 320,
  maxWidthPx: 720,
  /** Width when the dock is in the expanded ⤢ state (conversation + ScriptDoc
   *  workspace two-pane); capped to the viewport via inline maxWidth. */
  expandedWidthPx: 820,
  widthStepPx: 20,
  /** Inspector takes 55% of vertical space by default; conversation gets 45%. */
  defaultInspectorRatio: 0.55,
  minInspectorRatio: 0.2,
  maxInspectorRatio: 0.8,
  ratioStep: 0.05,
  handleThicknessPx: 6,
  storageKey: 'pixelvault.nodeStudio.dock.layout.v1',
} as const

export const NODE_STUDIO_REFERENCE_ROLES = [
  'identity',
  'pose',
  'style',
  'composition',
  'background',
] as const

export const NODE_STUDIO_REFERENCE_SOURCE_IDS = {
  upload: 'upload',
  asset: 'asset',
  paste: 'paste',
} as const

export const NODE_STUDIO_REFERENCE_SOURCES = [
  NODE_STUDIO_REFERENCE_SOURCE_IDS.upload,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.paste,
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
