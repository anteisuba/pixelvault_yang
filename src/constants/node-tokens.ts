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
  text: 'T',
  image: 'I',
  video: 'V',
  audio: 'A',
} as const satisfies Record<NodeTokenType, string>

interface NodeAccentToken {
  iconPlate: string
  iconText: string
  selectedRing: string
  dot: string
}

export const NODE_ACCENTS = {
  composer: {
    iconPlate: 'bg-amber-500/15',
    iconText: 'text-amber-200',
    selectedRing: 'ring-amber-400/70',
    dot: '!bg-amber-300',
  },
  agent: {
    iconPlate: 'bg-lime-500/15',
    iconText: 'text-lime-200',
    selectedRing: 'ring-lime-400/70',
    dot: '!bg-lime-300',
  },
  shotText: {
    iconPlate: 'bg-stone-300/10',
    iconText: 'text-stone-100',
    selectedRing: 'ring-stone-200/60',
    dot: '!bg-stone-200',
  },
  shot: {
    iconPlate: 'bg-sky-500/15',
    iconText: 'text-sky-200',
    selectedRing: 'ring-sky-400/70',
    dot: '!bg-sky-300',
  },
  characterImage: {
    iconPlate: 'bg-rose-500/15',
    iconText: 'text-rose-200',
    selectedRing: 'ring-rose-400/70',
    dot: '!bg-rose-300',
  },
  backgroundImage: {
    iconPlate: 'bg-emerald-500/15',
    iconText: 'text-emerald-200',
    selectedRing: 'ring-emerald-400/70',
    dot: '!bg-emerald-300',
  },
  frameImage: {
    iconPlate: 'bg-orange-500/15',
    iconText: 'text-orange-200',
    selectedRing: 'ring-orange-400/70',
    dot: '!bg-orange-300',
  },
  voice: {
    iconPlate: 'bg-fuchsia-500/15',
    iconText: 'text-fuchsia-200',
    selectedRing: 'ring-fuchsia-400/70',
    dot: '!bg-fuchsia-300',
  },
  seedance: {
    iconPlate: 'bg-teal-500/15',
    iconText: 'text-teal-200',
    selectedRing: 'ring-teal-400/70',
    dot: '!bg-teal-300',
  },
  text: {
    iconPlate: 'bg-zinc-300/10',
    iconText: 'text-zinc-100',
    selectedRing: 'ring-zinc-200/60',
    dot: '!bg-zinc-200',
  },
  image: {
    iconPlate: 'bg-cyan-500/15',
    iconText: 'text-cyan-200',
    selectedRing: 'ring-cyan-400/70',
    dot: '!bg-cyan-300',
  },
  video: {
    iconPlate: 'bg-red-500/15',
    iconText: 'text-red-200',
    selectedRing: 'ring-red-400/70',
    dot: '!bg-red-300',
  },
  audio: {
    iconPlate: 'bg-violet-500/15',
    iconText: 'text-violet-200',
    selectedRing: 'ring-violet-400/70',
    dot: '!bg-violet-300',
  },
} satisfies Record<NodeTokenType, NodeAccentToken>

export const STATUS_COLORS = {
  idle: 'bg-node-panel-inner text-node-muted',
  queued: 'bg-amber-500/15 text-amber-200',
  ready: 'bg-lime-500/15 text-lime-200',
  running: 'bg-sky-500/15 text-sky-200',
  done: 'bg-emerald-500/15 text-emerald-200',
  failed: 'bg-red-500/15 text-red-200',
  stale: 'bg-stone-300/10 text-stone-300',
  disabled: 'bg-node-panel-soft text-node-subtle',
} as const

export const EDGE_COLORS = {
  default: 'stroke-node-muted',
  flowing: 'stroke-amber-300',
  hover: 'stroke-node-foreground',
  selected: 'stroke-amber-400',
  connecting: 'stroke-lime-300',
  invalid: 'stroke-red-400',
} as const
