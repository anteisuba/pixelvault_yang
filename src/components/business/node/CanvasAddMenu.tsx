'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  FileText,
  Film,
  ImagePlus,
  Layers,
  Mic2,
  Search,
  Video,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { XYPosition } from '@xyflow/react'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_STUDIO_ADD_MENU } from '@/constants/node-studio'
import { NODE_ACCENTS } from '@/constants/node-tokens'
import { Input } from '@/components/ui/input'
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

const ADD_MENU_CATEGORY_IDS = {
  all: 'all',
  elements: 'elements',
  generation: 'generation',
  orchestration: 'orchestration',
} as const

type AddMenuCategoryId =
  (typeof ADD_MENU_CATEGORY_IDS)[keyof typeof ADD_MENU_CATEGORY_IDS]

interface CanvasAddMenuItem {
  type: NodeWorkflowNodeType
  category: Exclude<AddMenuCategoryId, 'all'>
  Icon: ComponentType<{ className?: string }>
}

const CANVAS_ADD_MENU_ITEMS: readonly CanvasAddMenuItem[] = [
  {
    type: NODE_TYPE_IDS.shotText,
    category: ADD_MENU_CATEGORY_IDS.elements,
    Icon: FileText,
  },
  {
    // Unified image node (option B): one menu entry; role (character /
    // background / shot) is chosen in the node's empty-state picker.
    type: NODE_TYPE_IDS.image,
    category: ADD_MENU_CATEGORY_IDS.elements,
    Icon: ImagePlus,
  },
  {
    type: NODE_TYPE_IDS.voice,
    category: ADD_MENU_CATEGORY_IDS.elements,
    Icon: Mic2,
  },
  {
    type: NODE_TYPE_IDS.videoReference,
    category: ADD_MENU_CATEGORY_IDS.elements,
    Icon: Film,
  },
  {
    type: NODE_TYPE_IDS.seedance,
    category: ADD_MENU_CATEGORY_IDS.generation,
    Icon: Video,
  },
  {
    type: NODE_TYPE_IDS.videoMerge,
    category: ADD_MENU_CATEGORY_IDS.orchestration,
    Icon: Layers,
  },
] as const

const ADD_MENU_CATEGORIES = [
  ADD_MENU_CATEGORY_IDS.all,
  ADD_MENU_CATEGORY_IDS.elements,
  ADD_MENU_CATEGORY_IDS.generation,
  ADD_MENU_CATEGORY_IDS.orchestration,
] as const

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
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
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<AddMenuCategoryId>(
    ADD_MENU_CATEGORY_IDS.all,
  )

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

  const filteredItems = useMemo(() => {
    const query = normalizeSearch(search)

    return CANVAS_ADD_MENU_ITEMS.filter((item) => {
      if (
        category !== ADD_MENU_CATEGORY_IDS.all &&
        item.category !== category
      ) {
        return false
      }

      if (!query) {
        return true
      }

      const haystack = [
        item.type,
        t(`nodeTypes.${item.type}`),
        t(`addMenuHelpers.${item.type}`),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [category, search, t])

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
      className="pointer-events-auto absolute z-20 w-80 overflow-y-auto overscroll-contain rounded-2xl border border-node-panel-inner/80 bg-node-panel/95 p-2 text-node-foreground shadow-node-panel backdrop-blur-xl"
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
        <label className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-node-subtle" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('addMenuSearchPlaceholder')}
            aria-label={t('addMenuSearchPlaceholder')}
            className="h-9 rounded-xl border-node-panel-inner bg-node-panel-soft pl-8 text-sm text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-node-focus-ring/20"
          />
        </label>
      </div>

      <div
        role="group"
        aria-label={t('addMenuCategoryLabel')}
        className="flex gap-1 overflow-x-auto px-2 pb-2"
      >
        {ADD_MENU_CATEGORIES.map((categoryId) => {
          const selected = category === categoryId

          return (
            <button
              key={categoryId}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategory(categoryId)}
              className={cn(
                'shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors',
                selected
                  ? 'bg-node-foreground text-node-canvas'
                  : 'text-node-muted hover:bg-node-panel-inner hover:text-node-foreground',
              )}
            >
              {t(`addMenuCategories.${categoryId}`)}
            </button>
          )
        })}
      </div>

      <div className="space-y-1">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
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
          })
        ) : (
          <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-4 text-sm text-node-muted">
            {t('addMenuEmpty')}
          </div>
        )}
      </div>
    </div>
  )
}
