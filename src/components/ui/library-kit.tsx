'use client'

import type { ReactNode } from 'react'

import { Check, ChevronDown, Search } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div className="min-w-0 max-w-90 flex-1">{search}</div>
      {pills}
      <span className="flex-1" />
      {end}
    </div>
  )
}

/** 搜索框 `SearchField`：浅灰药丸，没边。 */
export function LibrarySearch({
  value,
  onChange,
  placeholder,
  label,
  onKeyDown,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <label className="flex h-9 min-w-0 items-center gap-2 rounded-full bg-muted px-3.5 text-muted-foreground focus-within:shadow-focus">
      <Search className="size-3.75 shrink-0" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-2sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  )
}

/** 药丸（筛选 / 排序的触发键）：浅灰无边，点开深一档；设了写选中的值，⛔ 换强调色。 */
export const LIBRARY_PILL_CLASS =
  'inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-muted px-3 text-2sm font-medium text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-fill-strong [&>svg]:size-3.5 [&>svg]:text-ink-2'

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
