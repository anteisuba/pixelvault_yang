'use client'

import Image, { type ImageProps } from 'next/image'
import { ImageOff } from '@/components/icons'

import { useMediaReveal } from '@/components/ui/load-reveal'
import { cn } from '@/lib/utils'

type OptimizedImageProps = Omit<ImageProps, 'onLoad' | 'onError'> & {
  /** Extra class names for the outer container */
  containerClassName?: string
}

/**
 * Image wrapper with a static gray placeholder and error fallback.
 *
 * - A still gray block holds the slot while the image loads（⛔ 呼吸闪烁，
 *   owner 2026-10-08 加载中）.
 * - The image goes from blurred to sharp in place (`useMediaReveal`).
 * - Displays a fallback icon on error.
 * - Defaults to `loading="lazy"` unless `priority` is set.
 */
export function OptimizedImage({
  className,
  containerClassName,
  alt,
  ...props
}: OptimizedImageProps) {
  const {
    phase: revealPhase,
    imageRef: revealRef,
    onLoad: onRevealLoad,
    onError: onRevealError,
    style: revealStyle,
    className: revealClassName,
  } = useMediaReveal({
    src: typeof props.src === 'string' ? props.src : '',
  })
  const error = revealPhase === 'failed'

  // Determine if the image uses fill layout (no explicit width/height)
  const isFill = props.fill === true

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-accent',
        isFill && 'size-full',
        containerClassName,
      )}
    >
      {/* Error fallback */}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <ImageOff className="size-6 text-muted-foreground/40" />
        </div>
      ) : (
        <Image
          ref={revealRef}
          alt={alt}
          style={revealStyle}
          className={cn(revealClassName, className)}
          onLoad={onRevealLoad}
          onError={onRevealError}
          {...props}
        />
      )}
    </div>
  )
}
