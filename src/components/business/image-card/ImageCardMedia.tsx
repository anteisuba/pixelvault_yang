import { ImageIcon, Music, Play } from 'lucide-react'

import { OptimizedImage } from '@/components/ui/optimized-image'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface ImageCardMediaProps {
  generation: GenerationRecord
  isAudio: boolean
  isVideo: boolean
  aspectRatio: string
  onOpenDetail: () => void
  openImageLabel: string
  openVideoLabel: string
  referenceImageLabel: string
  priority?: boolean
}

export function ImageCardMedia({
  generation,
  isAudio,
  isVideo,
  aspectRatio,
  onOpenDetail,
  openImageLabel,
  openVideoLabel,
  referenceImageLabel,
  priority,
}: ImageCardMediaProps) {
  const imageSrc = getGenerationThumbnailUrl(generation)
  const videoPoster =
    generation.thumbnailUrl ?? generation.previewUrl ?? undefined

  return (
    <>
      <button
        type="button"
        className="block w-full cursor-pointer"
        onClick={onOpenDetail}
        aria-label={isVideo ? openVideoLabel : openImageLabel}
      >
        {isAudio ? (
          <div
            className="flex w-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 py-8"
            style={{ aspectRatio: '1 / 1' }}
          >
            <Music className="size-10 text-muted-foreground/40" />
            <audio
              src={generation.url}
              controls
              preload="metadata"
              className="w-full max-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : isVideo ? (
          <video
            src={generation.url}
            poster={videoPoster}
            muted
            playsInline
            preload="none"
            className="h-auto w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            style={{ aspectRatio }}
          />
        ) : (
          <OptimizedImage
            src={imageSrc}
            alt={generation.prompt}
            width={generation.width}
            height={generation.height}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="h-auto w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            unoptimized
          />
        )}
      </button>
      {generation.referenceImageUrl && (
        <span
          className={cn(
            // Type-aware accent so a glance tells image vs. video vs. audio:
            // image → sky, video → violet, audio → emerald. Tint stays on the
            // glass pill rather than swapping the whole chrome so it reads as
            // a Krea-style badge with a subtle category cue, not a sticker.
            'absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-white shadow-sm ring-1 backdrop-blur-md',
            isAudio
              ? 'bg-emerald-500/45 ring-emerald-200/50'
              : isVideo
                ? 'bg-violet-500/45 ring-violet-200/50'
                : 'bg-sky-500/45 ring-sky-200/50',
          )}
        >
          <ImageIcon className="size-3" />
          {referenceImageLabel}
        </span>
      )}
      {isVideo && (
        <>
          <span className="absolute bottom-3 left-3 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
            <Play className="ml-0.5 size-3.5" fill="currentColor" />
          </span>
          {generation.duration != null && (
            <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-md">
              0:{String(Math.round(generation.duration)).padStart(2, '0')}
            </span>
          )}
        </>
      )}
    </>
  )
}
