'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import type { Route } from '@/constants/routes'
import {
  GALLERY_GRID_COLUMN_BREAKPOINTS,
  GALLERY_GRID_GAP_X,
  GALLERY_GRID_GAP_X_BREAKPOINT,
  GALLERY_GRID_GAP_Y,
  GALLERY_GRID_LEAD_TILE_CHROME_PX,
  GALLERY_GRID_OVERSCAN,
  GALLERY_GRID_SSR_ITEM_COUNT,
  GALLERY_GRID_TILE_CHROME_PX,
} from '@/constants/gallery-grid'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import {
  ImageCard,
  IMAGE_CARD_PRESENTATIONS,
} from '@/components/business/ImageCard'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import type { GenerationRecord } from '@/types'

interface GalleryGridProps {
  generations: GenerationRecord[]
  emptyTitle: string
  emptyDescription: string
  emptyActionHref?: Route
  emptyActionLabel?: string
  feedLabel: string
  itemFallbackLabel: string
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
}

const SPATIAL_CROSS_AXIS_WEIGHT = 4

function getRectCenter(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function getSpatialNavigationTarget(
  items: HTMLElement[],
  current: HTMLElement,
  key: string,
): HTMLElement | null {
  if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(key)) {
    return null
  }

  const currentRect = current.getBoundingClientRect()
  const currentCenter = getRectCenter(currentRect)
  let bestItem: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const item of items) {
    if (item === current) continue

    const rect = item.getBoundingClientRect()
    const center = getRectCenter(rect)
    let primaryDistance = 0
    let crossDistance = 0

    if (key === 'ArrowRight') {
      if (center.x <= currentCenter.x) continue
      primaryDistance = center.x - currentCenter.x
      crossDistance = Math.abs(center.y - currentCenter.y)
    } else if (key === 'ArrowLeft') {
      if (center.x >= currentCenter.x) continue
      primaryDistance = currentCenter.x - center.x
      crossDistance = Math.abs(center.y - currentCenter.y)
    } else if (key === 'ArrowDown') {
      if (center.y <= currentCenter.y) continue
      primaryDistance = center.y - currentCenter.y
      crossDistance = Math.abs(center.x - currentCenter.x)
    } else {
      if (center.y >= currentCenter.y) continue
      primaryDistance = currentCenter.y - center.y
      crossDistance = Math.abs(center.x - currentCenter.x)
    }

    const score = crossDistance * SPATIAL_CROSS_AXIS_WEIGHT + primaryDistance
    if (score < bestScore) {
      bestScore = score
      bestItem = item
    }
  }

  return bestItem
}

/** 取最后一个满足 `viewportWidth >= minWidth` 的档。 */
function getColumnCount(viewportWidth: number): number {
  let columns: number = GALLERY_GRID_COLUMN_BREAKPOINTS[0].columns
  for (const step of GALLERY_GRID_COLUMN_BREAKPOINTS) {
    if (viewportWidth >= step.minWidth) columns = step.columns
  }
  return columns
}

function getGapX(viewportWidth: number): number {
  return viewportWidth >= GALLERY_GRID_GAP_X_BREAKPOINT.minWidth
    ? GALLERY_GRID_GAP_X.wide
    : GALLERY_GRID_GAP_X.narrow
}

/**
 * 画廊图墙（2026-09-03 起窗口化）。
 *
 * 退役的实现是「分批挂载 + 逐卡量高写 grid-row-end」：卡只增不减，滚到底就是
 * 全量卡都挂在 DOM 里。实测 300 张卡挂载阶段约 5.3–5.9s 脚本时间（每张约 20ms）、
 * 约 13900 个 DOM 节点 —— 瓶颈在挂载而不是布局，所以只有真正把不可见的卡
 * **卸载**才有意义。
 *
 * 高度用 `generation.width/height` 先估（画廊态的卡没有页脚，高度就是
 * `列宽 ÷ 宽高比`），挂载后交给 `measureElement` 换成实测值，所以估错也只是
 * 滚动条长度短暂不准，不会错位。
 *
 * ⚠ 首帧（含 SSR）走非窗口化的静态网格渲染前 `GALLERY_GRID_SSR_ITEM_COUNT` 张：
 * `/gallery` 是公开可索引路由，窗口化会把内容从 SSR HTML 里拿掉。等客户端量到
 * 容器宽度后再切窗口化，两条路径的列宽与间距同源，切换时位置对得上。
 */
