'use client'

import { useState } from 'react'

import { Check, ChevronDown } from '@/components/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface PromptFilterMenuOption<T extends string> {
  value: T
  label: string
}

interface PromptFilterMenuProps<T extends string> {
  /** 写进按钮里的那个标（「类型」「排序」）。 */
  label: string
  value: T
  options: readonly PromptFilterMenuOption<T>[]
  onChange: (value: T) => void
  /** 当前值不是默认那一档：画成「改过」（浅灰底）。 */
  changed: boolean
}

/**
 * 提示词页 A 那一行按内容宽的下拉（pages/prompts.md：与 LoRA 库 B 同一个样子）——
 * 标写进按钮里，改过的那一格浅灰底。
 */
export function PromptFilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  changed,
}: PromptFilterMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const current = options.find((option) => option.value === value)?.label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${label}：${current ?? ''}`}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.75 text-2sm transition-colors duration-fast ease-linear',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            changed
              ? 'border-transparent bg-muted'
              : 'border-border hover:border-foreground/30',
            open && 'border-foreground/40',
          )}
        >
          <span className="text-muted-foreground">{label}</span>
          <b className="font-semibold text-foreground">{current}</b>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-44 p-1"
      >
        <div role="listbox" aria-label={label} className="flex flex-col">
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className="flex h-8.5 items-center gap-2 rounded-lg px-2.5 text-left text-2sm text-foreground transition-colors duration-fast ease-linear hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? (
                  <Check aria-hidden className="size-3.5 shrink-0" />
                ) : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
