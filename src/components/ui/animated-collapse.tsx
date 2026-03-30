'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AnimatedCollapseProps {
  open: boolean
  children: ReactNode
  className?: string
}

/**
 * Animated collapse/expand wrapper following design system motion rules:
 * - fade-in + translate-up on open
 * - 300ms ease-out
 */
export function AnimatedCollapse({
  open,
  children,
  className,
}: AnimatedCollapseProps) {
  return (
    <div
      className={cn(
        'grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out',
        open ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        transform: open ? 'translateY(0)' : 'translateY(-8px)',
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
