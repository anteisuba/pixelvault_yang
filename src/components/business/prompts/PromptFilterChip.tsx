'use client'

import { cn } from '@/lib/utils'

interface PromptFilterChipProps {
  label: string
  active: boolean
  onClick: () => void
}

/** Pill filter toggle shared by the template type filter and the shared-library category filter. */
export function PromptFilterChip({
  label,
  active,
  onClick,
}: PromptFilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-all duration-200 active:scale-[0.98]',
        active
          ? 'bg-foreground/90 text-background'
          : 'border border-border/60 bg-card/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}
