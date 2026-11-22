'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown } from '@/components/icons'

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
import { LIBRARY_PILL_CLASS } from '@/components/ui/library-kit'
import { cn } from '@/lib/utils'

// 库 B 那一行的药丸（lora-library.md §3 · ui-spec §9）：触发器就是 `LIBRARY_PILL_CLASS`，与
// `LibraryPillSelect` 同一副长相。⚠ 没并进 `LibraryPillSelect`：底模候选几十个、要能检索
//（`searchable` → Command），而且这里没动过写格子名、动过写选中项（`changed`），`LibraryPillSelect`
// 永远写当前值。分级 / 排序 / 来源候选少，不开搜索框但同一套形制。

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
  /** 当前值不是默认那一档（画成「改过」：浅灰底 + 写选中的那一项）。 */
  changed?: boolean
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
  changed = false,
}: LoraLibraryFilterComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const currentLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? '',
    [options, value],
  )

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${ariaLabel}：${currentLabel}`}
            className={cn(
              LIBRARY_PILL_CLASS,
              'whitespace-nowrap',
              changed && 'bg-fill-strong',
            )}
          >
            {/* 药丸（ui-spec §9）：没动过写这一格的名字，动过写选中的那一项。 */}
            <span className="max-w-40 truncate">
              {changed ? currentLabel : label}
            </span>
            <ChevronDown
              className={cn(
                'transition-transform duration-base ease-standard',
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
              <CommandInput placeholder={searchPlaceholder} className="h-9" />
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
