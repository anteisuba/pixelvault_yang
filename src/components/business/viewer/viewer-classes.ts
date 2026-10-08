/** 就地查看器右栏的三种键（素材页 · 画廊共用）。 */
export const VIEWER_OUTLINE_PILL =
  'inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.75 text-2sm text-foreground transition-colors duration-fast ease-linear hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
export const VIEWER_OUTLINE_ICON =
  'grid size-8.5 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground/75 transition-colors duration-fast ease-linear hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
export const VIEWER_SMALL_PILL =
  'inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-foreground transition-colors duration-fast ease-linear hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * 复制键的「已复制」态（原型 I）：`data-copied` 时原地变黑底白字，过一会儿变回来。
 * 只换底色与字色，⛔ 加别的颜色。
 */
export const COPY_ACK_CLASS =
  'transition-[background-color,color,border-color] duration-fast ease-standard hover:bg-muted hover:text-foreground motion-reduce:transition-none data-[copied]:border-foreground data-[copied]:bg-foreground data-[copied]:text-background data-[copied]:hover:bg-foreground data-[copied]:hover:text-background'
