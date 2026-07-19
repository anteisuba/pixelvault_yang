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
  Frame,
  ImagePlus,
  Layers,
  Mic2,
  Mountain,
  Upload,
  UserRound,
  Video,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { XYPosition } from '@xyflow/react'

import {
  CANVAS_ADD_CATALOG,
  CANVAS_ADD_INTENT_IDS,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import { NODE_STUDIO_ADD_MENU } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

interface CanvasAddMenuProps {
  open: boolean
  screenPosition: XYPosition | null
  onSelect(intentId: CanvasAddIntentId): void
  onClose(): void
}

interface CanvasAddMenuLayout {
  anchorX: number
  anchorY: number
  left: number
  top: number
  maxHeight: number
}

const ICON_BY_INTENT: Record<
  CanvasAddIntentId,
  ComponentType<{ className?: string }>
> = {
  [CANVAS_ADD_INTENT_IDS.imageAsset]: ImagePlus,
  [CANVAS_ADD_INTENT_IDS.imageShot]: Clapperboard,
  [CANVAS_ADD_INTENT_IDS.imageKeyframe]: Frame,
  [CANVAS_ADD_INTENT_IDS.videoGenerate]: Video,
  [CANVAS_ADD_INTENT_IDS.videoReference]: Film,
  [CANVAS_ADD_INTENT_IDS.videoMerge]: Layers,
  [CANVAS_ADD_INTENT_IDS.audioVoiceProfile]: Mic2,
  [CANVAS_ADD_INTENT_IDS.organizeCharacter]: UserRound,
  [CANVAS_ADD_INTENT_IDS.organizeScene]: Mountain,
}

/**
 * Haivis-style insert menu: compact list near the pointer, soft panel, no
 * heavy accent plates. Groups stay as lightweight separators.
 */
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
      if (event.key === 'Escape' && !event.isComposing) {
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
      // R3-4 §4.1 L5: 瞬时浮层，与 CastDock 展开浮层同刻互斥（见 StudioNodeWorkbench）。
      className="pointer-events-auto absolute z-canvas-transient w-56 overflow-y-auto overscroll-contain rounded-xl border border-node-panel-inner bg-node-panel p-1.5 text-node-foreground [scrollbar-width:none] sm:w-64 [&::-webkit-scrollbar]:hidden"
      style={{
        left: activeLayout?.left ?? screenPosition.x,
        top: activeLayout?.top ?? screenPosition.y,
        maxHeight: activeLayout?.maxHeight,
        boxShadow: 'var(--shadow-canvas-menu)',
      }}
    >
      {/* Primary insert actions — Haivis short list density. */}
      <div className="space-y-0.5 p-0.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => onSelect(CANVAS_ADD_INTENT_IDS.imageAsset)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-node-foreground transition-colors hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none"
        >
          <Upload className="size-4 shrink-0 text-node-muted" />
          <span className="font-medium">
            {t('addCatalog.items.imageAsset.label')}
          </span>
        </button>
      </div>

      {CANVAS_ADD_CATALOG.map((group) => (
        <section
          key={group.id}
          className="mt-1 space-y-0.5 border-t border-node-panel-inner/80 pt-1.5"
        >
          <h3 className="px-2.5 pb-0.5 pt-0.5 text-[11px] font-semibold tracking-wide text-node-subtle">
            {t(`addCatalog.groups.${group.id}`)}
          </h3>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              // image.asset already listed as primary "upload" row above.
              if (item.id === CANVAS_ADD_INTENT_IDS.imageAsset) return null
              const Icon = ICON_BY_INTENT[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    'hover:bg-node-panel-inner focus-visible:bg-node-panel-inner focus-visible:outline-none',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-node-muted" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-node-foreground">
                      {t(`addCatalog.items.${item.labelKey}.label`)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
