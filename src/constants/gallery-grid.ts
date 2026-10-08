/**
 * 画廊图墙的窗口化几何参数。
 *
 * 这些值原先散在 `GalleryGrid` 的 Tailwind 工具类里（`grid-cols-*` / `gap-*`）。
 * 窗口化之后位置由 JS 算，工具类不再是唯一事实源，于是把断点和间距
 * 提到常量里，SSR 首屏的静态网格与窗口化路径共用同一组数，切换时不会跳位。
 * ⚠ 改这里必须同步改 `GalleryGrid` SSR 分支上那串 `grid-cols-*` 工具类。
 */

/**
 * 列数按视口宽度取档（升序，取最后一个满足 `viewportWidth >= minWidth` 的档）。
 * 2–6 列（owner 2026-10-08 画廊换皮：去掉左栏、整宽瀑布流）。档位与 Tailwind 断点
 * 对齐：md 768 · lg 1024 · 2xl 1536 · 3xl 1920（`globals.css` 的 `--breakpoint-3xl`）。
 */
export const GALLERY_GRID_COLUMN_BREAKPOINTS = [
  { minWidth: 0, columns: 2 },
  { minWidth: 768, columns: 3 },
  { minWidth: 1024, columns: 4 },
  { minWidth: 1536, columns: 5 },
  { minWidth: 1920, columns: 6 },
] as const

/** 列间距 8（owner 2026-10-08：各档同一个缝，图挨着图）。 */
export const GALLERY_GRID_GAP_X = 8

/** 行间距，与列间距同一个缝。 */
export const GALLERY_GRID_GAP_Y = 8

/** 视口上下各多挂几张卡，滚动时不至于看见空白再填。 */
export const GALLERY_GRID_OVERSCAN = 6

/** SSR / 首帧静态网格渲染的张数：`/gallery` 是公开可索引路由，不能整片空着。 */
export const GALLERY_GRID_SSR_ITEM_COUNT = 12
