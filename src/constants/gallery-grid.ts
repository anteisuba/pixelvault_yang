/**
 * 画廊图墙的窗口化几何参数。
 *
 * 这些值原先散在 `GalleryGrid` 的 Tailwind 工具类里（`grid-cols-*` / `gap-x-*` /
 * `pb-6`）。窗口化之后位置由 JS 算，工具类不再是唯一事实源，于是把断点和间距
 * 提到常量里，SSR 首屏的静态网格与窗口化路径共用同一组数，切换时不会跳位。
 * ⚠ 改这里必须同步改 `GalleryGrid` SSR 分支上那串 `grid-cols-*` 工具类。
 */

/** 列数按视口宽度取档（升序，取最后一个满足 `viewportWidth >= minWidth` 的档）。 */
export const GALLERY_GRID_COLUMN_BREAKPOINTS = [
  { minWidth: 0, columns: 2 },
  { minWidth: 1280, columns: 3 },
  { minWidth: 1536, columns: 4 },
] as const

/** 列间距：手机窄屏收紧到 8px，好让两列在 375 下还有像样的图宽。 */
export const GALLERY_GRID_GAP_X = {
  narrow: 8,
  wide: 24,
} as const

/** `gap-x-2` → `sm:gap-x-6` 的切换点。 */
export const GALLERY_GRID_GAP_X_BREAKPOINT = { minWidth: 640 } as const

/** 行间距，对应退役实现里每张卡的 `pb-6`。 */
export const GALLERY_GRID_GAP_Y = 24

/** 视口上下各多挂几张卡，滚动时不至于看见空白再填。 */
export const GALLERY_GRID_OVERSCAN = 6

/** SSR / 首帧静态网格渲染的张数：`/gallery` 是公开可索引路由，不能整片空着。 */
export const GALLERY_GRID_SSR_ITEM_COUNT = 12

/** 卡片自身边框等非图像高度，只用于首次估高，挂载后会被实测值替换。 */
export const GALLERY_GRID_TILE_CHROME_PX = 2

/** 首张卡的高亮外框（`p-1 ring-1`）额外占的高度，同样只影响估高。 */
export const GALLERY_GRID_LEAD_TILE_CHROME_PX = 8
