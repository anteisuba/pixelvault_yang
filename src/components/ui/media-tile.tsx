'use client'

import type { ReactNode } from 'react'

import { Check, MoreHorizontal } from '@/components/icons'
import { FavoriteBookmark } from '@/components/ui/favorite-bookmark'
import { cn } from '@/lib/utils'

/**
 * 图格 `MediaTile`（ui-spec §9）：干净无框，没边没影；悬停图变暗、左下浮出白药丸动作
 * （交给助手 · 收藏 · 更多，淡入上移 4px）；选中只靠右上角的勾（⑪），⛔ 铺色、⛔ 描边。
 *
 * 这里只给几块拼图（壳的类、变暗层、动作行、勾），格子里放什么媒体、点了做什么由宿主定 ——
 * 素材、LoRA、角色、提示词、画廊的格子都拼它，⛔ 各写一份悬停与选中。
 */

/** 格子本身：圆角 12、先铺 `fill` 等图。宿主自己给宽高 / 比例。 */
export const MEDIA_TILE_CLASS =
  'group/tile relative isolate overflow-hidden rounded-12 bg-muted'

/** 悬停变暗那一层（盖在媒体上、动作下面）。 */
export function MediaTileShade({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-fast ease-standard group-hover/tile:bg-black/15 group-has-focus-visible/tile:bg-black/15 motion-reduce:transition-none',
        className,
      )}
    />
  )
}

/** 图上那几颗动作的底：白药丸 / 白圆钮（`media-chip`），28 高。 */
export const MEDIA_TILE_PILL_CLASS =
  'inline-flex h-7 shrink-0 items-center rounded-full bg-media-chip px-3 text-xs font-medium text-on-media-chip shadow-media-action transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50'

export const MEDIA_TILE_ROUND_CLASS =
  'grid size-7 shrink-0 place-items-center rounded-full bg-media-chip text-on-media-chip shadow-media-action transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5'

interface MediaTileActionsProps {
  /** 「交给助手」那颗；缺席 = 这一格交不了（没有助手在场）。 */
  handToAssistant?: { label: string; onClick: () => void }
  favorite?: {
    saved: boolean
    label: string
    pending?: boolean
    onToggle: () => void
  }
  /** 「更多」：宿主把整颗菜单（触发键用 `MediaTileMoreTrigger`）放进来。 */
  more?: ReactNode
  className?: string
}

/**
 * 左下那一排动作：悬停 / 键盘进到这一格才出（淡入上移 4px）；触屏常显。
 * ⚠ 收藏了的书签常显 —— 收藏是这一格的状态，⛔ 只在悬停时才说。
 */
export function MediaTileActions({
  handToAssistant,
  favorite,
  more,
  className,
}: MediaTileActionsProps) {
  const reveal =
    'pointer-events-none translate-y-1 opacity-0 group-hover/tile:pointer-events-auto coarse:pointer-events-auto transition-[opacity,translate] duration-fast ease-standard group-hover/tile:translate-y-0 group-hover/tile:opacity-100 group-has-focus-visible/tile:translate-y-0 group-has-focus-visible/tile:opacity-100 coarse:translate-y-0 coarse:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-opacity'
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-2 bottom-2 z-20 flex min-w-0 items-center gap-1.5',
        className,
      )}
    >
      {handToAssistant ? (
        <button
          type="button"
          onClick={handToAssistant.onClick}
          className={cn(MEDIA_TILE_PILL_CLASS, reveal)}
        >
          {handToAssistant.label}
        </button>
      ) : null}
      {favorite ? (
        <button
          type="button"
          onClick={() => {
            if (!favorite.pending) favorite.onToggle()
          }}
          aria-pressed={favorite.saved}
          aria-busy={favorite.pending || undefined}
          aria-label={favorite.label}
          title={favorite.label}
          className={cn(
            MEDIA_TILE_ROUND_CLASS,
            favorite.saved ? 'pointer-events-auto opacity-100' : reveal,
            favorite.pending && 'opacity-60',
          )}
        >
          <FavoriteBookmark saved={favorite.saved} />
        </button>
      ) : null}
      {more ? <span className={cn('flex', reveal)}>{more}</span> : null}
    </div>
  )
}

/** 「更多」的触发键（交给 `DropdownMenuTrigger asChild`）。 */
export function MediaTileMoreTrigger({
  label,
  ...props
}: { label: string } & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn(MEDIA_TILE_ROUND_CLASS, props.className)}
    >
      <MoreHorizontal weight="bold" />
    </button>
  )
}

/** 选中的勾：右上角一个圆圈，选上变黑底白勾（⑪）。只在能选的时候画。 */
export function MediaTileCheck({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-2 right-2 z-20 grid size-5 place-items-center rounded-full border transition-[background-color,border-color,color] duration-fast ease-standard motion-reduce:transition-none',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-media-chip bg-black/15 text-transparent',
      )}
    >
      <Check
        weight="bold"
        className={cn(
          'size-3 transition-[scale,opacity] duration-spring-slot ease-spring-slot motion-reduce:transition-none',
          selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      />
    </span>
  )
}

/** 格子底下的名字 + 一行灰字（角色、LoRA、提示词、声音；素材没有名字就不画）。 */
export function MediaTileCaption({
  name,
  meta,
}: {
  name: string
  meta?: string | null
}) {
  return (
    <span className="mt-2 flex min-w-0 flex-col gap-0.5 px-0.5">
      <span className="truncate text-2sm font-medium text-foreground">
        {name}
      </span>
      {meta ? (
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      ) : null}
    </span>
  )
}
