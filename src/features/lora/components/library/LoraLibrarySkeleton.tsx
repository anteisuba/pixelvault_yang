import { LIBRARY_GRID_CLASS } from '@/components/ui/library-kit'

/** 首屏还没有结果时铺几格占位（6 列 × 2 行）。 */
const SKELETON_TILES = 12

/** 与库格同形的占位瓦片（3:4 封面 + 两行名字）。库里取第一段时与路由还没到时共用。 */
export function LoraLibrarySkeletonGrid() {
  return (
    <div className={LIBRARY_GRID_CLASS} aria-hidden>
      {Array.from({ length: SKELETON_TILES }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <span className="block aspect-3/4 rounded-12 bg-muted" />
          <span className="h-2.5 w-3/4 rounded bg-muted" />
          <span className="h-2.5 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

/**
 * 整页还没到的那一拍（路由块 / 页面脚本还在路上、`useSearchParams` 的 Suspense 还没放行）：
 * 一行工具条的位置 + 同一副瓦片，⛔ 白屏、⛔ 转圈文字。
 */
export function LoraLibrarySkeleton() {
  return (
    <div aria-busy="true" className="flex h-full min-h-0 flex-col gap-3">
      <div aria-hidden className="flex items-center gap-2 px-1">
        <span className="h-8 w-40 rounded-full bg-muted" />
        <span className="h-8 flex-1 rounded-full bg-muted" />
        <span className="h-8 w-24 rounded-full bg-muted" />
      </div>
      <div className="@container min-h-0 flex-1 overflow-hidden px-1 pt-1">
        <LoraLibrarySkeletonGrid />
      </div>
    </div>
  )
}
