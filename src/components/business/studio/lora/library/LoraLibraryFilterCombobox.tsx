'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// R1 库聚焦浏览（docs/references/pages/lora-library.md §3「类型与底模使用两个
// 独立下拉/组合框，触发器持续显示当前值；底模选择需要支持检索大量候选」）：
// 把 S1/S2 的 chip 行换成两个持续显示当前值的下拉。行首标（类型/底模）留在
// 触发器外做前缀，触发器本身只显示当前选中值 + chevron。底模走可检索
// Command（`searchable`）；类型候选少，不加搜索框但同一套形制。

interface LoraLibraryFilterOption<T extends string> {
  value: T
  label: string
}

interface LoraLibraryFilterComboboxProps<T extends string> {
  /** 行首标（如「类型」「底模」）——渲染在触发器左侧、低层级。 */
  label: string
  /** 触发器的 aria-label（含当前值由内部拼接）。 */
  ariaLabel: string
  value: T
  options: readonly LoraLibraryFilterOption<T>[]
  onChange: (value: T) => void
  /** 底模候选多，开检索框；类型候选少，关。 */
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
}

export function LoraLibraryFilterCombobox<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  searchable = false,
  searchPlaceholder,
  emptyText,
}: LoraLibraryFilterComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const currentLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? '',
    [options, value],
  )

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-2xs font-medium uppercase leading-tight tracking-wide text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${ariaLabel}：${currentLabel}`}
            className={cn(
              'flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 px-2.5 text-xs text-foreground',
              'transition-colors hover:border-primary/20 hover:bg-muted/45',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'data-[state=open]:border-primary/30 data-[state=open]:bg-muted/55',
            )}
          >
            <span className="min-w-0 max-w-[9rem] truncate font-medium">
              {currentLabel}
            </span>
            <ChevronDown
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="w-56 max-w-[calc(100vw-2rem)] p-0"
        >
          <Command
            // Small, curated value domains — filter only when searchable, and
            // match on the visible label (Command's default filters on `value`,
            // which we set to the visible label for that reason).
            shouldFilter={searchable}
          >
            {searchable ? (
              <CommandInput
                placeholder={searchPlaceholder}
                className="h-9 text-xs"
              />
            ) : null}
            <CommandList>
              {searchable ? <CommandEmpty>{emptyText}</CommandEmpty> : null}
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = option.value === value
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                      className="gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {isSelected ? (
                        <Check
                          className="size-3.5 shrink-0 text-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
