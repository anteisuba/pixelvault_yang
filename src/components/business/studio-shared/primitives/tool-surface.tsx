'use client'

import type * as React from 'react'

import { PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export const studioToolTriggerClass = cn(
  'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors duration-150',
  'hover:bg-muted/30 hover:text-foreground',
  'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
)

type StudioToolSurfaceSize = 'small' | 'action' | 'medium'

const studioToolSurfaceSizeClass: Record<StudioToolSurfaceSize, string> = {
  small: 'w-[min(280px,calc(100vw-2rem))] p-3',
  action: 'w-[min(360px,calc(100vw-2rem))] p-2.5',
  medium: 'w-[min(640px,calc(100vw-2rem))] overflow-hidden !p-0',
}

interface StudioToolPopoverContentProps extends React.ComponentProps<
  typeof PopoverContent
> {
  size?: StudioToolSurfaceSize
}

export function StudioToolPopoverContent({
  size = 'small',
  side = 'top',
  align = 'center',
  sideOffset = 12,
  collisionPadding = 12,
  className,
  onFocusOutside,
  onInteractOutside,
  onPointerDownOutside,
  ...props
}: StudioToolPopoverContentProps) {
  return (
    <PopoverContent
      data-studio-tool-popover=""
      side={side}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'rounded-xl border-border/70 bg-popover/95 shadow-2xl shadow-black/20 backdrop-blur-xl',
        'data-[state=open]:duration-150 data-[state=closed]:duration-100',
        'data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1',
        studioToolSurfaceSizeClass[size],
        className,
      )}
      onFocusOutside={(event) => {
        event.preventDefault()
        onFocusOutside?.(event)
      }}
      onInteractOutside={(event) => {
        event.preventDefault()
        onInteractOutside?.(event)
      }}
      onPointerDownOutside={(event) => {
        event.preventDefault()
        onPointerDownOutside?.(event)
      }}
      {...props}
    />
  )
}