export function GalleryGrid({
  generations,
  emptyTitle,
  emptyDescription,
  emptyActionHref,
  emptyActionLabel,
  feedLabel,
  itemFallbackLabel,
  showVisibility = false,
  showDelete = false,
  onDelete,
}: GalleryGridProps) {
  const feedRef = useRef<HTMLElement>(null)
  const [metrics, setMetrics] = useState({
    containerWidth: 0,
    viewportWidth: 0,
    scrollMargin: 0,
  })

  useEffect(() => {
    const element = feedRef.current
    if (!element) return

    const readMetrics = () => {
      const containerWidth = element.getBoundingClientRect().width
      // 列表在切换排序/筛选时会被父级藏起来（display:none），此时量到的是 0 宽、
      // 0 offsetTop。照单全收就会退回首帧的静态网格，而 ResizeObserver 之后
      // 不一定再补一次回调 —— 于是整页永远卡在 12 张。0 宽一律当作「没量到」。
      if (containerWidth <= 0) return
      const viewportWidth = window.innerWidth
      const scrollMargin = element.offsetTop
      setMetrics((previous) =>
        previous.containerWidth === containerWidth &&
        previous.viewportWidth === viewportWidth &&
        previous.scrollMargin === scrollMargin
          ? previous
          : { containerWidth, viewportWidth, scrollMargin },
      )
    }

    readMetrics()

    const observer = new ResizeObserver(readMetrics)
    observer.observe(element)
    window.addEventListener('resize', readMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', readMetrics)
    }
  }, [])

  const isVirtualized = metrics.containerWidth > 0
  const columnCount = getColumnCount(metrics.viewportWidth)
  const gapX = getGapX(metrics.viewportWidth)
  const columnWidth = isVirtualized
    ? (metrics.containerWidth - gapX * (columnCount - 1)) / columnCount
    : 0

  const estimateSize = useCallback(
    (index: number) => {
      const generation = generations[index]
      if (!generation || columnWidth <= 0) return 1
      const width = Math.max(generation.width, 1)
      const height = Math.max(generation.height, 1)
      return (
        Math.round((columnWidth * height) / width) +
        GALLERY_GRID_TILE_CHROME_PX +
        (index === 0 ? GALLERY_GRID_LEAD_TILE_CHROME_PX : 0)
      )
    },
    [generations, columnWidth],
  )

  const virtualizer = useWindowVirtualizer({
    count: isVirtualized ? generations.length : 0,
    estimateSize,
    lanes: columnCount,
    gap: GALLERY_GRID_GAP_Y,
    overscan: GALLERY_GRID_OVERSCAN,
    scrollMargin: metrics.scrollMargin,
    getItemKey: (index) => generations[index]?.id ?? index,
  })

  // 列宽一变，之前实测的高度全部作废（同一张图换列宽就换高），得整体重量。
  useEffect(() => {
    if (columnWidth > 0) virtualizer.measure()
  }, [columnWidth, columnCount, virtualizer])

  // Spatial keyboard navigation follows the visible grid positions.
  const handleGalleryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const items = e.currentTarget.querySelectorAll<HTMLElement>(
        '[data-gallery-index]',
      )
      const current = document.activeElement as HTMLElement
      if (!current.matches('[data-gallery-index]')) return

      const nextItem = getSpatialNavigationTarget(
        Array.from(items),
        current,
        e.key,
      )

      if (nextItem) {
        e.preventDefault()
        nextItem.focus()
      }
    },
    [],
  )

  const ssrGenerations = useMemo(
    () => generations.slice(0, GALLERY_GRID_SSR_ITEM_COUNT),
    [generations],
  )

  if (generations.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/3 px-6 py-16 text-center sm:px-10">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div className="space-y-2">
            <h3 className="text-2xl font-medium tracking-tight text-foreground">
              {emptyTitle}
            </h3>
            <p className="text-sm leading-7 text-muted-foreground">
              {emptyDescription}
            </p>
          </div>
          {emptyActionHref && emptyActionLabel ? (
            <Button asChild className="rounded-full px-5">
              <Link href={emptyActionHref}>{emptyActionLabel}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!isVirtualized) {
    // 首帧 / SSR：静态网格。列数与间距要和上面那组常量逐档对齐。
    return (
      <section
        ref={feedRef}
        role="feed"
        aria-label={feedLabel}
        className="grid grid-cols-2 items-start gap-x-2 gap-y-6 sm:gap-x-6 xl:grid-cols-3 2xl:grid-cols-4"
        onKeyDown={handleGalleryKeyDown}
      >
        {ssrGenerations.map((generation, index) => (
          <GalleryGridItem
            key={generation.id}
            generation={generation}
            index={index}
            total={generations.length}
            itemFallbackLabel={itemFallbackLabel}
            showVisibility={showVisibility}
            showDelete={showDelete}
            onDelete={onDelete}
            priority={index < 2}
            isLeadItem={index === 0}
          />
        ))}
      </section>
    )
  }

  return (
    <section
      ref={feedRef}
      role="feed"
      aria-label={feedLabel}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
      onKeyDown={handleGalleryKeyDown}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const generation = generations[virtualItem.index]
        if (!generation) return null
        return (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className="absolute top-0"
            style={{
              width: columnWidth,
              left: virtualItem.lane * (columnWidth + gapX),
              transform: `translateY(${virtualItem.start - metrics.scrollMargin}px)`,
            }}
          >
            <GalleryGridItem
              generation={generation}
              index={virtualItem.index}
              total={generations.length}
              itemFallbackLabel={itemFallbackLabel}
              showVisibility={showVisibility}
              showDelete={showDelete}
              onDelete={onDelete}
              priority={virtualItem.index < columnCount}
              isLeadItem={virtualItem.index === 0}
            />
          </div>
        )
      })}
    </section>
  )
}

