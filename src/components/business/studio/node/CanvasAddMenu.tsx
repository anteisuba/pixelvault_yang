'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { NodeWorkflowNodeType } from '@/types'

import { NODE_ACCENTS, NODE_ICONS } from './nodes/shared'

const NODE_OPTIONS: Array<{
  type: NodeWorkflowNodeType
  labelKey: string
  helperKey: string
}> = [
  {
    type: 'shot',
    labelKey: 'nodeTypes.shot',
    helperKey: 'addMenuHelpers.shot',
  },
  {
    type: 'shotText',
    labelKey: 'nodeTypes.shotText',
    helperKey: 'addMenuHelpers.shotText',
  },
  {
    type: 'characterImage',
    labelKey: 'nodeTypes.characterImage',
    helperKey: 'addMenuHelpers.characterImage',
  },
  {
    type: 'backgroundImage',
    labelKey: 'nodeTypes.backgroundImage',
    helperKey: 'addMenuHelpers.backgroundImage',
  },
  {
    type: 'frameImage',
    labelKey: 'nodeTypes.frameImage',
    helperKey: 'addMenuHelpers.frameImage',
  },
  {
    type: 'voice',
    labelKey: 'nodeTypes.voice',
    helperKey: 'addMenuHelpers.voice',
  },
  {
    type: 'seedance',
    labelKey: 'nodeTypes.seedance',
    helperKey: 'addMenuHelpers.seedance',
  },
  {
    type: 'composer',
    labelKey: 'nodeTypes.composer',
    helperKey: 'addMenuHelpers.composer',
  },
  {
    type: 'agent',
    labelKey: 'nodeTypes.agent',
    helperKey: 'addMenuHelpers.agent',
  },
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
      className="absolute z-40 w-72 rounded-2xl border border-white/[0.08] bg-[#181716] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="font-display text-[10px] font-semibold uppercase tracking-nav text-[#6f6a63]">
          {t('addMenuTitle')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('closeEditor')}
          className="rounded-md p-1 text-[#a6a098] transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-0.5">
        {NODE_OPTIONS.map((option) => {
          const Icon = NODE_ICONS[option.type]
          const accent = NODE_ACCENTS[option.type]
          return (
            <button
              key={option.type}
              type="button"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-white/5"
              onClick={() => onAdd(option.type)}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-lg',
                  accent.iconPlate,
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display">
                  {t(option.labelKey)}
                </span>
                <span className="block truncate text-[11px] leading-4 text-[#6f6a63]">
                  {t(option.helperKey)}
                </span>
              </span>
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
