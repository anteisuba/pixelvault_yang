/**
 * 查看器右栏的三种键（素材页 · 画廊共用；ui-spec §9「按钮」「图标键」）：
 * 白药丸、32 的白圆图标键（`raise` + `soft`），小键是灰底小药丸。
 */
export const VIEWER_OUTLINE_PILL =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-raise px-3 text-2sm text-foreground shadow-soft transition-colors duration-fast ease-linear hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50'
export const VIEWER_OUTLINE_ICON =
  'grid size-8 shrink-0 place-items-center rounded-full bg-raise text-ink-2 shadow-soft transition-colors duration-fast ease-linear hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50'
export const VIEWER_SMALL_PILL =
  'inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs text-ink-2 transition-colors duration-fast ease-linear hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus'

/**
 * 复制键的「已复制」态（原型 I）：`data-copied` 时原地变黑底白字，过一会儿变回来。
 * 只换底色与字色，⛔ 加别的颜色。
 */
export const COPY_ACK_CLASS =
  'transition-colors duration-fast ease-standard hover:text-foreground motion-reduce:transition-none data-[copied]:bg-foreground data-[copied]:text-background data-[copied]:hover:bg-foreground data-[copied]:hover:text-background'
