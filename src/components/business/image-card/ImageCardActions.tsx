import { Download, Heart } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ImageCardActionsProps {
  liked: boolean
  likeCount: number
  isLikePending: boolean
  isDownloading: boolean
  onLike: (e: React.MouseEvent) => void
  onDownload: (e: React.MouseEvent) => void
  likeLabel: string
  unlikeLabel: string
  downloadLabel: string
}

export function ImageCardActions({
  liked,
  likeCount,
  isLikePending,
  isDownloading,
  onLike,
  onDownload,
  likeLabel,
  unlikeLabel,
  downloadLabel,
}: ImageCardActionsProps) {
  return (
    <div className="card-actions absolute right-2.5 top-2.5 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        type="button"
        onClick={onLike}
        disabled={isLikePending}
        className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-full bg-black/50 px-2.5 py-1.5 text-xs text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none"
        aria-label={liked ? unlikeLabel : likeLabel}
      >
        <Heart
          className={cn(
            'size-3.5 transition-colors',
            liked && 'fill-red-500 text-red-500',
          )}
        />
        {likeCount > 0 && <span>{likeCount}</span>}
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={isDownloading}
        className="flex size-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none"
        aria-label={downloadLabel}
      >
        <Download
          className={cn('size-3.5', isDownloading && 'animate-pulse')}
        />
      </button>
    </div>
  )
}
