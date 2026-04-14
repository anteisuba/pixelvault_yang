'use client'

import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsiblePanelProps {
  title: string
  description?: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Collapsible panel with smooth height animation.
 * Uses CSS grid-rows trick for height: 0 → 1fr transition.
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
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className={
        className ?? 'rounded-3xl border border-border/70 bg-background/46 p-4'
      }
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen ? 'true' : 'false'}
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
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-300 ease-out',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Grid-rows trick: height animates from 0 to auto smoothly */}
      <div
        ref={contentRef}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-4 border-t border-border/70 pt-4">{children}</div>
        </div>
      </div>
    </div>
  )
}
