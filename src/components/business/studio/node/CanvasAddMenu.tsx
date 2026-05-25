'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Bot,
  Clapperboard,
  FileText,
  ImagePlus,
  Mic2,
  PanelsTopLeft,
  Video,
  Wallpaper,
  MessageSquarePlus,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { XYPosition } from '@xyflow/react'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_STUDIO_ADD_MENU } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

interface CanvasAddMenuProps {
  open: boolean
  screenPosition: XYPosition | null
  onSelect(type: NodeWorkflowNodeType): void
  onClose(): void
}

interface CanvasAddMenuLayout {
  anchorX: number
  anchorY: number
  left: number
  top: number
  maxHeight: number
}

export function CanvasAddMenu({
  open,
  screenPosition,
  onSelect,
  onClose,
}: CanvasAddMenuProps) {
  const t = useTranslations('StudioNode')
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<CanvasAddMenuLayout | null>(null)

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

  useLayoutEffect(() => {
    if (!open || !screenPosition) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const menuElement = menuRef.current
      const parentElement = menuElement?.parentElement
      const containerRect = parentElement?.getBoundingClientRect()
      const menuRect = menuElement?.getBoundingClientRect()
      const containerWidth = containerRect?.width ?? window.innerWidth
      const containerHeight = containerRect?.height ?? window.innerHeight
      const menuWidth = menuRect?.width ?? 0
      const menuHeight = menuRect?.height ?? 0
      const padding = NODE_STUDIO_ADD_MENU.viewportPaddingPx
      const minAvailableHeight = NODE_STUDIO_ADD_MENU.minAvailableHeightPx
      const maxAvailableHeight = Math.max(
        minAvailableHeight,
        containerHeight - padding * 2,
      )
      const availableBelow = Math.max(
        minAvailableHeight,
        containerHeight - screenPosition.y - padding,
      )
      const availableAbove = Math.max(
        minAvailableHeight,
        screenPosition.y - padding,
      )
      const shouldOpenAbove =
        menuHeight > availableBelow && availableAbove > availableBelow
      const maxHeight = Math.min(
        maxAvailableHeight,
        shouldOpenAbove ? availableAbove : availableBelow,
      )
      const top = shouldOpenAbove
        ? Math.max(padding, screenPosition.y - Math.min(menuHeight, maxHeight))
        : Math.min(
            screenPosition.y,
            Math.max(padding, containerHeight - padding - maxHeight),
          )
      const left = Math.min(
        Math.max(padding, screenPosition.x),
        Math.max(padding, containerWidth - menuWidth - padding),
      )

      setLayout({
        anchorX: screenPosition.x,
        anchorY: screenPosition.y,
        left,
        top,
        maxHeight,
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [open, screenPosition])

  if (!open || !screenPosition) {
    return null
  }

  const activeLayout =
    layout?.anchorX === screenPosition.x && layout.anchorY === screenPosition.y
      ? layout
      : null

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('addMenuTitle')}
      className="pointer-events-auto absolute z-20 w-72 overflow-y-auto overscroll-contain rounded-3xl border border-node-panel-inner/80 bg-node-panel/95 p-2 text-node-foreground shadow-node-panel backdrop-blur-xl"
      style={{
        left: activeLayout?.left ?? screenPosition.x,
        top: activeLayout?.top ?? screenPosition.y,
        maxHeight: activeLayout?.maxHeight,
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
        onClick={() => onSelect(NODE_TYPE_IDS.shotText)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-stone-300/10 text-stone-100">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.shotText')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.shotText')}
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.shot)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200">
          <Clapperboard className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.shot')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.shot')}
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
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.characterImage)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-200">
          <ImagePlus className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.characterImage')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.characterImage')}
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.backgroundImage)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200">
          <Wallpaper className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.backgroundImage')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.backgroundImage')}
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.frameImage)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-200">
          <PanelsTopLeft className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.frameImage')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.frameImage')}
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.voice)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-200">
          <Mic2 className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.voice')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.voice')}
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(NODE_TYPE_IDS.seedance)}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
          'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-200">
          <Video className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-node-foreground">
            {t('nodeTypes.seedance')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-node-muted">
            {t('addMenuHelpers.seedance')}
          </span>
        </span>
      </button>
    </div>
  )
}
