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
    <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
      <button
        type="button"
        onClick={onLike}
        disabled={isLikePending}
        className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none"
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
        className="flex items-center rounded-full bg-black/50 p-1.5 text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none"
        aria-label={downloadLabel}
      >
        <Download
          className={cn('size-3.5', isDownloading && 'animate-pulse')}
        />
      </button>
    </div>
  )
}
