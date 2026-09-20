import { Download, Heart } from '@/components/icons'

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
  /**
   * 触屏没有 hover：这一排在 `pointer: coarse` 上整条不渲染，操作改走详情弹窗
   * （ui-defaults §5「hover 态改为按压态 / 省略」）。⛔ 不退化成三颗常驻图标 ——
   * 那正是进度表 34 要拿掉的东西。
   */
  hiddenOnCoarse?: boolean
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
  hiddenOnCoarse = false,
}: ImageCardActionsProps) {
  return (
    <div
      className={cn(
        'card-actions absolute right-2.5 top-2.5 flex gap-1.5 opacity-0 max-sm:right-1.5 max-sm:top-1.5 max-sm:gap-1',
        // 透明还能点是假的干净：命中区跟着 opacity 一起走，键盘焦点照常唤醒。
        'pointer-events-none transition-opacity duration-(--duration-base) ease-standard group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
        hiddenOnCoarse && 'coarse:hidden',
      )}
    >
      <button
        type="button"
        onClick={onLike}
        disabled={isLikePending}
        className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-full bg-black/50 px-2.5 py-1.5 text-xs text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none max-sm:min-h-8 max-sm:min-w-8 max-sm:px-2"
        aria-label={liked ? unlikeLabel : likeLabel}
      >
        <Heart
          className={cn(
            'size-3.5 transition-colors',
            liked && 'fill-primary text-primary',
          )}
        />
        {likeCount > 0 && <span>{likeCount}</span>}
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={isDownloading}
        className="flex size-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none max-sm:size-8"
        aria-label={downloadLabel}
      >
        <Download
          className={cn('size-3.5', isDownloading && 'animate-pulse')}
        />
      </button>
    </div>
  )
}
