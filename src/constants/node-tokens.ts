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
/**
 * 章色 —— 强度梯度（台账 §17.3，owner 2026-08-03 拍板）。
 *
 * 判据只有一条：**这个状态出现时，用户需不需要为它停下来**。由弱到强：
 *
 *   idle 不盖章 → done 不盖章 → ready 最轻 → running 唯一带动效 → failed 唯一的红
 *
 * ⚠ `idle` 与 `done` 都是空串，且组件层直接 `return null` —— 它们不是「透明的
 * 章」，是**没有章**。done 不盖章是拍板①：完成的证据是卡上那张图，再盖一枚是
 * 同一件事说两遍。这条也顺手治了原来的 bug：ready 与 done 的值曾**逐字符相同**
 * （都是 `border-current text-node-foreground`），两个语义相反的态同一枚章。
 *
 * ⚠ `queued` / `stale` / `disabled` **全仓没有任何 writer**（只活在
 * `NODE_STATUS_IDS` 枚举里），所以按拍板③**不设专属档**，统一走中性兜底。
 * 枚举值不能删 —— 老项目 JSON 里可能存着，删了 Zod 解析会整份失败。
 *
 * ⚠ 三个底色预设（#FFFFFF / #F4F4F3 / #F1F1F1）上都算过（最差档）：
 *   `--node-foreground` #26231e → 13.86 ✓ 文字
 *   `--node-muted`      #5f594e →  6.15 ✓ 文字
 *   `--node-subtle`     #8a8070 →  3.44 ✗ **不够 12px 文字**，已弃用
 *   纸红                #a32d2d →  6.26 ✓ 文字
 * 原来 stale/disabled 用的就是那个 3.44 的 subtle，而 `canvas.css:529` 给
 * `--canvas-ink-subtle` 的注释原话就是「只在卡背上用，别放画布底」——
 * 这枚章恰恰画在画布底上。
 *
 * running 的石绿只在**边与点**上（见 `.canvas-status-badge--running`）：石绿作
 * 12px 文字最差只有 3.59，够图形档不够文字档，所以章文留墨色。
 */
export const STATUS_COLORS = {
  idle: '',
  ready: 'border-current text-node-muted',
  running: 'canvas-status-badge--running border-current text-node-foreground',
  done: '',
  failed: 'border-node-status-failed text-node-status-failed',
  // 以下三个永不发生，中性兜底（拍板③）
  queued: 'border-current text-node-muted',
  stale: 'border-current text-node-muted',
  disabled: 'border-current text-node-muted',
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
