'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CollapsiblePanelProps {
  title: string
  description?: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Collapsible panel with toggle button, used across generation forms
 * for reference image, advanced settings, reverse engineer, etc.
 */
export function CollapsiblePanel({
  title,
  description,
  badge,
  defaultOpen = false,
  className,
  children,
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div
      className={
        className ?? 'rounded-3xl border border-border/70 bg-background/46 p-4'
      }
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description && (
            <p className="font-serif text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {isOpen ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="mt-4 border-t border-border/70 pt-4">{children}</div>
      )}
    </div>
  )
}
