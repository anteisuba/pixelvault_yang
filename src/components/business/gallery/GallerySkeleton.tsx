import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * 画廊的灰块（owner 2026-10-08 加载中 · 第 1、2 题）：静止的浅灰，⛔ 呼吸闪烁；形状跟
 * 真内容一样 —— 同一组列数、同一道 8px 缝、同样的圆角。还不知道比例时按图墙里最常见的
 * 几种比例轮着摆；知道比例（`ratios`）就按真比例占位。
 *
 * ⚠ 列数与间距要和 `GalleryGrid` SSR 分支那串 `grid-cols-*` 逐档对齐
 *   （`constants/gallery-grid.ts`）。
 * 服务端可用（路由级 `loading.tsx` 也摆它）：⛔ 不加 hook、不读 i18n。
 */

/** 不知道比例时轮着摆的那几种（宽 / 高）。 */
const FALLBACK_RATIOS = [3 / 4, 1, 4 / 3, 2 / 3, 1, 3 / 4] as const

/**
 * 第 i 格在哪一档才露出来：一排灰块只占一行 —— 2 列时摆 2 块，6 列时摆 6 块。
 * 与 `GALLERY_GRID_COLUMN_BREAKPOINTS` 同一组档。
 */
const ROW_SLOT_VISIBILITY = [
  '',
  '',
  'hidden md:block',
  'hidden lg:block',
  'hidden 2xl:block',
  'hidden 3xl:block',
] as const

export const GALLERY_SKELETON_ROW_SIZE = ROW_SLOT_VISIBILITY.length

export function GallerySkeletonGrid({
  rows = 1,
  ratios,
  className,
}: {
  /** 摆几排（首屏 3 排，往下滚接一排）。 */
  rows?: number
  /** 已知的真实比例（宽 / 高），按格子顺序。 */
  ratios?: readonly number[]
  className?: string
}) {
  const count = rows * GALLERY_SKELETON_ROW_SIZE
  return (
    <div
      aria-hidden
      data-testid="gallery-skeleton"
      className={cn(
        // 一排 = 网格（每列一块）；多排 = 分栏，像瀑布流那样各列各自往下排。
        rows === 1
          ? 'grid grid-cols-2 items-start gap-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6'
          : 'columns-2 gap-2 md:columns-3 lg:columns-4 2xl:columns-5 3xl:columns-6',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => {
        const ratio =
          ratios?.[index] ?? FALLBACK_RATIOS[index % FALLBACK_RATIOS.length]
        return (
          <Skeleton
            key={index}
            className={cn(
              'w-full rounded-xl bg-muted',
              rows > 1 && 'mb-2 break-inside-avoid',
              // 只摆一排时，多出来的那几块在窄屏藏起来，⛔ 折成第二排。
              rows === 1 &&
                ROW_SLOT_VISIBILITY[index % GALLERY_SKELETON_ROW_SIZE],
            )}
            style={{ aspectRatio: ratio }}
          />
        )
      })}
    </div>
  )
}
