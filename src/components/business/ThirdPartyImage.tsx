'use client'

import Image from 'next/image'

import { useThirdPartyImage } from '@/hooks/use-third-party-image'

/**
 * 一张**第三方网图**（`useThirdPartyImage` 摊好的 `<img>`）：该走自家代理的先走代理，
 * 取不到退回直连，全都取不到就什么也不画（调用方的底色当占位，⛔ 破图标）。
 *
 * `fill` = 铺满父级（`next/image` 的 fill，父级要 `relative`）；不给 = 图按自己的比例。
 */
export function ThirdPartyImage({
  src,
  fallback,
  alt,
  fill,
  sizes,
  className,
  onClick,
}: {
  src: string
  /** 取不到 `src` 时的退路（如大图取不到退回小图）。 */
  fallback?: string | null
  alt: string
  fill?: boolean
  sizes?: string
  className?: string
  onClick?: () => void
}) {
  const image = useThirdPartyImage(src, fallback)
  if (!image.src) return null
  if (fill) {
    return (
      <Image
        unoptimized
        src={image.src}
        alt={alt}
        fill
        sizes={sizes}
        referrerPolicy={image.referrerPolicy}
        onError={image.onError}
        onClick={onClick}
        className={className}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      alt={alt}
      referrerPolicy={image.referrerPolicy}
      onError={image.onError}
      onClick={onClick}
      className={className}
    />
  )
}
