'use client'

import type { ReactNode } from 'react'

import { Lock, X } from '@/components/icons'

/**
 * 从库里挑 `LibraryPicker`（ui-spec §9 ㉔，样件 E S16 / S24 / S26）的几块共用拼图：台上的参考图、
 * LoRA、音色……要从库里拿东西，都弹正中的框（`float` + `pop`、圆角 24，背后 `scrim`），框里是库
 * 那副骨架，格子一行 6 张。从哪来就锁什么，写在标题旁的灰药丸里。
 *
 * 挑：格子右上角一个圆圈，挑了变强调色的勾（`MediaTileCheck tone="highlight"`，⛔ 铺色）；挑了才
 * 浮出黑条「已选 2 · 取消 · 挂上 2 个」。只填一个位置的点一张就选上、框关掉，⛔ 黑条。
 */

/** 框本身的大小（桌面）：1000 × 680，窗口小了往里收。给 `DialogContent` 用。 */
export const LIBRARY_PICKER_DIALOG_CLASS =
  'library-picker-size flex flex-col gap-0 overflow-hidden rounded-24 p-0'

/** 格子：一行 6 张（库整页是 8）。 */
export const LIBRARY_PICKER_MAX_COLUMNS = 6

/** 框顶那一行：标题 · 锁着什么（灰药丸）……… ×。 */
export function LibraryPickerHeader({
  title,
  lock,
  start,
  closeLabel,
  onClose,
  titleId,
}: {
  title: string
  /** 锁着什么（「仅图片」「和 WAI-Illustrious 装得上」）；没锁不画。 */
  lock?: string | null
  /** 标题前面那颗（素材的「收起左栏」）。 */
  start?: ReactNode
  closeLabel: string
  onClose: () => void
  titleId?: string
}) {
  return (
    <header className="flex h-15 shrink-0 items-center gap-2.5 border-b border-border px-5">
      {start}
      <h2
        id={titleId}
        className="min-w-0 truncate text-md font-semibold text-foreground"
      >
        {title}
      </h2>
      {lock ? (
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-ink-2">
          <Lock className="size-3" aria-hidden />
          {lock}
        </span>
      ) : null}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus [&_svg]:size-4"
      >
        <X />
      </button>
    </header>
  )
}

/**
 * 挑了才浮出来的黑条（多选）：「已选 2 / 4 · 取消 · 挂上 2 个」。放在框的格子那一栏里
 *（那一栏要 `relative`），贴底居中。
 */
export function LibraryPickBar({
  count,
  countLabel,
  warning,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  count: number
  /** 「已选 2 / 4」整句（宿主按有没有上限拼）。 */
  countLabel: ReactNode
  /** 挑满了还点：就地一句红字（⛔ 静默吞掉）。 */
  warning?: string | null
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  if (count === 0) return null
  return (
    <div
      role="status"
      className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex h-12 -translate-x-1/2 animate-in items-center gap-1 rounded-full bg-primary pr-1.5 pl-5 text-primary-foreground shadow-pop fade-in-0 slide-in-from-bottom-2 duration-base ease-standard motion-reduce:animate-none"
    >
      <span className="shrink-0 pr-2 text-sm tabular-nums">{countLabel}</span>
      {warning ? (
        <span className="max-w-48 shrink truncate pr-2 text-xs text-danger-on-primary">
          {warning}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onCancel}
        className="h-9 shrink-0 rounded-full border border-on-primary-line px-3.5 text-sm text-primary-foreground transition-colors duration-fast ease-standard hover:bg-on-primary-line/40 focus-visible:outline-none focus-visible:shadow-focus"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="h-9 shrink-0 rounded-full bg-primary-foreground px-4 text-sm font-medium text-primary transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
      >
        {confirmLabel}
      </button>
    </div>
  )
}
