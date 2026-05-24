'use client'

import { useEffect, useRef } from 'react'
import { Bot, MessageSquarePlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { XYPosition } from '@xyflow/react'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { cn } from '@/lib/utils'

interface CanvasAddMenuProps {
  open: boolean
  screenPosition: XYPosition | null
  onSelect(type: NodeWorkflowNodeType): void
  onClose(): void
}

export function CanvasAddMenu({
  open,
  screenPosition,
  onSelect,
  onClose,
}: CanvasAddMenuProps) {
  const t = useTranslations('StudioNode')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, open])

  if (!open || !screenPosition) {
    return null
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('addMenuTitle')}
      className="pointer-events-auto absolute z-20 w-72 overflow-hidden rounded-3xl border border-node-panel-inner/80 bg-node-panel/95 p-2 text-node-foreground shadow-node-panel backdrop-blur-xl"
      style={{
        left: screenPosition.x,
        top: screenPosition.y,
      }}
    >
      <div className="px-3 py-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
        {t('addMenuTitle')}
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.composer)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-200">
          <MessageSquarePlus className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.composer')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.composer')}
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.agent)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-lime-500/15 text-lime-200">
          <Bot className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.agent')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.agent')}
          </span>
        </span>
      </button>
    </div>
  )
}
