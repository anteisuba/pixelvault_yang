export const NODE_TOKEN_TYPES = [
  'composer',
  'agent',
  'shotText',
  'shot',
  'characterImage',
  'backgroundImage',
  'frameImage',
  'voice',
  'seedance',
  'videoReference',
  'videoMerge',
  'text',
  'image',
  'video',
  'audio',
] as const

export type NodeTokenType = (typeof NODE_TOKEN_TYPES)[number]

export const NODE_TOKEN_BADGE_LABELS = {
  composer: 'C',
  agent: 'A',
  shotText: 'T',
  shot: 'S',
  characterImage: 'C',
  backgroundImage: 'B',
  frameImage: 'F',
  voice: 'V',
  seedance: 'D',
  videoReference: 'R',
  videoMerge: 'M',
  text: 'T',
  image: 'I',
  video: 'V',
  audio: 'A',
} as const satisfies Record<NodeTokenType, string>

interface NodeAccentToken {
  iconPlate: string
  iconText: string
  selectedRing: string
  /** Output handle (solid filled dot) — background fill in the type color. */
  dot: string
  /** Input handle (outline ring dot) — border in the type color, hollow fill. */
  dotRing: string
}

/**
 * D1 去黄 + §2.3 端口类型色：节点强调色去掉满屏彩虹（amber/lime/sky/rose/...）。
 * 4 个视频导演元素（角色/背景/声音/视频族）保留「极淡功能性类型色」（fill-5），
 * 其余通用节点（composer/agent/shot/text/image/audio/frame）一律中性。
 */
const NEUTRAL_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-foreground/10',
  iconText: 'text-node-foreground',
  selectedRing: 'ring-node-foreground/40',
  dot: '!bg-node-muted',
  dotRing: '!border-node-muted',
}

const CHARACTER_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-character/20',
  iconText: 'text-node-port-character',
  selectedRing: 'ring-node-port-character/60',
  dot: '!bg-node-port-character',
  dotRing: '!border-node-port-character',
}

const BACKGROUND_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-background/20',
  iconText: 'text-node-port-background',
  selectedRing: 'ring-node-port-background/60',
  dot: '!bg-node-port-background',
  dotRing: '!border-node-port-background',
}

const VOICE_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-voice/20',
  iconText: 'text-node-port-voice',
  selectedRing: 'ring-node-port-voice/60',
  dot: '!bg-node-port-voice',
  dotRing: '!border-node-port-voice',
}

const VIDEO_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-video/20',
  iconText: 'text-node-port-video',
  selectedRing: 'ring-node-port-video/60',
  dot: '!bg-node-port-video',
  dotRing: '!border-node-port-video',
}

// Image-modality accent (low-sat violet). The unified `image` node and its
// non-character roles (shot / frame) use it so the most-used "create an image"
// surface isn't a colorless grey. character / background keep their own tint.
const IMAGE_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-image/20',
  iconText: 'text-node-port-image',
  selectedRing: 'ring-node-port-image/60',
  dot: '!bg-node-port-image',
  dotRing: '!border-node-port-image',
}

export const NODE_ACCENTS = {
  composer: NEUTRAL_ACCENT,
  agent: NEUTRAL_ACCENT,
  shotText: NEUTRAL_ACCENT,
  shot: IMAGE_ACCENT,
  characterImage: CHARACTER_ACCENT,
  backgroundImage: BACKGROUND_ACCENT,
  frameImage: IMAGE_ACCENT,
  voice: VOICE_ACCENT,
  seedance: VIDEO_ACCENT,
  videoReference: VIDEO_ACCENT,
  videoMerge: VIDEO_ACCENT,
  text: NEUTRAL_ACCENT,
  image: IMAGE_ACCENT,
  video: VIDEO_ACCENT,
  audio: NEUTRAL_ACCENT,
} satisfies Record<NodeTokenType, NodeAccentToken>

// §6 去黄：排队不再 amber，进行中靠动效（组件加脉冲）不靠色，完成克制，仅失败用红。
export const STATUS_COLORS = {
  idle: 'bg-node-panel-inner text-node-muted',
  queued: 'bg-node-panel-inner text-node-muted',
  ready: 'bg-node-panel-inner text-node-foreground',
  running: 'bg-node-panel-inner text-node-foreground',
  done: 'bg-node-status-done text-node-status-done-fg',
  failed: 'bg-node-status-failed text-node-status-failed-fg',
  stale: 'bg-node-panel-soft text-node-subtle',
  disabled: 'bg-node-panel-soft text-node-subtle',
} as const

// §2.3 连线全中性灰，default/hover/选中/进行中靠明度（--node-edge ↔ -edge-active），
// 仅非法连接用红（唯一语义色）。
export const EDGE_COLORS = {
  default: 'stroke-node-edge',
  flowing: 'stroke-node-edge-active',
  hover: 'stroke-node-edge-active',
  selected: 'stroke-node-edge-active',
  connecting: 'stroke-node-edge-active',
  invalid: 'stroke-red-400',
} as const
