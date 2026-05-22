import {
  FileText,
  ImageIcon,
  Mic,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react'

import type { NodeWorkflowNodeType } from '@/types'

export const NODE_ICONS: Record<NodeWorkflowNodeType, LucideIcon> = {
  script: FileText,
  text: Type,
  image: ImageIcon,
  video: Video,
  audio: Mic,
}

export interface NodeAccent {
  /** Soft tint applied to the icon plate inside the node header. */
  iconPlate: string
  /** Foreground color used for the icon glyph itself. */
  iconText: string
  /** Vertical color spine glued to the node's left edge. */
  spine: string
  /** Dot color used by the menu / chip rows to hint at the node family. */
  dot: string
  /** Outline class used when the node is selected. */
  selectedRing: string
}

export const NODE_ACCENTS: Record<NodeWorkflowNodeType, NodeAccent> = {
  script: {
    iconPlate: 'bg-orange-50 text-orange-700',
    iconText: 'text-orange-600',
    spine: 'bg-orange-400/70',
    dot: 'bg-orange-500',
    selectedRing: 'border-orange-400/80 ring-2 ring-orange-200/60',
  },
  text: {
    iconPlate: 'bg-stone-100 text-stone-700',
    iconText: 'text-stone-700',
    spine: 'bg-stone-400/70',
    dot: 'bg-stone-500',
    selectedRing: 'border-stone-400/80 ring-2 ring-stone-200/60',
  },
  image: {
    iconPlate: 'bg-emerald-50 text-emerald-700',
    iconText: 'text-emerald-600',
    spine: 'bg-emerald-400/70',
    dot: 'bg-emerald-500',
    selectedRing: 'border-emerald-400/80 ring-2 ring-emerald-200/60',
  },
  video: {
    iconPlate: 'bg-rose-50 text-rose-700',
    iconText: 'text-rose-600',
    spine: 'bg-rose-400/70',
    dot: 'bg-rose-500',
    selectedRing: 'border-rose-400/80 ring-2 ring-rose-200/60',
  },
  audio: {
    iconPlate: 'bg-amber-50 text-amber-700',
    iconText: 'text-amber-600',
    spine: 'bg-amber-400/80',
    dot: 'bg-amber-500',
    selectedRing: 'border-amber-400/80 ring-2 ring-amber-200/60',
  },
}

export const NODE_HANDLE_CLASS =
  '!size-3 !border !border-border !bg-card !shadow-sm hover:!border-primary'
