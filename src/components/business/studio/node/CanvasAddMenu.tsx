'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { NodeWorkflowNodeType } from '@/types'

import { NODE_ACCENTS, NODE_ICONS } from './nodes/shared'

const NODE_OPTIONS: Array<{
  type: NodeWorkflowNodeType
  labelKey: string
}> = [
  { type: 'script', labelKey: 'nodeTypes.script' },
  { type: 'text', labelKey: 'nodeTypes.text' },
  { type: 'image', labelKey: 'nodeTypes.image' },
  { type: 'video', labelKey: 'nodeTypes.video' },
  { type: 'audio', labelKey: 'nodeTypes.audio' },
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
      className="absolute z-40 w-56 rounded-xl border border-border/70 bg-card/95 p-2 shadow-xl backdrop-blur"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="font-display text-3xs font-medium uppercase tracking-nav text-muted-foreground">
          {t('addMenuTitle')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('closeEditor')}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-1">
        {NODE_OPTIONS.map((option) => {
          const Icon = NODE_ICONS[option.type]
          const accent = NODE_ACCENTS[option.type]
          return (
            <button
              key={option.type}
              type="button"
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/70"
              onClick={() => onAdd(option.type)}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-md',
                  accent.iconPlate,
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="font-display">{t(option.labelKey)}</span>
              <span
                aria-hidden
                className={cn('ml-auto size-1.5 rounded-full', accent.dot)}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