interface GalleryGridItemProps {
  generation: GenerationRecord
  index: number
  total: number
  itemFallbackLabel: string
  showVisibility: boolean
  showDelete: boolean
  onDelete?: (id: string) => void
  priority: boolean
  isLeadItem: boolean
}

const GalleryGridItem = memo(function GalleryGridItem({
  generation,
  index,
  total,
  itemFallbackLabel,
  showVisibility,
  showDelete,
  onDelete,
  priority,
  isLeadItem,
}: GalleryGridItemProps) {
  return (
    <BlurFade
      delay={Math.min(index * 0.025, 0.2)}
      duration={0.22}
      offset={4}
      blur="0px"
      inView
    >
      <div
        role="article"
        tabIndex={0}
        aria-posinset={index + 1}
        aria-setsize={total}
        aria-label={generation.prompt?.slice(0, 80) || itemFallbackLabel}
        data-gallery-index={index}
        className={cn(
          'rounded-xl transition-all duration-300 hover:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none',
          isLeadItem && 'bg-primary/6 p-1 ring-1 ring-primary/20',
        )}
      >
        <ImageCard
          generation={generation}
          showVisibility={showVisibility}
          showDelete={showDelete}
          onDelete={onDelete}
          priority={priority}
          presentation={IMAGE_CARD_PRESENTATIONS.GALLERY}
        />
      </div>
    </BlurFade>
  )
})
