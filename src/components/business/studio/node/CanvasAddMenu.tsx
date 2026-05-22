'use client'

import {
  FileText,
  ImageIcon,
  Mic,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { NodeWorkflowNodeType } from '@/types'

const NODE_OPTIONS: Array<{
  type: NodeWorkflowNodeType
  icon: LucideIcon
  labelKey: string
}> = [
  { type: 'script', icon: FileText, labelKey: 'nodeTypes.script' },
  { type: 'text', icon: Type, labelKey: 'nodeTypes.text' },
  { type: 'image', icon: ImageIcon, labelKey: 'nodeTypes.image' },
  { type: 'video', icon: Video, labelKey: 'nodeTypes.video' },
  { type: 'audio', icon: Mic, labelKey: 'nodeTypes.audio' },
]

interface CanvasAddMenuProps {
  x: number
  y: number
  onAdd: (type: NodeWorkflowNodeType) => void
  onClose: () => void
}

export function CanvasAddMenu({ x, y, onAdd, onClose }: CanvasAddMenuProps) {
  const t = useTranslations('StudioNode')

  return (
    <div
      className="absolute z-40 w-48 rounded-lg border border-border/70 bg-card/95 p-2 shadow-xl backdrop-blur"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
        <span>{t('addMenuTitle')}</span>
        <button type="button" onClick={onClose} aria-label={t('closeEditor')}>
          ×
        </button>
      </div>
      <div className="grid gap-1">
        {NODE_OPTIONS.map((option) => (
          <button
            key={option.type}
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
            onClick={() => onAdd(option.type)}
          >
            <option.icon className="size-4 text-muted-foreground" />
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
