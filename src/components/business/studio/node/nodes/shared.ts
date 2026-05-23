import {
  Bot,
  Clapperboard,
  Hash,
  ImageIcon,
  MapPinned,
  Mic,
  ScrollText,
  Type,
  UserRound,
  Video,
  type LucideIcon,
} from 'lucide-react'

import type { NodeWorkflowNodeType } from '@/types'

export const NODE_ICONS: Record<NodeWorkflowNodeType, LucideIcon> = {
  composer: Hash,
  agent: Bot,
  shot: Clapperboard,
  shotText: ScrollText,
  characterImage: UserRound,
  backgroundImage: MapPinned,
  frameImage: ImageIcon,
  voice: Mic,
  seedance: Video,
  text: Type,
  image: ImageIcon,
  video: Video,
  audio: Mic,
}

export const NODE_TYPE_GLYPHS: Record<NodeWorkflowNodeType, string> = {
  composer: '⌗',
  agent: 'A',
  shot: 'S',
  shotText: 'T',
  characterImage: 'C',
  backgroundImage: 'B',
  frameImage: 'F',
  voice: 'V',
  seedance: 'O',
  text: 'T',
  image: '□',
  video: '▱',
  audio: '♪',
}

export interface NodeAccent {
  /** Soft tint applied to chips and icon plates inside the node header. */
  iconPlate: string
  /** Foreground color used for the icon glyph itself. */
  iconText: string
  /** Hover/selected ring color expressed as a Tailwind class set. */
  selectedRing: string
  /** Dot color used by the menu / chip rows to hint at the node family. */
  dot: string
}

/**
 * Accents are tuned for the dark-overlay studio canvas (#0b0b0a background,
 * #181716 panels). Tints stay subtle and rely on the dark wrap to invert.
 */
export const NODE_ACCENTS: Record<NodeWorkflowNodeType, NodeAccent> = {
  composer: {
    iconPlate: 'bg-white/5 text-foreground/80',
    iconText: 'text-foreground/80',
    selectedRing: 'border-foreground/40 ring-1 ring-foreground/20',
    dot: 'bg-foreground/70',
  },
  agent: {
    iconPlate: 'bg-amber-500/15 text-amber-300',
    iconText: 'text-amber-300',
    selectedRing: 'border-amber-400/60 ring-1 ring-amber-400/20',
    dot: 'bg-amber-400',
  },
  shot: {
    iconPlate: 'bg-amber-500/15 text-amber-300',
    iconText: 'text-amber-300',
    selectedRing: 'border-amber-400/60 ring-1 ring-amber-400/20',
    dot: 'bg-amber-400',
  },
  shotText: {
    iconPlate: 'bg-stone-500/20 text-stone-100',
    iconText: 'text-stone-100',
    selectedRing: 'border-stone-200/60 ring-1 ring-stone-200/20',
    dot: 'bg-stone-200',
  },
  characterImage: {
    iconPlate: 'bg-emerald-500/15 text-emerald-300',
    iconText: 'text-emerald-300',
    selectedRing: 'border-emerald-300/60 ring-1 ring-emerald-300/20',
    dot: 'bg-emerald-300',
  },
  backgroundImage: {
    iconPlate: 'bg-cyan-500/15 text-cyan-200',
    iconText: 'text-cyan-200',
    selectedRing: 'border-cyan-200/60 ring-1 ring-cyan-200/20',
    dot: 'bg-cyan-200',
  },
  frameImage: {
    iconPlate: 'bg-lime-500/15 text-lime-200',
    iconText: 'text-lime-200',
    selectedRing: 'border-lime-200/60 ring-1 ring-lime-200/20',
    dot: 'bg-lime-200',
  },
  voice: {
    iconPlate: 'bg-sky-500/15 text-sky-200',
    iconText: 'text-sky-200',
    selectedRing: 'border-sky-200/60 ring-1 ring-sky-200/20',
    dot: 'bg-sky-200',
  },
  seedance: {
    iconPlate: 'bg-rose-500/15 text-rose-200',
    iconText: 'text-rose-200',
    selectedRing: 'border-rose-200/60 ring-1 ring-rose-200/20',
    dot: 'bg-rose-200',
  },
  text: {
    iconPlate: 'bg-slate-500/15 text-slate-200',
    iconText: 'text-slate-200',
    selectedRing: 'border-slate-300/60 ring-1 ring-slate-300/20',
    dot: 'bg-slate-300',
  },
  image: {
    iconPlate: 'bg-emerald-500/15 text-emerald-300',
    iconText: 'text-emerald-300',
    selectedRing: 'border-emerald-300/60 ring-1 ring-emerald-300/20',
    dot: 'bg-emerald-300',
  },
  video: {
    iconPlate: 'bg-violet-500/15 text-violet-300',
    iconText: 'text-violet-300',
    selectedRing: 'border-violet-300/60 ring-1 ring-violet-300/20',
    dot: 'bg-violet-300',
  },
  audio: {
    iconPlate: 'bg-amber-500/15 text-amber-300',
    iconText: 'text-amber-300',
    selectedRing: 'border-amber-300/60 ring-1 ring-amber-300/20',
    dot: 'bg-amber-300',
  },
}

/**
 * React Flow port handle. Matches the design's "+ in a circle" affordance.
 * The plus glyph itself is overlaid by the node component because Handle
 * cannot render children.
 */
export const NODE_HANDLE_CLASS =
  '!size-2.5 !border !border-white/30 !bg-[#22211f] hover:!border-white/60 hover:!bg-[#2d2b28]'
