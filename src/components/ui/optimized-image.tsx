'use client'

import { useState, useCallback } from 'react'
import Image, { type ImageProps } from 'next/image'
import { ImageOff } from 'lucide-react'

import { cn } from '@/lib/utils'

type OptimizedImageProps = Omit<ImageProps, 'onLoad' | 'onError'> & {
  /** Extra class names for the outer container */
  containerClassName?: string
}

/**
 * Image wrapper with shimmer skeleton placeholder and error fallback.
 *
 * - Shows an `animate-pulse` skeleton while the image loads.
 * - Fades in the image on load (opacity transition).
 * - Displays a fallback icon on error.
 * - Defaults to `loading="lazy"` unless `priority` is set.
 */
export function OptimizedImage({
  className,
  containerClassName,
  alt,
  ...props
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const handleLoad = useCallback(() => setLoaded(true), [])
  const handleError = useCallback(() => {
    setLoaded(true)
    setError(true)
  }, [])

  // Determine if the image uses fill layout (no explicit width/height)
  const isFill = props.fill === true

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        isFill && 'size-full',
        containerClassName,
      )}
    >
      {/* Shimmer skeleton — visible until image loads */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse rounded-[inherit] bg-accent" />
      )}

      {/* Error fallback */}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <ImageOff className="size-6 text-muted-foreground/40" />
        </div>
      ) : (
        <Image
          alt={alt}
          className={cn(
            'transition-opacity duration-300 ease-out',
            loaded ? 'opacity-100' : 'opacity-0',
            className,
          )}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      )}
    </div>
  )
}
