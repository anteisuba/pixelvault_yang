'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { FileText, Film, ImagePlus, Layers, Mic2, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { XYPosition } from '@xyflow/react'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_STUDIO_ADD_MENU } from '@/constants/node-studio'
import { NODE_ACCENTS } from '@/constants/node-tokens'
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

interface CanvasAddMenuItem {
  type: NodeWorkflowNodeType
  Icon: ComponentType<{ className?: string }>
}

// Flat list (post node-consolidation): only ~6 modality nodes, so category
// tabs were dropped — search covers find-by-name without the overflowing
// tab row. Order = elements first, then generators, then orchestration.
const CANVAS_ADD_MENU_ITEMS: readonly CanvasAddMenuItem[] = [
  { type: NODE_TYPE_IDS.shotText, Icon: FileText },
  {
    // Unified image node (option B): one menu entry; role (character /
    // background / shot) is chosen in the node's empty-state picker.
    type: NODE_TYPE_IDS.image,
    Icon: ImagePlus,
  },
  { type: NODE_TYPE_IDS.voice, Icon: Mic2 },
  { type: NODE_TYPE_IDS.videoReference, Icon: Film },
  { type: NODE_TYPE_IDS.seedance, Icon: Video },
  { type: NODE_TYPE_IDS.videoMerge, Icon: Layers },
] as const

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
      className="pointer-events-auto absolute z-20 w-80 overflow-y-auto overscroll-contain rounded-2xl border border-node-panel-inner/80 bg-node-panel/95 p-2 text-node-foreground shadow-node-panel backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        left: activeLayout?.left ?? screenPosition.x,
        top: activeLayout?.top ?? screenPosition.y,
        maxHeight: activeLayout?.maxHeight,
      }}
    >
      <div className="px-2 py-2">
        <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {t('addMenuTitle')}
        </p>
      </div>

      <div className="space-y-1">
        {CANVAS_ADD_MENU_ITEMS.map((item) => {
          const accent = NODE_ACCENTS[item.type]
          const Icon = item.Icon

          return (
            <button
              key={item.type}
              type="button"
              role="menuitem"
              onClick={() => onSelect(item.type)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
              )}
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-2xl',
                  accent.iconPlate,
                  accent.iconText,
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-node-foreground">
                  {t(`nodeTypes.${item.type}`)}
                </span>
                <span className="mt-1 block text-xs leading-5 text-node-muted">
                  {t(`addMenuHelpers.${item.type}`)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
