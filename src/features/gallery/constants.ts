/**
 * 画廊图墙的窗口化几何参数。
 *
 * 这些值原先散在 `GalleryGrid` 的 Tailwind 工具类里（`grid-cols-*` / `gap-*`）。
 * 窗口化之后位置由 JS 算，工具类不再是唯一事实源，于是把断点和间距
 * 提到常量里，SSR 首屏的静态网格与窗口化路径共用同一组数，切换时不会跳位。
 * ⚠ 改这里必须同步改 `GalleryGrid` SSR 分支上那串 `grid-cols-*` 工具类。
 */

/**
 * 列数按**图墙自己的宽度**取档（升序，取最后一个满足 `containerWidth >= minWidth` 的档）。
 * 2–6 列（owner 2026-10-08 画廊换皮：去掉左栏、整宽瀑布流）。
 * ⭐ 量容器、⛔ 量视口：库里叫出助手，图墙变窄就少几列，卡保持原来的最窄宽度（11-18 审查）。
 * 档位 = 原先的视口档换算成图墙宽（桌面外壳左栏 + 内边距共 138）：
 * - 3 / 4 列取 Tailwind 容器尺寸 `@2xl` 672 · `@4xl` 896（与原 768−138 / 1024−138 只差几像素）；
 * - 5 / 6 列 = 1536−138 / 1920−138。没有对应的容器尺寸，SSR 静态网格写成
 *   `2xl:@7xl:grid-cols-5` / `3xl:@7xl:grid-cols-6`：助手收着时与这里逐档一致；
 *   助手开着刷新页面，首帧可能多一列，量到宽度切窗口化后即按这里排。
 * ⚠ 改这里必须同步改 `GalleryGrid` SSR 分支与 `GallerySkeleton` 的类名。
 */
export const GALLERY_GRID_COLUMN_BREAKPOINTS = [
  { minWidth: 0, columns: 2 },
  { minWidth: 672, columns: 3 },
  { minWidth: 896, columns: 4 },
  { minWidth: 1398, columns: 5 },
  { minWidth: 1782, columns: 6 },
] as const

/** 列间距 8（owner 2026-10-08：各档同一个缝，图挨着图）。 */
export const GALLERY_GRID_GAP_X = 8

/** 行间距，与列间距同一个缝。 */
export const GALLERY_GRID_GAP_Y = 8

/** 视口上下各多挂几张卡，滚动时不至于看见空白再填。 */
export const GALLERY_GRID_OVERSCAN = 6

/** SSR / 首帧静态网格渲染的张数：`/gallery` 是公开可索引路由，不能整片空着。 */
export const GALLERY_GRID_SSR_ITEM_COUNT = 12
