'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  Clapperboard,
  Film,
  ImagePlus,
  Layers,
  Mic2,
  Video,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { XYPosition } from '@xyflow/react'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_STUDIO_ADD_MENU } from '@/constants/node-studio'
import { NODE_ACCENTS } from '@/constants/node-tokens'
import { cn } from '@/lib/utils'

interface CanvasAddMenuProps {
  open: boolean
  screenPosition: XYPosition | null
  onSelect(type: NodeWorkflowNodeType, role?: NodeImageRole): void
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
  /** Unique row key — two rows share `type: image` (素材/生成), so `type`
   *  alone can't key the list. */
  key: string
  type: NodeWorkflowNodeType
  /** Role to stamp immediately on creation (bypasses any on-canvas chooser —
   *  there isn't one anymore, S5d ③ retires it). Absent = role-less. */
  role?: NodeImageRole
  /** i18n label/helper key — defaults to `type` when unset (kept explicit
   *  here since two rows now share a type). */
  labelKey: string
  Icon: ComponentType<{ className?: string }>
}

// S5d ③「添加菜单更名区分」(node-canvas.md §6.1): the single ambiguous "image"
// row (which used to defer to an on-canvas role picker) splits into two —
// 图片（素材，role-less, upload-first 3-source starter）and 镜头图（生成，role
// stamped `shot` immediately, same "role-preset on creation" pattern
// `CastDock.handleCastCreate` already uses for character/background).
// Voice/videoReference (owner 2026-07-10 追加拍板「音色/参考视频=素材」)
// move back here — Cast 卡匣现在只放角色卡/场景卡（收集器），素材类创建走
// this menu, "与图片三同权" (same tier as 图片（素材）).
const CANVAS_ADD_MENU_ITEMS: readonly CanvasAddMenuItem[] = [
  {
    key: 'image',
    type: NODE_TYPE_IDS.image,
    labelKey: 'image',
    Icon: ImagePlus,
  },
  {
    key: 'shot',
    type: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.shot,
    labelKey: 'shot',
    Icon: Clapperboard,
  },
  {
    key: 'voice',
    type: NODE_TYPE_IDS.voice,
    labelKey: 'voice',
    Icon: Mic2,
  },
  {
    key: 'videoReference',
    type: NODE_TYPE_IDS.videoReference,
    labelKey: 'videoReference',
    Icon: Film,
  },
  {
    key: 'seedance',
    type: NODE_TYPE_IDS.seedance,
    labelKey: 'seedance',
    Icon: Video,
  },
  {
    key: 'videoMerge',
    type: NODE_TYPE_IDS.videoMerge,
    labelKey: 'videoMerge',
    Icon: Layers,
  },
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
          // 镜头图（生成）row visually reads as its own family (accent token),
          // even though it shares the unified `image` node TYPE with the
          // 图片（素材）row — role decides accent, matching how the rest of
          // the canvas resolves a role'd image node's presentation.
          const accent =
            NODE_ACCENTS[
              item.role === NODE_IMAGE_ROLE_IDS.shot
                ? NODE_TYPE_IDS.shot
                : item.type
            ]
          const Icon = item.Icon

          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => onSelect(item.type, item.role)}
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
                  {t(`nodeTypes.${item.labelKey}`)}
                </span>
                <span className="mt-1 block text-xs leading-5 text-node-muted">
                  {t(`addMenuHelpers.${item.labelKey}`)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
