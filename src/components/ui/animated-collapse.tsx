'use client'

import { useRef, useEffect, useState, type ReactNode } from 'react'
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
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [shouldRender, setShouldRender] = useState(open)

  useEffect(() => {
    if (open) {
      setShouldRender(true)
    }
  }, [open])

  useEffect(() => {
    if (shouldRender && contentRef.current) {
      setHeight(contentRef.current.scrollHeight)
    }
  }, [shouldRender, children])

  const handleTransitionEnd = () => {
    if (!open) {
      setShouldRender(false)
    }
  }

  if (!shouldRender) return null

  return (
    <div
      className={cn(
        'overflow-hidden transition-all duration-300 ease-out',
        open ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={{
        maxHeight: open ? `${height}px` : '0px',
        transform: open ? 'translateY(0)' : 'translateY(-8px)',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  )
}
