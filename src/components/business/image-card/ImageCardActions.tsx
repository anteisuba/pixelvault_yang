'use client'

import { Download } from '@/components/icons'
import { FavoriteHeart } from '@/components/ui/favorite-heart'
import { RollingNumber } from '@/components/ui/rolling-number'
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
   * （ui-defaults §5「hover 态改为按压态 / 省略」）。⛔ 不退化成常驻图标。
   */
  hiddenOnCoarse?: boolean
}

/**
 * 画廊卡右上角的 ♥ · 下载（卡片与详情 A）：白底圆键，悬停 / 键盘进到这一格才出；
 * 命中区跟着透明度一起开关，看不见的东西点不到。
 */
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
        'card-actions absolute right-2.5 top-2.5 z-10 flex gap-1.5 opacity-0 max-sm:right-1.5 max-sm:top-1.5 max-sm:gap-1',
        'pointer-events-none transition-opacity duration-fast ease-linear group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
        hiddenOnCoarse && 'coarse:hidden',
      )}
    >
      <button
        type="button"
        onClick={onLike}
        disabled={isLikePending}
        aria-pressed={liked}
        className="flex h-8 min-w-8 items-center justify-center gap-1 rounded-full bg-background/95 px-2 text-xs text-foreground shadow-sm transition-colors duration-fast hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        aria-label={liked ? unlikeLabel : likeLabel}
      >
        <FavoriteHeart liked={liked} />
        {likeCount > 0 && <LikeCount count={likeCount} />}
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={isDownloading}
        className="grid size-8 place-items-center rounded-full bg-background/95 text-foreground shadow-sm transition-colors duration-fast hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        aria-label={downloadLabel}
      >
        <Download
          className={cn('size-3.5', isDownloading && 'animate-pulse')}
        />
      </button>
    </div>
  )
}

/**
 * ♥ 旁的数：变了就滚到新值，只滚变了的那几位（`RollingNumber`，动效样片 K）；
 * 第一次画出来不滚。卡片与查看器共用这一颗。
 */
export function LikeCount({ count }: { count: number }) {
  return <RollingNumber value={count} className="font-mono" />
}
