'use client'

import type { ComponentProps } from 'react'

import { Search, X } from '@/components/icons'
import { cn } from '@/lib/utils'

interface SearchFieldProps extends Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'onChange' | 'className' | 'aria-label'
> {
  value: string
  onChange: (value: string) => void
  /** 读屏用：这个框搜什么。 */
  label: string
  /** 外框的额外样式（宽度之类）。 */
  className?: string
}

/** 搜索框 `SearchField`（ui-spec §9）：浅灰药丸，没边；36 高（触屏扩触控区不增粗视觉高度）。 */
export function SearchField({
  value,
  onChange,
  label,
  className,
  ...props
}: SearchFieldProps) {
  return (
    <label
      data-slot="search-field"
      className={cn(
        'touch-target-y flex h-9 min-w-0 items-center gap-2 rounded-full bg-muted px-3.5 text-muted-foreground max-md:focus-within:ring-1 max-md:focus-within:ring-foreground/15 md:focus-within:shadow-focus',
        className,
      )}
    >
      <Search className="size-3.75 shrink-0" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-2sm text-foreground outline-none placeholder:text-muted-foreground max-md:text-base"
        {...props}
      />
      {value ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange('')}
          className="touch-target -mr-1.5 grid size-5 shrink-0 place-items-center rounded-full bg-fill-strong/85 text-muted-foreground active:bg-fill-strong md:hidden"
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </label>
  )
}
