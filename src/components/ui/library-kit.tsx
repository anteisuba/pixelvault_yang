'use client'

import type { ReactNode } from 'react'

import { Check, ChevronDown, Plus } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SearchField } from '@/components/ui/search-field'
import { useLibraryRailOpen } from '@/hooks/use-library-rail'
import { cn } from '@/lib/utils'

/**
 * 库的几块共用拼图（ui-spec §9「库 `LibraryPage`」「库里的筛选」）：七个库同一副骨架 ——
 * 右边顶上搜索（最宽 360）+ 这个库其余的筛选药丸 + 排序在最右，下面一条切换条，再下面格子。
 * 左栏的行各库自己画（素材的文件夹树有拖放），当前那一行 `fill` 底 + 左边一道黑线。
 */

/** 顶上那一行：搜索 · 药丸 ……… 排序。 */
export function LibraryToolbar({
  search,
  pills,
  end,
  className,
}: {
  search: ReactNode
  pills?: ReactNode
  end?: ReactNode
  className?: string
}) {
  return (
    // 搜索框保底 144（手机上曾被挤到 23px，连占位字都看不见）。手机上药丸收成一组：放得下
    // 就排在搜索右边，放不下整组换到下一行、横着滚（⛔ 散成两三行）。≥768 那一组 `contents`，
    // 照旧「搜索 · 药丸 ……… 排序」。coarse 上下让出 6px 再抵回：横滚行会裁掉 44 的命中区。
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      <div className="min-w-36 max-w-90 flex-1">{search}</div>
      <div className="scrollbar-none ml-auto flex min-w-0 max-w-full items-center gap-2 overflow-x-auto *:shrink-0 coarse:-my-1.5 coarse:py-1.5 md:contents">
        {pills}
        {end ? (
          <div className="flex items-center gap-2 md:ml-auto md:shrink-0">
            {end}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 库顶上的搜索框：长相在 `ui/search-field.tsx`（ui-spec §9「搜索框」）。 */
export function LibrarySearch({
  value,
  onChange,
  placeholder,
  label,
  onKeyDown,
  maxLength,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  maxLength?: number
}) {
  return (
    <SearchField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      label={label}
      onKeyDown={onKeyDown}
      maxLength={maxLength}
    />
  )
}

/** 药丸（筛选 / 排序的触发键）：浅灰无边，点开深一档；设了写选中的值，⛔ 换强调色。触屏命中区 44（ui-defaults）。 */
export const LIBRARY_PILL_CLASS =
  'inline-flex h-8 coarse:h-11 shrink-0 items-center gap-1 rounded-full bg-muted px-3 text-2sm font-medium text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-fill-strong [&>svg]:size-3.5 [&>svg]:text-ink-2'

/** 单选药丸（排序、底模、分级…）：点开是菜单，当前那一项带勾。 */
export function LibraryPillSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  align = 'end',
}: {
  /** 读屏用：这颗药丸管什么（「排序」）。 */
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  align?: 'start' | 'end'
}) {
  const current = options.find((option) => option.value === value)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className={LIBRARY_PILL_CLASS}>
          {current?.label ?? label}
          <ChevronDown aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-40">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
          >
            {option.label}
            {option.value === value ? (
              <Check className="ml-auto size-4" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 左栏当前那一行左边那道黑线（`fill` 底之外再标一下，ui-spec §9「库」）。 */
export const LIBRARY_RAIL_ACTIVE_LINE_CLASS =
  'before:absolute before:inset-y-2 before:-left-2.5 before:w-0.5 before:rounded-full before:bg-foreground'

/**
 * 左栏：200 宽，一组一组的行（第一组永远是「全部 / 收藏」）。库顶上那颗键收起时宽度收到 0、
 * 淡出，右边格子跟着让位（`useLibraryRailOpen`）。
 */
export function LibraryRail({
  label,
  children,
  className,
}: {
  /** 读屏用：这一栏管什么（「角色」）。 */
  label: string
  children: ReactNode
  className?: string
}) {
  const [open] = useLibraryRailOpen()
  return (
    <nav
      aria-label={label}
      inert={!open}
      data-open={open}
      className={cn(
        'flex shrink-0 flex-col gap-0.5 overflow-x-hidden overflow-y-auto transition-[width,padding,opacity] duration-slow ease-standard motion-reduce:transition-none',
        open ? 'w-50 pl-2.5 opacity-100' : 'w-0 pl-0 opacity-0',
        className,
      )}
    >
      {children}
    </nav>
  )
}

/** 左栏的一行：图标 · 名字 ……… 计数（或来源，写在计数的位置：chub.ai、Civitai）。 */
export function LibraryRailRow({
  icon,
  label,
  trailing,
  active,
  onSelect,
}: {
  icon: ReactNode
  label: string
  trailing?: string | number
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'relative flex h-8.5 w-full shrink-0 items-center gap-2 rounded-lg px-2 text-left text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
        active
          ? cn(
              'bg-muted font-semibold text-foreground',
              LIBRARY_RAIL_ACTIVE_LINE_CLASS,
            )
          : 'text-foreground hover:tint-hover',
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&>svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing !== undefined ? (
        <span className="shrink-0 font-mono text-2xs font-normal text-muted-foreground tabular-nums">
          {trailing}
        </span>
      ) : null}
    </button>
  )
}

/**
 * 等宽格子（不需要虚拟化的库：角色、提示词、声音……）：按这一栏自己的宽排，最宽一行 8 张
 * （`@container` 量自己，⛔ 量整屏 —— 库叫出助手时这一栏会变窄）。
 */
/** 等宽格的列（放在 `@container` 里，按这一栏自己宽排，最多 8 列）。 */
export const LIBRARY_GRID_CLASS =
  'grid grid-cols-2 gap-2.5 @md:grid-cols-3 @xl:grid-cols-4 @3xl:grid-cols-6 @5xl:grid-cols-8'

export function LibraryGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="@container">
      <div className={cn(LIBRARY_GRID_CLASS, className)}>{children}</div>
    </div>
  )
}

/** 第一格的虚线「+ 新建」（角色、提示词、声音）。和格子里的图一样高（3:4）。 */
export function LibraryNewTile({
  label,
  icon,
  onClick,
}: {
  label: string
  /** 默认一颗「+」；声音库用麦克风。 */
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-3/4 w-full flex-col items-center justify-center gap-1.5 rounded-12 border border-dashed border-input text-xs text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus"
    >
      <span aria-hidden className="[&_svg]:size-4.5">
        {icon ?? <Plus />}
      </span>
      {label}
    </button>
  )
}
