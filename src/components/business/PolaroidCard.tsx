'use client'

import { useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Heart, Pin, X, Sparkles } from 'lucide-react'

import { OptimizedImage } from '@/components/ui/optimized-image'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { PROFILE } from '@/constants/config'

interface PolaroidCardProps {
  id: string
  url: string
  outputType: string
  prompt: string
  model: string
  createdAt: Date | string
  width: number
  height: number
  likeCount: number
  isLiked: boolean
  isFeatured: boolean
  isPromptPublic?: boolean
  totalImages: number
  isOwnProfile?: boolean
  onLike?: (id: string) => void
  onPin?: (id: string) => void
  className?: string
}

/**
 * Seeded random number from string (deterministic per image ID).
 */
function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return (Math.abs(hash) % 10000) / 10000
}

export function PolaroidCard({
  id,
  url,
  outputType,
  prompt,
  model,
  createdAt,
  width,
  height,
  likeCount,
  isLiked,
  isFeatured,
  isPromptPublic = false,
  totalImages,
  isOwnProfile,
  onLike,
  onPin,
  className,
}: PolaroidCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isVideo = outputType === 'VIDEO' || url.endsWith('.mp4')
  const t = useTranslations('CreatorProfile')

  // Deterministic scatter transforms based on image ID
  const transforms = useMemo(() => {
    const maxRot =
      totalImages <= 3
        ? PROFILE.POLAROID_FEW_ROTATION
        : PROFILE.POLAROID_MAX_ROTATION
    const maxOff = PROFILE.POLAROID_MAX_OFFSET

    const r1 = seededRandom(id)
    const r2 = seededRandom(id + 'x')
    const r3 = seededRandom(id + 'y')
    const r4 = seededRandom(id + 'z')

    return {
      rotation: r1 * maxRot * 2 - maxRot,
      translateX: r2 * maxOff * 2 - maxOff,
      translateY: r3 * maxOff * 2 - maxOff,
      zIndex: Math.floor(r4 * 16),
    }
  }, [id, totalImages])

  const handleExpand = useCallback(() => setIsExpanded(true), [])
  const handleClose = useCallback(() => setIsExpanded(false), [])
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsExpanded(true)
    }
  }, [])
  const handleExpandKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsExpanded(false)
    }
  }, [])

  const dateStr = new Date(createdAt).toLocaleDateString()

  return (
    <>
      {/* Card in grid */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${t('imageBy')} ${model}, ${dateStr}`}
        className={cn(
          'group cursor-pointer transition-transform duration-300 ease-out',
          'hover:scale-105 hover:z-20 focus-visible:scale-105 focus-visible:z-20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm',
          'motion-reduce:transform-none',
          className,
        )}
        style={{
          transform: `rotate(${transforms.rotation}deg) translate(${transforms.translateX}px, ${transforms.translateY}px)`,
          zIndex: transforms.zIndex,
        }}
        onClick={handleExpand}
        onKeyDown={handleKeyDown}
      >
        <div
          className="rounded-sm shadow-md overflow-hidden"
          style={{
            border: `8px solid ${PROFILE.POLAROID_BORDER_COLOR}`,
            borderBottom: `32px solid ${PROFILE.POLAROID_BORDER_COLOR}`,
          }}
        >
          <div className="relative aspect-square overflow-hidden bg-muted">
            {isVideo ? (
              <video
                src={url}
                muted
                loop
                playsInline
                onMouseEnter={(e) => e.currentTarget.play()}
                onMouseLeave={(e) => {
                  e.currentTarget.pause()
                  e.currentTarget.currentTime = 0
                }}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <OptimizedImage
                src={url}
                alt={
                  isPromptPublic
                    ? prompt.slice(0, 100)
                    : `${t('imageBy')} ${model}`
                }
                fill
                sizes="200px"
                className="object-cover"
                loading="lazy"
              />
            )}
            {isFeatured && (
              <div className="absolute top-1.5 right-1.5 bg-primary/90 text-primary-foreground rounded-full p-1">
                <Sparkles className="size-3" />
              </div>
            )}
          </div>
        </div>
        {/* Like indicator below polaroid */}
        <div className="flex items-center justify-between px-1 mt-1 text-xs text-muted-foreground">
          <span className="truncate font-serif">{model}</span>
          <span className="flex items-center gap-0.5">
            <Heart
              className={cn('size-3', isLiked && 'fill-primary text-primary')}
            />
            {likeCount > 0 && likeCount}
          </span>
        </div>
      </div>

      {/* Expanded overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-xl"
          onClick={handleClose}
          onKeyDown={handleExpandKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label={t('expandedImage')}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] motion-reduce:transform-none"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: 'polaroid-expand 300ms ease-out forwards',
            }}
          >
            {/* Close button */}
            <button
              className="absolute -top-3 -right-3 z-10 bg-card text-card-foreground rounded-full p-1.5 shadow-lg hover:bg-accent transition-colors"
              onClick={handleClose}
              aria-label={t('close')}
              autoFocus
            >
              <X className="size-4" />
            </button>

            {/* Polaroid frame */}
            <div
              className="rounded-sm shadow-2xl overflow-hidden"
              style={{
                border: `12px solid ${PROFILE.POLAROID_BORDER_COLOR}`,
                borderBottom: `48px solid ${PROFILE.POLAROID_BORDER_COLOR}`,
              }}
            >
              {isVideo ? (
                <video
                  src={url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                  className="max-w-[80vw] max-h-[65vh] object-contain"
                />
              ) : (
                <Image
                  src={url}
                  alt={
                    isPromptPublic
                      ? prompt.slice(0, 100)
                      : `${t('imageBy')} ${model}`
                  }
                  width={width}
                  height={height}
                  className="max-w-[80vw] max-h-[65vh] object-contain"
                  unoptimized
                  priority
                />
              )}
            </div>

            {/* Info panel */}
            <div
              className="absolute bottom-1 left-3 right-3 flex items-center justify-between text-xs"
              style={{ color: '#7a7668' }}
            >
              <div className="flex items-center gap-3">
                <span className="font-serif">{dateStr}</span>
                <span className="font-medium">{model}</span>
              </div>
              <div className="flex items-center gap-3">
                {isOwnProfile && onPin && (
                  <button
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPin(id)
                    }}
                    aria-label={isFeatured ? t('unpin') : t('pin')}
                  >
                    <Pin
                      className={cn(
                        'size-4',
                        isFeatured && 'fill-primary text-primary',
                      )}
                    />
                  </button>
                )}
                <button
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onLike?.(id)
                  }}
                  aria-label={isLiked ? t('unlike') : t('like')}
                >
                  <Heart
                    className={cn(
                      'size-4',
                      isLiked && 'fill-primary text-primary',
                    )}
                  />
                  {likeCount > 0 && <span>{likeCount}</span>}
                </button>
              </div>
            </div>

            {/* Prompt preview */}
            {isPromptPublic && (
              <div className="mt-2 max-w-[80vw] px-1">
                <p className="text-xs text-muted-foreground line-clamp-2 font-serif italic">
                  &ldquo;{prompt}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animation for Polaroid expand */}
      <style jsx global>{`
        @keyframes polaroid-expand {
          from {
            opacity: 0;
            transform: scale(0.8) rotate(${transforms.rotation}deg);
          }
          to {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes polaroid-expand {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        }
      `}</style>
    </>
  )
}
