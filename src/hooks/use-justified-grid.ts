'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import {
  ASSET_GRID_GAP,
  ASSET_GRID_LAST_ROW_MAX_SCALE,
  ASSET_GRID_SSR_CONTAINER_WIDTH,
  type AssetGridViewport,
} from '@/constants/assets-grid'
import {
  computeJustifiedRows,
  resolveAssetGridViewport,
  type JustifiedRow,
} from '@/lib/justified-layout'

/**
 * 量一个容器自己的 `clientWidth`（⛔ 不手算 padding）。
 *
 * SSR 量不到，先用 `ASSET_GRID_SSR_CONTAINER_WIDTH` 顶着；客户端在
 * `useLayoutEffect`（首帧绘制前）用真实值纠正，所以看不到中间态，也不会
 * hydration mismatch（两边首渲染用的是同一个假定值）。
 * justified 网格与文件夹门牌行共用这一条量法。
 */
export function useContainerWidth(): {
  containerRef: (node: HTMLDivElement | null) => void
  containerWidth: number
} {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(
    ASSET_GRID_SSR_CONTAINER_WIDTH,
  )

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setElement(node)
  }, [])

  useLayoutEffect(() => {
    if (!element) return

    const measure = () => {
      const next = element.clientWidth
      if (next > 0) setContainerWidth(next)
    }
    measure()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return { containerRef, containerWidth }
}

/**
 * 行高刻度用的视口档（page §5.6）。SSR 按桌面渲染，挂载后按真实视口纠正。
 */
export function useAssetGridViewport(): AssetGridViewport {
  const [viewport, setViewport] = useState<AssetGridViewport>('desktop')

  useEffect(() => {
    const apply = () => setViewport(resolveAssetGridViewport(window.innerWidth))
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  return viewport
}

interface UseJustifiedGridOptions {
  /** 每个元素参与排版的宽高比，顺序即渲染顺序。 */
  aspectRatios: readonly number[]
  /** 目标行高 = 密度档。 */
  targetRowHeight: number
  gap?: number
}

interface UseJustifiedGridReturn {
  /** 挂到网格容器上 —— 宽度取它自己的 `clientWidth`，⛔ 不手算 padding。 */
  containerRef: (node: HTMLDivElement | null) => void
  rows: JustifiedRow[]
  containerWidth: number
}

/**
 * 量容器宽 + 排 justified 行。
 *
 * SSR 量不到宽度，先按 `ASSET_GRID_SSR_CONTAINER_WIDTH` 排一遍；客户端在
 * `useLayoutEffect`（首帧绘制前）用真实 `clientWidth` 重排，所以用户看不到
 * 中间态，也不会 hydration mismatch（两边首渲染用的是同一个假定值）。
 */
export function useJustifiedGrid({
  aspectRatios,
  targetRowHeight,
  gap = ASSET_GRID_GAP,
}: UseJustifiedGridOptions): UseJustifiedGridReturn {
  const { containerRef, containerWidth } = useContainerWidth()

  const rows = useMemo(
    () =>
      computeJustifiedRows(aspectRatios, {
        containerWidth,
        targetRowHeight,
        gap,
        lastRowMaxScale: ASSET_GRID_LAST_ROW_MAX_SCALE,
      }),
    [aspectRatios, containerWidth, targetRowHeight, gap],
  )

  return { containerRef, rows, containerWidth }
}
