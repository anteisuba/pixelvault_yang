'use client'

import { useState, type SyntheticEvent } from 'react'

import { isLetterboxedDerivative } from '@/lib/generation-media'

/**
 * 量出来是补了黑边的派生图 URL（整页共用）：格子里量到一次，查看器缩略轨 / 大图
 * 再用同一张时直接换原图，⛔ 每个地方各自先闪一次黑条。
 */
const letterboxedDerivatives = new Set<string>()

/**
 * 派生小图 / 预览图被补成正方形黑边图时换成原图（`isLetterboxedDerivative`）。
 * 用法：`<img ref={guard.onMount} src={guard.src} onLoad={guard.onLoad} />`；宿主自己的
 * `ref` / `onLoad` 照旧调，把元素 / event 也转给这两个。
 *
 * - `expectedRatio` 是作品本身的宽高比（未知 / 不是图片就给 null，此时不检查）。
 * - `fallbackSrc` 是原图；派生图本来就是原图时什么都不做。
 */
export function useDerivativeRatioGuard({
  src,
  fallbackSrc,
  expectedRatio,
}: {
  src: string
  fallbackSrc: string | null | undefined
  expectedRatio: number | null | undefined
}): {
  src: string
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void
  /** 已在缓存里的图挂上时就是 `complete`，React 不一定再派 load：挂上那一刻也量一次。 */
  onMount: (image: HTMLImageElement | null) => void
} {
  const [badSrc, setBadSrc] = useState<string | null>(null)
  const canFallBack = Boolean(fallbackSrc) && fallbackSrc !== src
  const isBad = badSrc === src || letterboxedDerivatives.has(src)
  const resolved = canFallBack && isBad && fallbackSrc ? fallbackSrc : src

  const check = (image: HTMLImageElement) => {
    if (!canFallBack || resolved !== src) return
    if (
      isLetterboxedDerivative(
        { width: image.naturalWidth, height: image.naturalHeight },
        expectedRatio,
      )
    ) {
      letterboxedDerivatives.add(src)
      setBadSrc(src)
    }
  }

  return {
    src: resolved,
    onLoad: (event) => check(event.currentTarget),
    onMount: (image) => {
      if (image?.complete && image.naturalWidth > 0) check(image)
    },
  }
}
