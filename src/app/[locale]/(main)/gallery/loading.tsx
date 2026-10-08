import { GallerySkeletonGrid } from '@/components/business/gallery/GallerySkeleton'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * 画廊打开、数据还没到（owner 2026-10-08 加载中 · 第 1 题 B）：静止的灰块，⛔ 呼吸闪烁；
 * 形状 = 真页面（同一层灰底地台、同一道页边距、顶栏一条 + 瀑布流）。数据到了每张图在
 * 自己格里由糊变清（`GalleryGrid` → `useMediaReveal`）。
 */
export default function GalleryLoading() {
  return (
    <div className="relative min-h-svh bg-surface-workbench">
      <div className="flex flex-col gap-3 px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        <div className="flex h-10 items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-full bg-muted" />
          <Skeleton className="h-8 w-20 rounded-full bg-muted" />
          <Skeleton className="h-8 w-16 rounded-full bg-muted" />
          <Skeleton className="ml-auto h-8 w-40 rounded-full bg-muted" />
        </div>
        <GallerySkeletonGrid rows={3} />
      </div>
    </div>
  )
}
