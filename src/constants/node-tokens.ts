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

// S2 端口纸面校准（施工图 §2.3 / 任务包改动清单⑥）：dot / dotRing / iconText 换
// on-paper 变体类（NodeShell Handle 现挂在纸卡缘，需要对 --node-card-paper 达标的
// 类型色）。on-paper 变体本轮定值 = 原值（WCAG 脚本核实 5/5 已 ≥3:1，偏移量 0，见
// globals.css :root 注释），故这里替换 class 名本轮无像素变化，为纸面/深底两套上下
// 文后续可独立调参预留 token 分叉点。
//
// iconPlate 由 /20 改 /30 → 改 /10（chrome 实跑 canvas 取样 + WCAG 计算，S2 报告）：
// 淡底与字同色相，不透明度往上加反而把底色拉近字色、拉低对比（纸面 /20 量得
// 2.8–2.9:1、/30 反降到 2.5–2.6:1）；往下调到 /10 才是对的方向（纸面回升到
// 3.0–3.3:1，深底 chrome 语境同步从 2.9:1 升到 3.2:1——CanvasAddMenu /
// NodeDetailPanel 共享同一 iconPlate token，双向都是净改善，非只顾纸面）。任务包原
// 文按「看不清就调高」的直觉指向 /30，经验证方向相反，改 /10 而非 /30。
const CHARACTER_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-character/10',
  iconText: 'text-node-port-character-on-paper',
  selectedRing: 'ring-node-port-character/60',
  dot: '!bg-node-port-character-on-paper',
  dotRing: '!border-node-port-character-on-paper',
}

const BACKGROUND_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-background/10',
  iconText: 'text-node-port-background-on-paper',
  selectedRing: 'ring-node-port-background/60',
  dot: '!bg-node-port-background-on-paper',
  dotRing: '!border-node-port-background-on-paper',
}

const VOICE_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-voice/10',
  iconText: 'text-node-port-voice-on-paper',
  selectedRing: 'ring-node-port-voice/60',
  dot: '!bg-node-port-voice-on-paper',
  dotRing: '!border-node-port-voice-on-paper',
}

const VIDEO_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-video/10',
  iconText: 'text-node-port-video-on-paper',
  selectedRing: 'ring-node-port-video/60',
  dot: '!bg-node-port-video-on-paper',
  dotRing: '!border-node-port-video-on-paper',
}

// Image-modality accent (low-sat violet). The unified `image` node and its
// non-character roles (shot / frame) use it so the most-used "create an image"
// surface isn't a colorless grey. character / background keep their own tint.
const IMAGE_ACCENT: NodeAccentToken = {
  iconPlate: 'bg-node-port-image/10',
  iconText: 'text-node-port-image-on-paper',
  selectedRing: 'ring-node-port-image/60',
  dot: '!bg-node-port-image-on-paper',
  dotRing: '!border-node-port-image-on-paper',
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

// S3 盖章状态系统（node-canvas.md §4）：胶囊 → 章，透明底 + 描边 + 同色文字。
// idle 无章（组件层 return null，这里不需要条目）。§6 去黄原则延续：排队/完成
// 靠中性炭墨，进行中靠动效 + 石绿（§5 落点②），仅失败用红——章文承载语义、
// 颜色只加固。`text-node-*` 变量类在 `.node-card-paper` 作用域内自动变炭墨系、
// 深 chrome（详情面板等）自动浅色系，不写两套（见 globals.css strangler 覆盖）。
export const STATUS_COLORS = {
  idle: '',
  queued: 'border-current text-node-muted',
  ready: 'border-current text-node-foreground',
  running: 'border-current text-node-paint',
  done: 'border-current text-node-foreground',
  failed: 'border-node-status-failed text-node-status-failed',
  stale: 'border-current text-node-subtle',
  disabled: 'border-current text-node-subtle',
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
