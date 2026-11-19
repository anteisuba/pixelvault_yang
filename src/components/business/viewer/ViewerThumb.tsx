'use client'

import { useDerivativeRatioGuard } from '@/hooks/use-derivative-ratio-guard'

/**
 * 查看器里的缩略图（缩略轨 · 舞台垫底 · 邻居）：派生小图补成了正方形黑边图时换原图
 * （`useDerivativeRatioGuard`，11-19 库走查）。没给 `fallbackSrc` 就是一张普通的 `<img>`。
 */
export function ViewerThumb({
  src,
  fallbackSrc,
  ratio,
  className,
}: {
  src: string
  fallbackSrc?: string
  /** 作品本身的宽高比（与舞台外框同一个 `ratioOf`）。 */
  ratio: number
  className: string
}) {
  const {
    src: resolvedSrc,
    onLoad,
    onMount,
  } = useDerivativeRatioGuard({
    src,
    fallbackSrc,
    expectedRatio: fallbackSrc ? ratio : null,
  })
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 查看器缩略图走派生缩略图直链，比例已由外框锁住。
    <img
      ref={onMount}
      src={resolvedSrc}
      onLoad={onLoad}
      alt=""
      loading="lazy"
      draggable={false}
      className={className}
    />
  )
}
